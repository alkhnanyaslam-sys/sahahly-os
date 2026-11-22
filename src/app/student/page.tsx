import Link from "next/link";
import { GraduationCap, PlayCircle, Target, Trophy } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import { requireStudent } from "@/lib/student-auth";
import StudentSignOut from "@/components/student/StudentSignOut";
import { formatDateTimeAr, toArabicDigits } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  generating: { label: "قيد التجهيز", className: "badge-warning" },
  ready: { label: "جاهز", className: "badge-sky" },
  in_progress: { label: "قيد الحل", className: "badge-sky" },
  submitted: { label: "تم التسليم", className: "badge-success" },
  expired: { label: "انتهى الوقت", className: "badge-danger" },
  failed: { label: "فشل", className: "badge-danger" },
};

export default async function StudentHomePage() {
  const student = await requireStudent();
  const admin = createAdminClient();

  const { data: sessions } = await admin
    .from("quiz_sessions")
    .select("id, subject, topic, status, score, num_questions, created_at")
    .eq("user_id", student.userId)
    .order("created_at", { ascending: false })
    .limit(50);

  const list = sessions ?? [];
  const finished = list.filter(
    (s) => s.status === "submitted" && typeof s.score === "number"
  );
  const avg =
    finished.length > 0
      ? Math.round(
          (finished.reduce(
            (sum, s) => sum + ((s.score as number) / s.num_questions) * 100,
            0
          ) /
            finished.length) *
            10
        ) / 10
      : null;
  const best =
    finished.length > 0
      ? Math.max(
          ...finished.map((s) =>
            Math.round(((s.score as number) / s.num_questions) * 100)
          )
        )
      : null;

  const firstName = student.fullName.split(" ")[0];

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-600 text-white">
            <GraduationCap size={22} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-ink">أهلًا يا {firstName} 👋</h1>
            <p className="text-sm text-ink-muted">جاهز لكويز جديد اليوم؟</p>
          </div>
        </div>
        <StudentSignOut />
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-3" aria-label="إحصائياتك">
        <article className="card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink-muted">كويزات مكتملة</p>
            <Target size={18} className="text-sky-600" aria-hidden="true" />
          </div>
          <p className="mt-2 text-3xl font-bold text-ink">{toArabicDigits(finished.length)}</p>
        </article>
        <article className="card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink-muted">متوسط نتيجتك</p>
            <Trophy size={18} className="text-sky-600" aria-hidden="true" />
          </div>
          <p className="mt-2 text-3xl font-bold text-ink">
            {avg !== null ? `${toArabicDigits(avg)}%` : "—"}
          </p>
        </article>
        <article className="card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink-muted">أفضل نتيجة</p>
            <Trophy size={18} className="text-sky-600" aria-hidden="true" />
          </div>
          <p className="mt-2 text-3xl font-bold text-ink">
            {best !== null ? `${toArabicDigits(best)}%` : "—"}
          </p>
        </article>
      </section>

      <section className="mt-6 card flex flex-wrap items-center justify-between gap-4 bg-sky-50 p-5">
        <div>
          <h2 className="text-lg font-bold text-ink">ابدأ كويز جديد</h2>
          <p className="mt-1 text-sm text-ink-soft">
            اختر المادة والموضوع والوقت، ونجهز لك الأسئلة فورًا.
          </p>
        </div>
        <Link href="/student/quiz/new" className="btn-primary px-6 py-3">
          <PlayCircle size={18} aria-hidden="true" />
          ابدأ الآن
        </Link>
      </section>

      <section className="card mt-6" aria-label="آخر الكويزات">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-ink">آخر كويزاتك</h2>
        </div>
        {list.length > 0 ? (
          <ul className="divide-y divide-line">
            {list.slice(0, 5).map((s) => {
              const badge = STATUS_LABELS[s.status] ?? STATUS_LABELS.failed!;
              const href =
                s.status === "submitted"
                  ? `/student/quiz/${s.id}/result`
                  : `/student/quiz/${s.id}`;
              return (
                <li key={s.id}>
                  <Link
                    href={href}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-surface-muted"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">
                        {s.subject}
                        {s.topic ? ` · ${s.topic}` : ""}
                      </p>
                      <p className="text-xs text-ink-muted">{formatDateTimeAr(s.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {s.status === "submitted" && typeof s.score === "number" ? (
                        <span className="text-sm font-bold text-sky-700">
                          {toArabicDigits(s.score)} / {toArabicDigits(s.num_questions)}
                        </span>
                      ) : null}
                      <span className={badge.className}>{badge.label}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-ink-muted">
            لم تحل أي كويز بعد. ابدأ أول كويز الآن!
          </p>
        )}
      </section>
    </main>
  );
                                           }
