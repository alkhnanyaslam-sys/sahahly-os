"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const THEME_CHANGE_EVENT = "sahahly:theme-change";

function readDarkMode() {
  return document.documentElement.classList.contains("dark");
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const syncTheme = () => setIsDark(readDarkMode());
    syncTheme();
    window.addEventListener(THEME_CHANGE_EVENT, syncTheme);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
  }, []);

  function toggleTheme() {
    const nextIsDark = !readDarkMode();
    document.documentElement.classList.toggle("dark", nextIsDark);
    document.cookie = `sahahly-theme=${nextIsDark ? "dark" : "light"}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"}
      aria-pressed={isDark}
      title={isDark ? "الوضع النهاري" : "الوضع الليلي"}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-muted ${className}`}
    >
      {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
      <span>{isDark ? "الوضع النهاري" : "الوضع الليلي"}</span>
    </button>
  );
}
