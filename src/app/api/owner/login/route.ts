import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const MAX_BODY_BYTES = 8192;
const FAILURE_MESSAGE = "بيانات الدخول غير صحيحة";
const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

type AttemptType = "success" | "failure" | "locked";
type AuditOutcome = "success" | "failure" | "blocked";
type LoginAttemptRow = {
  attempt_type: AttemptType;
  locked_until: string | null;
};
type InsertTable = {
  insert: (record: Record<string, unknown>) => Promise<{ error: unknown }>;
};

async function insertAdminRecord(
  admin: ReturnType<typeof createAdminClient>,
  table: "login_attempts" | "admin_audit_log",
  record: Record<string, unknown>
) {
  const typedTable = admin.from(table) as unknown as InsertTable;
  return typedTable.insert(record);
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

async function writeLoginEvent(
  admin: ReturnType<typeof createAdminClient>,
  event: {
    emailFingerprint: string;
    ipAddress: string;
    userAgent: string | null;
    requestId: string;
    attemptType: AttemptType;
    outcome: AuditOutcome;
    actorId: string | null;
    lockedUntil?: string | null;
  }
): Promise<boolean> {
  const { error: attemptError } = await insertAdminRecord(admin, "login_attempts", {
    email_fingerprint: event.emailFingerprint,
    ip_address: event.ipAddress,
    user_agent: event.userAgent,
    request_id: event.requestId,
    attempt_type: event.attemptType,
    locked_until: event.lockedUntil ?? null,
  });

  const { error: auditError } = await insertAdminRecord(admin, "admin_audit_log", {
    actor_id: event.actorId,
    action: "owner.login",
    entity_type: "owner_auth",
    entity_id: event.actorId,
    ip_address: event.ipAddress,
    user_agent: event.userAgent,
    outcome: event.outcome,
    details: { request_id: event.requestId },
  });

  return !attemptError && !auditError;
}

function loginFailureEvent(
  emailFingerprint: string,
  ipAddress: string,
  userAgent: string | null,
  requestId: string,
  lockedUntil: string | null = null
) {
  return {
    emailFingerprint,
    ipAddress,
    userAgent,
    requestId,
    attemptType: "failure" as const,
    outcome: "failure" as const,
    actorId: null,
    lockedUntil,
  };
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

  try {
    const admin = createAdminClient();
    const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();
    const { data: recentAttempts, error: attemptsError } = await admin
      .from("login_attempts")
      .select("attempt_type, locked_until")
      .eq("ip_address", ipAddress)
      .eq("email_fingerprint", emailFingerprint)
      .in("attempt_type", ["failure", "locked"])
      .gte("attempted_at", windowStart)
      .order("attempted_at", { ascending: false })
      .limit(MAX_FAILURES + 1);

    if (attemptsError) return failureResponse();

    const attempts = (recentAttempts ?? []) as LoginAttemptRow[];
    const now = Date.now();
    const activeLock = attempts.find(
      (attempt) => attempt.locked_until && Date.parse(attempt.locked_until) > now
    );
    const failures = attempts.filter(
      (attempt) => attempt.attempt_type === "failure"
    ).length;

    if (activeLock || failures >= MAX_FAILURES) {
      const lockedUntil = activeLock?.locked_until ?? new Date(now + WINDOW_MS).toISOString();
      await writeLoginEvent(admin, {
        emailFingerprint,
        ipAddress,
        userAgent,
        requestId,
        attemptType: "locked",
        outcome: "blocked",
        actorId: null,
        lockedUntil,
      });
      return failureResponse(429);
    }

    if (!ownerEmail || email !== ownerEmail) {
      const failureCount = failures + 1;
      const lockedUntil = failureCount >= MAX_FAILURES
        ? new Date(now + WINDOW_MS).toISOString()
        : null;
      await writeLoginEvent(
        admin,
        loginFailureEvent(emailFingerprint, ipAddress, userAgent, requestId, lockedUntil)
      );
      return failureResponse();
    }

    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      const failureCount = failures + 1;
      const lockedUntil = failureCount >= MAX_FAILURES
        ? new Date(Date.now() + WINDOW_MS).toISOString()
        : null;
      await writeLoginEvent(
        admin,
        loginFailureEvent(emailFingerprint, ipAddress, userAgent, requestId, lockedUntil)
      );
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
      const failureCount = failures + 1;
      const lockedUntil = failureCount >= MAX_FAILURES
        ? new Date(Date.now() + WINDOW_MS).toISOString()
        : null;
      await writeLoginEvent(
        admin,
        loginFailureEvent(emailFingerprint, ipAddress, userAgent, requestId, lockedUntil)
      );
      return failureResponse();
    }

    const eventWritten = await writeLoginEvent(admin, {
      emailFingerprint,
      ipAddress,
      userAgent,
      requestId,
      attemptType: "success",
      outcome: "success",
      actorId: user.id,
    });

    if (!eventWritten) {
      await supabase.auth.signOut();
      return failureResponse();
    }

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: RESPONSE_HEADERS }
    );
  } catch {
    return failureResponse();
  }
}
