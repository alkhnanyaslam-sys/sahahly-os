import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export interface StudentContext {
  userId: string;
  email: string | null;
  fullName: string;
  age: number;
  country: string;
  studyLanguage: "ar" | "en" | "fr" | "de";
  subjectId: string | null;
  whatsapp: string;
  gradeId: string | null;
}

export const getStudentContext = cache(
  async (): Promise<StudentContext | null> => {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return null;

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("student_profiles")
      .select(
        "user_id, full_name, age, country, study_language, subject_id, whatsapp, grade_id"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) return null;

    return {
      userId: user.id,
      email: user.email ?? null,
      fullName: profile.full_name,
      age: profile.age,
      country: profile.country,
      studyLanguage: profile.study_language as StudentContext["studyLanguage"],
      subjectId: profile.subject_id,
      whatsapp: profile.whatsapp,
      gradeId: profile.grade_id,
    };
  }
);

/** للصفحات: يحوّل إلى دخول الطالب إن لم تكن هناك جلسة طالب. */
export async function requireStudent(): Promise<StudentContext> {
  const context = await getStudentContext();
  if (!context) redirect("/student/login");
  return context;
}

export class StudentAuthError extends Error {
  status = 401 as const;
  constructor() {
    super("يجب تسجيل الدخول أولًا.");
    this.name = "StudentAuthError";
  }
}

/** لمسارات الـ API: يرمي خطأً بدل التحويل. */
export async function requireApiStudent(): Promise<StudentContext> {
  const context = await getStudentContext();
  if (!context) throw new StudentAuthError();
  return context;
}

export function studentAuthErrorResponse(error: unknown): Response | null {
  if (error instanceof StudentAuthError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  return null;
}
