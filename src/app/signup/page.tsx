"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { firstZodError, signupSchema } from "@/lib/validation";
import { siteConfig } from "@/config/site";
import ThemeToggle from "@/components/ThemeToggle";

interface SignupFormState {
  name: string;
  subject: string;
  phone: string;
  email: string;
  password: string;
}

const INITIAL_STATE: SignupFormState = {
  name: "",
  subject: "",
  phone: "",
  email: "",
  password: "",
};

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState<SignupFormState>(INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof SignupFormState>(key: K, value: SignupFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = signupSchema.safeParse(form);
    if (!parsed.success) {
      setError(firstZodError(parsed.error));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!response.ok) {
        const body: { error?: string } = await response
          .json()
          .catch(() => ({}));
        setError(body.error ?? "تعذر إنشاء الحساب. حاول مرة أخرى.");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });

      if (signInError) {
        router.replace("/login");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("حدث خطأ غير متوقع. حاول مرة أخرى.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4 py-12">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2 text-sky-600">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-600 text-white">
              <GraduationCap size={22} aria-hidden="true" />
            </span>
            <span dir="ltr" lang="en" className="font-latin text-xl font-bold">
              {siteConfig.name}
            </span>
          </Link>
          <ThemeToggle className="px-2" />
        </div>

        <h1 className="mt-6 text-center text-2xl font-bold text-ink">إنشاء حساب مدرس</h1>
        <p className="mt-1 text-center text-sm text-ink-muted">
          ابدأ تجربتك المجانية وأضف مجموعتك الأولى خلال دقائق.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="name" className="label">
              الاسم
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              className="input"
              placeholder="مثال: أ/ أحمد محمود"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div>
            <label htmlFor="subject" className="label">
              المادة
            </label>
            <input
              id="subject"
              type="text"
              className="input"
              placeholder="مثال: الرياضيات"
              value={form.subject}
              onChange={(e) => update("subject", e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div>
            <label htmlFor="phone" className="label">
              رقم الهاتف
            </label>
            <input
              id="phone"
              type="tel"
              dir="ltr"
              autoComplete="tel"
              className="input text-left"
              placeholder="01012345678"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              disabled={loading}
              required
            />
          </div>

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
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
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
              autoComplete="new-password"
              className="input text-left"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              disabled={loading}
              required
            />
            <p className="mt-1 text-xs text-ink-muted">8 أحرف على الأقل.</p>
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
                جارٍ إنشاء الحساب...
              </>
            ) : (
              "إنشاء الحساب"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-muted">
          لديك حساب بالفعل؟{" "}
          <Link href="/login" className="font-semibold text-sky-600 hover:text-sky-700">
            تسجيل الدخول
          </Link>
        </p>
      </div>
    </main>
  );
              }
