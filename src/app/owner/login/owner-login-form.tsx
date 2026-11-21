"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle, LockKeyhole, Mail } from "lucide-react";

const GENERIC_ERROR = "بيانات الدخول غير صحيحة";

export function OwnerLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        setError(result?.error || GENERIC_ERROR);
        setIsSubmitting(false);
        return;
      }

      router.replace("/owner");
      router.refresh();
    } catch {
      setError("تعذّر إكمال تسجيل الدخول. حاول مرة أخرى.");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="owner-email" className="mb-2 block text-sm font-bold text-[#263750]">
          البريد الإلكتروني
        </label>
        <div className="relative">
          <Mail size={18} aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8797ad]" />
          <input
            id="owner-email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            dir="ltr"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="البريد المعتمد للمالك"
            className="w-full rounded-xl border border-[#d8e2ef] bg-[#ffffff] py-3 pr-11 pl-4 text-left text-sm text-[#15243b] placeholder:text-[#9aa8bb] focus:border-[#2e67bb] focus:outline-none focus:ring-4 focus:ring-[#e7effb]"
          />
        </div>
      </div>

      <div>
        <label htmlFor="owner-password" className="mb-2 block text-sm font-bold text-[#263750]">
          كلمة المرور
        </label>
        <div className="relative">
          <LockKeyhole size={18} aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8797ad]" />
          <input
            id="owner-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={1024}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="أدخل كلمة المرور"
            className="w-full rounded-xl border border-[#d8e2ef] bg-[#ffffff] py-3 pr-11 pl-4 text-sm text-[#15243b] placeholder:text-[#9aa8bb] focus:border-[#2e67bb] focus:outline-none focus:ring-4 focus:ring-[#e7effb]"
          />
        </div>
      </div>

      {error ? (
        <p role="alert" aria-live="polite" className="rounded-xl border border-[#f2d2cf] bg-[#fff6f5] px-4 py-3 text-sm font-semibold text-[#a3322b]">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#174ea6] px-4 py-3.5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(23,78,166,0.18)] transition-colors hover:bg-[#123f88] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174ea6] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? (
          <>
            <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
            <span>جارٍ التحقق</span>
          </>
        ) : (
          <>
            <span>دخول آمن</span>
            <ArrowLeft size={17} aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  );
}
