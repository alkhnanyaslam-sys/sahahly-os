import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { percent } from "@/lib/utils";
import AnalyticsCharts, {
  type AssessmentAveragePoint,
  type WeakQuestion,
  type WeakTopic,
} from "@/components/dashboard/AnalyticsCharts";

export const dynamic = "force-dynamic";

const WEAKNESS_THRESHOLD_PERCENT = 50;
const MIN_ANSWERS_FOR_WEAKNESS = 3;
const ASSESSMENTS_LIMIT = 12;

interface QuestionAggregate {
  assessmentId: string;
  questionNumber: number;
  topic: string | null;
  total: number;
  wrong: number;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ assessment?: string }>;
}) {
  const auth = await requirePermission("analytics.view");
  const { assessment: requestedId } = await searchParams;
  const admin = createAdminClient();

  const { data: assessments } = await admin
    .from("assessments")
    .select("id, title, total_marks, created_at")
    .eq("teacher_id", auth.teacherId)
    .order("created_at", { ascending: false })
    .limit(ASSESSMENTS_LIMIT);

  const assessmentList = assessments ?? [];
  const assessmentIds = assessmentList.map((a) => a.id);

  if (assessmentIds.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-ink">تحليل نقاط الضعف</h1>
        </header>
        <p className="card px-5 py-12 text-center text-sm text-ink-muted">
          لا توجد واجبات أو امتحانات بعد. ستظهر التحليلات بعد تصحيح أول دفعة من الأوراق.
        </p>
      </div>
    );
  }

  const { data: submissions } = await admin
    .from("submissions")
    .select("id, assessment_id, final_score")
    .in("assessment_id", assessmentIds)
    .in("status", ["approved", "sent_to_parent"]);

  const submissionList = submissions ?? [];
  const assessmentBySubmission = new Map(
    submissionList.map((s) => [s.id, s.assessment_id])
  );

  // متوسط الدرجات (كنسبة مئوية) لكل واجب/امتحان.
  const scoresByAssessment = new Map<string, number[]>();
  for (const submission of submissionList) {
    if (typeof submission.final_score !== "number") continue;
    const list = scoresByAssessment.get(submission.assessment_id) ?? [];
    list.push(submission.final_score);
    scoresByAssessment.set(submission.assessment_id, list);
  }

  const averages: AssessmentAveragePoint[] = [...assessmentList]
    .reverse()
    .map((assessment) => {
      const scores = scoresByAssessment.get(assessment.id) ?? [];
      const avg =
        scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      return {
        id: assessment.id,
        title: assessment.title,
        average_percent: avg === null ? null : percent(avg, assessment.total_marks),
        submissions: scores.length,
      };
    });

  // الأسئلة والدروس الضعيفة للواجب المختار (الأحدث افتراضيًا).
  const selected =
    assessmentList.find((a) => a.id === requestedId) ?? assessmentList[0]!;

  const selectedSubmissionIds = submissionList
    .filter((s) => s.assessment_id === selected.id)
    .map((s) => s.id);

  let weakQuestions: WeakQuestion[] = [];
  let weakTopics: WeakTopic[] = [];

  if (selectedSubmissionIds.length > 0) {
    const { data: grades } = await admin
      .from("question_grades")
      .select("submission_id, question_number, topic_tag, max_mark, awarded_mark")
      .in("submission_id", selectedSubmissionIds);

    const questionMap = new Map<number, QuestionAggregate>();
    const topicMap = new Map<string, { total: number; wrong: number }>();

    for (const grade of grades ?? []) {
      if (!assessmentBySubmission.has(grade.submission_id)) continue;

      // "أخطأ" = لم ينل الدرجة الكاملة للسؤال.
      const wrong = grade.awarded_mark < grade.max_mark;

      const existing = questionMap.get(grade.question_number) ?? {
        assessmentId: selected.id,
        questionNumber: grade.question_number,
        topic: grade.topic_tag,
        total: 0,
        wrong: 0,
      };
      existing.total += 1;
      if (wrong) existing.wrong += 1;
      if (!existing.topic && grade.topic_tag) existing.topic = grade.topic_tag;
      questionMap.set(grade.question_number, existing);

      if (grade.topic_tag) {
        const topic = topicMap.get(grade.topic_tag) ?? { total: 0, wrong: 0 };
        topic.total += 1;
        if (wrong) topic.wrong += 1;
        topicMap.set(grade.topic_tag, topic);
      }
    }

    weakQuestions = Array.from(questionMap.values())
      .map((q) => ({
        question_number: q.questionNumber,
        topic: q.topic,
        total: q.total,
        wrong: q.wrong,
        wrong_percent: percent(q.wrong, q.total),
      }))
      .filter(
        (q) =>
          q.total >= MIN_ANSWERS_FOR_WEAKNESS &&
          q.wrong_percent > WEAKNESS_THRESHOLD_PERCENT
      )
      .sort((a, b) => b.wrong_percent - a.wrong_percent);

    weakTopics = Array.from(topicMap.entries())
      .map(([topic, value]) => ({
        topic,
        total: value.total,
        wrong_percent: percent(value.wrong, value.total),
      }))
      .filter(
        (t) =>
          t.total >= MIN_ANSWERS_FOR_WEAKNESS &&
          t.wrong_percent > WEAKNESS_THRESHOLD_PERCENT
      )
      .sort((a, b) => b.wrong_percent - a.wrong_percent);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">تحليل نقاط الضعف</h1>
        <p className="mt-1 text-sm text-ink-muted">
          يعتمد التحليل على الأوراق المعتمدة فقط. السؤال يُعد ضعيفًا إذا أخطأ فيه أكثر من{" "}
          {WEAKNESS_THRESHOLD_PERCENT}% من الطلاب.
        </p>
      </header>

      <AnalyticsCharts
        averages={averages}
        assessments={assessmentList.map((a) => ({ id: a.id, title: a.title }))}
        selectedId={selected.id}
        selectedTitle={selected.title}
        approvedCount={selectedSubmissionIds.length}
        weakQuestions={weakQuestions}
        weakTopics={weakTopics}
      />
    </div>
  );
    }
