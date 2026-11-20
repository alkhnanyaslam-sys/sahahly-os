import { createAdminClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { todayKey } from "@/lib/utils";
import AttendanceScanner, {
  type AttendanceGroupOption,
} from "@/components/dashboard/AttendanceScanner";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const auth = await requirePermission("attendance.scan");
  const admin = createAdminClient();

  const { data: groups } = await admin
    .from("groups")
    .select("id, name, grade_level")
    .eq("teacher_id", auth.teacherId)
    .order("name", { ascending: true });

  const options: AttendanceGroupOption[] = (groups ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    grade_level: group.grade_level,
  }));

  const today = todayKey();

  const { count: todayCount } = await admin
    .from("attendance")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", auth.teacherId)
    .eq("session_date", today);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">الحضور والغياب</h1>
        <p className="mt-1 text-sm text-ink-muted">
          امسح كود الطالب بالكاميرا أو بقارئ الباركود، أو اكتبه يدويًا.
        </p>
      </header>

      <AttendanceScanner groups={options} initialTodayCount={todayCount ?? 0} />
    </div>
  );
}
