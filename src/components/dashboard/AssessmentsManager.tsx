"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDateTimeAr, toArabicDigits } from "@/lib/utils";
import type { AssessmentType } from "@/types/database";

export interface ManagerAssessmentGroup {
  id: string;
  name: string;
  grade_level: string;
}

export interface ManagerAssessment {
  id: string;
  group_id: string | null;
  title: string;
  type: AssessmentType;
  total_marks: number;
  mark_scheme_url: string | null;
  has_rubric: boolean;
  deadline: string | null;
  created_at: string;
  submissions_count: number;
}

interface AssessmentsManagerProps {
  teacherId: string;
  groups: ManagerAssessmentGroup[];
  assessments: ManagerAssessment[];
}

interface AssessmentForm {
  id?: string;
  title: string;
  type: AssessmentType;
  group_id: string;
  total_marks: string;
  /** قيمة حقل datetime-local (بتوقيت القاهرة) أو فارغ. */
  deadline: string;
  /** مسار نموذج الإجابة الحالي في التخزين (إن وُجد). */
  existing_scheme: string | null;
  new_scheme_file: File | null;
  remove_scheme: boolean;
}

type Feedback = { kind: "success" | "error"; text: string } | null;

const TYPE_LABELS: Record<AssessmentType, string> = {
  homework: "واجب",
  quiz: "اختبار قصير",
  mock_exam: "امتحان تجريبي",
};

const SCHEME_BUCKET = "mark-schemes";
const SCHEME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const EMPTY_FORM: AssessmentForm = {
  title: "",
  type: "homework",
  group_id: "",
  total_marks: "",
  deadline: "",
  existing_scheme: null,
  new_scheme_file: null,
  remove_scheme: false,
};

/** يحوّل ISO إلى قيمة datetime-local بتوقيت القاهرة (YYYY-MM-DDTHH:mm). */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** يحوّل قيمة datetime-local (بتوقيت القاهرة) إلى ISO مع إزاحة صحيحة. */
function localInputToIso(value: string): string | null {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return null;
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  if ([y, m, d, hh, mm].some((n) => n === undefined || Number.isNaN(n))) return null;

  // نحسب إزاحة القاهرة (قد تتغير مع التوقيت الصيفي) عند هذا التاريخ.
  const guess = new Date(Date.UTC(y!, m! - 1, d!, hh!, mm!));
  const cairoParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);
  const g = (type: string) => Number(cairoParts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  const offsetMs = asUtc - guess.getTime();
  return new Date(guess.getTime() - offsetMs).toISOString();
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
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
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

export default function AssessmentsManager({
  teacherId,
  groups,
  assessments: initialAssessments,
}: AssessmentsManagerProps) {
  const router = useRouter();
  const schemeInputRef = useRef<HTMLInputElement>(null);

  const [assessments, setAssessments] = useState<ManagerAssessment[]>(initialAssessments);
  useEffect(() => setAssessments(initialAssessments), [initialAssessments]);

  const [form, setForm] = useState<AssessmentForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [copied, setCopied] = useState(false);

  const groupNameById = useMemo(
    () => new Map(groups.map((group) => [group.id, group.name])),
    [groups]
  );

  function openCreate() {
    setModalError(null);
    setForm({ ...EMPTY_FORM });
  }

  function openEdit(assessment: ManagerAssessment) {
    setModalError(null);
    setForm({
      id: assessment.id,
      title: assessment.title,
      type: assessment.type,
      group_id: assessment.group_id ?? "",
      total_marks: String(assessment.total_marks),
      deadline: isoToLocalInput(assessment.deadline),
      existing_scheme: assessment.mark_scheme_url,
      new_scheme_file: null,
      remove_scheme: false,
    });
  }

  function closeModal() {
    setForm(null);
    setModalError(null);
  }

  function handleSchemeChange(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked || !form) return;
    setModalError(null);

    if (!(picked.type in SCHEME_TYPES)) {
      setModalError("صيغة الملف غير مدعومة. الصيغ المقبولة: JPG, PNG, WEBP, PDF.");
      return;
    }
    if (picked.size > MAX_FILE_SIZE) {
      setModalError("حجم الملف أكبر من 10 ميجابايت.");
      return;
    }
    setForm({ ...form, new_scheme_file: picked, remove_scheme: false });
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    setModalError(null);

    const totalMarks = Number(form.total_marks.replace(",", "."));
    if (!Number.isFinite(totalMarks) || totalMarks <= 0) {
      setModalError("الدرجة الكلية يجب أن تكون رقمًا أكبر من صفر.");
      return;
    }
    if (form.title.trim().length < 2) {
      setModalError("العنوان قصير جدًا.");
      return;
    }

    setBusy(true);
    try {
      let schemePath: string | null = form.remove_scheme ? null : form.existing_scheme;

      if (form.new_scheme_file) {
        const extension = SCHEME_TYPES[form.new_scheme_file.type] ?? "jpg";
        const path = `${teacherId}/schemes/${crypto.randomUUID()}.${extension}`;
        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from(SCHEME_BUCKET)
          .upload(path, form.new_scheme_file, {
            contentType: form.new_scheme_file.type,
            upsert: false,
          });
        if (uploadError) {
          setModalError("تعذر رفع نموذج الإجابة. حاول مرة أخرى.");
          return;
        }
        schemePath = path;
      }

      const isEdit = Boolean(form.id);
      const response = await fetch("/api/assessments", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isEdit ? { id: form.id } : {}),
          title: form.title.trim(),
          type: form.type,
          group_id: form.group_id || null,
          total_marks: totalMarks,
          mark_scheme_url: schemePath,
          deadline: localInputToIso(form.deadline),
        }),
      });

      if (!response.ok) {
        setModalError(await readError(response, "تعذر حفظ الواجب."));
        return;
      }

      setFeedback({
        kind: "success",
        text: isEdit
          ? "تم تعديل الواجب."
          : "تم إنشاء الواجب. شارك الطلاب رابط بوابة التسليم.",
      });
      closeModal();
      router.refresh();
    } catch {
      setModalError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAssessment(assessment: ManagerAssessment) {
    const cascadeWarning =
      assessment.submissions_count > 0
        ? ` سيتم حذف ${toArabicDigits(assessment.submissions_count)} تسليمًا ودرجاتها وملفاتها نهائيًا أيضًا.`
        : "";
    const ok = window.confirm(
      `حذف "${assessment.title}"؟${cascadeWarning} لا يمكن التراجع عن ذلك.`
    );
    if (!ok) return;

    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/assessments?id=${encodeURIComponent(assessment.id)}&submissions=${assessment.submissions_count}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        setFeedback({ kind: "error", text: await readError(response, "تعذر حذف الواجب.") });
        return;
      }
      const body = (await response.json().catch(() => ({}))) as {
        file_cleanup_warning?: boolean;
        deleted_submissions?: number;
      };
      setAssessments((prev) => prev.filter((a) => a.id !== assessment.id));
      setFeedback({
        kind: body.file_cleanup_warning ? "error" : "success",
        text: body.file_cleanup_warning
          ? "تم حذف الواجب والتسليمات، لكن تعذر تنظيف بعض الملفات المخزنة."
          : body.deleted_submissions
            ? `تم حذف الواجب و${toArabicDigits(body.deleted_submissions)} تسليمًا مرتبطًا به.`
            : "تم حذف الواجب.",
      });
      router.refresh();
    } catch {
      setFeedback({ kind: "error", text: "تعذر الاتصال بالخادم. حاول مرة أخرى." });
    } finally {
      setBusy(false);
    }
  }

  async function copySubmitLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/submit`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFeedback({ kind: "error", text: "تعذر نسخ الرابط. انسخه يدويًا من شريط العنوان." });
    }
  }

  const now = Date.now();

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
            className="shrink-0 opacity-70 hover:opacity-100"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </p>
      ) : null}

      <section className="card flex flex-wrap items-center justify-between gap-3 p-5" aria-label="رابط التسليم">
        <div>
          <h2 className="text-base font-bold text-ink">رابط بوابة تسليم الطلاب</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            يدخل الطالب كوده من هذا الرابط ويرفع حلّه، بدون تسجيل حساب.
          </p>
        </div>
        <button type="button" className="btn-secondary px-3 py-2" onClick={() => void copySubmitLink()}>
          {copied ? "تم النسخ ✓" : "نسخ رابط /submit"}
        </button>
      </section>

      <section className="card" aria-label="قائمة الواجبات">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-ink">
            الواجبات والامتحانات ({toArabicDigits(assessments.length)})
          </h2>
          <button type="button" className="btn-primary px-3 py-2" onClick={openCreate}>
            <Plus size={16} aria-hidden="true" />
            واجب جديد
          </button>
        </div>

        {assessments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>العنوان</th>
                  <th>النوع</th>
                  <th>المجموعة</th>
                  <th>الدرجة</th>
                  <th>الموعد النهائي</th>
                  <th>نموذج الإجابة</th>
                  <th>التسليمات</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {assessments.map((assessment) => {
                  const expired =
                    assessment.deadline !== null && new Date(assessment.deadline).getTime() < now;
                  return (
                    <tr key={assessment.id}>
                      <td className="font-semibold text-ink">{assessment.title}</td>
                      <td>
                        <span className="badge-sky">{TYPE_LABELS[assessment.type]}</span>
                      </td>
                      <td>
                        {assessment.group_id
                          ? groupNameById.get(assessment.group_id) ?? "—"
                          : "كل المجموعات"}
                      </td>
                      <td>{toArabicDigits(assessment.total_marks)}</td>
                      <td>
                        {assessment.deadline ? (
                          <span className={expired ? "text-danger-700" : ""}>
                            {formatDateTimeAr(assessment.deadline)}
                            {expired ? " (منتهٍ)" : ""}
                          </span>
                        ) : (
                          "بدون موعد"
                        )}
                      </td>
                      <td>
                        {assessment.mark_scheme_url ? (
                          <span className="flex flex-col gap-1">
                            <span className="inline-flex items-center gap-1 text-xs text-ink-soft">
                              <FileText size={14} className="text-sky-600" aria-hidden="true" />
                              مرفوع
                            </span>
                            <span className={assessment.has_rubric ? "badge-success" : "badge-warning"}>
                              {assessment.has_rubric ? "تم تحليله" : "قيد التحليل"}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-ink-muted">غير مرفوع</span>
                        )}
                      </td>
                      <td>{toArabicDigits(assessment.submissions_count)}</td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-soft hover:bg-surface-muted"
                            onClick={() => openEdit(assessment)}
                            aria-label={`تعديل ${assessment.title}`}
                          >
                            <Pencil size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-muted hover:bg-danger-50 hover:text-danger-600 disabled:opacity-40"
                            onClick={() => void deleteAssessment(assessment)}
                            disabled={busy}
                            title={
                              assessment.submissions_count > 0
                                ? "سيُحذف هذا الواجب وتسليماته ودرجاتها نهائيًا"
                                : undefined
                            }
                            aria-label={`حذف ${assessment.title}`}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
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
            لا توجد واجبات بعد. أنشئ أول واجب وارفع نموذج إجابته.
          </p>
        )}
      </section>

      {form ? (
        <Modal title={form.id ? "تعديل الواجب" : "واجب جديد"} onClose={closeModal}>
          <form onSubmit={submitForm} className="space-y-4" noValidate>
            <div>
              <label htmlFor="assessment-title" className="label">
                العنوان
              </label>
              <input
                id="assessment-title"
                className="input"
                placeholder="مثال: واجب الباب الأول - التفاضل"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                disabled={busy}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="assessment-type" className="label">
                  النوع
                </label>
                <select
                  id="assessment-type"
                  className="input"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as AssessmentType })}
                  disabled={busy}
                >
                  {(Object.keys(TYPE_LABELS) as AssessmentType[]).map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="assessment-marks" className="label">
                  الدرجة الكلية
                </label>
                <input
                  id="assessment-marks"
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  className="input text-left"
                  placeholder="20"
                  value={form.total_marks}
                  onChange={(e) => setForm({ ...form, total_marks: e.target.value })}
                  disabled={busy}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="assessment-group" className="label">
                  المجموعة
                </label>
                <select
                  id="assessment-group"
                  className="input"
                  value={form.group_id}
                  onChange={(e) => setForm({ ...form, group_id: e.target.value })}
                  disabled={busy}
                >
                  <option value="">كل المجموعات</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="assessment-deadline" className="label">
                  الموعد النهائي (اختياري)
                </label>
                <input
                  id="assessment-deadline"
                  type="datetime-local"
                  dir="ltr"
                  className="input text-left"
                  value={form.deadline}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                  disabled={busy}
                />
              </div>
            </div>

            <div>
              <span className="label">نموذج الإجابة (صورة أو PDF)</span>
              <input
                ref={schemeInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                onChange={handleSchemeChange}
                disabled={busy}
              />

              {form.new_scheme_file ? (
                <div className="flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-2">
                  <FileText size={18} className="shrink-0 text-sky-600" aria-hidden="true" />
                  <span dir="ltr" className="min-w-0 flex-1 truncate text-left text-sm text-ink">
                    {form.new_scheme_file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, new_scheme_file: null })}
                    disabled={busy}
                    aria-label="إلغاء الملف الجديد"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-danger-50 hover:text-danger-600"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              ) : form.existing_scheme && !form.remove_scheme ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white px-3 py-2">
                  <FileText size={18} className="shrink-0 text-sky-600" aria-hidden="true" />
                  <span className="flex-1 text-sm text-ink-soft">يوجد نموذج إجابة مرفوع.</span>
                  <button
                    type="button"
                    className="btn-secondary px-2.5 py-1.5"
                    onClick={() => schemeInputRef.current?.click()}
                    disabled={busy}
                  >
                    استبدال
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-2.5 py-1.5 text-danger-700"
                    onClick={() => setForm({ ...form, remove_scheme: true })}
                    disabled={busy}
                  >
                    إزالة
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => schemeInputRef.current?.click()}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-sky-200 bg-sky-50 px-4 py-4 text-sm font-semibold text-sky-700 hover:bg-sky-100"
                >
                  <Paperclip size={16} aria-hidden="true" />
                  {form.remove_scheme ? "اختر نموذجًا جديدًا (أو احفظ لإزالته)" : "ارفع نموذج الإجابة"}
                </button>
              )}
              <p className="mt-1.5 text-xs text-ink-muted">
                بدون نموذج إجابة سيصحح الذكاء الاصطناعي اعتمادًا على فهمه للمسألة فقط، وتقل الدقة.
              </p>
            </div>

            {modalError ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{modalError}</span>
              </p>
            ) : null}

            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1 py-2.5" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    جارٍ الحفظ...
                  </>
                ) : (
                  "حفظ"
                )}
              </button>
              <button type="button" className="btn-secondary px-5" onClick={closeModal} disabled={busy}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
    }
