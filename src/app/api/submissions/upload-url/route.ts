import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import {
  firstZodError,
  studentCodeSchema,
  uuidSchema,
} from "@/lib/validation";

export const runtime = "nodejs";

const RAW_BUCKET = "raw-submissions";
const MAX_FILES = 20;
const ALLOWED_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const uploadUrlSchema = z.object({
  student_code: studentCodeSchema,
  assessment_id: uuidSchema,
  files: z
    .array(
      z.object({
        content_type: z.string().refine((value) => value in ALLOWED_EXTENSIONS, {
          message: "صيغة الملف غير مدعومة. الصيغ المقبولة: JPG, PNG, WEBP, PDF.",
        }),
      })
    )
    .min(1, "يجب اختيار ملف واحد على الأقل.")
    .max(MAX_FILES, `الحد الأقصى ${MAX_FILES} ملفًا لكل تسليم.`),
});

/**
 * إصدار روابط رفع موقّعة لبوابة تسليم الطلاب (بدون تسجيل دخول):
 * 1) التحقق من كود الطالب وأنه نشط.
 * 2) التحقق من أن الواجب يخص نفس المدرس والمجموعة ولم ينتهِ موعده ولم يُسلَّم من قبل.
 * 3) إنشاء مسار لكل ملف بالشكل {student_id}/{assessment_id}/{اسم عشوائي}.{امتداد}
 *    وإصدار رابط رفع موقّع له، فلا يستطيع الطالب الكتابة خارج مجلده.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صالحة." }, { status: 400 });
  }

  const parsed = uploadUrlSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const { student_code, assessment_id, files } = parsed.data;
  const admin = createAdminClient();

  const { data: student, error: studentError } = await admin
    .from("students")
    .select("id, teacher_id, group_id, is_active")
    .eq("student_code", student_code)
    .maybeSingle();

  if (studentError) {
    return Response.json(
      { error: "تعذر التحقق من كود الطالب. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  if (!student) {
    return Response.json({ error: "كود الطالب غير صحيح." }, { status: 404 });
  }

  if (!student.is_active) {
    return Response.json(
      { error: "هذا الحساب غير مفعّل. تواصل مع المدرس." },
      { status: 403 }
    );
  }

  const { data: assessment, error: assessmentError } = await admin
    .from("assessments")
    .select("id, teacher_id, group_id, deadline")
    .eq("id", assessment_id)
    .maybeSingle();

  if (assessmentError) {
    return Response.json(
      { error: "تعذر جلب بيانات الواجب. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  if (!assessment || assessment.teacher_id !== student.teacher_id) {
    return Response.json({ error: "هذا الواجب غير متاح لك." }, { status: 404 });
  }

  if (assessment.group_id && assessment.group_id !== student.group_id) {
    return Response.json(
      { error: "هذا الواجب غير متاح لمجموعتك." },
      { status: 403 }
    );
  }

  if (assessment.deadline && new Date(assessment.deadline).getTime() < Date.now()) {
    return Response.json({ error: "انتهى موعد تسليم هذا الواجب." }, { status: 403 });
  }

  const { data: existing, error: existingError } = await admin
    .from("submissions")
    .select("id")
    .eq("assessment_id", assessment_id)
    .eq("student_id", student.id)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return Response.json(
      { error: "تعذر التحقق من حالة التسليم. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  if (existing) {
    return Response.json({ error: "تم تسليم هذا الواجب من قبل." }, { status: 409 });
  }

  const folder = `${student.id}/${assessment_id}`;
  const uploads: Array<{ path: string; token: string; signed_url: string }> = [];

  for (const file of files) {
    const extension = ALLOWED_EXTENSIONS[file.content_type] ?? "jpg";
    const path = `${folder}/${crypto.randomUUID()}.${extension}`;

    const { data, error } = await admin.storage
      .from(RAW_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      return Response.json(
        { error: "تعذر تجهيز رفع الملفات. حاول مرة أخرى." },
        { status: 500 }
      );
    }

    uploads.push({ path, token: data.token, signed_url: data.signedUrl });
  }

  return Response.json({ ok: true, uploads }, { status: 200 });
    }
