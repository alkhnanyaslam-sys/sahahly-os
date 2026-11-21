import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import AssessmentsManager, {
  type ManagerAssessment,
  type ManagerAssessmentGroup,
} from "@/components/dashboard/AssessmentsManager";

export const dynamic = "force-dynamic";

const ASSESSMENTS_LIMIT = 200;

export default async function AssessmentsPage() {
  const auth = await requirePermission("assessments.manage");
  const admin = createAdminClient();
  const teacherId = auth.teacherId;

  const [groupsResult, assessmentsResult] = await Promise.all([
    admin
      .from("groups")
      .select("id, name, grade_level")
      .eq("teacher_id", teacherId)
      .order("name", { ascending: true }),
    admin
      .from("assessments")
      .select(
        "id, group_id, title, type, total_marks, mark_scheme_url, ai_rubric, deadline, created_at"
      )
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false })
      .limit(ASSESSMENTS_LIMIT),
  ]);

  const assessmentRows = assessmentsResult.data ?? [];
  const assessmentIds = assessmentRows.map((a) => a.id);

  const submissionCounts = new Map<string, number>();
  const submissionPageSize = 500;
  if (assessmentIds.length > 0) {
    for (let offset = 0; ; offset += submissionPageSize) {
      const { data: submissionRows, error: submissionError } = await admin
        .from("submissions")
        .select("assessment_id, id")
        .in("assessment_id", assessmentIds)
        .order("assessment_id", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + submissionPageSize - 1);

      if (submissionError) {
        throw new Error("تعذر تحميل أعداد التسليمات المرتبطة بالواجبات.");
      }

      for (const row of submissionRows ?? []) {
        submissionCounts.set(
          row.assessment_id,
          (submissionCounts.get(row.assessment_id) ?? 0) + 1
        );
      }

      if (!submissionRows || submissionRows.length < submissionPageSize) break;
    }
  }

  const groups: ManagerAssessmentGroup[] = (groupsResult.data ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    grade_level: group.grade_level,
  }));

  const assessments: ManagerAssessment[] = assessmentRows.map((assessment) => ({
    id: assessment.id,
    group_id: assessment.group_id,
    title: assessment.title,
    type: assessment.type,
    total_marks: Number(assessment.total_marks),
    mark_scheme_url: assessment.mark_scheme_url,
    has_rubric: Boolean(assessment.ai_rubric),
    deadline: assessment.deadline,
    created_at: assessment.created_at,
    submissions_count: submissionCounts.get(assessment.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">الواجبات والامتحانات</h1>
        <p className="mt-1 text-sm text-ink-muted">
          أنشئ واجبًا أو اختبارًا، وارفع نموذج الإجابة ليعتمد عليه التصحيح الآلي، ثم شارك
          الطلاب بوابة التسليم.
        </p>
      </header>

      <AssessmentsManager
        teacherId={teacherId}
        groups={groups}
        assessments={assessments}
      />
    </div>
  );
                                                              }
