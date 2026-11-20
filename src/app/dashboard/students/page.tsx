import { createAdminClient } from "@/lib/supabase/server";
import { hasPermission, requirePermission } from "@/lib/auth";
import { currentMonthKey } from "@/lib/utils";
import StudentsManager, {
  type ManagerGroup,
  type ManagerStudent,
} from "@/components/dashboard/StudentsManager";

export const dynamic = "force-dynamic";

const STUDENTS_LIMIT = 2000;

export default async function StudentsPage() {
  const auth = await requirePermission("students.manage");
  const admin = createAdminClient();
  const teacherId = auth.teacherId;
  const month = currentMonthKey();

  const [groupsResult, studentsResult, paymentsResult] = await Promise.all([
    admin
      .from("groups")
      .select("id, name, grade_level, schedule_info")
      .eq("teacher_id", teacherId)
      .order("name", { ascending: true }),
    admin
      .from("students")
      .select(
        "id, name, student_code, group_id, student_phone, parent_phone, is_active"
      )
      .eq("teacher_id", teacherId)
      .order("name", { ascending: true })
      .limit(STUDENTS_LIMIT),
    admin
      .from("payments")
      .select("student_id, amount, status")
      .eq("teacher_id", teacherId)
      .eq("month", month),
  ]);

  const paymentByStudent = new Map(
    (paymentsResult.data ?? []).map((row) => [
      row.student_id,
      { status: row.status, amount: Number(row.amount) },
    ])
  );

  const groups: ManagerGroup[] = (groupsResult.data ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    grade_level: group.grade_level,
    schedule_info: group.schedule_info,
  }));

  const students: ManagerStudent[] = (studentsResult.data ?? []).map((student) => {
    const payment = paymentByStudent.get(student.id);
    return {
      id: student.id,
      name: student.name,
      student_code: student.student_code,
      group_id: student.group_id,
      student_phone: student.student_phone,
      parent_phone: student.parent_phone,
      is_active: student.is_active,
      payment_status: payment?.status ?? "unpaid",
      payment_amount: payment?.amount ?? 0,
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">الطلاب والمجموعات</h1>
        <p className="mt-1 text-sm text-ink-muted">
          أضف المجموعات والطلاب، استورد القوائم من Excel، واطبع بطاقات الـ QR وتابع
          اشتراكات الشهر.
        </p>
      </header>

      <StudentsManager
        groups={groups}
        students={students}
        month={month}
        canManagePayments={hasPermission(auth.role, "payments.manage")}
      />
    </div>
  );
    }
