import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { formatDateTimeAr } from "@/lib/utils";
import type { SubmissionStatus } from "@/types/database";

export const dynamic = "force-dynamic";

type FilterKey = "needs_review" | "pending_ai" | "approved" | "all";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "needs_review", label: "بانتظار المراجعة" },
  { key: "pending_ai", label: "قيد التصحيح الآلي" },
  { key: "approved", label: "تم الاعتماد" },
  { key: "all", label: "الكل" },
];

const STATUS_BADGES: Record<SubmissionStatus, { label: string; className: string }> = {
  pending_ai: { label: "قيد التصحيح الآلي", className: "badge-warning" },
  needs_review: { label: "بانتظار المراجعة", className: "badge-sky" },
  approved: { label: "معتمد", className: "badge-success" },
  sent_to_parent: { label: "أُرسل لولي الأمر", className: "badge-success" },
};

function parseFilter(value: string | undefined): FilterKey {
  return FILTERS.some((f) => f.key === value) ? (value as FilterKey) : "needs_review";
}

export default async function GradingQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const auth = await requirePermission("grading.review");
  const { status } = await searchParams;
  const filter = parseFilter(status);
  const admin = createAdminClient();

  const { data: assessments } = await admin
    .from("assessments")
    .select("id, title, total_marks")
    .eq("teacher_id", auth.teacherId);

  const assessmentMap = new Map((assessments ?? []).map((a) => [a.id, a]));
  const assessmentIds = Array.from(assessmentMap.keys());

  let submissions: Array<{
    id: string;
    assessment_id: string;
    student_id: string;
    status: SubmissionStatus;
    ai_score: number | null;
    final_score: number | null;
    submitted_at: string;
  }> = [];

  if (assessmentIds.length > 0) {
    let query = admin
      .from("submissions")
      .select("id, assessment_id, student_id, status, ai_score, final_score, submitted_at")
      .in("assessment_id", assessmentIds)
      .order("submitted_at", { ascending: filter === "needs_review" })
      .limit(100);

    if (filter === "approved") {
      query = query.in("status", ["approved", "sent_to_parent"]);
    } else if (filter !== "all") {
      query = query.eq("status", filter);
    }

    const { data } = await query;
    submissions = data ?? [];
  }

  const studentIds = Array.from(new Set(submissions.map((s) => s.student_id)));
  const { data: students } =
    studentIds.length > 0
      ? await admin.from("students").select("id, name, student_code").in("id", studentIds)
      : { data: null };
  const studentMap = new Map((students ?? []).map((s) => [s.id, s]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">مراجعة التصحيح</h1>
        <p className="mt-1 text-sm text-ink-muted">
          راجع الأوراق التي صححها الذكاء الاصطناعي وعدّل الدرجات قبل اعتمادها.
        </p>
      </header>

      <nav aria-label="تصفية الأوراق" className="flex flex-wrap gap-2">
        {FILTERS.map((item) => {
          const active = item.key === filter;
          return (
            <Link
              key={item.key}
              href={`/dashboard/grading?status=${item.key}`}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "rounded-full bg-sky-100 px-4 py-1.5 text-sm font-semibold text-sky-700"
                  : "rounded-full border border-line bg-white px-4 py-1.5 text-sm font-semibold text-ink-soft hover:bg-surface-muted"
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <section className="card">
        {submissions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th>الواجب / الامتحان</th>
                  <th>الدرجة</th>
                  <th>الحالة</th>
                  <th>وقت التسليم</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {submissions.map((item) => {
                  const student = studentMap.get(item.student_id);
                  const assessment = assessmentMap.get(item.assessment_id);
                  const badge = STATUS_BADGES[item.status];
                  const score = item.final_score ?? item.ai_score;
                  const canOpen = item.status !== "pending_ai";

                  return (
                    <tr key={item.id}>
                      <td>
                        <span className="block font-semibold text-ink">
                          {student?.name ?? "—"}
                        </span>
                        {student ? (
                          <span dir="ltr" className="block text-right text-xs text-ink-muted">
                            {student.student_code}
                          </span>
                        ) : null}
                      </td>
                      <td>{assessment?.title ?? "—"}</td>
                      <td>
                        {score !== null && assessment
                          ? `${score} / ${assessment.total_marks}`
                          : "—"}
                      </td>
                      <td>
                        <span className={badge.className}>{badge.label}</span>
                      </td>
                      <td>{formatDateTimeAr(item.submitted_at)}</td>
                      <td className="text-left">
                        {canOpen ? (
                          <Link
                            href={`/dashboard/grading/${item.id}`}
                            className={
                              item.status === "needs_review"
                                ? "btn-primary px-3 py-1.5"
                                : "btn-secondary px-3 py-1.5"
                            }
                          >
                            {item.status === "needs_review" ? "مراجعة" : "عرض"}
                          </Link>
                        ) : (
                          <span className="text-xs text-ink-muted">جارٍ التصحيح...</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-12 text-center text-sm text-ink-muted">
            لا توجد أوراق في هذه القائمة.
          </p>
        )}
      </section>
    </div>
  );
                      }
