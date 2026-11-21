"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  Printer,
  Search,
  UserRound,
  UserRoundX,
} from "lucide-react";
import type { AttendanceStatus } from "@/types/database";

type AttendanceCounts = Record<AttendanceStatus, number>;

export interface StudentReportRow {
  studentId: string;
  name: string;
  studentCode: string;
  isActive: boolean;
  attendance: AttendanceCounts;
  totalSessions: number;
  paper: {
    title: string;
    submittedAt: string;
    href: string | null;
  } | null;
}

interface StudentReportsProps {
  month: string;
  monthLabel: string;
  currentMonthLabel: string;
  rows: StudentReportRow[];
  totals: {
    students: number;
    present: number;
    absent: number;
    papers: number;
  };
}

function arabicNumber(value: number) {
  return new Intl.NumberFormat("ar-EG").format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Cairo",
  }).format(new Date(value));
}

function attendanceRate(row: StudentReportRow) {
  if (row.totalSessions === 0) return null;
  const attended = row.attendance.present + row.attendance.late + row.attendance.makeup_session;
  return Math.round((attended / row.totalSessions) * 100);
}

export default function StudentReports({
  month,
  monthLabel,
  currentMonthLabel,
  rows,
  totals,
}: StudentReportsProps) {
  const [search, setSearch] = useState("");
  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ar");
    if (!term) return rows;
    return rows.filter(
      (row) =>
        row.name.toLocaleLowerCase("ar").includes(term) ||
        row.studentCode.toLocaleLowerCase("ar").includes(term)
    );
  }, [rows, search]);

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="ملخص الشهر">
        <SummaryCard icon={UserRound} label="إجمالي الطلاب" value={arabicNumber(totals.students)} tone="sky" />
        <SummaryCard icon={CheckCircle2} label="حالات الحضور المسجلة" value={arabicNumber(totals.present)} tone="green" />
        <SummaryCard icon={UserRoundX} label="حالات الغياب المسجلة" value={arabicNumber(totals.absent)} tone="rose" />
        <SummaryCard icon={FileText} label="أوراق إجابة هذا الشهر" value={arabicNumber(totals.papers)} tone="violet" />
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="text-lg font-bold text-ink">كشف الطلاب — {monthLabel}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-6 text-ink-muted">
              الأرقام مبنية على سجلات الحضور والغياب المدخلة خلال الشهر فقط؛ لا يُحتسب اليوم غيابًا ما لم يُسجّل كغياب.
            </p>
          </div>
          <button type="button" onClick={() => window.print()} className="btn-secondary no-print shrink-0">
            <Printer size={16} aria-hidden="true" />
            طباعة التقرير
          </button>
        </div>

        <div className="no-print flex flex-col gap-3 border-b border-line bg-surface-muted px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <label className="relative block w-full sm:max-w-xs">
            <span className="sr-only">ابحث باسم الطالب أو الكود</span>
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              className="input pr-9"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث باسم الطالب أو الكود"
            />
          </label>
          <p className="text-xs text-ink-muted">
            {arabicNumber(filteredRows.length)} من {arabicNumber(rows.length)} طالب · {currentMonthLabel}
          </p>
        </div>

        {filteredRows.length ? (
          <div className="overflow-x-auto">
            <table className="table-clean min-w-[850px]">
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th>حضر</th>
                  <th>غاب</th>
                  <th>تأخر</th>
                  <th>تعويضية</th>
                  <th>نسبة الحضور</th>
                  <th>أحدث ورقة إجابة</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const rate = attendanceRate(row);
                  return (
                    <tr key={row.studentId}>
                      <td>
                        <span className="block font-semibold text-ink">{row.name}</span>
                        <span dir="ltr" className="block text-right text-xs text-ink-muted">
                          {row.studentCode}
                          {!row.isActive ? " · غير نشط" : ""}
                        </span>
                      </td>
                      <td className="font-semibold text-success-700">{arabicNumber(row.attendance.present)}</td>
                      <td className="font-semibold text-danger-700">{arabicNumber(row.attendance.absent)}</td>
                      <td>{arabicNumber(row.attendance.late)}</td>
                      <td>{arabicNumber(row.attendance.makeup_session)}</td>
                      <td>
                        {rate === null ? (
                          <span className="text-xs text-ink-muted">لا توجد سجلات</span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                              <span className="block h-full rounded-full bg-sky-600" style={{ width: `${rate}%` }} />
                            </span>
                            <span className="text-xs font-semibold text-ink-soft">
                              {arabicNumber(rate)}٪
                            </span>
                          </span>
                        )}
                      </td>
                      <td>
                        {row.paper ? (
                          <div className="flex min-w-48 flex-col gap-1">
                            {row.paper.href ? (
                              <Link
                                href={row.paper.href}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700 hover:text-sky-800"
                              >
                                <FileText size={15} aria-hidden="true" />
                                <span className="max-w-48 truncate">{row.paper.title}</span>
                              </Link>
                            ) : (
                              <span className="text-sm font-semibold text-ink-soft">{row.paper.title}</span>
                            )}
                            <span className="text-xs text-ink-muted">{formatDate(row.paper.submittedAt)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-muted">لا توجد ورقة هذا الشهر</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-14 text-center">
            <CalendarDays size={28} aria-hidden="true" className="mx-auto text-ink-muted" />
            <p className="mt-3 font-semibold text-ink">
              {rows.length ? "لا توجد نتائج مطابقة" : "لا يوجد طلاب مسجلون لعرضهم"}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              {rows.length ? "جرّب البحث باسم مختلف أو بكود الطالب." : "ستظهر تقارير الطلاب هنا بعد إضافتهم."}
            </p>
          </div>
        )}
      </section>
    </>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
  tone: "sky" | "green" | "rose" | "violet";
}) {
  const tones = {
    sky: "bg-sky-100 text-sky-700",
    green: "bg-success-100 text-success-700",
    rose: "bg-danger-50 text-danger-700",
    violet: "bg-violet-100 text-violet-700",
  };

  return (
    <article className="card flex items-center gap-4 p-4 sm:p-5">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-ink-muted">{label}</p>
        <p className="mt-0.5 text-2xl font-bold leading-tight text-ink">{value}</p>
      </div>
    </article>
  );
}
