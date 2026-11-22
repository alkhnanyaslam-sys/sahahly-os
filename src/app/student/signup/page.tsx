"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface Subject {
  id: string;
  name: string;
  language: string;
}
interface System {
  id: string;
  country: string;
  name: string;
}
interface Stage {
  id: string;
  system_id: string;
  name: string;
}
interface Grade {
  id: string;
  stage_id: string;
  name: string;
  has_tracks: boolean;
}
interface Track {
  id: string;
  grade_id: string;
  name: string;
}
interface Options {
  subjects: Subject[];
  systems: System[];
  stages: Stage[];
  grades: Grade[];
  tracks: Track[];
}

const LANGUAGES = [
  { code: "ar", label: "العربية", hint: "أدرس بالعربية" },
  { code: "en", label: "English", hint: "I study in English" },
  { code: "fr", label: "Français", hint: "J'étudie en français" },
  { code: "de", label: "Deutsch", hint: "Ich lerne auf Deutsch" },
] as const;

const COUNTRIES = [
  "مصر",
  "السعودية",
  "الإمارات",
  "الكويت",
  "قطر",
  "البحرين",
  "عُمان",
  "الأردن",
  "لبنان",
  "العراق",
  "سوريا",
  "فلسطين",
  "ليبيا",
  "تونس",
  "الجزائر",
  "المغرب",
  "السودان",
  "اليمن",
  "أخرى",
];

const STEP_TITLES = ["عمرك", "لغة الدراسة", "المادة", "بياناتك"];

const EMPTY_OPTIONS: Options = {
  subjects: [],
  systems: [],
  stages: [],
  grades: [],
  tracks: [],
};

const variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * -40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * 40 }),
};

function FloatingBubbles() {
  const bubbles = [
    { size: 220, left: "6%", top: "12%", dur: 14 },
    { size: 140, left: "82%", top: "20%", dur: 11 },
    { size: 180, left: "70%", top: "75%", dur: 16 },
    { size: 100, left: "12%", top: "78%", dur: 12 },
  ];
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {bubbles.map((b, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-sky-200/40"
          style={{ width: b.size, height: b.size, left: b.left, top: b.top }}
          animate={{ y: [0, -24, 0], x: [0, 12, 0] }}
          transition={{ duration: b.dur, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

export default function StudentSignupPage() {
  const router = useRouter();

  const [options, setOptions] = useState<Options>(EMPTY_OPTIONS);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const [age, setAge] = useState("");
  const [language, setLanguage] = useState<string>("");
  const [subjectId, setSubjectId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [country, setCountry] = useState("مصر");
  const [password, setPassword] = useState("");
  const [stageId, setStageId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [trackId, setTrackId] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/student/options");
        if (!response.ok) throw new Error("failed");
        const data = (await response.json()) as Options;
        if (!cancelled) setOptions(data);
      } catch {
        if (!cancelled) setOptionsError("تعذر تحميل الخيارات. أعد تحميل الصفحة.");
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subjectsForLanguage = useMemo(
    () => options.subjects.filter((s) => s.language === language),
    [options.subjects, language]
  );

  const egyptSystem = useMemo(
    () => options.systems.find((s) => s.country === "مصر") ?? null,
    [options.systems]
  );
  const showEducation = country === "مصر" && egyptSystem !== null;
  const stages = useMemo(
    () => options.stages.filter((s) => s.system_id === egyptSystem?.id),
    [options.stages, egyptSystem]
  );
  const grades = useMemo(
    () => options.grades.filter((g) => g.stage_id === stageId),
    [options.grades, stageId]
  );
  const selectedGrade = grades.find((g) => g.id === gradeId) ?? null;
  const tracks = useMemo(
    () => options.tracks.filter((t) => t.grade_id === gradeId),
    [options.tracks, gradeId]
  );

  function go(next: number) {
    setDirection(next > step ? 1 : -1);
    setError(null);
    setStep(next);
  }

  function validateStep(): string | null {
    if (step === 0) {
      const n = Number(age);
      if (!Number.isInteger(n) || n < 5 || n > 80) return "اكتب عمرًا بين 5 و80 سنة.";
    }
    if (step === 1 && !language) return "اختر لغة الدراسة.";
    if (step === 2 && !subjectId) return "اختر المادة.";
    return null;
  }

  function next() {
    const problem = validateStep();
    if (problem) {
      setError(problem);
      return;
    }
    go(step + 1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (fullName.trim().length < 2) return setError("اكتب اسمك.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("البريد الإلكتروني غير صالح.");
    if (whatsapp.replace(/[^\d]/g, "").length < 8) return setError("رقم الواتساب غير صالح.");
    if (!country) return setError("اختر الدولة.");
    if (password.length < 8) return setError("كلمة المرور 8 أحرف على الأقل.");
    if (showEducation) {
      if (!stageId) return setError("اختر المرحلة الدراسية.");
      if (!gradeId) return setError("اختر الصف.");
      if (selectedGrade?.has_tracks && !trackId) return setError("اختر الشعبة.");
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/student/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          age: Number(age),
          study_language: language,
          subject_id: subjectId,
          full_name: fullName.trim(),
          email: email.trim(),
          password,
          whatsapp: whatsapp.trim(),
          country,
          system_id: showEducation ? egyptSystem?.id ?? null : null,
          stage_id: showEducation ? stageId || null : null,
          grade_id: showEducation ? gradeId || null : null,
          track_id: showEducation ? trackId || null : null,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "تعذر إنشاء الحساب. حاول مرة أخرى.");
        setSubmitting(false);
        return;
      }

      try {
        const supabase = createClient();
        await supabase.auth.signInWithPassword({ email: email.trim(), password });
      } catch {
        // الحساب أُنشئ؛ يمكنه الدخول يدويًا لاحقًا.
      }
      setDone(true);
      setSubmitting(false);
    } catch {
      setError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
      setSubmitting(false);
    }
  }

  const progress = ((step + 1) / STEP_TITLES.length) * 100;

  return (
    <main className="relative mx-auto flex min-h-[calc(100vh-10rem)] w-full max-w-xl flex-col justify-center px-4 py-10">
      <FloatingBubbles />

      <Link href="/" className="mb-6 flex items-center justify-center gap-2 text-sky-600">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-600 text-white">
          <GraduationCap size={22} aria-hidden="true" />
        </span>
        <span dir="ltr" lang="en" className="font-latin text-xl font-bold">
          Sahahly OS
        </span>
      </Link>

      <div className="card overflow-hidden p-5 sm:p-7">
        {done ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="py-6 text-center"
            role="status"
          >
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-100 text-success-600"
            >
              <CheckCircle2 size={36} aria-hidden="true" />
            </motion.span>
            <h1 className="mt-4 text-xl font-bold text-ink">أهلًا بك يا {fullName.split(" ")[0]}!</h1>
            <p className="mt-2 text-sm text-ink-soft">تم إنشاء حسابك بنجاح. جهّز نفسك لأول كويز.</p>
            <button
              type="button"
              onClick={() => router.replace("/student")}
              className="btn-primary mt-6 px-8 py-3"
            >
              ادخل لوحتك
            </button>
          </motion.div>
        ) : loadingOptions ? (
          <div className="flex items-center justify-center gap-2 py-16 text-ink-muted">
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            جارٍ التحميل...
          </div>
        ) : optionsError ? (
          <p role="alert" className="py-10 text-center text-sm text-danger-700">
            {optionsError}
          </p>
        ) : (
          <>
            <div className="mb-5">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-ink-muted">
                <span>
                  الخطوة {step + 1} من {STEP_TITLES.length}
                </span>
                <span>{STEP_TITLES[step]}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-sky-100">
                <motion.div
                  className="h-full rounded-full bg-sky-600"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.35 }}
                />
              </div>
            </div>

            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25 }}
              >
                {step === 0 ? (
                  <div>
                    <h1 className="text-2xl font-bold text-ink">كم عمرك؟</h1>
                    <p className="mt-1 text-sm text-ink-muted">نستخدمه لاختيار مستوى الأسئلة المناسب.</p>
                    <label htmlFor="age" className="sr-only">
                      العمر
                    </label>
                    <input
                      id="age"
                      type="number"
                      inputMode="numeric"
                      min={5}
                      max={80}
                      dir="ltr"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          next();
                        }
                      }}
                      className="input mt-5 text-center text-3xl font-bold"
                      placeholder="15"
                      autoFocus
                    />
                  </div>
                ) : null}

                {step === 1 ? (
                  <div>
                    <h1 className="text-2xl font-bold text-ink">بأي لغة تدرس؟</h1>
                    <p className="mt-1 text-sm text-ink-muted">ستظهر لك المواد بهذه اللغة.</p>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {LANGUAGES.map((lang) => (
                        <motion.button
                          key={lang.code}
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            setLanguage(lang.code);
                            setSubjectId("");
                          }}
                          className={cn(
                            "rounded-xl border p-4 text-right transition-colors",
                            language === lang.code
                              ? "border-sky-500 bg-sky-50"
                              : "border-line bg-white hover:bg-surface-muted"
                          )}
                        >
                          <span className="block text-lg font-bold text-ink">{lang.label}</span>
                          <span className="block text-xs text-ink-muted">{lang.hint}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {step === 2 ? (
                  <div>
                    <h1 className="text-2xl font-bold text-ink">اختر المادة</h1>
                    <p className="mt-1 text-sm text-ink-muted">سنجهز لك كويزات في هذه المادة.</p>
                    {subjectsForLanguage.length === 0 ? (
                      <p className="mt-5 rounded-lg border border-line bg-surface-muted px-4 py-8 text-center text-sm text-ink-muted">
                        لا توجد مواد متاحة بهذه اللغة حاليًا. ارجع واختر لغة أخرى.
                      </p>
                    ) : (
                      <div className="mt-5 grid grid-cols-2 gap-3">
                        {subjectsForLanguage.map((subject, index) => (
                          <motion.button
                            key={subject.id}
                            type="button"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.04 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => setSubjectId(subject.id)}
                            className={cn(
                              "rounded-xl border px-3 py-4 text-center text-sm font-bold transition-colors",
                              subjectId === subject.id
                                ? "border-sky-500 bg-sky-50 text-sky-700"
                                : "border-line bg-white text-ink-soft hover:bg-surface-muted"
                            )}
                          >
                            {subject.name}
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {step === 3 ? (
                  <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <div>
                      <h1 className="text-2xl font-bold text-ink">بياناتك</h1>
                      <p className="mt-1 text-sm text-ink-muted">آخر خطوة وتبدأ.</p>
                    </div>

                    <div>
                      <label htmlFor="full-name" className="label">
                        الاسم
                      </label>
                      <input
                        id="full-name"
                        className="input"
                        autoComplete="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        disabled={submitting}
                      />
                    </div>

                    <div>
                      <label htmlFor="student-email" className="label">
                        البريد الإلكتروني
                      </label>
                      <input
                        id="student-email"
                        type="email"
                        dir="ltr"
                        autoComplete="email"
                        className="input text-left"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={submitting}
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="student-whatsapp" className="label">
                          رقم الواتساب
                        </label>
                        <input
                          id="student-whatsapp"
                          type="tel"
                          dir="ltr"
                          autoComplete="tel"
                          className="input text-left"
                          placeholder="01012345678"
                          value={whatsapp}
                          onChange={(e) => setWhatsapp(e.target.value)}
                          disabled={submitting}
                        />
                      </div>
                      <div>
                        <label htmlFor="student-country" className="label">
                          الدولة
                        </label>
                        <select
                          id="student-country"
                          className="input"
                          value={country}
                          onChange={(e) => {
                            setCountry(e.target.value);
                            setStageId("");
                            setGradeId("");
                            setTrackId("");
                          }}
                          disabled={submitting}
                        >
                          {COUNTRIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {showEducation ? (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="grid gap-4 sm:grid-cols-3"
                      >
                        <div>
                          <label htmlFor="stage" className="label">
                            المرحلة
                          </label>
                          <select
                            id="stage"
                            className="input"
                            value={stageId}
                            onChange={(e) => {
                              setStageId(e.target.value);
                              setGradeId("");
                              setTrackId("");
                            }}
                            disabled={submitting}
                          >
                            <option value="">اختر</option>
                            {stages.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="grade" className="label">
                            الصف
                          </label>
                          <select
                            id="grade"
                            className="input"
                            value={gradeId}
                            onChange={(e) => {
                              setGradeId(e.target.value);
                              setTrackId("");
                            }}
                            disabled={submitting || !stageId}
                          >
                            <option value="">اختر</option>
                            {grades.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        {selectedGrade?.has_tracks ? (
                          <div>
                            <label htmlFor="track" className="label">
                              الشعبة
                            </label>
                            <select
                              id="track"
                              className="input"
                              value={trackId}
                              onChange={(e) => setTrackId(e.target.value)}
                              disabled={submitting}
                            >
                              <option value="">اختر</option>
                              {tracks.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                      </motion.div>
                    ) : null}

                    <div>
                      <label htmlFor="student-password" className="label">
                        كلمة المرور
                      </label>
                      <input
                        id="student-password"
                        type="password"
                        dir="ltr"
                        autoComplete="new-password"
                        className="input text-left"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={submitting}
                      />
                      <p className="mt-1 text-xs text-ink-muted">8 أحرف على الأقل.</p>
                    </div>

                    {error ? <ErrorBox message={error} /> : null}

                    <button type="submit" className="btn-primary w-full py-3" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                          جارٍ إنشاء الحساب...
                        </>
                      ) : (
                        "إنشاء الحساب"
                      )}
                    </button>
                  </form>
                ) : null}
              </motion.div>
            </AnimatePresence>

            {step < 3 && error ? (
              <div className="mt-4">
                <ErrorBox message={error} />
              </div>
            ) : null}

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() => go(step - 1)}
                disabled={step === 0 || submitting}
                className="btn-secondary px-4 py-2 disabled:invisible"
              >
                <ArrowRight size={16} aria-hidden="true" />
                السابق
              </button>
              {step < 3 ? (
                <button type="button" onClick={next} className="btn-primary px-6 py-2">
                  التالي
                  <ArrowLeft size={16} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      {!done ? (
        <p className="mt-5 text-center text-sm text-ink-muted">
          لديك حساب؟{" "}
          <Link href="/student/login" className="font-semibold text-sky-600 hover:text-sky-700">
            تسجيل الدخول
          </Link>
        </p>
      ) : null}
    </main>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700"
    >
      <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}
