"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  ShieldEllipsis,
} from "lucide-react";

const navigation = [
  { href: "/owner", label: "نظرة عامة", icon: LayoutDashboard },
  { href: "/owner/security", label: "الأمان والسجل", icon: ShieldEllipsis },
];

export function OwnerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const isLoginPage = pathname === "/owner/login";

  async function signOut() {
    setIsSigningOut(true);
    setSignOutError("");

    try {
      const response = await fetch("/api/owner/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Sign out failed");
      router.replace("/owner/login");
      router.refresh();
    } catch {
      setSignOutError("تعذّر إنهاء الجلسة. حاول مرة أخرى.");
      setIsSigningOut(false);
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#f5f8fc] text-[#12213a]">
      <header className="border-b border-[#dce6f2] bg-[#ffffff]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href={isLoginPage ? "/owner/login" : "/owner"} className="flex items-center gap-3" aria-label="بوابة المالك الرئيسية">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#174ea6] text-white">
              <ShieldCheck size={22} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-base font-extrabold tracking-tight">ساهلي</span>
              <span className="block text-xs font-semibold text-[#63748d]">بوابة المالك</span>
            </span>
          </Link>

          {isLoginPage ? (
            <span className="rounded-full border border-[#dce6f2] px-3 py-1.5 text-xs font-semibold text-[#63748d]">
              وصول خاص ومؤمّن
            </span>
          ) : (
            <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
              <nav aria-label="التنقل في بوابة المالك" className="flex items-center gap-1 sm:gap-2">
                {navigation.map(({ href, label, icon: Icon }) => {
                  const active = href === "/owner"
                    ? pathname === "/owner"
                    : pathname.startsWith(href);

                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                        active
                          ? "bg-[#eaf2ff] text-[#174ea6]"
                          : "text-[#63748d] hover:bg-[#f1f5fa] hover:text-[#174ea6]"
                      }`}
                    >
                      <Icon size={17} aria-hidden="true" />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </nav>
              <button
                type="button"
                onClick={signOut}
                disabled={isSigningOut}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[#dce6f2] bg-[#ffffff] px-3 py-2 text-sm font-bold text-[#42536d] transition-colors hover:border-[#c4d2e4] hover:bg-[#f8faff] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut size={16} aria-hidden="true" />
                <span>{isSigningOut ? "جارٍ الخروج" : "تسجيل الخروج"}</span>
              </button>
            </div>
          )}
        </div>
        {signOutError ? (
          <p role="alert" className="mx-auto max-w-7xl px-4 pb-3 text-sm font-semibold text-[#b42318] sm:px-6 lg:px-8">
            {signOutError}
          </p>
        ) : null}
      </header>
      {children}
    </div>
  );
}
