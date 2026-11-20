"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  UserX,
  Wallet,
  X,
} from "lucide-react";
import { cn, formatEGP, toArabicDigits } from "@/lib/utils";
import type { PaymentStatus } from "@/types/database";

export interface ManagerGroup {
  id: string;
  name: string;
  grade_level: string;
  schedule_info: string | null;
}

export interface ManagerStudent {
  id: string;
  name: string;
  student_code: string;
  group_id: string | null;
  student_phone: string | null;
  parent_phone: string;
  is_active: boolean;
  payment_status: PaymentStatus;
  payment_amount: number;
}

interface StudentsManagerProps {
  groups: ManagerGroup[];
  students: ManagerStudent[];
  month: string;
  canManagePayments: boolean;
}

interface GroupForm {
  id?: string;
  name: string;
  grade_level: string;
  schedule_info: string;
}

interface StudentForm {
  id?: string;
  name: string;
  student_code: string;
  group_id: string;
  student_phone: string;
  parent_phone: string;
  is_active: boolean;
}

interface PaymentForm {
  student: ManagerStudent;
  amount: string;
  status: PaymentStatus;
}

interface ImportRow {
  name: string;
  parent_phone: string;
  student_phone: string | null;
  student_code: string | null;
  group_name: string | null;
}

interface ImportResult {
  imported: number;
  failed: number;
  errors: { row: number; error: string }[];
}

type Feedback = { kind: "success" | "error"; text: string } | null;

const EMPTY_GROUP: GroupForm = { name: "", grade_level: "", schedule_info: "" };
const EMPTY_STUDENT: StudentForm = {
  name: "",
  student_code: "",
  group_id: "",
  student_phone: "",
  parent_phone: "",
  is_active: true,
};

const PAYMENT_LABELS: Record<PaymentStatus, { label: string; className: string }> = {
  paid: { label: "مدفوع", className: "badge-success" },
  partial: { label: "مدفوع جزئيًا", className: "badge-warning" },
  unpaid: { label: "غير مدفوع", className: "badge-danger" },
};

/** أسماء الأعمدة المقبولة (عربي/إنجليزي) لكل حقل في ملف الاستيراد. */
const HEADER_ALIASES: Record<keyof ImportRow, string[]> = {
  name: ["name", "student name", "student_name", "الاسم", "اسم الطالب", "اسم"],
  parent_phone: [
    "parent_phone",
    "parent phone",
    "parent",
    "رقم ولي الأمر",
    "هاتف ولي الأمر",
    "موبايل ولي الأمر",
    "ولي الأمر",
  ],
  student_phone: [
    "student_phone",
    "student phone",
    "phone",
    "رقم الطالب",
    "هاتف الطالب",
    "موبايل الطالب",
    "الموبايل",
  ],
  student_code: ["student_code", "code", "كود", "كود الطالب", "الكود"],
  group_name: ["group_name", "group", "المجموعة", "اسم المجموعة", "مجموعة"],
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function mapRecords(records: Record<string, unknown>[]): ImportRow[] {
  return records.map((record) => {
    const lookup = new Map<string, unknown>();
    for (const [key, value] of Object.entries(record)) {
      lookup.set(normalizeHeader(key), value);
    }

    const pick = (field: keyof ImportRow): string => {
      for (const alias of HEADER_ALIASES[field]) {
        const value = lookup.get(normalizeHeader(alias));
        const text = cellToString(value);
        if (text) return text;
      }
      return "";
    };

    let parentPhone = pick("parent_phone");
    let studentPhone = pick("student_phone");
    // أرقام Excel تفقد الصفر الأول أحيانًا (1012345678): نعيده لتُقبل الصيغة.
    if (/^1[0125]\d{8}$/.test(parentPhone)) parentPhone = `0${parentPhone}`;
    if (/^1[0125]\d{8}$/.test(studentPhone)) studentPhone = `0${studentPhone}`;

    return {
      name: pick("name"),
      parent_phone: parentPhone,
      student_phone: studentPhone || null,
      student_code: pick("student_code") || null,
      group_name: pick("group_name") || null,
    };
  });
}

async function parseImportFile(file: File): Promise<ImportRow[]> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".csv")) {
    const Papa = (await import("papaparse")).default;
    const text = await file.text();
    const result = Papa.parse<Record<string, unknown>>(text.replace(/^\uFEFF/, ""), {
      header: true,
      skipEmptyLines: true,
    });
    return mapRecords(result.data);
  }

  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) return [];
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  return mapRecords(records);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? fallback;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="إغلاق" className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-line bg-white shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function StudentsManager({
  groups: initialGroups,
  students: initialStudents,
  month,
  canManagePayments,
}: StudentsManagerProps) {
  const router = useRouter();
  const importInputRef = useRef<HTMLInputElement>(null);

  const [groups, setGroups] = useState<ManagerGroup[]>(initialGroups);
  const [students, setStudents] = useState<ManagerStudent[]>(initialStudents);

  useEffect(() => setGroups(initialGroups), [initialGroups]);
  useEffect(() => setStudents(initialStudents), [initialStudents]);

  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | PaymentStatus>("all");
  const [showInactive, setShowInactive] = useState(false);

  const [groupForm, setGroupForm] = useState<GroupForm | null>(null);
  const [studentForm, setStudentForm] = useState<StudentForm | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentForm | null>(null);
  const [importState, setImportState] = useState<{
    rows: ImportRow[];
    fileName: string;
    defaultGroupId: string;
  } | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [printingGroupId, setPrintingGroupId] = useState<string | null>(null);

  const groupNameById = useMemo(
    () => new Map(groups.map((group) => [group.id, group.name])),
    [groups]
  );

  const countsByGroup = useMemo(() => {
    const counts = new Map<string, number>();
    for (const student of students) {
      if (!student.is_active || !student.group_id) continue;
      counts.set(student.group_id, (counts.get(student.group_id) ?? 0) + 1);
    }
    return counts;
  }, [students]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter((student) => {
      if (!showInactive && !student.is_active) return false;
      if (groupFilter === "none" && student.group_id) return false;
      if (groupFilter !== "all" && groupFilter !== "none" && student.group_id !== groupFilter) {
        return false;
      }
      if (paymentFilter !== "all" && student.payment_status !== paymentFilter) return false;
      if (!term) return true;
      return (
        student.name.toLowerCase().includes(term) ||
        student.student_code.toLowerCase().includes(term) ||
        student.parent_phone.includes(term) ||
        (student.student_phone ?? "").includes(term)
      );
    });
  }, [students, search, groupFilter, paymentFilter, showInactive]);

  const summary = useMemo(() => {
    const active = students.filter((s) => s.is_active);
    return {
      active: active.length,
      paid: active.filter((s) => s.payment_status === "paid").length,
      unpaid: active.filter((s) => s.payment_status !== "paid").length,
    };
  }, [students]);

  function closeModals() {
    setGroupForm(null);
    setStudentForm(null);
    setPaymentForm(null);
    setImportState(null);
    setImportResult(null);
    setModalError(null);
  }

  /* ---------------------------- المجموعات ---------------------------- */

  async function submitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupForm) return;
    setModalError(null);
    setBusy(true);

    try {
      const isEdit = Boolean(groupForm.id);
      const response = await fetch("/api/groups", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isEdit ? { id: groupForm.id } : {}),
          name: groupForm.name,
          grade_level: groupForm.grade_level,
          schedule_info: groupForm.schedule_info.trim() || null,
        }),
      });

      if (!response.ok) {
        setModalError(await readError(response, "تعذر حفظ المجموعة."));
        return;
      }

      const body = (await response.json()) as { group: ManagerGroup };
      setGroups((prev) =>
        isEdit
          ? prev.map((g) => (g.id === body.group.id ? body.group : g))
          : [...prev, body.group].sort((a, b) => a.name.localeCompare(b.name, "ar"))
      );
      setFeedback({ kind: "success", text: isEdit ? "تم تعديل المجموعة." : "تمت إضافة المجموعة." });
      closeModals();
      router.refresh();
    } catch {
      setModalError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteGroup(group: ManagerGroup) {
    const ok = window.confirm(
      `حذف المجموعة "${group.name}"؟ لن يُحذف الطلاب، لكنهم سيصبحون بلا مجموعة.`
    );
    if (!ok) return;

    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/groups?id=${encodeURIComponent(group.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setFeedback({ kind: "error", text: await readError(response, "تعذر حذف المجموعة.") });
        return;
      }
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
      setStudents((prev) =>
        prev.map((s) => (s.group_id === group.id ? { ...s, group_id: null } : s))
      );
      if (groupFilter === group.id) setGroupFilter("all");
      setFeedback({ kind: "success", text: "تم حذف المجموعة." });
      router.refresh();
    } catch {
      setFeedback({ kind: "error", text: "تعذر الاتصال بالخادم. حاول مرة أخرى." });
    } finally {
      setBusy(false);
    }
  }

  /* ----------------------------- الطلاب ------------------------------ */

  async function submitStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studentForm) return;
    setModalError(null);
    setBusy(true);

    try {
      const isEdit = Boolean(studentForm.id);
      const code = studentForm.student_code.trim();
      const response = await fetch("/api/students", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isEdit ? { id: studentForm.id } : {}),
          name: studentForm.name,
          ...(code ? { student_code: code } : {}),
          group_id: studentForm.group_id || null,
          student_phone: studentForm.student_phone.trim() || null,
          parent_phone: studentForm.parent_phone,
          is_active: studentForm.is_active,
        }),
      });

      if (!response.ok) {
        setModalError(await readError(response, "تعذر حفظ بيانات الطالب."));
        return;
      }

      const body = (await response.json()) as {
        student: Omit<ManagerStudent, "payment_status" | "payment_amount">;
      };

      setStudents((prev) => {
        if (isEdit) {
          return prev.map((s) => (s.id === body.student.id ? { ...s, ...body.student } : s));
        }
        return [
          ...prev,
          { ...body.student, payment_status: "unpaid" as PaymentStatus, payment_amount: 0 },
        ].sort((a, b) => a.name.localeCompare(b.name, "ar"));
      });
      setFeedback({ kind: "success", text: isEdit ? "تم تعديل بيانات الطالب." : "تمت إضافة الطالب." });
      closeModals();
      router.refresh();
    } catch {
      setModalError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivateStudent(student: ManagerStudent) {
    const ok = window.confirm(
      `إيقاف الطالب "${student.name}"؟ ستبقى سجلات حضوره ودرجاته محفوظة، ولن يستطيع التسليم.`
    );
    if (!ok) return;

    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/students?id=${encodeURIComponent(student.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setFeedback({ kind: "error", text: await readError(response, "تعذر إيقاف الطالب.") });
        return;
      }
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, is_active: false } : s))
      );
      setFeedback({ kind: "success", text: "تم إيقاف الطالب." });
      router.refresh();
    } catch {
      setFeedback({ kind: "error", text: "تعذر الاتصال بالخادم. حاول مرة أخرى." });
    } finally {
      setBusy(false);
    }
  }

  /* ----------------------------- المدفوعات --------------------------- */

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paymentForm) return;
    setModalError(null);

    const amount = Number(paymentForm.amount.replace(",", "."));
    if (paymentForm.status !== "unpaid" && (!Number.isFinite(amount) || amount <= 0)) {
      setModalError("أدخل مبلغًا أكبر من صفر.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/payments/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: paymentForm.student.id,
          month,
          amount: paymentForm.status === "unpaid" ? 0 : amount,
          status: paymentForm.status,
        }),
      });

      if (!response.ok) {
        setModalError(await readError(response, "تعذر تسجيل الدفع."));
        return;
      }

      const savedAmount = paymentForm.status === "unpaid" ? 0 : amount;
      setStudents((prev) =>
        prev.map((s) =>
          s.id === paymentForm.student.id
            ? { ...s, payment_status: paymentForm.status, payment_amount: savedAmount }
            : s
        )
      );
      setFeedback({ kind: "success", text: "تم تحديث حالة الاشتراك." });
      closeModals();
      router.refresh();
    } catch {
      setModalError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  /* ----------------------------- الاستيراد --------------------------- */

  async function handleImportFile(file: File | undefined) {
    if (!file) return;
    setFeedback(null);
    setModalError(null);
    setImportResult(null);

    const lower = file.name.toLowerCase();
    if (![".xlsx", ".xls", ".csv"].some((ext) => lower.endsWith(ext))) {
      setFeedback({ kind: "error", text: "الصيغة غير مدعومة. اختر ملف Excel أو CSV." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFeedback({ kind: "error", text: "حجم الملف أكبر من 5 ميجابايت." });
      return;
    }

    setBusy(true);
    try {
      const rows = (await parseImportFile(file)).filter(
        (row) => row.name || row.parent_phone || row.student_code
      );
      if (rows.length === 0) {
        setFeedback({
          kind: "error",
          text: "لم نجد صفوفًا صالحة. تأكد من وجود عمودي الاسم ورقم ولي الأمر في الصف الأول.",
        });
        return;
      }
      if (rows.length > 1000) {
        setFeedback({ kind: "error", text: "الحد الأقصى 1000 طالب في الاستيراد الواحد." });
        return;
      }
      setImportState({ rows, fileName: file.name, defaultGroupId: "" });
    } catch {
      setFeedback({ kind: "error", text: "تعذر قراءة الملف. تأكد أنه ملف Excel أو CSV سليم." });
    } finally {
      setBusy(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!importState) return;
    setModalError(null);
    setBusy(true);

    try {
      const response = await fetch("/api/students/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_group_id: importState.defaultGroupId || null,
          rows: importState.rows,
        }),
      });

      if (!response.ok) {
        setModalError(await readError(response, "تعذر استيراد الملف."));
        return;
      }

      const body = (await response.json()) as ImportResult;
      setImportResult(body);
      setImportState(null);
      router.refresh();
    } catch {
      setModalError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  /* --------------------------- بطاقات الـ QR ------------------------- */

  async function printGroupCards(group: ManagerGroup) {
    const members = students.filter((s) => s.group_id === group.id && s.is_active);
    if (members.length === 0) {
      setFeedback({ kind: "error", text: "لا يوجد طلاب نشطون في هذه المجموعة لطباعة بطاقاتهم." });
      return;
    }

    // نفتح النافذة أولًا (داخل حدث الضغط) حتى لا يحجبها المتصفح.
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      setFeedback({ kind: "error", text: "المتصفح منع فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة." });
      return;
    }

    setPrintingGroupId(group.id);
    try {
      const QRCode = (await import("qrcode")).default;
      const cards: string[] = [];

      for (const student of members) {
        const dataUrl = await QRCode.toDataURL(student.student_code, {
          margin: 1,
          width: 260,
          errorCorrectionLevel: "M",
        });
        cards.push(`
          <div class="card">
            <div class="group">${escapeHtml(group.name)}</div>
            <img src="${dataUrl}" alt="QR" />
            <div class="name">${escapeHtml(student.name)}</div>
            <div class="code">${escapeHtml(student.student_code)}</div>
          </div>`);
      }

      printWindow.document.open();
      printWindow.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>بطاقات ${escapeHtml(group.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; font-family: Cairo, Tajawal, Arial, sans-serif; color: #0f172a; }
  h1 { font-size: 16px; margin: 0 0 12px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; text-align: center; break-inside: avoid; page-break-inside: avoid; }
  .card img { width: 130px; height: 130px; display: block; margin: 6px auto; }
  .group { font-size: 11px; color: #0369a1; font-weight: 700; }
  .name { font-size: 14px; font-weight: 700; margin-top: 2px; }
  .code { font-size: 13px; letter-spacing: 2px; direction: ltr; color: #334155; margin-top: 2px; }
  @media print { body { padding: 0; } h1 { display: none; } }
</style>
</head>
<body>
<h1>بطاقات مجموعة ${escapeHtml(group.name)} (${members.length} طالب)</h1>
<div class="grid">${cards.join("")}</div>
<script>
  window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });
</script>
</body>
</html>`);
      printWindow.document.close();
    } catch {
      printWindow.close();
      setFeedback({ kind: "error", text: "تعذر توليد بطاقات الـ QR. حاول مرة أخرى." });
    } finally {
      setPrintingGroupId(null);
    }
  }

  /* ------------------------------ الواجهة ---------------------------- */

  return (
    <div className="space-y-6">
      {feedback ? (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2 rounded-lg border px-4 py-3 text-sm",
            feedback.kind === "error"
              ? "border-danger-100 bg-danger-50 text-danger-700"
              : "border-success-100 bg-success-50 text-success-700"
          )}
        >
          {feedback.kind === "error" ? (
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          )}
          <span className="flex-1">{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="إخفاء الرسالة"
            className="shrink-0 text-current opacity-70 hover:opacity-100"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </p>
      ) : null}

      <section aria-label="ملخص" className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-sm font-semibold text-ink-muted">الطلاب النشطون</p>
          <p className="mt-1 text-2xl font-bold text-ink">{toArabicDigits(summary.active)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm font-semibold text-ink-muted">مسدّدو اشتراك {month}</p>
          <p className="mt-1 text-2xl font-bold text-success-700">{toArabicDigits(summary.paid)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm font-semibold text-ink-muted">لم يسدّدوا بعد</p>
          <p className="mt-1 text-2xl font-bold text-danger-700">{toArabicDigits(summary.unpaid)}</p>
        </div>
      </section>

      <section className="card" aria-label="المجموعات">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-ink">المجموعات</h2>
          <button
            type="button"
            className="btn-primary px-3 py-2"
            onClick={() => {
              setModalError(null);
              setGroupForm({ ...EMPTY_GROUP });
            }}
          >
            <Plus size={16} aria-hidden="true" />
            مجموعة جديدة
          </button>
        </div>

        {groups.length > 0 ? (
          <ul className="divide-y divide-line">
            {groups.map((group) => (
              <li key={group.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-bold text-ink">{group.name}</p>
                  <p className="text-xs text-ink-muted">
                    {group.grade_level}
                    {group.schedule_info ? ` · ${group.schedule_info}` : ""}
                    {` · ${toArabicDigits(countsByGroup.get(group.id) ?? 0)} طالب`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1.5"
                    onClick={() => void printGroupCards(group)}
                    disabled={printingGroupId === group.id}
                  >
                    {printingGroupId === group.id ? (
                      <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Printer size={14} aria-hidden="true" />
                    )}
                    طباعة بطاقات QR
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1.5"
                    onClick={() => {
                      setModalError(null);
                      setGroupForm({
                        id: group.id,
                        name: group.name,
                        grade_level: group.grade_level,
                        schedule_info: group.schedule_info ?? "",
                      });
                    }}
                    aria-label={`تعديل ${group.name}`}
                  >
                    <Pencil size={14} aria-hidden="true" />
                    تعديل
                  </button>
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-muted hover:bg-danger-50 hover:text-danger-600"
                    onClick={() => void deleteGroup(group)}
                    disabled={busy}
                    aria-label={`حذف ${group.name}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">
            لم تضف أي مجموعة بعد. ابدأ بإنشاء مجموعتك الأولى.
          </p>
        )}
      </section>

      <section className="card" aria-label="الطلاب">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-ink">الطلاب</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(e) => void handleImportFile(e.target.files?.[0])}
            />
            <button
              type="button"
              className="btn-secondary px-3 py-2"
              onClick={() => importInputRef.current?.click()}
              disabled={busy}
            >
              <FileSpreadsheet size={16} aria-hidden="true" />
              استيراد من Excel / CSV
            </button>
            <button
              type="button"
              className="btn-primary px-3 py-2"
              onClick={() => {
                setModalError(null);
                setStudentForm({ ...EMPTY_STUDENT, group_id: groups[0]?.id ?? "" });
              }}
            >
              <Plus size={16} aria-hidden="true" />
              طالب جديد
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-b border-line px-5 py-4 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <label htmlFor="student-search" className="sr-only">
              بحث
            </label>
            <Search
              size={16}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <input
              id="student-search"
              type="search"
              className="input pr-9"
              placeholder="ابحث بالاسم أو الكود أو رقم الهاتف"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="group-filter" className="sr-only">
              المجموعة
            </label>
            <select
              id="group-filter"
              className="input"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            >
              <option value="all">كل المجموعات</option>
              <option value="none">بدون مجموعة</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="payment-filter" className="sr-only">
              حالة الاشتراك
            </label>
            <select
              id="payment-filter"
              className="input"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as "all" | PaymentStatus)}
            >
              <option value="all">كل حالات الاشتراك</option>
              <option value="paid">مدفوع</option>
              <option value="partial">مدفوع جزئيًا</option>
              <option value="unpaid">غير مدفوع</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-soft md:col-span-4">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 accent-sky-600"
            />
            إظهار الطلاب الموقوفين
          </label>
        </div>

        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th>الكود</th>
                  <th>المجموعة</th>
                  <th>هاتف ولي الأمر</th>
                  <th>اشتراك {month}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((student) => {
                  const payment = PAYMENT_LABELS[student.payment_status];
                  return (
                    <tr key={student.id} className={student.is_active ? "" : "opacity-60"}>
                      <td>
                        <span className="block font-semibold text-ink">{student.name}</span>
                        {!student.is_active ? (
                          <span className="badge-warning mt-1">موقوف</span>
                        ) : null}
                      </td>
                      <td>
                        <span dir="ltr" className="font-latin text-xs tracking-wider">
                          {student.student_code}
                        </span>
                      </td>
                      <td>
                        {student.group_id ? groupNameById.get(student.group_id) ?? "—" : "—"}
                      </td>
                      <td>
                        <span dir="ltr" className="font-latin text-xs">
                          {student.parent_phone}
                        </span>
                      </td>
                      <td>
                        <span className={payment.className}>{payment.label}</span>
                        {student.payment_amount > 0 ? (
                          <span className="mt-1 block text-xs text-ink-muted">
                            {formatEGP(student.payment_amount)}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          {canManagePayments && student.is_active ? (
                            <button
                              type="button"
                              className="btn-secondary px-2.5 py-1.5"
                              onClick={() => {
                                setModalError(null);
                                setPaymentForm({
                                  student,
                                  amount: student.payment_amount > 0 ? String(student.payment_amount) : "",
                                  status: student.payment_status === "unpaid" ? "paid" : student.payment_status,
                                });
                              }}
                              aria-label={`تسجيل دفع ${student.name}`}
                            >
                              <Wallet size={14} aria-hidden="true" />
                              دفع
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-soft hover:bg-surface-muted"
                            onClick={() => {
                              setModalError(null);
                              setStudentForm({
                                id: student.id,
                                name: student.name,
                                student_code: student.student_code,
                                group_id: student.group_id ?? "",
                                student_phone: student.student_phone ?? "",
                                parent_phone: student.parent_phone,
                                is_active: student.is_active,
                              });
                            }}
                            aria-label={`تعديل ${student.name}`}
                          >
                            <Pencil size={14} aria-hidden="true" />
                          </button>
                          {student.is_active ? (
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-muted hover:bg-danger-50 hover:text-danger-600"
                              onClick={() => void deactivateStudent(student)}
                              disabled={busy}
                              aria-label={`إيقاف ${student.name}`}
                            >
                              <UserX size={14} aria-hidden="true" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-ink-muted">
            {students.length === 0
              ? "لا يوجد طلاب بعد. أضف طالبًا أو استورد قائمتك من Excel."
              : "لا توجد نتائج مطابقة للبحث."}
          </p>
        )}
      </section>

      {groupForm ? (
        <Modal title={groupForm.id ? "تعديل المجموعة" : "مجموعة جديدة"} onClose={closeModals}>
          <form onSubmit={submitGroup} className="space-y-4" noValidate>
            <div>
              <label htmlFor="group-name" className="label">
                اسم المجموعة
              </label>
              <input
                id="group-name"
                className="input"
                placeholder="مثال: مجموعة السبت والثلاثاء"
                value={groupForm.name}
                onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                disabled={busy}
                required
              />
            </div>
            <div>
              <label htmlFor="group-grade" className="label">
                المرحلة الدراسية
              </label>
              <input
                id="group-grade"
                className="input"
                placeholder="مثال: الصف الثالث الثانوي"
                value={groupForm.grade_level}
                onChange={(e) => setGroupForm({ ...groupForm, grade_level: e.target.value })}
                disabled={busy}
                required
              />
            </div>
            <div>
              <label htmlFor="group-schedule" className="label">
                المواعيد (اختياري)
              </label>
              <input
                id="group-schedule"
                className="input"
                placeholder="مثال: السبت والثلاثاء 5 مساءً"
                value={groupForm.schedule_info}
                onChange={(e) => setGroupForm({ ...groupForm, schedule_info: e.target.value })}
                disabled={busy}
              />
            </div>
            {modalError ? <ModalError message={modalError} /> : null}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1 py-2.5" disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : "حفظ"}
              </button>
              <button type="button" className="btn-secondary px-5" onClick={closeModals} disabled={busy}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {studentForm ? (
        <Modal title={studentForm.id ? "تعديل بيانات الطالب" : "طالب جديد"} onClose={closeModals}>
          <form onSubmit={submitStudent} className="space-y-4" noValidate>
            <div>
              <label htmlFor="student-name" className="label">
                اسم الطالب
              </label>
              <input
                id="student-name"
                className="input"
                value={studentForm.name}
                onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                disabled={busy}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="student-parent" className="label">
                  هاتف ولي الأمر
                </label>
                <input
                  id="student-parent"
                  type="tel"
                  dir="ltr"
                  className="input text-left"
                  placeholder="01012345678"
                  value={studentForm.parent_phone}
                  onChange={(e) => setStudentForm({ ...studentForm, parent_phone: e.target.value })}
                  disabled={busy}
                  required
                />
              </div>
              <div>
                <label htmlFor="student-phone" className="label">
                  هاتف الطالب (اختياري)
                </label>
                <input
                  id="student-phone"
                  type="tel"
                  dir="ltr"
                  className="input text-left"
                  placeholder="01012345678"
                  value={studentForm.student_phone}
                  onChange={(e) => setStudentForm({ ...studentForm, student_phone: e.target.value })}
                  disabled={busy}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="student-group" className="label">
                  المجموعة
                </label>
                <select
                  id="student-group"
                  className="input"
                  value={studentForm.group_id}
                  onChange={(e) => setStudentForm({ ...studentForm, group_id: e.target.value })}
                  disabled={busy}
                >
                  <option value="">بدون مجموعة</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="student-code-input" className="label">
                  كود الطالب
                </label>
                <input
                  id="student-code-input"
                  dir="ltr"
                  className="input text-left"
                  placeholder="يُولَّد تلقائيًا إن تُرك فارغًا"
                  value={studentForm.student_code}
                  onChange={(e) => setStudentForm({ ...studentForm, student_code: e.target.value })}
                  disabled={busy}
                />
              </div>
            </div>
            {studentForm.id ? (
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={studentForm.is_active}
                  onChange={(e) => setStudentForm({ ...studentForm, is_active: e.target.checked })}
                  disabled={busy}
                  className="h-4 w-4 accent-sky-600"
                />
                الطالب نشط
              </label>
            ) : null}
            {modalError ? <ModalError message={modalError} /> : null}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1 py-2.5" disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : "حفظ"}
              </button>
              <button type="button" className="btn-secondary px-5" onClick={closeModals} disabled={busy}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {paymentForm ? (
        <Modal title={`اشتراك ${paymentForm.student.name}`} onClose={closeModals}>
          <form onSubmit={submitPayment} className="space-y-4" noValidate>
            <p className="text-sm text-ink-muted">شهر {month}</p>
            <div>
              <label htmlFor="payment-status" className="label">
                الحالة
              </label>
              <select
                id="payment-status"
                className="input"
                value={paymentForm.status}
                onChange={(e) =>
                  setPaymentForm({ ...paymentForm, status: e.target.value as PaymentStatus })
                }
                disabled={busy}
              >
                <option value="paid">مدفوع بالكامل</option>
                <option value="partial">مدفوع جزئيًا</option>
                <option value="unpaid">غير مدفوع</option>
              </select>
            </div>
            {paymentForm.status !== "unpaid" ? (
              <div>
                <label htmlFor="payment-amount" className="label">
                  المبلغ المسدد (جنيه)
                </label>
                <input
                  id="payment-amount"
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  className="input text-left"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  disabled={busy}
                />
              </div>
            ) : null}
            {modalError ? <ModalError message={modalError} /> : null}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1 py-2.5" disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : "حفظ"}
              </button>
              <button type="button" className="btn-secondary px-5" onClick={closeModals} disabled={busy}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {importState ? (
        <Modal title="استيراد الطلاب" onClose={closeModals}>
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">
              الملف <span dir="ltr" className="font-latin font-semibold">{importState.fileName}</span> يحتوي على{" "}
              <strong>{toArabicDigits(importState.rows.length)}</strong> صف.
            </p>

            <div className="max-h-48 overflow-auto rounded-lg border border-line">
              <table className="table-clean">
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>هاتف ولي الأمر</th>
                    <th>المجموعة</th>
                  </tr>
                </thead>
                <tbody>
                  {importState.rows.slice(0, 5).map((row, index) => (
                    <tr key={`${row.name}-${index}`}>
                      <td>{row.name || "—"}</td>
                      <td>
                        <span dir="ltr" className="font-latin text-xs">
                          {row.parent_phone || "—"}
                        </span>
                      </td>
                      <td>{row.group_name ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {importState.rows.length > 5 ? (
              <p className="text-xs text-ink-muted">
                معاينة لأول 5 صفوف من {toArabicDigits(importState.rows.length)}.
              </p>
            ) : null}

            <div>
              <label htmlFor="import-group" className="label">
                مجموعة افتراضية للصفوف التي بلا عمود مجموعة
              </label>
              <select
                id="import-group"
                className="input"
                value={importState.defaultGroupId}
                onChange={(e) => setImportState({ ...importState, defaultGroupId: e.target.value })}
                disabled={busy}
              >
                <option value="">بدون مجموعة</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            <p className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-ink-soft">
              الأعمدة المعروفة: الاسم، رقم ولي الأمر، رقم الطالب، كود الطالب، المجموعة. الكود يُولَّد
              تلقائيًا إن كان فارغًا.
            </p>

            {modalError ? <ModalError message={modalError} /> : null}

            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary flex-1 py-2.5"
                onClick={() => void confirmImport()}
                disabled={busy}
              >
                {busy ? (
                  <>
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    جارٍ الاستيراد...
                  </>
                ) : (
                  "تأكيد الاستيراد"
                )}
              </button>
              <button type="button" className="btn-secondary px-5" onClick={closeModals} disabled={busy}>
                إلغاء
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {importResult ? (
        <Modal title="نتيجة الاستيراد" onClose={closeModals}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-success-100 bg-success-50 p-3 text-center">
                <p className="text-2xl font-bold text-success-700">{toArabicDigits(importResult.imported)}</p>
                <p className="text-xs font-semibold text-success-700">تم استيرادهم</p>
              </div>
              <div className="rounded-lg border border-danger-100 bg-danger-50 p-3 text-center">
                <p className="text-2xl font-bold text-danger-700">{toArabicDigits(importResult.failed)}</p>
                <p className="text-xs font-semibold text-danger-700">تعذر استيرادهم</p>
              </div>
            </div>

            {importResult.errors.length > 0 ? (
              <div className="max-h-56 overflow-auto rounded-lg border border-line">
                <table className="table-clean">
                  <thead>
                    <tr>
                      <th>الصف</th>
                      <th>السبب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.errors.map((item) => (
                      <tr key={`${item.row}-${item.error}`}>
                        <td>{toArabicDigits(item.row)}</td>
                        <td>{item.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <button type="button" className="btn-primary w-full py-2.5" onClick={closeModals}>
              تم
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function ModalError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700"
    >
      <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
           }
