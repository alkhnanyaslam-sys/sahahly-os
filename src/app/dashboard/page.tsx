import Link from "next/link";
import {
  ClipboardCheck,
  GraduationCap,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import { hasPermission, requirePermission } from "@/lib/auth";
import { currentMonthKey, formatEGP, formatDateTimeAr } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}

function KpiCard({ icon: Icon, label, value, hint }: KpiCardProps) {
  return (
    <article className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink-muted">{label}</p>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
          <Icon size={20} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </article>
  );
}

export default async function DashboardPage() {
  const auth = await requirePermission("dashboard.view");
  const admin = createAdminClient();
  const teacherId = auth.teacherId;
  const month = currentMonthKey();

  const canReview = hasPermission(auth.role, "grading.review");
  const canSeePayments = hasPermission(auth.role, "payments.manage");
  const canSeeStudents = hasPermission(auth.role, "students.manage");
  const canSeeAnalytics = hasPermission(auth.role, "analytics.view");

  const { data: assessments } = await admin
    .from("assessments")
    .select("id, title, created_at")
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false });

  const assessmentIds = (assessments ?? []).map((a) => a.id);
  const latestAssessment = assessments?.[0] ?? null;

  const [activeStudents, pendingReview, payments, latestScores] = await Promise.all([
    canSeeStudents
      ? admin
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("teacher_id", teacherId)
          .eq("is_active", true)
      : Promise.resolve(null),
    canReview && assessmentIds.length > 0
      ? admin
          .from("submissions")
          .select("id", { count: "exact", head: true })
          .in("assessment_id", assessmentIds)
          .eq("status", "needs_review")
      : Promise.resolve(null),
    canSeePayments
      ? admin
          .from("payments")
          .select("amount, status")
          .eq("teacher_id", teacherId)
          .eq("month", month)
          .in("status", ["paid", "partial"])
      : Promise.resolve(null),
    canSeeAnalytics && latestAssessment
      ? admin
          .from("submissions")
          .select("final_score")
          .eq("assessment_id", latestAssessment.id)
          .in("status", ["approved", "sent_to_parent"])
      : Promise.resolve(null),
  ]);

  const studentsCount = activeStudents?.count ?? 0;
  const pendingCount = pendingReview?.count ?? 0;
  const monthlyTotal = (payments?.data ?? []).reduce(
    (sum, row) => sum + Number(row.amount),
    0
  );

  const scores = (latestScores?.data ?? [])
    .map((row) => row.final_score)
    .filter((value): value is number => typeof value === "number");
  const averageScore =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null;

  const { data: queue } =
    canReview && assessmentIds.length > 0
      ? await admin
          .from("submissions")
          .select("id, assessment_id, student_id, ai_score, submitted_at")
          .in("assessment_id", assessmentIds)
          .eq("status", "needs_review")
          .order("submitted_at", { ascending: true })
          .limit(5)
      : { data: null };

  const studentIds = Array.from(new Set((queue ?? []).map((s) => s.student_id)));
  const { data: queueStudents } =
    studentIds.length > 0
      ? await admin.from("students").select("id, name").in("id", studentIds)
      : { data: null };

  const studentNames = new Map((queueStudents ?? []).map((s) => [s.id, s.name]));
  const assessmentTitles = new Map((assessments ?? []).map((a) => [a.id, a.title]));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-ink">أهلًا، {auth.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">نظرة سريعة على أداء سنترك اليوم.</p>
      </header>

      <section aria-label="مؤشرات الأداء" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canSeeStudents ? (
          <KpiCard
            icon={Users}
            label="الطلاب النشطون"
            value={String(studentsCount)}
          />
        ) : null}
        {canReview ? (
          <KpiCard
            icon={ClipboardCheck}
            label="أوراق بانتظار المراجعة"
            value={String(pendingCount)}
          />
        ) : null}
        {canSeeAnalytics ? (
          <KpiCard
            icon={GraduationCap}
            label="متوسط درجات آخر امتحان"
            value={averageScore !== null ? String(averageScore) : "—"}
            hint={latestAssessment?.title}
          />
        ) : null}
        {canSeePayments ? (
          <KpiCard
            icon={Wallet}
            label="تحصيل الشهر الحالي"
            value={formatEGP(monthlyTotal)}
            hint={`شهر ${month}`}
          />
        ) : null}
      </section>

      {canReview ? (
        <section aria-label="أوراق بانتظار المراجعة" className="card">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-lg font-bold text-ink">بانتظار مراجعتك</h2>
            <Link
              href="/dashboard/grading"
              className="text-sm font-semibold text-sky-600 hover:text-sky-700"
            >
              عرض الكل
            </Link>
          </div>

          {queue && queue.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="table-clean">
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>الواجب / الامتحان</th>
                    <th>درجة الذكاء الاصطناعي</th>
                    <th>وقت التسليم</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {queue.map((item) => (
                    <tr key={item.id}>
                      <td className="font-semibold text-ink">
                        {studentNames.get(item.student_id) ?? "—"}
                      </td>
                      <td>{assessmentTitles.get(item.assessment_id) ?? "—"}</td>
                      <td>{item.ai_score ?? "—"}</td>
                      <td>{formatDateTimeAr(item.submitted_at)}</td>
                      <td className="text-left">
                        <Link
                          href={`/dashboard/grading/${item.id}`}
                          className="btn-primary px-3 py-1.5"
                        >
                          مراجعة
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-ink-muted">
              لا توجد أوراق بانتظار المراجعة الآن.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
                         }
