"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, Search, ShieldAlert, ShieldCheck } from "lucide-react";

type OwnerTeacher = {
  id: string;
  name: string;
  subject: string;
  phone: string;
  subscriptionStatus: "trial" | "active" | "expired";
  createdAtLabel: string;
};

const subscriptionLabels: Record<OwnerTeacher["subscriptionStatus"], string> = {
  trial: "تجريبية",
  active: "نشطة",
  expired: "منتهية",
};

export function TeacherTable({ initialTeachers }: { initialTeachers: OwnerTeacher[] }) {
  const [teachers, setTeachers] = useState(initialTeachers);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const filteredTeachers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ar");
    if (!normalizedQuery) return teachers;

    return teachers.filter((teacher) => [
      teacher.name,
      teacher.subject,
      teacher.phone,
    ].some((value) => value.toLocaleLowerCase("ar").includes(normalizedQuery)));
  }, [query, teachers]);

  async function updateSubscriptionStatus(
    teacher: OwnerTeacher,
    subscriptionStatus: OwnerTeacher["subscriptionStatus"]
  ) {
    if (subscriptionStatus === teacher.subscriptionStatus) return;

    setPendingId(teacher.id);
    setNotice("");
    setError("");

    try {
      const response = await fetch(`/api/owner/teachers/${teacher.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionStatus }),
      });
      const result = await response.json().catch(() => null) as {
        teacher?: { subscriptionStatus?: OwnerTeacher["subscriptionStatus"] };
        error?: string;
      } | null;

      if (!response.ok || !result?.teacher?.subscriptionStatus) {
        setError(result?.error || "تعذّر تحديث الاشتراك.");
        return;
      }

      setTeachers((current) => current.map((item) => item.id === teacher.id
        ? { ...item, subscriptionStatus: result.teacher!.subscriptionStatus! }
        : item));
      setNotice(`تم تحديث اشتراك ${teacher.name} إلى ${subscriptionLabels[result.teacher.subscriptionStatus]}.`);
    } catch {
      setError("تعذّر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#dce6f2] bg-[#ffffff] shadow-[0_8px_28px_rgba(22,54,98,0.04)]">
      <div className="flex flex-col gap-4 border-b border-[#e8eef6] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-[#15243b]">حسابات المدرسين</h2>
          <p className="mt-1 text-sm text-[#718198]">إدارة الوصول وحالة الاشتراك للحسابات المسجلة.</p>
        </div>
        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">البحث عن مدرس</span>
          <Search size={17} aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8a99ad]" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث بالاسم أو المادة أو الهاتف"
            className="w-full rounded-xl border border-[#dce6f2] bg-[#ffffff] py-2.5 pr-10 pl-3 text-sm text-[#15243b] placeholder:text-[#8a99ad] focus:border-[#2e67bb] focus:outline-none focus:ring-4 focus:ring-[#eaf2ff]"
          />
        </label>
      </div>

      {notice ? <p role="status" className="border-b border-[#d7eadf] bg-[#f2fbf5] px-5 py-3 text-sm font-semibold text-[#17603a]">{notice}</p> : null}
      {error ? <p role="alert" className="border-b border-[#f2d2cf] bg-[#fff6f5] px-5 py-3 text-sm font-semibold text-[#a3322b]">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-right text-sm">
          <caption className="sr-only">قائمة المدرسين المسجلين وحالة حساباتهم</caption>
          <thead className="bg-[#f7f9fc] text-xs font-bold text-[#61728a]">
            <tr>
              <th scope="col" className="px-5 py-3.5">المدرس</th>
              <th scope="col" className="px-4 py-3.5">رقم الهاتف</th>
              <th scope="col" className="px-4 py-3.5">الاشتراك</th>
              <th scope="col" className="px-4 py-3.5">حالة الوصول</th>
              <th scope="col" className="px-4 py-3.5">تاريخ التسجيل</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf1f6]">
            {filteredTeachers.map((teacher) => {
              const isPending = pendingId === teacher.id;

              return (
                <tr key={teacher.id} className="transition-colors hover:bg-[#fafcff]">
                  <td className="px-5 py-4">
                    <span className="block font-bold text-[#21334d]">{teacher.name}</span>
                    <span className="mt-0.5 block text-xs text-[#7a8aa0]">{teacher.subject}</span>
                  </td>
                  <td dir="ltr" className="px-4 py-4 text-left font-medium text-[#53657d]">{teacher.phone}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`teacher-subscription-${teacher.id}`}>
                        تغيير اشتراك {teacher.name}
                      </label>
                      <select
                        id={`teacher-subscription-${teacher.id}`}
                        value={teacher.subscriptionStatus}
                        onChange={(event) => updateSubscriptionStatus(
                          teacher,
                          event.target.value as OwnerTeacher["subscriptionStatus"]
                        )}
                        disabled={pendingId !== null}
                        className="rounded-lg border border-[#dce6f2] bg-white px-2.5 py-2 text-xs font-bold text-[#42536d] focus:border-[#2e67bb] focus:outline-none focus:ring-4 focus:ring-[#eaf2ff] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {Object.entries(subscriptionLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      {isPending ? <LoaderCircle size={14} className="animate-spin text-[#3768aa]" aria-label="جارٍ تحديث الاشتراك" /> : null}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                      teacher.subscriptionStatus === "expired"
                        ? "bg-[#fff1f0] text-[#a3322b]"
                        : "bg-[#edf9f1] text-[#17603a]"
                    }`}>
                      {teacher.subscriptionStatus === "expired"
                        ? <ShieldAlert size={14} aria-hidden="true" />
                        : <ShieldCheck size={14} aria-hidden="true" />}
                      {teacher.subscriptionStatus === "expired" ? "موقوف" : "متاح"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-[#718198]">{teacher.createdAtLabel}</td>
                </tr>
              );
            })}
            {filteredTeachers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-sm text-[#718198]">
                  {teachers.length === 0 ? "لا توجد حسابات مدرسين بعد." : "لا توجد نتائج مطابقة للبحث."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {teachers.length >= 100 ? (
        <p className="border-t border-[#e8eef6] px-5 py-3 text-xs text-[#718198]">تعرض القائمة أحدث 100 حساب.</p>
      ) : null}
    </section>
  );
}
