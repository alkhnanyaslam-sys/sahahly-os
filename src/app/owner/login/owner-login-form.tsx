"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Lock, Mail } from "lucide-react";

export function OwnerLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(null);

    if (!email.trim() || !password) {
      setError("بيانات الدخول غير صحيحة.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(
          response.status === 429
            ? "محاولات كثيرة. حاول مرة أخرى بعد قليل."
            : body.error ?? "بيانات الدخول غير صحيحة."
        );
        setLoading(false);
        return;
      }

      router.replace("/owner");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div>
        <label
          htmlFor="owner-email"
          className="mb-2 block text-sm font-bold text-[#15243b]"
        >
          البريد الإلكتروني المعتمد
        </label>
        <div className="relative">
          <input
            id="owner-email"
            type="email"
            dir="ltr"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className="w-full rounded-xl border border-[#dce6f2] bg-[#f8fafc] px-4 py-3.5 pe-11 text-left text-sm text-[#15243b] outline-none focus:border-[#174ea6] focus:ring-2 focus:ring-[#174ea6]/15 disabled:opacity-60"
          />
          <Mail
            size={18}
            aria-hidden="true"
            className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[#7d8ca1]"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="owner-password"
          className="mb-2 block text-sm font-bold text-[#15243b]"
        >
          كلمة المرور
        </label>
        <div className="relative">
          <input
            id="owner-password"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className="w-full rounded-xl border border-[#dce6f2] bg-[#f8fafc] px-4 py-3.5 pe-11 text-left text-sm text-[#15243b] outline-none focus:border-[#174ea6] focus:ring-2 focus:ring-[#174ea6]/15 disabled:opacity-60"
          />
          <Lock
            size={18}
            aria-hidden="true"
            className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[#7d8ca1]"
          />
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-[#f3d1d1] bg-[#fdf3f3] px-4 py-3 text-sm text-[#a12626]"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#174ea6] px-4 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#123f88] disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            جارٍ التحقق...
          </>
        ) : (
          "تسجيل الدخول"
        )}
      </button>
    </form>
  );
      }
