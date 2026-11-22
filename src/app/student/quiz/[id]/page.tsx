"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";
import { cn, toArabicDigits } from "@/lib/utils";

interface Question {
  id: number;
  question: string;
  options: string[];
}

interface ReviewItem {
  id: number;
  chosen: number | null;
  correct_index: number;
  is_correct: boolean;
  explanation: string;
}

interface Result {
  late: boolean;
  score: number;
  total: number;
  review: ReviewItem[];
}

const LETTERS = ["أ", "ب", "ج", "د"];

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const storageKey = `quiz-answers-${id}`;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subject, setSubject] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const endAtRef = useRef<number>(0);
  const submittedRef = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/student/quiz/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start" }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          status?: string;
          questions?: Question[];
          remaining_ms?: number;
          subject?: string;
        };
        if (cancelled) return;

        if (!response.ok || !body.questions) {
          setError(
            body.status === "submitted" || body.status === "expired"
              ? "تم تسليم هذا الكويز من قبل."
              : body.error ?? "تعذر فتح الكويز."
          );
          return;
        }

        setQuestions(body.questions);
        setSubject(body.subject ?? "");
        endAtRef.current = Date.now() + (body.remaining_ms ?? 0);
        setRemaining(body.remaining_ms ?? 0);

        try {
          const saved = window.localStorage.getItem(storageKey);
          if (saved) setAnswers(JSON.parse(saved) as Record<string, number>);
        } catch {
          // التخزين المحلي غير متاح؛ نتجاهله.
        }
      } catch {
        if (!cancelled) setError("تعذر الاتصال بالخادم.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, storageKey]);

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/student/quiz/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", answers: answersRef.current }),
      });
      const body = (await response.json().catch(() => ({}))) as Result & {
        error?: string;
      };
      if (!response.ok) {
        submittedRef.current = false;
        setError(body.error ?? "تعذر تسليم الكويز.");
        setSubmitting(false);
        return;
      }
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // لا شيء.
      }
      setResult(body);
    } catch {
      submittedRef.current = false;
      setError("تعذر الاتصال بالخادم. حاول التسليم مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  }, [id, storageKey]);

  // العدّاد
  useEffect(() => {
    if (loading || result || error || questions.length === 0) return;
    const timer = window.setInterval(() => {
      const left = endAtRef.current - Date.now();
      setRemaining(left);
      if (left <= 0) {
        window.clearInterval(timer);
        void submit();
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [loading, result, error, questions.length, submit]);

  function choose(questionId: number, optionIndex: number) {
    setAnswers((prev) => {
      const next = { ...prev, [String(questionId)]: optionIndex };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // لا شيء.
      }
      return next;
    });
  }

  const answered = useMemo(() => Object.keys(answers).length, [answers]);

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center gap-2 text-ink-muted">
        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        جارٍ فتح الكويز...
      </main>
    );
  }

  if (error && !result) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-10 text-center">
        <p
          role="alert"
          className="flex items-start justify-center gap-2 rounded-lg border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
        <Link href="/student" className="btn-primary mt-5 px-6 py-2.5">
          العودة للوحة
        </Link>
      </main>
    );
  }

  if (result) {
    const percent = Math.round((result.score / Math.max(1, result.total)) * 100);
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card p-6 text-center"
        >
          <p className="text-sm font-semibold text-ink-muted">
            نتيجتك في {subject}
            {result.late ? " (انتهى الوقت)" : ""}
          </p>
          <p className="mt-2 text-5xl font-bold text-sky-700">{toArabicDigits(percent)}%</p>
          <p className="mt-1 text-ink-soft">
            {toArabicDigits(result.score)} من {toArabicDigits(result.total)} إجابة صحيحة
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/student/quiz/new" className="btn-primary px-5 py-2.5">
              كويز جديد
            </Link>
            <Link href="/student" className="btn-secondary px-5 py-2.5">
              اللوحة
            </Link>
          </div>
        </motion.div>

        <h2 className="mb-3 mt-6 text-lg font-bold text-ink">مراجعة الإجابات</h2>
        <ul className="space-y-3">
          {questions.map((q, i) => {
            const r = result.review.find((x) => x.id === q.id);
            if (!r) return null;
            return (
              <motion.li
                key={q.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.4) }}
                className="card p-4"
              >
                <div className="flex items-start gap-2">
                  {r.is_correct ? (
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
                        oi === r.correct_index
                          ? "border-success-600 bg-success-50 text-success-700"
                          : oi === r.chosen
                            ? "border-danger-600 bg-danger-50 text-danger-700"
                            : "border-line text-ink-soft"
                      )}
                    >
                      <span className="font-bold">{LETTERS[oi]}.</span> {opt}
                    </li>
                  ))}
                </ul>
                {r.chosen === null ? (
                  <p className="mt-2 text-xs font-semibold text-warning-700">لم تجب عن هذا السؤال.</p>
                ) : null}
                {r.explanation ? (
                  <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-ink-soft">
                    <strong className="text-sky-700">الشرح: </strong>
                    {r.explanation}
                  </p>
                ) : null}
              </motion.li>
            );
          })}
        </ul>
      </main>
    );
  }

  const q = questions[index];
  if (!q) return null;
  const urgent = remaining < 60_000;
  const progress = ((index + 1) / questions.length) * 100;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <header className="card sticky top-2 z-10 flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm font-bold text-ink">{subject}</p>
          <p className="text-xs text-ink-muted">
            أجبت عن {toArabicDigits(answered)} من {toArabicDigits(questions.length)}
          </p>
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-latin text-lg font-bold tabular-nums",
            urgent ? "bg-danger-50 text-danger-700" : "bg-sky-50 text-sky-700"
          )}
          role="timer"
          aria-label="الوقت المتبقي"
        >
          <Clock size={18} aria-hidden="true" />
          {formatClock(remaining)}
        </div>
      </header>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-sky-100">
        <motion.div
          className="h-full rounded-full bg-sky-600"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.section
          key={q.id}
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.2 }}
          className="card mt-4 p-5"
        >
          <p className="text-xs font-semibold text-ink-muted">
            السؤال {toArabicDigits(index + 1)} من {toArabicDigits(questions.length)}
          </p>
          <h1 className="mt-2 text-lg font-bold leading-8 text-ink">{q.question}</h1>
          <div className="mt-4 space-y-2.5">
            {q.options.map((opt, oi) => {
              const selected = answers[String(q.id)] === oi;
              return (
                <motion.button
                  key={oi}
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => choose(q.id, oi)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-right transition-colors",
                    selected
                      ? "border-sky-500 bg-sky-50"
                      : "border-line bg-white hover:bg-surface-muted"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                      selected ? "bg-sky-600 text-white" : "bg-surface-muted text-ink-soft"
                    )}
                  >
                    {LETTERS[oi]}
                  </span>
                  <span className="text-sm text-ink">{opt}</span>
                </motion.button>
              );
            })}
          </div>
        </motion.section>
      </AnimatePresence>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="btn-secondary px-4 py-2"
        >
          <ChevronRight size={16} aria-hidden="true" />
          السابق
        </button>

        {index < questions.length - 1 ? (
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
            className="btn-primary px-5 py-2"
          >
            التالي
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              const missing = questions.length - answered;
              if (
                missing > 0 &&
                !window.confirm(`لم تجب عن ${missing} سؤال. هل تريد التسليم؟`)
              ) {
                return;
              }
              void submit();
            }}
            disabled={submitting}
            className="btn-success px-5 py-2"
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 size={16} aria-hidden="true" />
            )}
            تسليم الكويز
          </button>
        )}
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-1.5" aria-label="التنقل بين الأسئلة">
        {questions.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`السؤال ${i + 1}`}
            className={cn(
              "h-8 w-8 rounded-lg text-xs font-bold transition-colors",
              i === index
                ? "bg-sky-600 text-white"
                : answers[String(item.id)] !== undefined
                  ? "bg-sky-100 text-sky-700"
                  : "border border-line bg-white text-ink-muted"
            )}
          >
            {toArabicDigits(i + 1)}
          </button>
        ))}
      </div>
    </main>
  );
    }
