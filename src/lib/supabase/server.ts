import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`متغير البيئة ${name} غير مضبوط.`);
  }
  return value;
}

/**
 * عميل Supabase للسيرفر يعمل بصلاحيات المستخدم المسجّل (يحترم سياسات RLS).
 * يُستخدم داخل Server Components و Route Handlers و Server Actions.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // الاستدعاء من Server Component لا يسمح بتعديل الكوكيز؛
            // يتم تجديد الجلسة في middleware بدلًا من ذلك.
          }
        },
      },
    }
  );
}

/**
 * عميل Supabase بصلاحيات الخدمة (service role) — يتجاوز RLS.
 * للاستخدام داخل السيرفر فقط (مثل بوابة تسليم الطلاب وعمليات الذكاء الاصطناعي)،
 * ولا يجوز استيراده أبدًا في أي مكوّن يعمل في المتصفح.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
