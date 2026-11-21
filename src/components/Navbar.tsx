"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, GraduationCap } from "lucide-react";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";
import ThemeToggle from "@/components/ThemeToggle";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  const links = siteConfig.navLinks.filter((l) => l.href !== "/login");

  return (
    <header className="no-print sticky top-0 z-40 w-full border-b border-line bg-white">
      <nav
        className="mx-auto flex h-16 max-w-page items-center justify-between px-4 sm:px-6"
        aria-label="التنقل الرئيسي"
      >
        <Link
          href="/"
          className="flex items-center gap-2 text-sky-600"
          onClick={() => setOpen(false)}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-white">
            <GraduationCap size={20} aria-hidden="true" />
          </span>
          <span dir="ltr" lang="en" className="font-latin text-lg font-bold">
            {siteConfig.name}
          </span>
        </Link>

        <ul className="hidden items-center gap-6 md:flex">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm font-semibold text-ink-soft transition-colors hover:text-sky-600"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <Link href="/login" className="btn-secondary">
            تسجيل الدخول
          </Link>
          <Link href="/signup" className="btn-primary">
            ابدأ تجربتك الآن
          </Link>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle className="px-2" />
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-ink-soft"
            aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </nav>

      <div
        id="mobile-menu"
        className={cn(
          "border-t border-line bg-white md:hidden",
          open ? "block" : "hidden"
        )}
      >
        <ul className="mx-auto flex max-w-page flex-col gap-1 px-4 py-3 sm:px-6">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-ink-soft hover:bg-sky-50 hover:text-sky-700"
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li className="mt-2 flex flex-col gap-2">
            <Link href="/login" onClick={() => setOpen(false)} className="btn-secondary">
              تسجيل الدخول
            </Link>
            <Link href="/signup" onClick={() => setOpen(false)} className="btn-primary">
              ابدأ تجربتك الآن
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
}
