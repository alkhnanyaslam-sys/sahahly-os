"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, Search, ShieldAlert, ShieldCheck } from "lucide-react";

type OwnerTeacher = {
  id: string;
  name: string;
  subject: string;
  phone: string;
  subscriptionStatus: "trial" | "active" | "expired";
  isSuspended: boolean;
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

  async function toggleSuspension(teacher: OwnerTeacher) {
    setPendingId(teacher.id);
    setNotice("");
    setError("");

    try {
      const response = await fetch(`/api/owner/teachers/${teacher.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSuspended: !teacher.isSuspended }),
      });
      const result = await response.json().catch(() => null) as {
        teacher?: { isSuspended?: boolean };
        error?: string;
      } | null;

      if (!response.ok || typeof result?.teacher?.isSuspended !== "boolean") {
        setError(result?.error || "تعذّر تحديث حالة الحساب.");
        return;
      }

      setTeachers((current) => current.map((item) => item.id === teacher.id
        ? { ...item, isSuspended: result.teacher!.isSuspended! }
        : item));
      setNotice(result.teacher.isSuspended
        ? `تم تعليق حساب ${teacher.name}.`
        : `تمت إعادة تفعيل حساب ${teacher.name}.`);
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
        <table className="w-full min-w-[820px] border-collapse text-right text-sm">
          <caption className="sr-only">قائمة المدرسين المسجلين وحالة حساباتهم</caption>
          <thead className="bg-[#f7f9fc] text-xs font-bold text-[#61728a]">
            <tr>
              <th scope="col" className="px-5 py-3.5">المدرس</th>
              <th scope="col" className="px-4 py-3.5">رقم الهاتف</th>
              <th scope="col" className="px-4 py-3.5">الاشتراك</th>
              <th scope="col" className="px-4 py-3.5">حالة الوصول</th>
              <th scope="col" className="px-4 py-3.5">تاريخ التسجيل</th>
              <th scope="col" className="px-5 py-3.5"><span className="sr-only">إجراء</span></th>
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
                    <span className="rounded-full bg-[#f0f4f9] px-2.5 py-1 text-xs font-bold text-[#52647c]">
                      {subscriptionLabels[teacher.subscriptionStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                      teacher.isSuspended
                        ? "bg-[#fff1f0] text-[#a3322b]"
                        : "bg-[#edf9f1] text-[#17603a]"
                    }`}>
                      {teacher.isSuspended
                        ? <ShieldAlert size={14} aria-hidden="true" />
                        : <ShieldCheck size={14} aria-hidden="true" />}
                      {teacher.isSuspended ? "معلّق" : "نشط"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-[#718198]">{teacher.createdAtLabel}</td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => toggleSuspension(teacher)}
                      disabled={pendingId !== null}
                      aria-label={teacher.isSuspended ? `إعادة تفعيل حساب ${teacher.name}` : `تعليق حساب ${teacher.name}`}
                      className={`inline-flex min-w-28 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        teacher.isSuspended
                          ? "border-[#b9d2f3] bg-[#f2f7ff] text-[#174ea6] hover:bg-[#e8f1ff]"
                          : "border-[#f0cbc7] bg-[#fff8f7] text-[#a3322b] hover:bg-[#fff0ee]"
                      }`}
                    >
                      {isPending ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : null}
                      {teacher.isSuspended ? "إعادة التفعيل" : "تعليق الحساب"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredTeachers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-[#718198]">
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
