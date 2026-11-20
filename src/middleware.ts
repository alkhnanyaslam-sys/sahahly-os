import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * تطبيق الـ middleware على كل المسارات ما عدا:
     * - الملفات الثابتة وصور Next.js المُحسّنة
     * - الأيقونة وملفات الخطوط والصور
     * - مسارات الـ API الخاصة بتسليم الطلاب (لا تحتاج جلسة)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/submissions/create|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)",
  ],
};
