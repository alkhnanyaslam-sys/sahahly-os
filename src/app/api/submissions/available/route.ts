import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { firstZodError, studentCodeSchema } from "@/lib/validation";

export const runtime = "nodejs";

const availableSchema = z.object({
  student_code: studentCodeSchema,
});

/**
 * جلب بيانات الطالب والواجبات/الامتحانات المتاحة له في بوابة /submit (بدون تسجيل دخول):
 * 1) التحقق من كود الطالب وأنه نشط.
 * 2) جلب واجبات المدرس الموجهة لمجموعة الطالب أو لجميع المجموعات (group_id فارغ).
 * 3) استبعاد الواجبات التي انتهى موعدها أو التي سلّمها الطالب من قبل.
 *
 * لا يُرجع هذا المسار أي بيانات حساسة (مثل أرقام الهواتف أو نماذج الإجابة)،
 * فقط الاسم والمجموعة وعناوين الواجبات.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صالحة." }, { status: 400 });
  }

  const parsed = availableSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const { student_code } = parsed.data;
  const admin = createAdminClient();

  const { data: student, error: studentError } = await admin
    .from("students")
    .select("id, teacher_id, group_id, name, is_active")
    .eq("student_code", student_code)
    .maybeSingle();

  if (studentError) {
    return Response.json(
      { error: "تعذر التحقق من كود الطالب. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  if (!student) {
    return Response.json({ error: "كود الطالب غير صحيح." }, { status: 404 });
  }

  if (!student.is_active) {
    return Response.json(
      { error: "هذا الحساب غير مفعّل. تواصل مع المدرس." },
      { status: 403 }
    );
  }

  let groupName: string | null = null;
  let assessmentsQuery = admin
    .from("assessments")
    .select("id, title, type, total_marks, deadline, group_id, created_at")
    .eq("teacher_id", student.teacher_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (student.group_id) {
    assessmentsQuery = assessmentsQuery.or(
      `group_id.is.null,group_id.eq.${student.group_id}`
    );

    const { data: group } = await admin
      .from("groups")
      .select("name")
      .eq("id", student.group_id)
      .maybeSingle();
    groupName = group?.name ?? null;
  } else {
    assessmentsQuery = assessmentsQuery.is("group_id", null);
  }

  const { data: assessments, error: assessmentsError } = await assessmentsQuery;

  if (assessmentsError) {
    return Response.json(
      { error: "تعذر جلب الواجبات المتاحة. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  const { data: submitted, error: submittedError } = await admin
    .from("submissions")
    .select("assessment_id")
    .eq("student_id", student.id);

  if (submittedError) {
    return Response.json(
      { error: "تعذر جلب بيانات التسليمات. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  const submittedIds = new Set((submitted ?? []).map((row) => row.assessment_id));
  const now = Date.now();

  const available = (assessments ?? [])
    .filter((assessment) => {
      if (submittedIds.has(assessment.id)) return false;
      if (assessment.deadline && new Date(assessment.deadline).getTime() < now) {
        return false;
      }
      return true;
    })
    .map((assessment) => ({
      id: assessment.id,
      title: assessment.title,
      type: assessment.type,
      total_marks: assessment.total_marks,
      deadline: assessment.deadline,
    }));

  return Response.json(
    {
      ok: true,
      student: { name: student.name, group_name: groupName },
      assessments: available,
    },
    { status: 200 }
  );
}
