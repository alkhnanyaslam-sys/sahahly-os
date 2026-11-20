import { createAdminClient } from "@/lib/supabase/server";
import { authErrorResponse, requireApiAuth } from "@/lib/auth";
import { firstZodError, paymentSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * تسجيل أو تحديث سداد اشتراك شهري لطالب:
 * 1) التحقق من الصلاحية (payments.manage) ومن أن الطالب يتبع نفس المدرس.
 * 2) إذا وُجد سجل لنفس الطالب والشهر يُحدَّث، وإلا يُنشأ سجل جديد
 *    (لا يتكرر أكثر من سجل لنفس الطالب في نفس الشهر).
 * 3) عند الحالة paid أو partial يُسجَّل وقت السداد paid_at، وعند unpaid يُمسح.
 */
export async function POST(request: Request) {
  let auth;
  try {
    auth = await requireApiAuth("payments.manage");
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

  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const { student_id, month, amount, status } = parsed.data;
  const admin = createAdminClient();

  const { data: student, error: studentError } = await admin
    .from("students")
    .select("id")
    .eq("id", student_id)
    .eq("teacher_id", auth.teacherId)
    .maybeSingle();

  if (studentError) {
    return Response.json(
      { error: "تعذر التحقق من الطالب. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  if (!student) {
    return Response.json({ error: "لم يتم العثور على الطالب." }, { status: 404 });
  }

  if (status !== "unpaid" && amount <= 0) {
    return Response.json(
      { error: "أدخل مبلغًا أكبر من صفر." },
      { status: 400 }
    );
  }

  const paidAt = status === "unpaid" ? null : new Date().toISOString();

  const { data: existing, error: existingError } = await admin
    .from("payments")
    .select("id")
    .eq("teacher_id", auth.teacherId)
    .eq("student_id", student_id)
    .eq("month", month)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return Response.json(
      { error: "تعذر جلب سجل الدفع. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  if (existing) {
    const { error: updateError } = await admin
      .from("payments")
      .update({ amount, status, paid_at: paidAt })
      .eq("id", existing.id)
      .eq("teacher_id", auth.teacherId);

    if (updateError) {
      return Response.json(
        { error: "تعذر تحديث سجل الدفع." },
        { status: 500 }
      );
    }

    return Response.json(
      { ok: true, payment_id: existing.id, updated: true },
      { status: 200 }
    );
  }

  const { data: created, error: insertError } = await admin
    .from("payments")
    .insert({
      teacher_id: auth.teacherId,
      student_id,
      month,
      amount,
      status,
      paid_at: paidAt,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    return Response.json(
      { error: "تعذر تسجيل الدفع. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  return Response.json(
    { ok: true, payment_id: created.id, updated: false },
    { status: 201 }
  );
}
