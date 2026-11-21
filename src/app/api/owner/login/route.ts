import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse, type NextRequest } from "next/server";
import {
  createOwnerSessionToken,
  OWNER_SESSION_COOKIE,
} from "@/lib/owner-session";
import { OWNER_EMAIL } from "@/lib/owner-email";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8192;
const GENERIC_ERROR = "تعذّر إكمال الطلب. تحقق من الرمز وحاول مرة أخرى.";
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

function jsonError(status = 401) {
  return NextResponse.json(
    { error: GENERIC_ERROR },
    { status, headers: RESPONSE_HEADERS }
  );
}

function jsonOk(body: Record<string, unknown>) {
  return NextResponse.json(body, { status: 200, headers: RESPONSE_HEADERS });
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

async function readBody(request: NextRequest): Promise<unknown | null> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return null;

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return null;
    }
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

async function sendCode(email: string) {
  if (email !== OWNER_EMAIL) return jsonError();

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    if (error) {
      return NextResponse.json(
        { error: "تعذّر إرسال الرمز. حاول مرة أخرى لاحقًا." },
        { status: 503, headers: RESPONSE_HEADERS }
      );
    }

    return jsonOk({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "تعذّر إرسال الرمز. حاول مرة أخرى لاحقًا." },
      { status: 503, headers: RESPONSE_HEADERS }
    );
  }
}

async function verifyCode(request: NextRequest, email: string, token: string) {
  if (email !== OWNER_EMAIL || !/^\d{6,8}$/.test(token)) {
    return jsonError();
  }

  const ipAddress = getClientIp(request);
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) ?? null;
  const requestId = randomUUID();
  let admin: ReturnType<typeof createAdminClient> | null = null;
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;
  let attemptId: string | null = null;

  try {
    admin = createAdminClient();
    const { data: claimData, error: claimError } = await ownerRpc(
      admin,
      "claim_owner_login_attempt",
      {
        p_email_fingerprint: fingerprintEmail(email),
        p_ip_address: ipAddress,
        p_user_agent: userAgent,
        p_request_id: requestId,
      }
    );
    if (claimError) return jsonError();

    const claim = Array.isArray(claimData)
      ? claimData[0] as AttemptClaim | undefined
      : undefined;
    if (!claim) return jsonError();
    if (!claim.attempt_id) return jsonError(429);
    attemptId = claim.attempt_id;

    supabase = await createClient();
    const { data: verification, error: verificationError } =
      await supabase.auth.verifyOtp({ email, token, type: "email" });

    const user = verification.user;
    const emailMatches = user?.email?.trim().toLowerCase() === OWNER_EMAIL;
    const membership = user && emailMatches
      ? await admin
          .from("platform_admins")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle()
      : null;

    if (
      verificationError
      || !user
      || !emailMatches
      || !membership
      || membership.error
      || !membership.data
    ) {
      await supabase.auth.signOut();
      await completeLoginAttempt(admin, attemptId, "failure");
      attemptId = null;
      return jsonError();
    }

    const { data: sessionSettings, error: settingsError } = await admin
      .from("platform_settings")
      .select("require_owner_mfa, owner_idle_timeout_seconds")
      .eq("id", 1)
      .maybeSingle();
    if (settingsError) {
      await supabase.auth.signOut();
      await completeLoginAttempt(admin, attemptId, "failure");
      attemptId = null;
      return jsonError();
    }

    const sessionPolicy = sessionSettings as {
      require_owner_mfa?: boolean;
      owner_idle_timeout_seconds?: number;
    } | null;

    if (sessionPolicy?.require_owner_mfa) {
      await supabase.auth.signOut();
      await completeLoginAttempt(admin, attemptId, "failure");
      attemptId = null;
      return jsonError();
    }

    const ownerToken = await createOwnerSessionToken(
      user.id,
      sessionPolicy?.owner_idle_timeout_seconds ?? 12 * 60 * 60
    );
    if (!ownerToken) {
      await supabase.auth.signOut();
      await completeLoginAttempt(admin, attemptId, "failure");
      attemptId = null;
      return jsonError();
    }

    const attemptCompleted = await completeLoginAttempt(
      admin,
      attemptId,
      "success",
      user.id
    );
    if (!attemptCompleted) {
      await supabase.auth.signOut();
      return jsonError();
    }
    attemptId = null;

    const response = jsonOk({ ok: true });
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
        // Keep the generic verification response even if cleanup fails.
      }
    }
    if (admin && attemptId) {
      await completeLoginAttempt(admin, attemptId, "failure");
    }
    return jsonError();
  }
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) return jsonError(403);

  const body = await readBody(request);
  if (!body || typeof body !== "object") return jsonError();

  const payload = body as { action?: unknown; email?: unknown; token?: unknown };
  const email = typeof payload.email === "string"
    ? payload.email.trim().toLowerCase()
    : "";
  if (!email || email.length > 254) return jsonError();

  if (payload.action === "send") return sendCode(email);
  if (payload.action === "verify" && typeof payload.token === "string") {
    return verifyCode(request, email, payload.token.trim());
  }

  return jsonError();
}
