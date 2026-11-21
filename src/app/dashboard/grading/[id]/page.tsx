import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import { hasPermission, requirePermission } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";
import GradingWorkspace, {
  type WorkspaceGrade,
  type WorkspacePage,
} from "@/components/dashboard/GradingWorkspace";
import type { BoundingBox } from "@/types/database";

export const dynamic = "force-dynamic";

const RAW_BUCKET = "raw-submissions";
const GRADED_BUCKET = "graded-pdfs";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function pageKind(path: string): WorkspacePage["kind"] {
  return path.toLowerCase().endsWith(".pdf") ? "pdf" : "image";
}

export default async function GradingReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requirePermission("grading.review");
  const { id } = await params;

  const idCheck = uuidSchema.safeParse(id);
  if (!idCheck.success) notFound();

  const admin = createAdminClient();

  const { data: submission } = await admin
    .from("submissions")
    .select(
      "id, assessment_id, student_id, raw_files_urls, graded_pdf_url, status, ai_score, final_score, ai_feedback_summary"
    )
    .eq("id", idCheck.data)
    .maybeSingle();

  if (!submission) notFound();

  const { data: assessment } = await admin
    .from("assessments")
    .select("id, teacher_id, title, total_marks")
    .eq("id", submission.assessment_id)
    .maybeSingle();

  // عزل البيانات: لا يُعرض إلا تسليم يتبع نفس المدرس.
  if (!assessment || assessment.teacher_id !== auth.teacherId) notFound();

  // الورقة التي لم ينتهِ تصحيحها الآلي لا تُفتح بعد.
  if (submission.status === "pending_ai") {
    redirect("/dashboard/grading?status=pending_ai");
  }

  const filePaths = Array.isArray(submission.raw_files_urls)
    ? submission.raw_files_urls.filter(
        (item): item is string => typeof item === "string" && item.length > 0
      )
    : [];

  const [studentResult, gradesResult, rawFilesResult, gradedFileResult] =
    await Promise.all([
      admin
        .from("students")
        .select("name, student_code")
        .eq("id", submission.student_id)
        .maybeSingle(),
      admin
        .from("question_grades")
        .select(
          "question_number, topic_tag, max_mark, awarded_mark, is_correct, ai_comment, bounding_box, page_index"
        )
        .eq("submission_id", submission.id)
        .order("question_number", { ascending: true }),
      filePaths.length > 0
        ? admin.storage
            .from(RAW_BUCKET)
            .createSignedUrls(filePaths, SIGNED_URL_TTL_SECONDS)
        : Promise.resolve({ data: null }),
      submission.graded_pdf_url
        ? admin.storage
            .from(GRADED_BUCKET)
            .createSignedUrl(submission.graded_pdf_url, SIGNED_URL_TTL_SECONDS)
        : Promise.resolve({ data: null }),
    ]);

  const student = studentResult.data;
  const grades: WorkspaceGrade[] = (gradesResult.data ?? []).map((row) => ({
    question_number: row.question_number,
    topic_tag: row.topic_tag,
    max_mark: row.max_mark,
    awarded_mark: row.awarded_mark,
    is_correct: row.is_correct,
    ai_comment: row.ai_comment,
    bounding_box: (row.bounding_box as BoundingBox | null) ?? null,
    page_index: row.page_index ?? 0,
  }));

  const urlByPath = new Map(
    (rawFilesResult.data ?? []).map((item) => [item.path, item.signedUrl])
  );
  const pages: WorkspacePage[] = filePaths.flatMap((path) => {
    const url = urlByPath.get(path);
    return url ? [{ url, kind: pageKind(path) }] : [];
  });
  const gradedPdfUrl = gradedFileResult.data?.signedUrl ?? null;

  const canApprove =
    hasPermission(auth.role, "grading.approve") &&
    submission.status === "needs_review";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/grading"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-sky-600"
        >
          <ArrowRight size={16} aria-hidden="true" />
          العودة إلى قائمة المراجعة
        </Link>
      </div>

      <GradingWorkspace
        submissionId={submission.id}
        status={submission.status}
        studentName={student?.name ?? "—"}
        studentCode={student?.student_code ?? ""}
        assessmentTitle={assessment.title}
        totalMarks={assessment.total_marks}
        aiScore={submission.ai_score}
        finalScore={submission.final_score}
        feedbackSummary={submission.ai_feedback_summary}
        pages={pages}
        grades={grades}
        gradedPdfUrl={gradedPdfUrl}
        canApprove={canApprove}
      />
    </div>
  );
}
