import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import { requireStudent } from "@/lib/student-auth";
import { cn, toArabicDigits } from "@/lib/utils";

export const dynamic = "force-dynamic";

const LETTERS = ["أ", "ب", "ج", "د"];

interface Question {
  id: number;
  question: string;
  options: string[];
}
interface AnswerKeyItem {
  id: number;
  correct_index: number;
  explanation: string;
}

export default async function QuizResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const student = await requireStudent();
  const { id } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("quiz_sessions")
    .select("id, subject, topic, status, questions, answers, score, num_questions")
    .eq("id", id)
    .eq("user_id", student.userId)
    .maybeSingle();

  if (!session) notFound();

  // الإجابات الصحيحة لا تُعرض إلا بعد انتهاء الكويز
  if (session.status !== "submitted" && session.status !== "expired") {
    redirect(`/student/quiz/${session.id}`);
  }

  const { data: keyRow } = await admin
    .from("quiz_answer_keys")
    .select("answer_key")
    .eq("session_id", session.id)
    .maybeSingle();

  const questions = (session.questions ?? []) as Question[];
  const key = (keyRow?.answer_key ?? []) as AnswerKeyItem[];
  const answers = (session.answers ?? {}) as Record<string, number>;

  const total = questions.length || session.num_questions;
  const score = session.score ?? 0;
  const percent = Math.round((score / Math.max(1, total)) * 100);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="card p-6 text-center">
        <p className="text-sm font-semibold text-ink-muted">
          نتيجتك في {session.subject}
          {session.topic ? ` · ${session.topic}` : ""}
          {session.status === "expired" ? " (انتهى الوقت)" : ""}
        </p>
        <p className="mt-2 text-5xl font-bold text-sky-700">{toArabicDigits(percent)}%</p>
        <p className="mt-1 text-ink-soft">
          {toArabicDigits(score)} من {toArabicDigits(total)} إجابة صحيحة
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/student/quiz/new" className="btn-primary px-5 py-2.5">
            كويز جديد
          </Link>
          <Link href="/student" className="btn-secondary px-5 py-2.5">
            اللوحة
          </Link>
        </div>
      </div>

      <h2 className="mb-3 mt-6 text-lg font-bold text-ink">مراجعة الإجابات</h2>
      <ul className="space-y-3">
        {questions.map((q, i) => {
          const k = key.find((x) => x.id === q.id);
          const chosen = answers[String(q.id)];
          const hasChosen = typeof chosen === "number";
          const correct = k ? chosen === k.correct_index : false;
          return (
            <li key={q.id} className="card p-4">
              <div className="flex items-start gap-2">
                {correct ? (
                  <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success-600" aria-hidden="true" />
                ) : (
                  <XCircle size={20} className="mt-0.5 shrink-0 text-danger-600" aria-hidden="true" />
                )}
                <p className="font-semibold text-ink">
                  {toArabicDigits(i + 1)}. {q.question}
                </p>
              </div>
              <ul className="mt-3 space-y-1.5">
                {q.options.map((opt, oi) => (
                  <li
                    key={oi}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm",
                      k && oi === k.correct_index
                        ? "border-success-600 bg-success-50 text-success-700"
                        : hasChosen && oi === chosen
                          ? "border-danger-600 bg-danger-50 text-danger-700"
                          : "border-line text-ink-soft"
                    )}
                  >
                    <span className="font-bold">{LETTERS[oi]}.</span> {opt}
                  </li>
                ))}
              </ul>
              {!hasChosen ? (
                <p className="mt-2 text-xs font-semibold text-warning-700">لم تجب عن هذا السؤال.</p>
              ) : null}
              {k?.explanation ? (
                <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-ink-soft">
                  <strong className="text-sky-700">الشرح: </strong>
                  {k.explanation}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
    }
