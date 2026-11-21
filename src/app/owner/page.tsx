import type { Metadata } from "next";
import { Activity, FileCheck2, Users, GraduationCap } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { TeacherTable } from "./teacher-table";

export const metadata: Metadata = {
  title: "نظرة عامة",
};

export const dynamic = "force-dynamic";

function formatDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";

  return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(timestamp);
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Users;
}) {
  return (
    <article className="rounded-2xl border border-[#dce6f2] bg-[#ffffff] p-5 shadow-[0_8px_28px_rgba(22,54,98,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-[#6e8098]">{label}</p>
          <p className="mt-3 text-3xl font-extrabold tracking-tight text-[#15243b]">{value}</p>
          <p className="mt-1.5 text-xs text-[#8291a5]">{detail}</p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eaf2ff] text-[#174ea6]">
          <Icon size={21} aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}

export default async function OwnerDashboardPage() {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const [teachersCount, studentsCount, submissionsCount, teachersResult] = await Promise.all([
    admin.from("teachers").select("id", { count: "exact", head: true }),
    admin.from("students").select("id", { count: "exact", head: true }),
    admin.from("submissions").select("id", { count: "exact", head: true }),
    admin
      .from("teachers")
      .select("id, name, subject, phone, subscription_status, created_at, is_suspended")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const hasDataError = Boolean(
    teachersCount.error
    || studentsCount.error
    || submissionsCount.error
    || teachersResult.error
  );
  const teachers = (teachersResult.data ?? []).map((teacher) => ({
    id: teacher.id,
    name: teacher.name,
    subject: teacher.subject,
    phone: teacher.phone,
    subscriptionStatus: teacher.subscription_status,
    isSuspended: Boolean(teacher.is_suspended),
    createdAtLabel: formatDate(teacher.created_at),
  }));

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-bold text-[#3768aa]">
            <Activity size={16} aria-hidden="true" />
            مركز إدارة المنصة
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#15243b]">نظرة عامة</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#718198]">
            متابعة مؤشرات المنصة وإدارة صلاحية وصول المدرسين.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#d9e6f7] bg-[#f3f7ff] px-3.5 py-2 text-xs font-bold text-[#315d9b]">
          <span className="h-2 w-2 rounded-full bg-[#2b9b61]" aria-hidden="true" />
          لوحة المالك
        </span>
      </section>

      {hasDataError ? (
        <div role="status" className="rounded-xl border border-[#f0d8ae] bg-[#fffaf0] px-4 py-3 text-sm leading-6 text-[#77551c]">
          تعذّر تحميل بعض البيانات. تأكد من إعداد جداول بوابة المالك وترحيلات قاعدة البيانات المطلوبة.
        </div>
      ) : null}

      <section aria-label="مؤشرات المنصة" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="المدرسون"
          value={teachersCount.error ? "—" : (teachersCount.count ?? 0).toLocaleString("ar-EG")}
          detail="إجمالي حسابات المدرسين"
          icon={Users}
        />
        <MetricCard
          label="الطلاب"
          value={studentsCount.error ? "—" : (studentsCount.count ?? 0).toLocaleString("ar-EG")}
          detail="إجمالي سجلات الطلاب"
          icon={GraduationCap}
        />
        <MetricCard
          label="أوراق التصحيح"
          value={submissionsCount.error ? "—" : (submissionsCount.count ?? 0).toLocaleString("ar-EG")}
          detail="إجمالي عمليات التسليم"
          icon={FileCheck2}
        />
      </section>

      <TeacherTable initialTeachers={teachers} />
    </main>
  );
}
