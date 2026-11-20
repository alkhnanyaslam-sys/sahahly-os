import { createAdminClient } from "@/lib/supabase/server";
import { authErrorResponse, requireApiAuth } from "@/lib/auth";
import { firstZodError, whatsappSendSchema } from "@/lib/validation";
import { sendWhatsAppDocument, sendWhatsAppText } from "@/lib/whatsapp";
import { normalizeEgyptPhone } from "@/lib/utils";
import type { Permission } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

function isInternalCall(request: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  const provided = request.headers.get("x-internal-secret");
  if (!secret || !provided) return false;
  if (secret.length !== provided.length) return false;

  let mismatch = 0;
  for (let i = 0; i < secret.length; i += 1) {
    mismatch |= secret.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}

const PERMISSION_BY_TYPE: Record<
  "grade_report" | "attendance_alert" | "payment_reminder",
  Permission
> = {
  grade_report: "grading.approve",
  attendance_alert: "attendance.scan",
  payment_reminder: "payments.manage",
};

/**
 * بوابة موحدة لإرسال رسائل الواتساب وتسجيل كل محاولة في whatsapp_logs.
 *
 * يُسمح بالاستدعاء بطريقتين:
 * 1) خدمة داخلية: ترويسة x-internal-secret صحيحة + ترويسة x-teacher-id لتحديد المدرس.
 * 2) مستخدم مسجّل بالصلاحية المناسبة لنوع الرسالة.
 *
 * إذا وُجد student_id فيجب أن يتبع نفس المدرس، ويُستخدم رقم ولي الأمر المسجّل
 * بدل الرقم المُرسل لمنع استخدام البوابة لإرسال رسائل لأرقام عشوائية.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صالحة." }, { status: 400 });
  }

  const parsed = whatsappSendSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const input = parsed.data;
  const admin = createAdminClient();

  let teacherId: string;

  if (isInternalCall(request)) {
    const headerTeacherId = request.headers.get("x-teacher-id");
    if (!headerTeacherId) {
      return Response.json({ error: "معرّف المدرس مطلوب." }, { status: 400 });
    }
    teacherId = headerTeacherId;
  } else {
    try {
      const auth = await requireApiAuth(PERMISSION_BY_TYPE[input.message_type]);
      teacherId = auth.teacherId;
    } catch (error) {
      const response = authErrorResponse(error);
      if (response) return response;
      return Response.json({ error: "تعذر التحقق من الهوية." }, { status: 500 });
    }
  }

  let recipientPhone = input.recipient_phone;
  let studentId: string | null = null;

  if (input.student_id) {
    const { data: student } = await admin
      .from("students")
      .select("id, teacher_id, parent_phone")
      .eq("id", input.student_id)
      .maybeSingle();

    if (!student || student.teacher_id !== teacherId) {
      return Response.json({ error: "لم يتم العثور على الطالب." }, { status: 404 });
    }

    studentId = student.id;
    recipientPhone = student.parent_phone;
  }

  const normalized = normalizeEgyptPhone(recipientPhone);
  if (!normalized) {
    return Response.json({ error: "رقم الهاتف غير صالح." }, { status: 400 });
  }

  const { data: log, error: logError } = await admin
    .from("whatsapp_logs")
    .insert({
      teacher_id: teacherId,
      student_id: studentId,
      recipient_phone: normalized,
      message_type: input.message_type,
      payload: { ...input.payload, message: input.message },
      status: "queued",
    })
    .select("id")
    .single();

  if (logError || !log) {
    return Response.json({ error: "تعذر تسجيل الرسالة." }, { status: 500 });
  }

  const result = input.document_url
    ? await sendWhatsAppDocument({
        to: normalized,
        documentUrl: input.document_url,
        filename: input.document_filename ?? "document.pdf",
        caption: input.message,
      })
    : await sendWhatsAppText({ to: normalized, message: input.message });

  if (!result.ok) {
    await admin
      .from("whatsapp_logs")
      .update({
        status: "failed",
        payload: {
          ...input.payload,
          message: input.message,
          error: result.error ?? "فشل غير معروف",
        },
      })
      .eq("id", log.id);

    return Response.json(
      { error: result.error ?? "فشل إرسال الرسالة." },
      { status: 502 }
    );
  }

  await admin
    .from("whatsapp_logs")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      payload: {
        ...input.payload,
        message: input.message,
        provider: result.provider,
        provider_message_id: result.providerMessageId ?? null,
      },
    })
    .eq("id", log.id);

  return Response.json(
    { ok: true, log_id: log.id, provider: result.provider },
    { status: 200 }
  );
      }
