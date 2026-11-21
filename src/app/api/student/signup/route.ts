import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { normalizeEgyptPhone } from "@/lib/utils";

export const runtime = "nodejs";

const uuid = z.string().uuid();

const signupSchema = z.object({
  age: z.number().int().min(5).max(80),
  study_language: z.enum(["ar", "en", "fr", "de"]),
  subject_id: uuid,
  full_name: z.string().trim().min(2, "الاسم قصير جدًا.").max(100),
  email: z.string().trim().toLowerCase().email("البريد الإلكتروني غير صالح.").max(254),
  password: z.string().min(8, "كلمة المرور 8 أحرف على الأقل.").max(100),
  whatsapp: z.string().trim().min(8, "رقم الواتساب غير صالح.").max(20),
  country: z.string().trim().min(2, "اختر الدولة.").max(60),
  system_id: uuid.nullable().optional(),
  stage_id: uuid.nullable().optional(),
  grade_id: uuid.nullable().optional(),
  track_id: uuid.nullable().optional(),
});

// حد بسيط في الذاكرة لكل IP (يكفي كبداية، ولا يغني عن حد دائم لاحقًا)
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function tooMany(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("طلب غير مسموح.", 403);

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (tooMany(ip)) return fail("محاولات كثيرة. حاول لاحقًا.", 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("صيغة الطلب غير صالحة.", 400);
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "البيانات غير صالحة.", 400);
  }
  const d = parsed.data;

  // أرقام الواتساب: المصرية تُنظَّف، وغيرها تُقبل كأرقام دولية
  const digits = d.whatsapp.replace(/[^\d]/g, "");
  const whatsapp = normalizeEgyptPhone(d.whatsapp) ?? digits;
  if (whatsapp.length < 8 || whatsapp.length > 15) {
    return fail("رقم الواتساب غير صالح.", 400);
  }

  const admin = createAdminClient();

  // المادة موجودة ونشطة وبنفس لغة الدراسة
  const { data: subject } = await admin
    .from("subjects")
    .select("id, language, is_active")
    .eq("id", d.subject_id)
    .maybeSingle();
  if (!subject || !subject.is_active || subject.language !== d.study_language) {
    return fail("المادة المختارة غير متاحة.", 400);
  }

  // تحقق من تسلسل النظام > المرحلة > الصف > الشعبة (إن وُجدت)
  if (d.grade_id) {
    const { data: grade } = await admin
      .from("education_grades")
      .select("id, stage_id, has_tracks")
      .eq("id", d.grade_id)
      .maybeSingle();
    if (!grade || (d.stage_id && grade.stage_id !== d.stage_id)) {
      return fail("الصف المختار غير صحيح.", 400);
    }
    if (d.track_id) {
      const { data: track } = await admin
        .from("education_tracks")
        .select("id")
        .eq("id", d.track_id)
        .eq("grade_id", d.grade_id)
        .maybeSingle();
      if (!track) return fail("الشعبة المختارة غير صحيحة.", 400);
    } else if (grade.has_tracks) {
      return fail("اختر الشعبة.", 400);
    }
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: d.email,
      password: d.password,
      email_confirm: true,
      user_metadata: { name: d.full_name, role: "student" },
    });

  if (createError || !created.user) {
    const msg = createError?.message?.toLowerCase() ?? "";
    if (msg.includes("already") || msg.includes("registered")) {
      return fail("هذا البريد مسجّل بالفعل.", 409);
    }
    return fail("تعذر إنشاء الحساب. حاول مرة أخرى.", 500);
  }

  const { error: profileError } = await admin.from("student_profiles").insert({
    user_id: created.user.id,
    full_name: d.full_name,
    age: d.age,
    study_language: d.study_language,
    subject_id: d.subject_id,
    whatsapp,
    country: d.country,
    system_id: d.system_id ?? null,
    stage_id: d.stage_id ?? null,
    grade_id: d.grade_id ?? null,
    track_id: d.track_id ?? null,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return fail("تعذر حفظ بيانات الطالب. حاول مرة أخرى.", 500);
  }

  return Response.json({ ok: true }, { status: 201 });
    }
