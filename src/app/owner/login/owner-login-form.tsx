"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { OWNER_EMAIL } from "@/lib/owner-email";

export function OwnerLoginForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function sendCode() {
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", email: OWNER_EMAIL }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;

      if (!response.ok) {
        setError(result?.error || "تعذّر إرسال الرمز. حاول مرة أخرى.");
        return;
      }

      setIsCodeSent(true);
      setMessage("إذا كان البريد معتمدًا، سيصلك رمز تحقق عليه.");
    } catch {
      setError("تعذّر إرسال الرمز. حاول مرة أخرى.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCodeSent) {
      await sendCode();
      return;
    }

    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email: OWNER_EMAIL, token }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        setError(result?.error || "الرمز غير صحيح أو انتهت صلاحيته.");
        return;
      }

      router.replace("/owner");
      router.refresh();
    } catch {
      setError("تعذّر التحقق من الرمز. حاول مرة أخرى.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="owner-email" className="mb-2 block text-sm font-bold text-[#263750]">
          البريد الإلكتروني المعتمد
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
            readOnly
            value={OWNER_EMAIL}
            className="w-full rounded-xl border border-[#d8e2ef] bg-[#f6f8fb] py-3 pr-11 pl-4 text-left text-sm text-[#15243b] focus:outline-none"
          />
        </div>
      </div>

      {isCodeSent ? (
        <div>
          <label htmlFor="owner-code" className="mb-2 block text-sm font-bold text-[#263750]">
            رمز التحقق المرسل إلى بريدك
          </label>
          <div className="relative">
            <ShieldCheck size={18} aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8797ad]" />
            <input
              id="owner-code"
              name="token"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              required
              minLength={6}
              maxLength={8}
              pattern="[0-9]{6,8}"
              value={token}
              onChange={(event) => setToken(event.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="أدخل رمز التحقق"
              className="w-full rounded-xl border border-[#d8e2ef] bg-[#ffffff] py-3 pr-11 pl-4 text-left text-sm tracking-[0.25em] text-[#15243b] placeholder:tracking-normal placeholder:text-[#9aa8bb] focus:border-[#2e67bb] focus:outline-none focus:ring-4 focus:ring-[#e7effb]"
            />
          </div>
        </div>
      ) : null}

      {message ? (
        <p role="status" aria-live="polite" className="rounded-xl border border-[#d6e7dc] bg-[#f3fbf6] px-4 py-3 text-sm font-semibold text-[#286643]">
          {message}
        </p>
      ) : null}

      {error ? (
        <p role="alert" aria-live="polite" className="rounded-xl border border-[#f2d2cf] bg-[#fff6f5] px-4 py-3 text-sm font-semibold text-[#a3322b]">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting || (isCodeSent && token.length < 6)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#174ea6] px-4 py-3.5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(23,78,166,0.18)] transition-colors hover:bg-[#123f88] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174ea6] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? (
          <>
            <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
            <span>{isCodeSent ? "جارٍ التحقق" : "جارٍ الإرسال"}</span>
          </>
        ) : (
          <>
            <span>{isCodeSent ? "تحقق وادخل" : "إرسال رمز الدخول"}</span>
            <ArrowLeft size={17} aria-hidden="true" />
          </>
        )}
      </button>

      {isCodeSent ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={sendCode}
            className="font-semibold text-[#315d9b] underline-offset-4 hover:underline disabled:opacity-60"
          >
            إعادة إرسال الرمز
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              setIsCodeSent(false);
              setToken("");
              setError("");
              setMessage("");
            }}
            className="font-semibold text-[#718198] underline-offset-4 hover:underline disabled:opacity-60"
          >
            رجوع
          </button>
        </div>
      ) : null}
    </form>
  );
}
