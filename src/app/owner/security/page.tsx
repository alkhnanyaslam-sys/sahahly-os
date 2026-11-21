import type { Metadata } from "next";
import { Activity, Clock3, Fingerprint, Globe2, ShieldAlert } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "الأمان والسجل",
};

export const dynamic = "force-dynamic";

type LoginAuditRow = {
  id: string;
  created_at: string;
  outcome: "success" | "failure" | "blocked" | null;
  ip_address: string | null;
  user_agent: string | null;
};

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";

  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function browserLabel(userAgent: string | null): string {
  if (!userAgent) return "متصفح غير معروف";
  if (/Edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/Firefox\//i.test(userAgent)) return "Mozilla Firefox";
  if (/Chrome\//i.test(userAgent) && !/Chromium/i.test(userAgent)) return "Google Chrome";
  if (/Safari\//i.test(userAgent)) return "Safari";
  return "متصفح آخر";
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Clock3;
}) {
  return (
    <article className="rounded-2xl border border-[#dce6f2] bg-[#ffffff] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#6e8098]">{label}</p>
          <p className="mt-3 text-xl font-extrabold text-[#15243b]">{value}</p>
          <p className="mt-1 text-xs text-[#8291a5]">{detail}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf2ff] text-[#174ea6]">
          <Icon size={19} aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}

export default async function OwnerSecurityPage() {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const [settingsResult, auditResult, failureResult] = await Promise.all([
    admin
      .from("platform_settings")
      .select("require_owner_mfa, owner_idle_timeout_seconds")
      .eq("id", 1)
      .maybeSingle(),
    admin
      .from("admin_audit_log")
      .select("id, created_at, outcome, ip_address, user_agent")
      .eq("action", "owner.login")
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("attempt_type", "failure")
      .gte("attempted_at", windowStart),
  ]);

  const settings = settingsResult.data as {
    require_owner_mfa?: boolean;
    owner_idle_timeout_seconds?: number;
  } | null;
  const loginEvents = (auditResult.data ?? []) as LoginAuditRow[];
  const hasDataError = Boolean(settingsResult.error || auditResult.error || failureResult.error);
  const timeoutSeconds = settings?.owner_idle_timeout_seconds ?? 12 * 60 * 60;
  const timeoutHours = Math.floor(timeoutSeconds / 3600);
  const timeoutMinutes = Math.floor((timeoutSeconds % 3600) / 60);
  const timeoutLabel = timeoutHours > 0
    ? `${timeoutHours} ساعة${timeoutMinutes ? ` و${timeoutMinutes} دقيقة` : ""}`
    : `${timeoutMinutes} دقيقة`;

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <section>
        <p className="inline-flex items-center gap-2 text-sm font-bold text-[#3768aa]">
          <ShieldAlert size={16} aria-hidden="true" />
          مركز الحماية
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#15243b]">الأمان والسجل</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#718198]">
          إعدادات جلسة المالك ومحاولات الدخول الأخيرة، مع عنوان الشبكة والمتصفح.
        </p>
      </section>

      {hasDataError ? (
        <div role="status" className="rounded-xl border border-[#f0d8ae] bg-[#fffaf0] px-4 py-3 text-sm leading-6 text-[#77551c]">
          تعذّر تحميل بعض سجلات الأمان. تأكد من إعداد ترحيلات بوابة المالك.
        </div>
      ) : null}
      {settings?.require_owner_mfa ? (
        <div role="alert" className="rounded-xl border border-[#f0d8ae] bg-[#fffaf0] px-4 py-3 text-sm leading-6 text-[#77551c]">
          سياسة التحقق متعدد العوامل مفعّلة. تسجيل الدخول مرفوض حتى تكتمل خطوة التحقق الإضافية.
        </div>
      ) : null}

      <section aria-label="إعدادات الجلسة" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Metric
          label="مدة الجلسة القصوى"
          value={timeoutLabel}
          detail="تنتهي جلسة المالك بعدها تلقائيًا"
          icon={Clock3}
        />
        <Metric
          label="التحقق متعدد العوامل"
          value={settings?.require_owner_mfa ? "مطلوب" : "غير مفعّل"}
          detail="حالة إعداد المنصة الحالية"
          icon={Fingerprint}
        />
        <Metric
          label="محاولات دخول فاشلة"
          value={failureResult.error ? "—" : (failureResult.count ?? 0).toLocaleString("ar-EG")}
          detail="خلال آخر 15 دقيقة"
          icon={Activity}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#dce6f2] bg-[#ffffff] shadow-[0_8px_28px_rgba(22,54,98,0.04)]">
        <div className="border-b border-[#e8eef6] px-5 py-5">
          <h2 className="text-lg font-extrabold text-[#15243b]">سجل دخول المالك</h2>
          <p className="mt-1 text-sm text-[#718198]">آخر عشر محاولات مسجلة، دون تخزين البريد أو كلمة المرور.</p>
        </div>

        {loginEvents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-right text-sm">
              <caption className="sr-only">سجل محاولات دخول المالك مع الوقت وعنوان الشبكة والمتصفح</caption>
              <thead className="bg-[#f7f9fc] text-xs font-bold text-[#61728a]">
                <tr>
                  <th scope="col" className="px-5 py-3.5">النتيجة</th>
                  <th scope="col" className="px-4 py-3.5">الوقت</th>
                  <th scope="col" className="px-4 py-3.5">عنوان IP</th>
                  <th scope="col" className="px-5 py-3.5">المتصفح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1f6]">
                {loginEvents.map((event) => {
                  const isSuccess = event.outcome === "success";
                  const label = isSuccess
                    ? "دخول ناجح"
                    : event.outcome === "blocked"
                      ? "محظور مؤقتًا"
                      : "دخول مرفوض";

                  return (
                    <tr key={event.id} className="hover:bg-[#fafcff]">
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          isSuccess
                            ? "bg-[#edf9f1] text-[#17603a]"
                            : "bg-[#fff1f0] text-[#a3322b]"
                        }`}>{label}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-[#52647c]">{formatDateTime(event.created_at)}</td>
                      <td dir="ltr" className="px-4 py-4 text-left font-mono text-xs text-[#52647c]">{event.ip_address || "—"}</td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-2 text-[#52647c]">
                          <Globe2 size={15} aria-hidden="true" className="text-[#8291a5]" />
                          {browserLabel(event.user_agent)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-12 text-center text-sm text-[#718198]">
            {auditResult.error ? "السجل غير متاح حاليًا." : "لا توجد محاولات دخول مسجلة بعد."}
          </p>
        )}
      </section>
    </main>
  );
}
