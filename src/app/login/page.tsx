"use client";

import Link from "next/link";
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { firstZodError, loginSchema } from "@/lib/validation";
import { siteConfig } from "@/config/site";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(firstZodError(parsed.error));
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });

      if (signInError) {
        setError("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
        setLoading(false);
        return;
      }

      const next = searchParams.get("next");
      const target = next && next.startsWith("/dashboard") ? next : "/dashboard";
      router.replace(target);
      router.refresh();
    } catch {
      setError("حدث خطأ غير متوقع. حاول مرة أخرى.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="label">
          البريد الإلكتروني
        </label>
        <input
          id="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          className="input text-left"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          required
        />
      </div>

      <div>
        <label htmlFor="password" className="label">
          كلمة المرور
        </label>
        <input
          id="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          className="input text-left"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          required
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700"
        >
          {error}
        </p>
      ) : null}

      <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            جارٍ تسجيل الدخول...
          </>
        ) : (
          "تسجيل الدخول"
        )}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4 py-12">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <Link href="/" className="flex items-center justify-center gap-2 text-sky-600">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-600 text-white">
            <GraduationCap size={22} aria-hidden="true" />
          </span>
          <span dir="ltr" lang="en" className="font-latin text-xl font-bold">
            {siteConfig.name}
          </span>
        </Link>

        <h1 className="mt-6 text-center text-2xl font-bold text-ink">تسجيل الدخول</h1>
        <p className="mt-1 text-center text-sm text-ink-muted">
          ادخل بحساب المدرس أو المساعد للوصول إلى لوحة التحكم.
        </p>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-center text-sm text-ink-muted">
          ليس لديك حساب؟{" "}
          <Link href="/signup" className="font-semibold text-sky-600 hover:text-sky-700">
            أنشئ حساب مدرس
          </Link>
        </p>
      </div>
    </main>
  );
}
