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

  const { data: student } = await admin
    .from("students")
    .select("name, student_code")
    .eq("id", submission.student_id)
    .maybeSingle();

  const { data: gradeRows } = await admin
    .from("question_grades")
    .select("*")
    .eq("submission_id", submission.id)
    .order("question_number", { ascending: true });

  const grades: WorkspaceGrade[] = (gradeRows ?? []).map((row) => ({
    question_number: row.question_number,
    topic_tag: row.topic_tag,
    max_mark: row.max_mark,
    awarded_mark: row.awarded_mark,
    is_correct: row.is_correct,
    ai_comment: row.ai_comment,
    bounding_box: (row.bounding_box as BoundingBox | null) ?? null,
    page_index: row.page_index ?? 0,
  }));

  const filePaths = Array.isArray(submission.raw_files_urls)
    ? submission.raw_files_urls.filter(
        (item): item is string => typeof item === "string" && item.length > 0
      )
    : [];

  const pages: WorkspacePage[] = [];
  if (filePaths.length > 0) {
    const { data: signedList } = await admin.storage
      .from(RAW_BUCKET)
      .createSignedUrls(filePaths, SIGNED_URL_TTL_SECONDS);

    const urlByPath = new Map(
      (signedList ?? []).map((item) => [item.path, item.signedUrl])
    );

    for (const path of filePaths) {
      const url = urlByPath.get(path);
      if (url) pages.push({ url, kind: pageKind(path) });
    }
  }

  let gradedPdfUrl: string | null = null;
  if (submission.graded_pdf_url) {
    const { data: signed } = await admin.storage
      .from(GRADED_BUCKET)
      .createSignedUrl(submission.graded_pdf_url, SIGNED_URL_TTL_SECONDS);
    gradedPdfUrl = signed?.signedUrl ?? null;
  }

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
