import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { currentMonthKey, toArabicDigits } from "@/lib/utils";
import { monthKeySchema } from "@/lib/validation";
import StudentReports, {
  type StudentReportRow,
} from "@/components/dashboard/StudentReports";
import type { AttendanceStatus, SubmissionStatus } from "@/types/database";

export const dynamic = "force-dynamic";

const STUDENTS_LIMIT = 2000;
const SUBMISSIONS_LIMIT = 5000;
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const GRADED_BUCKET = "graded-pdfs";

const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "present",
  "absent",
  "late",
  "makeup_session",
];

function getMonthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

function formatMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat("ar-EG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default async function StudentReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const auth = await requirePermission("analytics.view");
  const { month: requestedMonth } = await searchParams;
  const currentMonth = currentMonthKey();
  const month = monthKeySchema.safeParse(requestedMonth).success
    ? requestedMonth!
    : currentMonth;
  const { start, end } = getMonthRange(month);
  const admin = createAdminClient();

  const [studentsResult, attendanceResult, assessmentsResult] = await Promise.all([
    admin
      .from("students")
      .select("id, name, student_code, is_active")
      .eq("teacher_id", auth.teacherId)
      .order("name", { ascending: true })
      .limit(STUDENTS_LIMIT),
    admin
      .from("attendance")
      .select("student_id, status, session_date")
      .eq("teacher_id", auth.teacherId)
      .gte("session_date", month + "-01")
      .lt("session_date", end.slice(0, 10))
      .limit(10000),
    admin
      .from("assessments")
      .select("id, title")
      .eq("teacher_id", auth.teacherId),
  ]);

  const students = studentsResult.data ?? [];
  const assessmentList = assessmentsResult.data ?? [];
  const assessmentIds = assessmentList.map((assessment) => assessment.id);
  const assessmentById = new Map(assessmentList.map((assessment) => [assessment.id, assessment]));

  const { data: submissions } = assessmentIds.length
    ? await admin
        .from("submissions")
        .select("id, student_id, assessment_id, graded_pdf_url, submitted_at, status")
        .in("assessment_id", assessmentIds)
        .gte("submitted_at", start)
        .lt("submitted_at", end)
        .neq("status", "pending_ai")
        .order("submitted_at", { ascending: false })
        .limit(SUBMISSIONS_LIMIT)
    : { data: null };

  const studentById = new Map(students.map((student) => [student.id, student]));
  const countsByStudent = new Map<
    string,
    Record<AttendanceStatus, number>
  >();

  for (const record of attendanceResult.data ?? []) {
    if (!studentById.has(record.student_id)) continue;
    const status = record.status as AttendanceStatus;
    if (!ATTENDANCE_STATUSES.includes(status)) continue;
    const counts = countsByStudent.get(record.student_id) ?? {
      present: 0,
      absent: 0,
      late: 0,
      makeup_session: 0,
    };
    counts[status] += 1;
    countsByStudent.set(record.student_id, counts);
  }

  const latestSubmissionByStudent = new Map<
    string,
    NonNullable<typeof submissions>[number]
  >();
  for (const submission of submissions ?? []) {
    if (!latestSubmissionByStudent.has(submission.student_id)) {
      latestSubmissionByStudent.set(submission.student_id, submission);
    }
  }

  const gradedPaths = Array.from(
    new Set(
      Array.from(latestSubmissionByStudent.values())
        .map((submission) => submission.graded_pdf_url)
        .filter((path): path is string => Boolean(path))
    )
  );

  const { data: signedFiles } = gradedPaths.length
    ? await admin.storage
        .from(GRADED_BUCKET)
        .createSignedUrls(gradedPaths, SIGNED_URL_TTL_SECONDS)
    : { data: null };
  const signedUrlByPath = new Map(
    (signedFiles ?? [])
      .filter((file) => Boolean(file.signedUrl))
      .map((file) => [file.path, file.signedUrl as string])
  );

  const rows: StudentReportRow[] = students.map((student) => {
    const counts = countsByStudent.get(student.id) ?? {
      present: 0,
      absent: 0,
      late: 0,
      makeup_session: 0,
    };
    const submission = latestSubmissionByStudent.get(student.id);
    const assessment = submission
      ? assessmentById.get(submission.assessment_id)
      : null;
    const status = submission?.status as SubmissionStatus | undefined;

    return {
      studentId: student.id,
      name: student.name,
      studentCode: student.student_code,
      isActive: student.is_active,
      attendance: counts,
      totalSessions: counts.present + counts.absent + counts.late + counts.makeup_session,
      paper: submission
        ? {
            title: assessment?.title ?? "ورقة إجابة",
            submittedAt: submission.submitted_at,
            href:
              (submission.graded_pdf_url && signedUrlByPath.get(submission.graded_pdf_url)) ||
              (status === "approved" || status === "sent_to_parent"
                ? `/dashboard/grading/${submission.id}`
                : null),
          }
        : null,
    };
  });

  const totalPresent = rows.reduce(
    (sum, row) => sum + row.attendance.present + row.attendance.late + row.attendance.makeup_session,
    0
  );
  const totalAbsent = rows.reduce((sum, row) => sum + row.attendance.absent, 0);
  const paperCount = rows.filter((row) => row.paper).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-sky-700">متابعة الطلاب</p>
          <h1 className="mt-1 text-2xl font-bold text-ink">التقارير الشهرية</h1>
          <p className="mt-1 text-sm text-ink-muted">
            ملخص الحضور والغياب وأحدث أوراق الإجابة المسجلة لكل طالب.
          </p>
        </div>
        <form action="/dashboard/reports" method="get" className="no-print flex items-end gap-2">
          <label className="text-sm font-semibold text-ink-soft">
            الشهر
            <input
              aria-label="اختر الشهر"
              className="input mt-1 min-w-40"
              type="month"
              name="month"
              defaultValue={month}
            />
          </label>
          <button type="submit" className="btn-primary">عرض التقرير</button>
        </form>
      </header>

      <StudentReports
        month={month}
        monthLabel={formatMonth(month)}
        rows={rows}
        totals={{
          students: rows.length,
          present: totalPresent,
          absent: totalAbsent,
          papers: paperCount,
        }}
        currentMonthLabel={toArabicDigits(month)}
      />
    </div>
  );
}
