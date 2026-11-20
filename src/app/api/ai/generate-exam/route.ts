import { createAdminClient } from "@/lib/supabase/server";
import { authErrorResponse, requireApiAuth } from "@/lib/auth";
import { fetchAsInlineFile, generateParallelExams } from "@/lib/gemini";
import { firstZodError, generateExamSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 120;

const SOURCE_BUCKET = "mark-schemes";
const SIGNED_URL_TTL_SECONDS = 60 * 5;

/**
 * توليد نماذج امتحانية موازية (أ، ب، ج) من نص أو صورة امتحان:
 * 1) التحقق من الصلاحية (exam_generator.use).
 * 2) إن أُرسل ملف فيجب أن يكون داخل مجلد المدرس {teacher_id}/ في حاوية mark-schemes،
 *    فلا يستطيع مدرس قراءة ملفات مدرس آخر.
 * 3) إرسال المحتوى إلى Gemini واسترجاع النماذج مع إجاباتها بصيغة منظمة.
 */
export async function POST(request: Request) {
  let auth;
  try {
    auth = await requireApiAuth("exam_generator.use");
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

  const parsed = generateExamSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const { source_text, source_file_path, models_count } = parsed.data;

  if (!source_text?.trim() && !source_file_path) {
    return Response.json(
      { error: "أدخل نص الامتحان أو ارفع صورته." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  let sourceFile = null;

  if (source_file_path) {
    const normalized = source_file_path.replace(/^\/+/, "");

    if (
      !normalized.startsWith(`${auth.teacherId}/`) ||
      normalized.includes("..")
    ) {
      return Response.json({ error: "مسار الملف غير صالح." }, { status: 400 });
    }

    const { data: signed, error: signedError } = await admin.storage
      .from(SOURCE_BUCKET)
      .createSignedUrl(normalized, SIGNED_URL_TTL_SECONDS);

    if (signedError || !signed?.signedUrl) {
      return Response.json(
        { error: "تعذر الوصول إلى ملف الامتحان." },
        { status: 404 }
      );
    }

    try {
      sourceFile = await fetchAsInlineFile(signed.signedUrl);
    } catch {
      return Response.json(
        { error: "تعذر تحميل ملف الامتحان." },
        { status: 502 }
      );
    }
  }

  const { data: teacher } = await admin
    .from("teachers")
    .select("subject")
    .eq("id", auth.teacherId)
    .maybeSingle<{ subject: string }>();

  try {
    const exams = await generateParallelExams({
      sourceText: source_text,
      sourceFile,
      subject: teacher?.subject,
      modelsCount: models_count,
    });

    return Response.json({ ok: true, exams }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "فشل توليد النماذج الموازية.";
    return Response.json({ error: message }, { status: 502 });
  }
}
