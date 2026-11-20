import { createAdminClient } from "@/lib/supabase/server";
import { authErrorResponse, requireApiAuth } from "@/lib/auth";
import { attendanceScanSchema, firstZodError } from "@/lib/validation";
import {
  buildAttendanceMessage,
  sendWhatsAppText,
} from "@/lib/whatsapp";
import { currentMonthKey, normalizeEgyptPhone, todayKey } from "@/lib/utils";
import type { AttendanceStatus } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * تسجيل حضور طالب عبر مسح كود الـ QR أو الإدخال اليدوي:
 * 1) التحقق من الصلاحية (attendance.scan) ومن أن الطالب يتبع نفس المدرس وأنه نشط.
 * 2) منع تكرار تسجيل الحضور لنفس الطالب في نفس اليوم والمجموعة.
 * 3) كشف الحصة التعويضية: إذا كان الطالب يحضر مع مجموعة غير مجموعته الأصلية
 *    (أو طُلب ذلك يدويًا) تُسجَّل الحالة makeup_session.
 * 4) فحص سداد اشتراك الشهر الحالي في payments (paid فقط يُعتبر مسدّدًا).
 * 5) إرسال إشعار واتساب لولي الأمر وتسجيله في whatsapp_logs (فشله لا يلغي الحضور).
 */
export async function POST(request: Request) {
  let auth;
  try {
    auth = await requireApiAuth("attendance.scan");
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    return Response.json({ error: "تعذر التحقق من الهوية." }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صالحة." }, { status: 400 });
  }

  const parsed = attendanceScanSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const { student_code, group_id, session_date, is_makeup } = parsed.data;
  const admin = createAdminClient();

  const { data: student, error: studentError } = await admin
    .from("students")
    .select("id, teacher_id, group_id, name, parent_phone, is_active")
    .eq("student_code", student_code)
    .eq("teacher_id", auth.teacherId)
    .maybeSingle();

  if (studentError) {
    return Response.json(
      { error: "تعذر البحث عن الطالب. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  if (!student) {
    return Response.json({ error: "كود الطالب غير صحيح." }, { status: 404 });
  }

  if (!student.is_active) {
    return Response.json(
      { error: "هذا الطالب غير مفعّل. راجع المدرس." },
      { status: 403 }
    );
  }

  const sessionGroupId = group_id ?? student.group_id;

  if (group_id) {
    const { data: group } = await admin
      .from("groups")
      .select("id")
      .eq("id", group_id)
      .eq("teacher_id", auth.teacherId)
      .maybeSingle();

    if (!group) {
      return Response.json({ error: "المجموعة غير موجودة." }, { status: 404 });
    }
  }

  const sessionDate = session_date ?? todayKey();

  let duplicateQuery = admin
    .from("attendance")
    .select("id, status, scanned_at")
    .eq("teacher_id", auth.teacherId)
    .eq("student_id", student.id)
    .eq("session_date", sessionDate)
    .limit(1);

  duplicateQuery = sessionGroupId
    ? duplicateQuery.eq("group_id", sessionGroupId)
    : duplicateQuery.is("group_id", null);

  const { data: duplicate } = await duplicateQuery.maybeSingle();

  const month = currentMonthKey();
  const { data: payment } = await admin
    .from("payments")
    .select("status, amount")
    .eq("teacher_id", auth.teacherId)
    .eq("student_id", student.id)
    .eq("month", month)
    .maybeSingle();

  const paymentStatus = payment?.status ?? "unpaid";
  const isPaid = paymentStatus === "paid";

  if (duplicate) {
    return Response.json(
      {
        ok: true,
        already_recorded: true,
        student: { id: student.id, name: student.name },
        attendance_status: duplicate.status,
        payment: { month, status: paymentStatus, is_paid: isPaid },
      },
      { status: 200 }
    );
  }

  const isMakeup =
    Boolean(is_makeup) ||
    Boolean(
      group_id && student.group_id && group_id !== student.group_id
    );

  const attendanceStatus: AttendanceStatus = isMakeup ? "makeup_session" : "present";

  const { error: insertError } = await admin.from("attendance").insert({
    teacher_id: auth.teacherId,
    student_id: student.id,
    group_id: sessionGroupId,
    session_date: sessionDate,
    status: attendanceStatus,
  });

  if (insertError) {
    return Response.json(
      { error: "تعذر تسجيل الحضور. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  let whatsappSent = false;
  let whatsappError: string | undefined;

  const parentPhone = normalizeEgyptPhone(student.parent_phone);

  if (!parentPhone) {
    whatsappError = "رقم ولي الأمر غير صالح.";
  } else {
    const { data: teacher } = await admin
      .from("teachers")
      .select("name")
      .eq("id", auth.teacherId)
      .maybeSingle();

    const message = buildAttendanceMessage({
      studentName: student.name,
      status: attendanceStatus,
      sessionDate,
      teacherName: teacher?.name ?? auth.name,
    });

    const { data: log } = await admin
      .from("whatsapp_logs")
      .insert({
        teacher_id: auth.teacherId,
        student_id: student.id,
        recipient_phone: parentPhone,
        message_type: "attendance_alert",
        payload: { message, session_date: sessionDate, status: attendanceStatus },
        status: "queued",
      })
      .select("id")
      .single();

    const result = await sendWhatsAppText({ to: parentPhone, message });
    whatsappSent = result.ok;
    if (!result.ok) {
      whatsappError = result.error ?? "فشل إرسال رسالة الواتساب.";
    }

    if (log) {
      await admin
        .from("whatsapp_logs")
        .update(
          result.ok
            ? {
                status: "sent",
                sent_at: new Date().toISOString(),
                payload: {
                  message,
                  session_date: sessionDate,
                  status: attendanceStatus,
                  provider: result.provider,
                  provider_message_id: result.providerMessageId ?? null,
                },
              }
            : {
                status: "failed",
                payload: {
                  message,
                  session_date: sessionDate,
                  status: attendanceStatus,
                  error: whatsappError ?? "فشل غير معروف",
                },
              }
        )
        .eq("id", log.id);
    }
  }

  return Response.json(
    {
      ok: true,
      already_recorded: false,
      student: { id: student.id, name: student.name },
      attendance_status: attendanceStatus,
      is_makeup: isMakeup,
      payment: { month, status: paymentStatus, is_paid: isPaid },
      whatsapp: {
        sent: whatsappSent,
        ...(whatsappError ? { error: whatsappError } : {}),
      },
    },
    { status: 201 }
  );
      }
