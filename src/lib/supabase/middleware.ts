import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { OWNER_SESSION_COOKIE, refreshOwnerSessionToken } from "@/lib/owner-session";
import { OWNER_EMAIL } from "@/lib/owner-email";
import type { Database } from "@/types/database";

const PROTECTED_PREFIX = "/dashboard";
const AUTH_PAGES = ["/login", "/signup"];

/**
 * تجديد جلسة Supabase في كل طلب، وحماية مسارات لوحة التحكم.
 * - المستخدم غير المسجّل الذي يفتح /dashboard يُحوَّل إلى /login.
 * - المستخدم المسجّل الذي يفتح /login أو /signup يُحوَّل إلى /dashboard.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;
  const isOwnerRoute = pathname === "/owner"
    || pathname.startsWith("/owner/")
    || pathname === "/api/owner"
    || pathname.startsWith("/api/owner/");

  if (isOwnerRoute) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isOwnerLoginRoute = pathname === "/owner/login";
  const isPublicOwnerApi = pathname === "/api/owner/login";

  if (isOwnerRoute && !isOwnerLoginRoute && !isPublicOwnerApi) {
    const ownerEmailMatches = Boolean(
      user?.email
      && user.email.trim().toLowerCase() === OWNER_EMAIL
    );
    const renewedOwnerToken = ownerEmailMatches && user
      ? await refreshOwnerSessionToken(
          request.cookies.get(OWNER_SESSION_COOKIE)?.value,
          user.id
        )
      : null;

    if (!renewedOwnerToken) {
      if (pathname.startsWith("/api/owner/")) {
        return NextResponse.json(
          { error: "غير موجود" },
          { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } }
        );
      }

      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/owner/login";
      loginUrl.search = "";
      const redirectResponse = NextResponse.redirect(loginUrl);
      redirectResponse.headers.set("X-Robots-Tag", "noindex, nofollow");
      return redirectResponse;
    }

    response.cookies.set(OWNER_SESSION_COOKIE, renewedOwnerToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 12 * 60 * 60,
    });
  }

  if (!user && pathname.startsWith(PROTECTED_PREFIX)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && AUTH_PAGES.includes(pathname)) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}
