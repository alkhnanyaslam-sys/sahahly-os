"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  FileStack,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  QrCode,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

export interface SidebarItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** يطابق المسار بالضبط فقط (للصفحة الرئيسية للوحة التحكم). */
  exact?: boolean;
  /** اسم الصلاحية المطلوبة؛ تُمرَّر قائمة الصلاحيات المسموحة من الخادم. */
  permission: string;
}

export const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    href: "/dashboard",
    label: "الرئيسية",
    icon: LayoutDashboard,
    exact: true,
    permission: "dashboard.view",
  },
  {
    href: "/dashboard/assessments",
    label: "الواجبات والامتحانات",
    icon: ClipboardList,
    permission: "assessments.manage",
  },
  {
    href: "/dashboard/grading",
    label: "مراجعة التصحيح",
    icon: ClipboardCheck,
    permission: "grading.review",
  },
  {
    href: "/dashboard/attendance",
    label: "الحضور والغياب",
    icon: QrCode,
    permission: "attendance.scan",
  },
  {
    href: "/dashboard/students",
    label: "الطلاب والمجموعات",
    icon: Users,
    permission: "students.manage",
  },
  {
    href: "/dashboard/analytics",
    label: "تحليل نقاط الضعف",
    icon: BarChart3,
    permission: "analytics.view",
  },
  {
    href: "/dashboard/exam-generator",
    label: "مولد الامتحانات",
    icon: FileStack,
    permission: "exam_generator.use",
  },
];

interface SidebarProps {
  userName: string;
  roleLabel: string;
  /** الصلاحيات المسموحة للمستخدم الحالي (تُحسب في الخادم). */
  permissions: string[];
}

export default function Sidebar({ userName, roleLabel, permissions }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const items = SIDEBAR_ITEMS.filter((item) => permissions.includes(item.permission));

  function isActive(item: SidebarItem): boolean {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const nav = (
    <div className="flex h-full flex-col">
      <Link
        href="/dashboard"
        onClick={() => setOpen(false)}
        className="flex items-center gap-2 border-b border-line px-5 py-4 text-sky-600"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-white">
          <GraduationCap size={20} aria-hidden="true" />
        </span>
        <span dir="ltr" lang="en" className="font-latin text-lg font-bold">
          {siteConfig.name}
        </span>
      </Link>

      <nav aria-label="قائمة لوحة التحكم" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                    active
                      ? "bg-sky-100 text-sky-700"
                      : "text-ink-soft hover:bg-surface-muted hover:text-ink"
                  )}
                >
                  <Icon size={18} aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-line p-3">
        <div className="px-3 pb-3">
          <p className="truncate text-sm font-bold text-ink">{userName}</p>
          <p className="text-xs text-ink-muted">{roleLabel}</p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:bg-danger-50 hover:text-danger-600"
        >
          <LogOut size={18} aria-hidden="true" />
          {signingOut ? "جارٍ الخروج..." : "تسجيل الخروج"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="no-print sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-white px-4 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 text-sky-600">
          <GraduationCap size={22} aria-hidden="true" />
          <span dir="ltr" lang="en" className="font-latin text-base font-bold">
            {siteConfig.name}
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="فتح القائمة"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-ink-soft"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      </div>

      <aside className="no-print hidden w-64 shrink-0 border-l border-line bg-white lg:sticky lg:top-0 lg:block lg:h-screen">
        {nav}
      </aside>

      {open ? (
        <div className="no-print fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            className="absolute inset-0 bg-ink/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 right-0 w-72 max-w-[85%] bg-white shadow-pop">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="إغلاق القائمة"
              className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted"
            >
              <X size={18} aria-hidden="true" />
            </button>
            {nav}
          </aside>
        </div>
      ) : null}
    </>
  );
    }
