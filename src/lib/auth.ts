import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { AssistantRole } from "@/types/database";

/** "owner" = المدرس صاحب الحساب، وباقي الأدوار للمساعدين. */
export type AppRole = "owner" | AssistantRole;

export type Permission =
  | "dashboard.view"
  | "grading.review"
  | "grading.approve"
  | "assessments.manage"
  | "attendance.scan"
  | "students.manage"
  | "payments.manage"
  | "analytics.view"
  | "exam_generator.use"
  | "assistants.manage"
  | "billing.manage";

export interface AuthContext {
  userId: string;
  email: string | null;
  name: string;
  role: AppRole;
  /** معرّف المدرس الذي تتبعه البيانات (المدرس نفسه أو المدرس صاحب المساعد). */
  teacherId: string;
}

const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  owner: [
    "dashboard.view",
    "grading.review",
    "grading.approve",
    "assessments.manage",
    "attendance.scan",
    "students.manage",
    "payments.manage",
    "analytics.view",
    "exam_generator.use",
    "assistants.manage",
    "billing.manage",
  ],
  admin: [
    "dashboard.view",
    "grading.review",
    "grading.approve",
    "assessments.manage",
    "attendance.scan",
    "students.manage",
    "payments.manage",
    "analytics.view",
    "exam_generator.use",
  ],
  grader: [
    "dashboard.view",
    "grading.review",
    "grading.approve",
    "analytics.view",
  ],
  receptionist: [
    "dashboard.view",
    "attendance.scan",
    "students.manage",
    "payments.manage",
  ],
};

export function hasPermission(role: AppRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: AppRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/**
 * يحدد هوية المستخدم الحالي ودوره وأي مدرس تتبعه بياناته.
 * يتحقق من الجلسة عبر supabase.auth.getUser() (تحقق فعلي من الخادم)،
 * ثم يبحث عن سجل المدرس أو المساعد المطابق لهذا المستخدم.
 * يعيد null إذا لم يكن هناك مستخدم مسجّل أو لم يُربط حسابه بأي مدرس.
 *
 * البحث يتم بعميل الخدمة لكنه مقيّد حصريًا بمعرّف/بريد المستخدم الموثّق،
 * لذلك لا يتسرّب منه أي سجل يخص شخصًا آخر.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const admin = createAdminClient();

  const { data: teacher } = await admin
    .from("teachers")
    .select("id, name")
    .eq("id", user.id)
    .maybeSingle();

  if (teacher) {
    return {
      userId: user.id,
      email: user.email ?? null,
      name: teacher.name,
      role: "owner",
      teacherId: teacher.id,
    };
  }

  const { data: assistantById } = await admin
    .from("assistants")
    .select("id, teacher_id, name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (assistantById) {
    return {
      userId: user.id,
      email: user.email ?? null,
      name: assistantById.name,
      role: assistantById.role,
      teacherId: assistantById.teacher_id,
    };
  }

  if (user.email) {
    const { data: assistantByEmail } = await admin
      .from("assistants")
      .select("id, teacher_id, name, role")
      .eq("email", user.email)
      .maybeSingle();

    if (assistantByEmail) {
      return {
        userId: user.id,
        email: user.email,
        name: assistantByEmail.name,
        role: assistantByEmail.role,
        teacherId: assistantByEmail.teacher_id,
      };
    }
  }

  return null;
});

/**
 * للصفحات (Server Components): يحوّل إلى /login إذا لم يكن المستخدم مسجّلًا.
 */
export async function requireAuth(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) {
    redirect("/login");
  }
  return context;
}

/**
 * للصفحات: يتطلب صلاحية محددة، وإلا يحوّل إلى لوحة التحكم.
 */
export async function requirePermission(
  permission: Permission
): Promise<AuthContext> {
  const context = await requireAuth();
  if (!hasPermission(context.role, permission)) {
    redirect("/dashboard");
  }
  return context;
}

export class ApiAuthError extends Error {
  status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "ApiAuthError";
    this.status = status;
  }
}

/**
 * لمسارات الـ API: يرمي ApiAuthError بدل التحويل.
 * 401 = غير مسجّل، 403 = لا يملك الصلاحية.
 */
export async function requireApiAuth(
  permission?: Permission
): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) {
    throw new ApiAuthError(401, "يجب تسجيل الدخول أولًا.");
  }
  if (permission && !hasPermission(context.role, permission)) {
    throw new ApiAuthError(403, "ليست لديك صلاحية تنفيذ هذا الإجراء.");
  }
  return context;
}

/**
 * يحوّل أي خطأ مصادقة إلى استجابة JSON مناسبة داخل مسارات الـ API.
 * يعيد null إذا لم يكن الخطأ من نوع ApiAuthError.
 */
export function authErrorResponse(error: unknown): Response | null {
  if (error instanceof ApiAuthError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
                                    }
