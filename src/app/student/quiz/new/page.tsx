"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Subject {
  id: string;
  name: string;
  language: string;
}

const DIFFICULTIES = [
  { value: "easy", label: "سهل", hint: "أساسي" },
  { value: "medium", label: "متوسط", hint: "مستوى المنهج" },
  { value: "hard", label: "صعب", hint: "مستويات عليا" },
] as const;

const COUNTS = [5, 10, 15, 20];
const TIMES = [5, 10, 15, 20, 30, 45, 60];

export default function NewQuizPage() {
  const router = useRouter();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [count, setCount] = useState(10);
  const [minutes, setMinutes] = useState(15);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/student/options");
        if (!response.ok) throw new Error("failed");
        const data = (await response.json()) as { subjects: Subject[] };
        if (!cancelled) {
          setSubjects(data.subjects);
          if (data.subjects[0]) setSubject(data.subjects[0].name);
        }
      } catch {
        if (!cancelled) setError("تعذر تحميل المواد. أعد تحميل الصفحة.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (generating) return;
    setError(null);

    if (!subject) {
      setError("اختر المادة.");
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch("/api/student/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          topic: topic.trim() || undefined,
          difficulty,
          num_questions: count,
          time_limit_minutes: minutes,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        session_id?: string;
      };

      if (!response.ok || !body.session_id) {
        setError(body.error ?? "تعذر إنشاء الكويز. حاول مرة أخرى.");
        setGenerating(false);
        return;
      }

      router.push(`/student/quiz/${body.session_id}`);
    } catch {
      setError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
      setGenerating(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6">
      <Link
        href="/student"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-sky-600"
      >
        <ArrowRight size={16} aria-hidden="true" />
        العودة للوحة
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="card mt-4 p-5 sm:p-7"
      >
        <h1 className="text-2xl font-bold text-ink">كويز جديد</h1>
        <p className="mt-1 text-sm text-ink-muted">حدّد ما تريد، ونجهز لك الأسئلة بالذكاء الاصطناعي.</p>

        {generating ? (
          <div className="py-14 text-center" role="status" aria-live="polite">
            <motion.span
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-sky-600"
              animate={{ scale: [1, 1.12, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            >
              <Sparkles size={30} aria-hidden="true" />
            </motion.span>
            <p className="mt-4 text-lg font-bold text-ink">جارٍ تجهيز أسئلتك...</p>
            <p className="mt-1 text-sm text-ink-muted">قد يستغرق الأمر حتى نصف دقيقة.</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-ink-muted">
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            جارٍ التحميل...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
            <div>
              <label htmlFor="quiz-subject" className="label">
                المادة
              </label>
              <select
                id="quiz-subject"
                className="input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="quiz-topic" className="label">
                الدرس أو الموضوع (اختياري)
              </label>
              <input
                id="quiz-topic"
                className="input"
                placeholder="مثال: المعادلات من الدرجة الثانية"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={200}
              />
            </div>

            <fieldset>
              <legend className="label">مستوى الصعوبة</legend>
              <div className="grid grid-cols-3 gap-2">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDifficulty(d.value)}
                    className={cn(
                      "rounded-xl border px-2 py-3 text-center transition-colors",
                      difficulty === d.value
                        ? "border-sky-500 bg-sky-50"
                        : "border-line bg-white hover:bg-surface-muted"
                    )}
                  >
                    <span className="block text-sm font-bold text-ink">{d.label}</span>
                    <span className="block text-xs text-ink-muted">{d.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="quiz-count" className="label">
                  عدد الأسئلة
                </label>
                <select
                  id="quiz-count"
                  className="input"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                >
                  {COUNTS.map((n) => (
                    <option key={n} value={n}>
                      {n} سؤال
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="quiz-time" className="label">
                  الوقت
                </label>
                <select
                  id="quiz-time"
                  className="input"
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                >
                  {TIMES.map((n) => (
                    <option key={n} value={n}>
                      {n} دقيقة
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </p>
            ) : null}

            <button type="submit" className="btn-primary w-full py-3">
              <Sparkles size={18} aria-hidden="true" />
              جهّز الكويز
            </button>
          </form>
        )}
      </motion.div>
    </main>
  );
                }
