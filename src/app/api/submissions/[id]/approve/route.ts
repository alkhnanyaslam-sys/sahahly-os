import { createAdminClient } from "@/lib/supabase/server";
import { authErrorResponse, requireApiAuth } from "@/lib/auth";
import {
  approveSubmissionSchema,
  firstZodError,
  uuidSchema,
} from "@/lib/validation";
import {
  renderGradedPdf,
  type PdfQuestionMark,
  type PdfSourcePage,
} from "@/lib/pdf-grader";
import { buildGradeReportMessage } from "@/lib/whatsapp";
import type { BoundingBox } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 120;

const RAW_BUCKET = "raw-submissions";
const GRADED_BUCKET = "graded-pdfs";
const DOCUMENT_URL_TTL_SECONDS = 60 * 60 * 24;

function guessMimeType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "image/jpeg";
}

/**
 * اعتماد تسليم بعد مراجعة المساعد:
 * 1) التحقق من الصلاحية (grading.approve) ومن أن التسليم يتبع نفس المدرس.
 * 2) تطبيق تعديلات الدرجات والتعليقات على question_grades.
 * 3) توليد ملف PDF النهائي برسم علامات الصح والخطأ والدرجة ورفعه إلى graded-pdfs.
 * 4) تحديث الحالة إلى approved، ثم إلى sent_to_parent عند نجاح إرسال الواتساب.
 *
 * فشل الواتساب لا يلغي الاعتماد: يبقى التسليم approved ويمكن إعادة الإرسال لاحقًا.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const idCheck = uuidSchema.safeParse(id);
  if (!idCheck.success) {
    return Response.json({ error: "معرّف التسليم غير صالح." }, { status: 400 });
  }
  const submissionId = idCheck.data;

  let auth;
  try {
    auth = await requireApiAuth("grading.approve");
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

  const parsed = approveSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const { questions: edits, feedback_summary, send_to_parent } = parsed.data;
  const admin = createAdminClient();

  const { data: submission, error: submissionError } = await admin
    .from("submissions")
    .select(
      "id, assessment_id, student_id, raw_files_urls, status, ai_feedback_summary"
    )
    .eq("id", submissionId)
    .maybeSingle();

  if (submissionError) {
    return Response.json(
      { error: "تعذر جلب التسليم. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  if (!submission) {
    return Response.json({ error: "لم يتم العثور على التسليم." }, { status: 404 });
  }

  const { data: assessment } = await admin
    .from("assessments")
    .select("id, teacher_id, title, total_marks")
    .eq("id", submission.assessment_id)
    .maybeSingle();

  if (!assessment || assessment.teacher_id !== auth.teacherId) {
    return Response.json({ error: "لم يتم العثور على التسليم." }, { status: 404 });
  }

  if (submission.status === "pending_ai") {
    return Response.json(
      { error: "لم ينتهِ التصحيح الآلي لهذا التسليم بعد." },
      { status: 409 }
    );
  }

  if (submission.status === "sent_to_parent") {
    return Response.json(
      { error: "تم اعتماد وإرسال هذا التسليم من قبل." },
      { status: 409 }
    );
  }

  const { data: grades, error: gradesError } = await admin
    .from("question_grades")
    .select("*")
    .eq("submission_id", submissionId)
    .order("question_number", { ascending: true });

  if (gradesError || !grades || grades.length === 0) {
    return Response.json(
      { error: "لا توجد درجات أسئلة لهذا التسليم." },
      { status: 409 }
    );
  }

  const editsByNumber = new Map(edits.map((edit) => [edit.question_number, edit]));
  const knownNumbers = new Set(grades.map((grade) => grade.question_number));
  const unknown = edits.find((edit) => !knownNumbers.has(edit.question_number));
  if (unknown) {
    return Response.json(
      { error: `السؤال رقم ${unknown.question_number} غير موجود في هذا التسليم.` },
      { status: 400 }
    );
  }

  const merged = grades.map((grade) => {
    const edit = editsByNumber.get(grade.question_number);
    const awarded = edit
      ? Math.min(Math.max(0, edit.awarded_mark), grade.max_mark)
      : grade.awarded_mark;
    const comment =
      edit && edit.ai_comment !== undefined ? edit.ai_comment : grade.ai_comment;
    return {
      ...grade,
      awarded_mark: awarded,
      is_correct: awarded >= grade.max_mark,
      ai_comment: comment,
    };
  });

  for (const row of merged) {
    const { error: updateGradeError } = await admin
      .from("question_grades")
      .update({
        awarded_mark: row.awarded_mark,
        is_correct: row.is_correct,
        ai_comment: row.ai_comment,
      })
      .eq("id", row.id);

    if (updateGradeError) {
      return Response.json(
        { error: "تعذر حفظ تعديلات الدرجات." },
        { status: 500 }
      );
    }
  }

  const rawTotal = merged.reduce((sum, row) => sum + row.awarded_mark, 0);
  const finalScore = Math.min(
    Math.round(rawTotal * 100) / 100,
    assessment.total_marks
  );

  const filePaths = Array.isArray(submission.raw_files_urls)
    ? submission.raw_files_urls.filter(
        (item): item is string => typeof item === "string" && item.length > 0
      )
    : [];

  if (filePaths.length === 0) {
    return Response.json(
      { error: "لا توجد ملفات أصلية لهذا التسليم." },
      { status: 409 }
    );
  }

  let pdfBytes: Uint8Array;
  try {
    const sources: PdfSourcePage[] = [];
    for (const path of filePaths) {
      const { data: blob, error: downloadError } = await admin.storage
        .from(RAW_BUCKET)
        .download(path);
      if (downloadError || !blob) {
        throw new Error(`تعذر تحميل الملف ${path}.`);
      }
      sources.push({
        bytes: new Uint8Array(await blob.arrayBuffer()),
        mimeType: blob.type || guessMimeType(path),
      });
    }

    const marks: PdfQuestionMark[] = merged.map((row) => ({
      question_number: row.question_number,
      awarded_mark: row.awarded_mark,
      max_mark: row.max_mark,
      is_correct: row.is_correct,
      bounding_box: (row.bounding_box as BoundingBox | null) ?? null,
      page_index: row.page_index ?? 0,
    }));

    pdfBytes = await renderGradedPdf({
      files: sources,
      marks,
      finalScore,
      totalMarks: assessment.total_marks,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "تعذر توليد ملف PDF.";
    return Response.json({ error: message }, { status: 500 });
  }

  const pdfPath = `${auth.teacherId}/${submissionId}.pdf`;
  const { error: uploadError } = await admin.storage
    .from(GRADED_BUCKET)
    .upload(pdfPath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    return Response.json(
      { error: "تعذر رفع ملف PDF النهائي." },
      { status: 500 }
    );
  }

  const finalSummary =
    feedback_summary !== undefined
      ? feedback_summary
      : submission.ai_feedback_summary;

  const { error: approveError } = await admin
    .from("submissions")
    .update({
      status: "approved",
      final_score: finalScore,
      ai_feedback_summary: finalSummary,
      graded_pdf_url: pdfPath,
      reviewed_by: auth.userId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", submissionId);

  if (approveError) {
    return Response.json(
      { error: "تعذر تحديث حالة التسليم." },
      { status: 500 }
    );
  }

  if (!send_to_parent) {
    return Response.json(
      {
        ok: true,
        status: "approved",
        final_score: finalScore,
        whatsapp: { attempted: false },
      },
      { status: 200 }
    );
  }

  const { data: student } = await admin
    .from("students")
    .select("id, name, parent_phone")
    .eq("id", submission.student_id)
    .maybeSingle();

  const { data: teacher } = await admin
    .from("teachers")
    .select("name")
    .eq("id", auth.teacherId)
    .maybeSingle();

  const { data: signed } = await admin.storage
    .from(GRADED_BUCKET)
    .createSignedUrl(pdfPath, DOCUMENT_URL_TTL_SECONDS);

  if (!student || !signed?.signedUrl) {
    return Response.json(
      {
        ok: true,
        status: "approved",
        final_score: finalScore,
        whatsapp: {
          attempted: false,
          error: "تعذر تجهيز بيانات الإرسال لولي الأمر.",
        },
      },
      { status: 200 }
    );
  }

  const message = buildGradeReportMessage({
    studentName: student.name,
    assessmentTitle: assessment.title,
    score: finalScore,
    totalMarks: assessment.total_marks,
    feedbackSummary: finalSummary,
    teacherName: teacher?.name ?? auth.name,
  });

  const origin = new URL(request.url).origin;
  let whatsappOk = false;
  let whatsappError: string | undefined;

  try {
    const sendResponse = await fetch(`${origin}/api/whatsapp/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
        "x-teacher-id": auth.teacherId,
      },
      body: JSON.stringify({
        student_id: student.id,
        recipient_phone: student.parent_phone,
        message_type: "grade_report",
        message,
        document_url: signed.signedUrl,
        document_filename: `${student.name}-${assessment.title}.pdf`,
        payload: {
          submission_id: submissionId,
          final_score: finalScore,
          total_marks: assessment.total_marks,
        },
      }),
    });

    whatsappOk = sendResponse.ok;
    if (!sendResponse.ok) {
      const errBody = (await sendResponse.json().catch(() => ({}))) as {
        error?: string;
      };
      whatsappError = errBody.error ?? "فشل إرسال رسالة الواتساب.";
    }
  } catch (error) {
    whatsappError =
      error instanceof Error ? error.message : "تعذر الاتصال بخدمة الواتساب.";
  }

  if (whatsappOk) {
    await admin
      .from("submissions")
      .update({ status: "sent_to_parent" })
      .eq("id", submissionId);
  }

  return Response.json(
    {
      ok: true,
      status: whatsappOk ? "sent_to_parent" : "approved",
      final_score: finalScore,
      whatsapp: {
        attempted: true,
        sent: whatsappOk,
        ...(whatsappError ? { error: whatsappError } : {}),
      },
    },
    { status: 200 }
  );
}
