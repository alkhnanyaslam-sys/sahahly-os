import { createAdminClient } from "@/lib/supabase/server";
import {
  fetchAsInlineFile,
  gradeSubmission,
  type InlineFile,
} from "@/lib/gemini";
import type { AiRubric } from "@/types/database";

const SIGNED_URL_TTL_SECONDS = 60 * 10;

/**
 * يستخرج اسم الحاوية والمسار من قيمة مخزّنة.
 * القيمة قد تكون مسارًا مباشرًا داخل الحاوية (path) أو رابط Supabase كاملًا.
 */
function resolveStoragePath(
  value: string,
  defaultBucket: string
): { bucket: string; path: string } {
  const marker = "/storage/v1/object/";
  const index = value.indexOf(marker);
  if (index === -1) {
    return { bucket: defaultBucket, path: value.replace(/^\/+/, "") };
  }

  const rest = value.slice(index + marker.length).split("?")[0] ?? "";
  const segments = rest.split("/").filter(Boolean);
  const first = segments[0];
  if (first === "public" || first === "sign" || first === "authenticated") {
    segments.shift();
  }
  const bucket = segments.shift() ?? defaultBucket;
  return { bucket, path: decodeURIComponent(segments.join("/")) };
}

async function downloadFromStorage(
  value: string,
  defaultBucket: string
): Promise<InlineFile> {
  const admin = createAdminClient();
  const { bucket, path } = resolveStoragePath(value, defaultBucket);

  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(`تعذر الوصول إلى الملف ${path}: ${error?.message ?? "غير معروف"}`);
  }

  return fetchAsInlineFile(data.signedUrl);
}

export interface RunAiGradingResult {
  ok: boolean;
  submissionId: string;
  aiScore?: number;
  questionsCount?: number;
  error?: string;
}

/**
 * يشغّل التصحيح الآلي لتسليم واحد بالكامل:
 * 1) يجلب بيانات التسليم والامتحان والطالب.
 * 2) يحمّل صور الطالب ونموذج الإجابة.
 * 3) يرسلها إلى Gemini ويخزّن نتيجة كل سؤال في question_grades.
 * 4) يحدّث حالة التسليم إلى needs_review.
 *
 * يعمل بصلاحيات الخدمة، لذلك يجب استدعاؤه من السيرفر فقط بعد التحقق من الطلب.
 */
export async function runAiGrading(
  submissionId: string
): Promise<RunAiGradingResult> {
  const admin = createAdminClient();

  try {
    const { data: submission, error: submissionError } = await admin
      .from("submissions")
      .select("id, assessment_id, student_id, raw_files_urls, status")
      .eq("id", submissionId)
      .maybeSingle();

    if (submissionError || !submission) {
      throw new Error("لم يتم العثور على التسليم.");
    }

    if (submission.status !== "pending_ai") {
      return {
        ok: false,
        submissionId,
        error: "هذا التسليم ليس في حالة انتظار التصحيح الآلي.",
      };
    }

    const { data: assessment, error: assessmentError } = await admin
      .from("assessments")
      .select("id, teacher_id, total_marks, mark_scheme_url, ai_rubric")
      .eq("id", submission.assessment_id)
      .maybeSingle();

    if (assessmentError || !assessment) {
      throw new Error("لم يتم العثور على الامتحان المرتبط بالتسليم.");
    }

    const { data: teacher } = await admin
      .from("teachers")
      .select("subject")
      .eq("id", assessment.teacher_id)
      .maybeSingle();

    const fileRefs = Array.isArray(submission.raw_files_urls)
      ? submission.raw_files_urls.filter(
          (item): item is string => typeof item === "string" && item.length > 0
        )
      : [];

    if (fileRefs.length === 0) {
      throw new Error("لا توجد صور مرفوعة لهذا التسليم.");
    }

    const studentPages = await Promise.all(
      fileRefs.map((ref) => downloadFromStorage(ref, "raw-submissions"))
    );

    const markScheme = assessment.mark_scheme_url
      ? await downloadFromStorage(assessment.mark_scheme_url, "mark-schemes")
      : null;

    const result = await gradeSubmission({
      studentPages,
      markScheme,
      rubric: (assessment.ai_rubric as AiRubric | null) ?? null,
      totalMarks: assessment.total_marks,
      subject: teacher?.subject,
    });

    await admin
      .from("question_grades")
      .delete()
      .eq("submission_id", submissionId);

    const rows = result.questions.map((q) => ({
      submission_id: submissionId,
      question_number: q.question_number,
      topic_tag: q.topic_tag || null,
      max_mark: q.max_mark,
      awarded_mark: q.awarded_mark,
      is_correct: q.is_correct,
      ai_comment: q.ai_comment || null,
      bounding_box: q.bounding_box,
      page_index: q.page_index,
    }));

    const { error: insertError } = await admin
      .from("question_grades")
      .insert(rows);

    if (insertError) {
      throw new Error(`فشل حفظ درجات الأسئلة: ${insertError.message}`);
    }

    const rawScore = rows.reduce((sum, row) => sum + row.awarded_mark, 0);
    const aiScore = Math.min(
      Math.round(rawScore * 100) / 100,
      assessment.total_marks
    );

    const { error: updateError } = await admin
      .from("submissions")
      .update({
        status: "needs_review",
        ai_score: aiScore,
        final_score: aiScore,
        ai_feedback_summary: result.feedback_summary || null,
      })
      .eq("id", submissionId);

    if (updateError) {
      throw new Error(`فشل تحديث حالة التسليم: ${updateError.message}`);
    }

    return {
      ok: true,
      submissionId,
      aiScore,
      questionsCount: rows.length,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "خطأ غير معروف أثناء التصحيح.";
    return { ok: false, submissionId, error: message };
  }
}
