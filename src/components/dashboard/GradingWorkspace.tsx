"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BoundingBox, SubmissionStatus } from "@/types/database";

export interface WorkspaceGrade {
  question_number: number;
  topic_tag: string | null;
  max_mark: number;
  awarded_mark: number;
  is_correct: boolean;
  ai_comment: string | null;
  bounding_box: BoundingBox | null;
  page_index: number;
}

export interface WorkspacePage {
  url: string;
  kind: "image" | "pdf";
}

interface GradingWorkspaceProps {
  submissionId: string;
  status: SubmissionStatus;
  studentName: string;
  studentCode: string;
  assessmentTitle: string;
  totalMarks: number;
  aiScore: number | null;
  finalScore: number | null;
  feedbackSummary: string | null;
  pages: WorkspacePage[];
  grades: WorkspaceGrade[];
  gradedPdfUrl: string | null;
  canApprove: boolean;
}

interface EditableGrade {
  awarded: string;
  comment: string;
}

interface ApproveResponse {
  ok?: boolean;
  status?: string;
  error?: string;
  whatsapp?: { attempted?: boolean; sent?: boolean; error?: string };
}

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending_ai: "قيد التصحيح الآلي",
  needs_review: "بانتظار المراجعة",
  approved: "معتمد",
  sent_to_parent: "أُرسل لولي الأمر",
};

function markColor(grade: WorkspaceGrade, awarded: number) {
  if (awarded >= grade.max_mark) return "success" as const;
  if (awarded <= 0) return "danger" as const;
  return "warning" as const;
}

const COLOR_CLASSES = {
  success: {
    box: "border-success-600 bg-success-50/30",
    chip: "bg-success-600 text-white",
  },
  danger: {
    box: "border-danger-600 bg-danger-50/30",
    chip: "bg-danger-600 text-white",
  },
  warning: {
    box: "border-warning-600 bg-warning-50/30",
    chip: "bg-warning-600 text-white",
  },
} as const;

export default function GradingWorkspace({
  submissionId,
  status,
  studentName,
  studentCode,
  assessmentTitle,
  totalMarks,
  aiScore,
  finalScore,
  feedbackSummary,
  pages,
  grades,
  gradedPdfUrl,
  canApprove,
}: GradingWorkspaceProps) {
  const router = useRouter();

  const [edits, setEdits] = useState<Record<number, EditableGrade>>(() => {
    const initial: Record<number, EditableGrade> = {};
    for (const grade of grades) {
      initial[grade.question_number] = {
        awarded: String(grade.awarded_mark),
        comment: grade.ai_comment ?? "",
      };
    }
    return initial;
  });
  const [summary, setSummary] = useState(feedbackSummary ?? "");
  const [sendToParent, setSendToParent] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const readOnly = !canApprove;

  const parsedMarks = useMemo(() => {
    const result = new Map<number, number | null>();
    for (const grade of grades) {
      const raw = edits[grade.question_number]?.awarded ?? "";
      const value = Number(raw.replace(",", "."));
      const valid =
        raw.trim() !== "" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= grade.max_mark;
      result.set(grade.question_number, valid ? value : null);
    }
    return result;
  }, [edits, grades]);

  const hasInvalid = Array.from(parsedMarks.values()).some((v) => v === null);

  const liveTotal = useMemo(() => {
    let sum = 0;
    for (const value of parsedMarks.values()) sum += value ?? 0;
    return Math.round(sum * 100) / 100;
  }, [parsedMarks]);

  const displayTotal = readOnly ? (finalScore ?? aiScore ?? liveTotal) : liveTotal;

  const currentPage = pages[pageIndex];
  const pageGrades = useMemo(
    () => grades.filter((grade) => grade.page_index === pageIndex),
    [grades, pageIndex]
  );

  const updateEdit = useCallback(
    (questionNumber: number, patch: Partial<EditableGrade>) => {
      setEdits((prev) => ({
        ...prev,
        [questionNumber]: {
          awarded: prev[questionNumber]?.awarded ?? "0",
          comment: prev[questionNumber]?.comment ?? "",
          ...patch,
        },
      }));
    },
    []
  );

  const activateQuestion = useCallback(
    (questionNumber: number, questionPage: number) => {
      setActiveQuestion(questionNumber);
      if (questionPage !== pageIndex && questionPage < pages.length) {
        setPageIndex(questionPage);
      }
    },
    [pageIndex, pages.length]
  );

  async function handleApprove() {
    setError(null);
    setNotice(null);

    if (hasInvalid) {
      setError("تأكد أن كل درجة رقم صحيح بين صفر والدرجة الكاملة للسؤال.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/submissions/${submissionId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions: grades.map((grade) => ({
            question_number: grade.question_number,
            awarded_mark: parsedMarks.get(grade.question_number) ?? 0,
            ai_comment: (edits[grade.question_number]?.comment ?? "").trim() || null,
          })),
          feedback_summary: summary.trim() || null,
          send_to_parent: sendToParent,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as ApproveResponse;

      if (!response.ok) {
        setError(body.error ?? "تعذر اعتماد الورقة. حاول مرة أخرى.");
        setSubmitting(false);
        return;
      }

      if (body.whatsapp?.attempted && !body.whatsapp.sent) {
        setNotice(
          `تم الاعتماد، لكن تعذر إرسال الواتساب: ${body.whatsapp.error ?? "سبب غير معروف"}.`
        );
      } else {
        setNotice("تم الاعتماد بنجاح.");
      }

      router.refresh();
      setSubmitting(false);
    } catch {
      setError("حدث خطأ في الاتصال. حاول مرة أخرى.");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="card flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div>
          <h1 className="text-xl font-bold text-ink">{studentName}</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            {assessmentTitle}
            {studentCode ? (
              <>
                {" · "}
                <span dir="ltr">{studentCode}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="badge-sky">{STATUS_LABELS[status]}</span>
          <div className="text-center">
            <p className="text-xs font-semibold text-ink-muted">الدرجة</p>
            <p className="text-2xl font-bold text-sky-700">
              {displayTotal}
              <span className="text-base font-semibold text-ink-muted"> / {totalMarks}</span>
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* الجزء الأيمن: ورقة الطالب */}
        <section className="card overflow-hidden" aria-label="ورقة الطالب">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-base font-bold text-ink">ورقة الطالب</h2>
            {pages.length > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                  disabled={pageIndex === 0}
                  aria-label="الصفحة السابقة"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-soft hover:bg-surface-muted disabled:opacity-40"
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
                <span className="text-sm font-semibold text-ink-soft">
                  {pageIndex + 1} / {pages.length}
                </span>
                <button
                  type="button"
                  onClick={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))}
                  disabled={pageIndex === pages.length - 1}
                  aria-label="الصفحة التالية"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-soft hover:bg-surface-muted disabled:opacity-40"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>

          <div className="max-h-[75vh] overflow-auto bg-surface-muted p-3">
            {!currentPage ? (
              <p className="py-16 text-center text-sm text-ink-muted">لا توجد صور لعرضها.</p>
            ) : currentPage.kind === "pdf" ? (
              <iframe
                src={currentPage.url}
                title="ملف PDF للطالب"
                className="h-[70vh] w-full rounded-lg border border-line bg-white"
              />
            ) : (
              <div dir="ltr" className="relative mx-auto w-full max-w-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentPage.url}
                  alt={`صفحة ${pageIndex + 1} من ورقة الطالب`}
                  decoding="async"
                  fetchPriority="high"
                  className="block h-auto w-full rounded-lg border border-line bg-white"
                />
                {pageGrades.map((grade) => {
                  if (!grade.bounding_box) return null;
                  const [ymin, xmin, ymax, xmax] = grade.bounding_box;
                  const awarded = parsedMarks.get(grade.question_number) ?? 0;
                  const color = COLOR_CLASSES[markColor(grade, awarded)];
                  const isActive = activeQuestion === grade.question_number;
                  return (
                    <button
                      key={grade.question_number}
                      type="button"
                      onClick={() => setActiveQuestion(grade.question_number)}
                      aria-label={`السؤال ${grade.question_number}`}
                      className={cn(
                        "absolute rounded-md border-2 transition-shadow",
                        color.box,
                        isActive ? "ring-2 ring-sky-400" : ""
                      )}
                      style={{
                        top: `${ymin / 10}%`,
                        left: `${xmin / 10}%`,
                        height: `${Math.max(0, ymax - ymin) / 10}%`,
                        width: `${Math.max(0, xmax - xmin) / 10}%`,
                      }}
                    >
                      <span
                        className={cn(
                          "absolute -top-3 left-1 rounded-md px-1.5 py-0.5 text-xs font-bold",
                          color.chip
                        )}
                      >
                        {awarded >= grade.max_mark ? "✓" : awarded <= 0 ? "✗" : "~"}{" "}
                        {awarded}/{grade.max_mark}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* الجزء الأيسر: الأسئلة والدرجات */}
        <section className="card flex flex-col" aria-label="درجات الأسئلة">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-base font-bold text-ink">
              {readOnly ? "درجات الأسئلة" : "راجع الدرجات وعدّلها"}
            </h2>
          </div>

          <div className="max-h-[60vh] flex-1 space-y-3 overflow-y-auto p-4">
            {grades.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-muted">
                لا توجد أسئلة مستخرجة لهذه الورقة.
              </p>
            ) : (
              grades.map((grade) => (
                <QuestionGradeCard
                  key={grade.question_number}
                  grade={grade}
                  edit={edits[grade.question_number]}
                  parsed={parsedMarks.get(grade.question_number)}
                  readOnly={readOnly}
                  submitting={submitting}
                  isActive={activeQuestion === grade.question_number}
                  onActivate={activateQuestion}
                  onEdit={updateEdit}
                />
              ))
            )}
          </div>

          <div className="space-y-3 border-t border-line p-4">
            <div>
              <label htmlFor="feedback-summary" className="label">
                ملخص الأداء (يصل لولي الأمر)
              </label>
              <textarea
                id="feedback-summary"
                rows={3}
                value={summary}
                disabled={readOnly || submitting}
                onChange={(e) => setSummary(e.target.value)}
                className="input resize-none text-sm"
              />
            </div>

            {error ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </p>
            ) : null}

            {notice ? (
              <p
                role="status"
                className="flex items-start gap-2 rounded-lg border border-success-100 bg-success-50 px-3 py-2 text-sm text-success-700"
              >
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{notice}</span>
              </p>
            ) : null}

            {canApprove ? (
              <>
                <label className="flex items-center gap-2 text-sm text-ink-soft">
                  <input
                    type="checkbox"
                    checked={sendToParent}
                    onChange={(e) => setSendToParent(e.target.checked)}
                    disabled={submitting}
                    className="h-4 w-4 accent-sky-600"
                  />
                  إرسال النتيجة وملف PDF لولي الأمر عبر واتساب
                </label>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={submitting || grades.length === 0 || hasInvalid}
                  className="btn-primary w-full py-3"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      جارٍ الاعتماد وتوليد الملف...
                    </>
                  ) : (
                    <>
                      <Send size={16} aria-hidden="true" />
                      {sendToParent ? "اعتماد وإرسال لولي الأمر" : "اعتماد فقط"}
                    </>
                  )}
                </button>
              </>
            ) : gradedPdfUrl ? (
              <a
                href={gradedPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary w-full py-3"
              >
                <Download size={16} aria-hidden="true" />
                تحميل ملف PDF بعد التصحيح
              </a>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

type QuestionGradeCardProps = {
  grade: WorkspaceGrade;
  edit: EditableGrade | undefined;
  parsed: number | null | undefined;
  readOnly: boolean;
  submitting: boolean;
  isActive: boolean;
  onActivate: (questionNumber: number, pageIndex: number) => void;
  onEdit: (questionNumber: number, patch: Partial<EditableGrade>) => void;
};

const QuestionGradeCard = memo(function QuestionGradeCard({
  grade,
  edit,
  parsed,
  readOnly,
  submitting,
  isActive,
  onActivate,
  onEdit,
}: QuestionGradeCardProps) {
  const invalid = parsed === null;
  const color = COLOR_CLASSES[markColor(grade, parsed ?? 0)];

  return (
    <article
      onClick={() => onActivate(grade.question_number, grade.page_index)}
      className={cn(
        "rounded-lg border p-3 transition-colors",
        isActive ? "border-sky-400 bg-sky-50" : "border-line bg-white"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => onActivate(grade.question_number, grade.page_index)}
            aria-pressed={isActive}
            className="rounded text-start font-bold text-ink hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            السؤال {grade.question_number}
          </button>
          {grade.topic_tag ? (
            <p className="text-xs text-ink-muted">{grade.topic_tag}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("rounded-md px-2 py-0.5 text-xs font-bold", color.chip)}>
            {parsed !== null && parsed !== undefined
              ? parsed >= grade.max_mark
                ? "صحيح"
                : parsed <= 0
                  ? "خطأ"
                  : "جزئي"
              : "—"}
          </span>
          <label className="sr-only" htmlFor={`mark-${grade.question_number}`}>
            درجة السؤال {grade.question_number}
          </label>
          <input
            id={`mark-${grade.question_number}`}
            type="text"
            inputMode="decimal"
            dir="ltr"
            value={edit?.awarded ?? ""}
            disabled={readOnly || submitting}
            onChange={(event) =>
              onEdit(grade.question_number, { awarded: event.target.value })
            }
            aria-invalid={invalid}
            className={cn(
              "input w-16 px-2 py-1.5 text-center",
              invalid ? "border-danger-600 focus:border-danger-600" : ""
            )}
          />
          <span className="text-sm font-semibold text-ink-muted">/ {grade.max_mark}</span>
        </div>
      </div>

      <div className="mt-3">
        <label
          htmlFor={`comment-${grade.question_number}`}
          className="mb-1 block text-xs font-semibold text-ink-muted"
        >
          التعليق
        </label>
        <textarea
          id={`comment-${grade.question_number}`}
          rows={2}
          value={edit?.comment ?? ""}
          disabled={readOnly || submitting}
          onChange={(event) =>
            onEdit(grade.question_number, { comment: event.target.value })
          }
          placeholder={readOnly ? "—" : "أضف تعليقًا عربيًا للطالب (اختياري)"}
          className="input resize-none text-sm"
        />
      </div>
    </article>
  );
});
