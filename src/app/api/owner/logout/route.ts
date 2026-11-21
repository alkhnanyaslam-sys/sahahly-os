import { NextResponse, type NextRequest } from "next/server";
import { OWNER_SESSION_COOKIE } from "@/lib/owner-session";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

function hasSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "غير مسموح" }, { status: 403 });
  }

  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Clear the owner cookie even if the Supabase session has expired.
  }

  const response = NextResponse.json(
    { ok: true },
    { status: 200, headers: RESPONSE_HEADERS }
  );
  response.cookies.set(OWNER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
