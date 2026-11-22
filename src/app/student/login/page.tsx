"use client";

import Link from "next/link";
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertCircle, GraduationCap, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function StudentLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(null);

    if (!/^\S+@\S+\.\S+$/.test(email.trim()) || password.length < 6) {
      setError("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError || !data.user) {
        setError("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("student_profiles")
        .select("user_id")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (!profile) {
        await supabase.auth.signOut();
        setError("هذا الحساب ليس حساب طالب. استخدم بوابة المدرسين.");
        setLoading(false);
        return;
      }

      const next = searchParams.get("next");
      const target = next && next.startsWith("/student") ? next : "/student";
      router.replace(target);
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
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
          disabled={loading}
        />
      </div>

      <div>
        <label htmlFor="student-password" className="label">
          كلمة المرور
        </label>
        <input
          id="student-password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          className="input text-left"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
        />
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

      <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            جارٍ الدخول...
          </>
        ) : (
          "تسجيل الدخول"
        )}
      </button>
    </form>
  );
}

export default function StudentLoginPage() {
  return (
    <main className="relative mx-auto flex min-h-[calc(100vh-10rem)] w-full max-w-md flex-col justify-center px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <motion.span
          className="absolute -left-10 top-20 h-52 w-52 rounded-full bg-sky-200/40"
          animate={{ y: [0, -22, 0] }}
          transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span
          className="absolute -right-8 bottom-24 h-40 w-40 rounded-full bg-sky-200/40"
          animate={{ y: [0, 20, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="card p-6 sm:p-8"
      >
        <Link href="/" className="flex items-center justify-center gap-2 text-sky-600">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-600 text-white">
            <GraduationCap size={22} aria-hidden="true" />
          </span>
          <span dir="ltr" lang="en" className="font-latin text-xl font-bold">
            Sahahly OS
          </span>
        </Link>

        <h1 className="mt-6 text-center text-2xl font-bold text-ink">دخول الطالب</h1>
        <p className="mt-1 text-center text-sm text-ink-muted">
          ادخل لتكمل مذاكرتك وتبدأ كويز جديد.
        </p>

        <Suspense fallback={null}>
          <StudentLoginForm />
        </Suspense>

        <p className="mt-6 text-center text-sm text-ink-muted">
          ليس لديك حساب؟{" "}
          <Link href="/student/signup" className="font-semibold text-sky-600 hover:text-sky-700">
            أنشئ حساب طالب
          </Link>
        </p>
      </motion.div>
    </main>
  );
  }
