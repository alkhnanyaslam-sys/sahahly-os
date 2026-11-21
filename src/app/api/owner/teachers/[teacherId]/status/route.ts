import { NextResponse, type NextRequest } from "next/server";
import { ApiAuthError, requireApiSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { SubscriptionStatus } from "@/types/database";

export const runtime = "nodejs";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};
const subscriptionStatuses: readonly SubscriptionStatus[] = ["trial", "active", "expired"];

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: RESPONSE_HEADERS }
  );
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ teacherId: string }> }
) {
  if (!hasSameOrigin(request)) {
    return errorResponse("الطلب غير مسموح.", 403);
  }

  const { teacherId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(teacherId)) {
    return errorResponse("المدرّس غير موجود.", 404);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1024) return errorResponse("الطلب غير صالح.", 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("الطلب غير صالح.", 400);
  }

  const subscriptionStatus = body && typeof body === "object"
    ? (body as { subscriptionStatus?: unknown }).subscriptionStatus
    : null;
  if (
    typeof subscriptionStatus !== "string"
    || !subscriptionStatuses.includes(subscriptionStatus as SubscriptionStatus)
  ) {
    return errorResponse("حالة الاشتراك غير صالحة.", 400);
  }

  try {
    await requireApiSuperAdmin();
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return errorResponse("غير موجود.", 404);
    }
    return errorResponse("غير مصرح بتنفيذ هذا الإجراء.", 403);
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("teachers")
      .update({ subscription_status: subscriptionStatus as SubscriptionStatus })
      .eq("id", teacherId)
      .select("id, name, subscription_status")
      .maybeSingle();

    if (error) return errorResponse("تعذّر تحديث الاشتراك. حاول مرة أخرى.", 503);
    if (!data) return errorResponse("المدرّس غير موجود.", 404);

    return NextResponse.json(
      {
        teacher: {
          id: data.id,
          name: data.name,
          subscriptionStatus: data.subscription_status,
        },
      },
      { status: 200, headers: RESPONSE_HEADERS }
    );
  } catch {
    return errorResponse("تعذّر تحديث الاشتراك. حاول مرة أخرى.", 500);
  }
}
