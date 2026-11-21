import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { authErrorResponse, requireApiAuth } from "@/lib/auth";
import { runAiGrading } from "@/lib/ai-grading";
import { aiGradeSchema, firstZodError } from "@/lib/validation";
import type { SubmissionStatus } from "@/types/database"; // عدّل المسار حسب مكان ملف الأنواع عندك

export const runtime = "nodejs";
export const maxDuration = 120;

interface SubmissionRow {
  id: string;
  assessment_id: string;
  status: SubmissionStatus;
  submitted_at: string;
}

interface AssessmentRow {
  teacher_id: string;
}

/**
 * تشغيل (أو إعادة تشغيل) التصحيح الآلي لتسليم واحد.
 *
 * يُسمح بالاستدعاء بطريقتين:
 * 1) خدمة داخلية: ترويسة x-internal-secret تطابق INTERNAL_API_SECRET.
 * 2) مستخدم مسجّل (مدرس/مساعد) بصلاحية grading.review، ويجب أن يتبع التسليم نفس المدرس.
 *
 * إذا كان التسليم عالقًا في حالة needs_review وطُلبت إعادة التصحيح يمكن تمرير
 * force=true لإعادته إلى pending_ai أولًا (يحذف الدرجات القديمة عند اكتمال التصحيح).
 */
const bodySchema = aiGradeSchema.extend({
  force: z.boolean().optional(),
});

const MANUAL_RETRY_DELAY_MS = 150_000;

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

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صالحة." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const { submission_id, force } = parsed.data;
  const admin = createAdminClient();

  const internal = isInternalCall(request);
  let teacherId: string | null = null;

  if (!internal) {
    try {
      const context = await requireApiAuth("grading.review");
      teacherId = context.teacherId;
    } catch (error) {
      const response = authErrorResponse(error);
      if (response) return response;
      return Response.json({ error: "تعذر التحقق من الهوية." }, { status: 500 });
    }
  }

  const { data: rawSubmission, error: submissionError } = await admin
    .from("submissions")
    .select("id, assessment_id, status, submitted_at")
    .eq("id", submission_id)
    .maybeSingle();

  const submission = rawSubmission as SubmissionRow | null;

  if (submissionError) {
    return Response.json(
      { error: "تعذر جلب التسليم. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  if (!submission) {
    return Response.json({ error: "لم يتم العثور على التسليم." }, { status: 404 });
  }

  if (teacherId) {
    const { data: rawAssessment } = await admin
      .from("assessments")
      .select("teacher_id")
      .eq("id", submission.assessment_id)
      .maybeSingle();

    const assessment = rawAssessment as AssessmentRow | null;

    if (!assessment || assessment.teacher_id !== teacherId) {
      return Response.json({ error: "لم يتم العثور على التسليم." }, { status: 404 });
    }
  }

  if (submission.status === "approved" || submission.status === "sent_to_parent") {
    return Response.json(
      { error: "لا يمكن إعادة تصحيح تسليم تم اعتماده." },
      { status: 409 }
    );
  }

  if (submission.status === "pending_ai" && !internal) {
    const submittedAt = Date.parse(submission.submitted_at);
    if (!Number.isFinite(submittedAt) || Date.now() - submittedAt < MANUAL_RETRY_DELAY_MS) {
      return Response.json(
        { error: "ما زال التصحيح جارٍ. ستتاح إعادة المحاولة بعد مرور دقيقتين ونصف." },
        { status: 409 }
      );
    }
  }

  if (submission.status === "needs_review") {
    if (!force) {
      return Response.json(
        { error: "تم تصحيح هذا التسليم بالفعل. استخدم إعادة التصحيح لتجاوزه." },
        { status: 409 }
      );
    }

    const { error: resetError } = await admin
      .from("submissions")
      .update({ status: "pending_ai" } as never)
      .eq("id", submission_id)
      .eq("status", "needs_review");

    if (resetError) {
      return Response.json(
        { error: "تعذر تجهيز التسليم لإعادة التصحيح." },
        { status: 500 }
      );
    }
  }

  const result = await runAiGrading(submission_id);

  if (!result.ok) {
    return Response.json(
      { error: result.error ?? "فشل التصحيح الآلي." },
      { status: 502 }
    );
  }

  return Response.json(
    {
      ok: true,
      submission_id: result.submissionId,
      ai_score: result.aiScore,
      questions_count: result.questionsCount,
    },
    { status: 200 }
  );
}
