import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse, type NextRequest } from "next/server";
import {
  createOwnerSessionToken,
  OWNER_SESSION_COOKIE,
} from "@/lib/owner-session";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8192;
const FAILURE_MESSAGE = "بيانات الدخول غير صحيحة";
const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

type OwnerRpcName = "claim_owner_login_attempt" | "complete_owner_login_attempt";
type OwnerRpcClient = {
  rpc: (
    functionName: OwnerRpcName,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown }>;
};
type AttemptClaim = {
  attempt_id: string | null;
  locked_until: string | null;
};

function ownerRpc(
  admin: ReturnType<typeof createAdminClient>,
  functionName: OwnerRpcName,
  args: Record<string, unknown>
) {
  return (admin as unknown as OwnerRpcClient).rpc(functionName, args);
}

async function completeLoginAttempt(
  admin: ReturnType<typeof createAdminClient>,
  attemptId: string,
  outcome: "success" | "failure",
  actorId: string | null = null
): Promise<boolean> {
  try {
    const { error } = await ownerRpc(admin, "complete_owner_login_attempt", {
      p_attempt_id: attemptId,
      p_outcome: outcome,
      p_actor_id: actorId,
    });
    return !error;
  } catch {
    return false;
  }
}

function failureResponse(status = 401) {
  return NextResponse.json(
    { error: FAILURE_MESSAGE },
    { status, headers: RESPONSE_HEADERS }
  );
}

function getClientIp(request: NextRequest): string {
  const forwardedAddress = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const realAddress = request.headers.get("x-real-ip")?.trim();
  const candidate = forwardedAddress || realAddress;

  return candidate && isIP(candidate) ? candidate : "0.0.0.0";
}

function fingerprintEmail(email: string): string {
  const digest = createHash("sha256").update(email).digest("hex");
  return `\\x${digest}`;
}

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
  if (!hasSameOrigin(request)) return failureResponse();

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return failureResponse();

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return failureResponse();
    }
    body = JSON.parse(rawBody);
  } catch {
    return failureResponse();
  }

  if (!body || typeof body !== "object") return failureResponse();

  const payload = body as { email?: unknown; password?: unknown };
  const email = typeof payload.email === "string"
    ? payload.email.trim().toLowerCase()
    : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!email || email.length > 254 || !password || password.length > 1024) {
    return failureResponse();
  }

  const ipAddress = getClientIp(request);
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) ?? null;
  const requestId = randomUUID();
  const emailFingerprint = fingerprintEmail(email);
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  let admin: ReturnType<typeof createAdminClient> | null = null;
  let attemptId: string | null = null;
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;

  try {
    admin = createAdminClient();
    const { data: claimData, error: claimError } = await ownerRpc(
      admin,
      "claim_owner_login_attempt",
      {
        p_email_fingerprint: emailFingerprint,
        p_ip_address: ipAddress,
        p_user_agent: userAgent,
        p_request_id: requestId,
      }
    );
    if (claimError) return failureResponse();

    const claim = Array.isArray(claimData)
      ? claimData[0] as AttemptClaim | undefined
      : undefined;
    if (!claim) return failureResponse();
    if (!claim.attempt_id) return failureResponse(429);
    attemptId = claim.attempt_id;

    if (!ownerEmail || email !== ownerEmail) {
      await completeLoginAttempt(admin, attemptId, "failure");
      attemptId = null;
      return failureResponse();
    }

    supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      await completeLoginAttempt(admin, attemptId, "failure");
      attemptId = null;
      return failureResponse();
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    const membership = user?.email?.trim().toLowerCase() === ownerEmail
      ? await admin
          .from("platform_admins")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle()
      : null;

    if (userError || !user || !membership || membership.error || !membership.data) {
      await supabase.auth.signOut();
      await completeLoginAttempt(admin, attemptId, "failure");
      attemptId = null;
      return failureResponse();
    }

    const { data: sessionSettings, error: sessionSettingsError } = await admin
      .from("platform_settings")
      .select("require_owner_mfa, owner_idle_timeout_seconds")
      .eq("id", 1)
      .maybeSingle();
    if (sessionSettingsError) {
      await supabase.auth.signOut();
      await completeLoginAttempt(admin, attemptId, "failure");
      attemptId = null;
      return failureResponse();
    }

    const sessionPolicy = sessionSettings as {
      require_owner_mfa?: boolean;
      owner_idle_timeout_seconds?: number;
    } | null;

    if (sessionPolicy?.require_owner_mfa) {
      await supabase.auth.signOut();
      await completeLoginAttempt(admin, attemptId, "failure");
      attemptId = null;
      return failureResponse();
    }

    const ownerToken = await createOwnerSessionToken(
      user.id,
      sessionPolicy?.owner_idle_timeout_seconds ?? 12 * 60 * 60
    );
    if (!ownerToken) {
      await supabase.auth.signOut();
      await completeLoginAttempt(admin, attemptId, "failure");
      attemptId = null;
      return failureResponse();
    }

    const attemptCompleted = await completeLoginAttempt(
      admin,
      attemptId,
      "success",
      user.id
    );
    if (!attemptCompleted) {
      await supabase.auth.signOut();
      return failureResponse();
    }
    attemptId = null;

    const response = NextResponse.json(
      { ok: true },
      { status: 200, headers: RESPONSE_HEADERS }
    );
    response.cookies.set(OWNER_SESSION_COOKIE, ownerToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 12 * 60 * 60,
    });
    return response;
  } catch {
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // Keep the generic login response even if cleanup fails.
      }
    }
    if (admin && attemptId) {
      await completeLoginAttempt(admin, attemptId, "failure");
    }
    return failureResponse();
  }
}
