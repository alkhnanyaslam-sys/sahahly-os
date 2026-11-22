import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { runAiGrading } from "@/lib/ai-grading";
import { createSubmissionSchema, firstZodError } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 120;

const RAW_BUCKET = "raw-submissions";

/**
 * استلام تسليم طالب من بوابة /submit (بدون تسجيل دخول):
 * 1) التحقق من كود الطالب وأنه نشط.
 * 2) التحقق من أن الامتحان يخص نفس المدرس، ومن المجموعة والموعد النهائي.
 * 3) التحقق من أن الملفات المذكورة موجودة فعلًا في مجلد الطالب داخل raw-submissions.
 * 4) إنشاء سجل التسليم بحالة pending_ai ثم تشغيل التصحيح الآلي في الخلفية.
 *
 * مسار كل ملف يجب أن يكون بالشكل: {student_id}/{assessment_id}/{file_name}
 * وهذا يمنع أي طالب من ربط ملفات طالب آخر بتسليمه.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صالحة." }, { status: 400 });
  }

  const parsed = createSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const { student_code, assessment_id, file_paths } = parsed.data;
  const admin = createAdminClient();

  const { data: student, error: studentError } = await admin
    .from("students")
    .select("id, teacher_id, group_id, name, is_active")
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
      { error: "تعذر جلب بيانات الامتحان. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  if (!assessment || assessment.teacher_id !== student.teacher_id) {
    return Response.json(
      { error: "هذا الواجب غير متاح لك." },
      { status: 404 }
    );
  }

  if (assessment.group_id && assessment.group_id !== student.group_id) {
    return Response.json(
      { error: "هذا الواجب غير متاح لمجموعتك." },
      { status: 403 }
    );
  }

  if (assessment.deadline && new Date(assessment.deadline).getTime() < Date.now()) {
    return Response.json(
      { error: "انتهى موعد تسليم هذا الواجب." },
      { status: 403 }
    );
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
    return Response.json(
      { error: "تم تسليم هذا الواجب من قبل." },
      { status: 409 }
    );
  }

  const folder = `${student.id}/${assessment_id}`;
  const uniquePaths = Array.from(new Set(file_paths));

  const hasInvalidPath = uniquePaths.some((path) => {
    if (!path.startsWith(`${folder}/`)) return true;
    const fileName = path.slice(folder.length + 1);
    return !fileName || fileName.includes("/") || fileName.includes("..");
  });

  if (hasInvalidPath) {
    return Response.json({ error: "مسارات الملفات غير صالحة." }, { status: 400 });
  }

  const { data: storedFiles, error: listError } = await admin.storage
    .from(RAW_BUCKET)
    .list(folder, { limit: 100 });

  if (listError) {
    return Response.json(
      { error: "تعذر التحقق من الملفات المرفوعة. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  const storedNames = new Set((storedFiles ?? []).map((file) => file.name));
  const missing = uniquePaths.some(
    (path) => !storedNames.has(path.slice(folder.length + 1))
  );

  if (missing) {
    return Response.json(
      { error: "بعض الملفات لم يكتمل رفعها. أعد المحاولة." },
      { status: 400 }
    );
  }

  const { data: submission, error: insertError } = await admin
    .from("submissions")
    .insert({
      assessment_id,
      student_id: student.id,
      raw_files_urls: uniquePaths,
      status: "pending_ai",
    })
    .select("id")
    .single();

  if (insertError || !submission) {
    return Response.json(
      { error: "تعذر حفظ التسليم. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  const submissionId = submission.id;

  after(async () => {
    const result = await runAiGrading(submissionId);
    if (!result.ok) {
      console.error(
        `[ai-grading] فشل تصحيح التسليم ${submissionId}: ${result.error ?? "غير معروف"}`
      );
    }
  });

  return Response.json(
    {
      ok: true,
      submission_id: submissionId,
      student_name: student.name,
      message: "تم استلام حلك بنجاح.",
    },
    { status: 201 }
  );
}
