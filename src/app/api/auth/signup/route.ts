import { createAdminClient } from "@/lib/supabase/server";
import { firstZodError, signupSchema } from "@/lib/validation";
import { normalizeEgyptPhone } from "@/lib/utils";

export const runtime = "nodejs";

/**
 * إنشاء حساب مدرس جديد:
 * 1) ينشئ مستخدم Supabase Auth (بريد مؤكد مسبقًا ليتمكن من الدخول فورًا).
 * 2) ينشئ سجل المدرس بنفس معرّف المستخدم وبحالة اشتراك تجريبية (trial).
 * إذا فشلت الخطوة 2 يُحذف المستخدم حتى لا يبقى حساب بلا سجل مدرس.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صالحة." }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const { name, subject, phone, email, password } = parsed.data;

  const normalizedPhone = normalizeEgyptPhone(phone);
  if (!normalizedPhone) {
    return Response.json({ error: "رقم الهاتف غير صالح." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existingPhone } = await admin
    .from("teachers")
    .select("id")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (existingPhone) {
    return Response.json(
      { error: "رقم الهاتف مسجّل بحساب آخر." },
      { status: 409 }
    );
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role: "teacher" },
  });

  if (createError || !created.user) {
    const message = createError?.message?.toLowerCase() ?? "";
    if (message.includes("already") || message.includes("registered")) {
      return Response.json(
        { error: "هذا البريد الإلكتروني مسجّل بالفعل." },
        { status: 409 }
      );
    }
    return Response.json(
      { error: "تعذر إنشاء الحساب. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  const { error: insertError } = await admin.from("teachers").insert({
    id: created.user.id,
    name,
    subject,
    phone: normalizedPhone,
    subscription_status: "trial",
  });

  if (insertError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return Response.json(
      { error: "تعذر إنشاء سجل المدرس. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  return Response.json({ ok: true }, { status: 201 });
}
