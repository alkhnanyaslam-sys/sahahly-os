import { NextResponse, type NextRequest } from "next/server";
import { ApiAuthError, requireApiSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};

type StatusRpcClient = {
  rpc: (
    functionName: "owner_set_teacher_suspension",
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown }>;
};
type StatusResult = {
  teacher_id: string;
  teacher_name: string;
  is_suspended: boolean;
};

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

  if (!body || typeof body !== "object" || typeof (body as { isSuspended?: unknown }).isSuspended !== "boolean") {
    return errorResponse("الطلب غير صالح.", 400);
  }

  let adminContext;
  try {
    adminContext = await requireApiSuperAdmin();
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return errorResponse("غير موجود.", 404);
    }
    return errorResponse("غير مصرح بتنفيذ هذا الإجراء.", 403);
  }

  try {
    const admin = createAdminClient() as unknown as StatusRpcClient;
    const { data, error } = await admin.rpc("owner_set_teacher_suspension", {
      p_teacher_id: teacherId,
      p_is_suspended: (body as { isSuspended: boolean }).isSuspended,
      p_actor_id: adminContext.userId,
    });

    if (error) return errorResponse("تعذّر تحديث الحساب. تحقق من إعداد قاعدة البيانات.", 503);

    const result = Array.isArray(data)
      ? data[0] as StatusResult | undefined
      : undefined;
    if (!result) return errorResponse("المدرّس غير موجود.", 404);

    return NextResponse.json(
      {
        teacher: {
          id: result.teacher_id,
          name: result.teacher_name,
          isSuspended: result.is_suspended,
        },
      },
      { status: 200, headers: RESPONSE_HEADERS }
    );
  } catch {
    return errorResponse("تعذّر تحديث الحساب. حاول مرة أخرى.", 500);
  }
}
