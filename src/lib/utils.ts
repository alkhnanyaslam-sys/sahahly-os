import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * تحويل الأرقام الإنجليزية إلى أرقام عربية-هندية للعرض.
 */
export function toArabicDigits(value: string | number): string {
  const map = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return String(value).replace(/\d/g, (d) => map[Number(d)] ?? d);
}

/**
 * تنسيق مبلغ مالي بالجنيه المصري.
 */
export function formatEGP(amount: number): string {
  return new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * تنسيق تاريخ بالعربية (مثال: ٢٠ نوفمبر ٢٠٢٦).
 */
export function formatDateAr(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Africa/Cairo",
  }).format(d);
}

/**
 * تنسيق تاريخ ووقت بالعربية.
 */
export function formatDateTimeAr(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Cairo",
  }).format(d);
}

/**
 * الشهر الحالي بصيغة YYYY-MM بتوقيت القاهرة (يُستخدم في جدول payments).
 */
export function currentMonthKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "Africa/Cairo",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

/**
 * تاريخ اليوم بصيغة YYYY-MM-DD بتوقيت القاهرة (يُستخدم في session_date).
 */
export function todayKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Cairo",
  }).format(date);
}

/**
 * تنظيف رقم هاتف مصري وتحويله لصيغة دولية بدون علامة + (مثال: 201012345678).
 * يعيد null إذا كان الرقم غير صالح.
 */
export function normalizeEgyptPhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  if (/^201[0125]\d{8}$/.test(digits)) return digits;
  if (/^01[0125]\d{8}$/.test(digits)) return `2${digits}`;
  if (/^1[0125]\d{8}$/.test(digits)) return `20${digits}`;
  return null;
}

/**
 * نسبة مئوية آمنة (تتجنب القسمة على صفر).
 */
export function percent(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

/**
 * تقسيم مصفوفة إلى دفعات بحجم ثابت.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
    }
