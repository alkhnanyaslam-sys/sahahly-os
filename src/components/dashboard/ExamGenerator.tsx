"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  FileText,
  ImagePlus,
  Loader2,
  Printer,
  Sparkles,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, toArabicDigits } from "@/lib/utils";

interface ExamQuestion {
  number: number;
  text: string;
  marks: number;
  answer: string;
  solution_steps: string;
}

interface ExamModel {
  label: string;
  questions: ExamQuestion[];
}

interface GeneratedExams {
  title: string;
  models: ExamModel[];
}

interface ExamGeneratorProps {
  teacherId: string;
}

type PrintMode = "exams" | "answers" | "all";

const SOURCE_BUCKET = "mark-schemes";
const ACCEPTED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TEXT_LENGTH = 20000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function totalMarks(model: ExamModel): number {
  return model.questions.reduce((sum, q) => sum + q.marks, 0);
}

function buildPrintHtml(exams: GeneratedExams, mode: PrintMode): string {
  const title = escapeHtml(exams.title || "امتحان");

  const examPages = exams.models
    .map((model) => {
      const questions = model.questions
        .map(
          (q) => `
        <div class="q">
          <div class="q-head">
            <span class="q-num">السؤال ${q.number}</span>
            <span class="q-marks">(${q.marks} درجة)</span>
          </div>
          <div class="q-text">${escapeHtml(q.text)}</div>
        </div>`
        )
        .join("");

      return `
      <section class="page">
        <header class="head">
          <h1>${title}</h1>
          <p>النموذج (${escapeHtml(model.label)}) · الدرجة الكلية: ${totalMarks(model)}</p>
          <div class="fields"><span>الاسم: ....................................</span><span>الدرجة: ........ / ${totalMarks(model)}</span></div>
        </header>
        ${questions}
      </section>`;
    })
    .join("");

  const answerPages = exams.models
    .map((model) => {
      const answers = model.questions
        .map(
          (q) => `
        <div class="q">
          <div class="q-head">
            <span class="q-num">السؤال ${q.number}</span>
            <span class="q-marks">(${q.marks} درجة)</span>
          </div>
          <div class="ans"><strong>الإجابة:</strong> ${escapeHtml(q.answer)}</div>
          ${
            q.solution_steps.trim()
              ? `<div class="steps"><strong>خطوات الحل:</strong> ${escapeHtml(q.solution_steps)}</div>`
              : ""
          }
        </div>`
        )
        .join("");

      return `
      <section class="page">
        <header class="head">
          <h1>نموذج الإجابة - ${title}</h1>
          <p>النموذج (${escapeHtml(model.label)}) · الدرجة الكلية: ${totalMarks(model)}</p>
        </header>
        ${answers}
      </section>`;
    })
    .join("");

  const body =
    mode === "exams" ? examPages : mode === "answers" ? answerPages : examPages + answerPages;

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; font-family: Cairo, Tajawal, Arial, sans-serif; color: #0f172a; line-height: 1.8; }
  .page { page-break-after: always; break-after: page; padding: 8px 4px; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .head { border-bottom: 2px solid #0284c7; padding-bottom: 8px; margin-bottom: 14px; }
  .head h1 { margin: 0; font-size: 20px; color: #0369a1; }
  .head p { margin: 2px 0 0; font-size: 13px; color: #334155; }
  .fields { display: flex; justify-content: space-between; margin-top: 10px; font-size: 13px; }
  .q { margin-bottom: 14px; break-inside: avoid; page-break-inside: avoid; }
  .q-head { display: flex; gap: 8px; align-items: baseline; font-weight: 700; }
  .q-num { color: #0369a1; }
  .q-marks { font-size: 12px; color: #64748b; font-weight: 600; }
  .q-text, .ans, .steps { white-space: pre-wrap; font-size: 14px; margin-top: 2px; }
  .steps { color: #334155; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
${body}
<script>
  window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });
</script>
</body>
</html>`;
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? fallback;
}

export default function ExamGenerator({ teacherId }: ExamGeneratorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sourceText, setSourceText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<"upload" | "generate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exams, setExams] = useState<GeneratedExams | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showAnswers, setShowAnswers] = useState(false);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;

    if (!(picked.type in ACCEPTED_TYPES)) {
      setError("صيغة الملف غير مدعومة. الصيغ المقبولة: JPG, PNG, WEBP, PDF.");
      return;
    }
    if (picked.size > MAX_FILE_SIZE) {
      setError("حجم الملف أكبر من 10 ميجابايت.");
      return;
    }
    setFile(picked);
  }

  async function handleGenerate() {
    setError(null);

    const text = sourceText.trim();
    if (!text && !file) {
      setError("أدخل نص الامتحان أو ارفع صورته.");
      return;
    }
    if (text.length > MAX_TEXT_LENGTH) {
      setError("نص الامتحان طويل جدًا (الحد الأقصى 20000 حرف).");
      return;
    }

    setLoading(true);
    setExams(null);

    try {
      let sourcePath: string | undefined;

      if (file) {
        setStage("upload");
        const extension = ACCEPTED_TYPES[file.type] ?? "jpg";
        sourcePath = `${teacherId}/exam-sources/${crypto.randomUUID()}.${extension}`;

        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from(SOURCE_BUCKET)
          .upload(sourcePath, file, { contentType: file.type, upsert: false });

        if (uploadError) {
          setError("تعذر رفع ملف الامتحان. حاول مرة أخرى.");
          return;
        }
      }

      setStage("generate");
      const response = await fetch("/api/ai/generate-exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(text ? { source_text: text } : {}),
          ...(sourcePath ? { source_file_path: sourcePath } : {}),
          models_count: 3,
        }),
      });

      if (!response.ok) {
        setError(await readError(response, "فشل توليد النماذج. حاول مرة أخرى."));
        return;
      }

      const body = (await response.json()) as { exams?: GeneratedExams };
      if (!body.exams || body.exams.models.length === 0) {
        setError("لم يرجع النظام أي نماذج. حاول مرة أخرى.");
        return;
      }

      setExams(body.exams);
      setActiveIndex(0);
      setShowAnswers(false);
    } catch {
      setError("حدث خطأ في الاتصال. تأكد من الإنترنت وحاول مرة أخرى.");
    } finally {
      setLoading(false);
      setStage(null);
    }
  }

  function handlePrint(mode: PrintMode) {
    if (!exams) return;
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      setError("المتصفح منع فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildPrintHtml(exams, mode));
    printWindow.document.close();
  }

  const activeModel = exams?.models[activeIndex];

  return (
    <div className="space-y-6">
      <section className="card p-5" aria-label="مصدر الامتحان">
        <h2 className="text-lg font-bold text-ink">الامتحان الأصلي</h2>
        <p className="mt-1 text-sm text-ink-muted">
          اكتب نص الامتحان، أو ارفع صورة/ملف PDF له، أو استخدم الاثنين معًا.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="exam-source-text" className="label">
              نص الامتحان
            </label>
            <textarea
              id="exam-source-text"
              rows={7}
              className="input resize-y"
              placeholder="الصق أسئلة الامتحان هنا مع درجة كل سؤال..."
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              disabled={loading}
            />
            <p className="mt-1 text-xs text-ink-muted">
              {toArabicDigits(sourceText.length)} / {toArabicDigits(MAX_TEXT_LENGTH)} حرف
            </p>
          </div>

          <div>
            <span className="label">صورة أو ملف الامتحان (اختياري)</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              onChange={handleFileChange}
              disabled={loading}
            />
            {file ? (
              <div className="flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-2">
                <FileText size={18} className="shrink-0 text-sky-600" aria-hidden="true" />
                <span dir="ltr" className="min-w-0 flex-1 truncate text-left text-sm text-ink">
                  {file.name}
                </span>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  disabled={loading}
                  aria-label="حذف الملف"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-danger-50 hover:text-danger-600"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-sky-200 bg-sky-50 px-4 py-6 text-sky-700 transition-colors hover:bg-sky-100"
              >
                <ImagePlus size={26} aria-hidden="true" />
                <span className="text-sm font-semibold">اضغط لرفع صورة أو PDF</span>
                <span className="text-xs text-ink-muted">JPG / PNG / WEBP / PDF — حتى 10 ميجابايت</span>
              </button>
            )}
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

          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={loading}
            className="btn-primary w-full py-3 sm:w-auto sm:px-8"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                {stage === "upload" ? "جارٍ رفع الملف..." : "جارٍ توليد النماذج (قد يستغرق دقيقة)..."}
              </>
            ) : (
              <>
                <Sparkles size={16} aria-hidden="true" />
                توليد 3 نماذج موازية
              </>
            )}
          </button>
        </div>
      </section>

      {exams && activeModel ? (
        <section className="card" aria-label="النماذج الناتجة">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-ink">{exams.title || "النماذج الموازية"}</h2>
              <p className="text-sm text-ink-muted">
                راجع الأسئلة والإجابات جيدًا قبل الطباعة، فالنماذج مولَّدة آليًا.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-secondary px-3 py-2" onClick={() => handlePrint("exams")}>
                <Printer size={16} aria-hidden="true" />
                طباعة الأسئلة
              </button>
              <button type="button" className="btn-secondary px-3 py-2" onClick={() => handlePrint("answers")}>
                <Printer size={16} aria-hidden="true" />
                طباعة الإجابات
              </button>
              <button type="button" className="btn-primary px-3 py-2" onClick={() => handlePrint("all")}>
                <Printer size={16} aria-hidden="true" />
                طباعة الكل
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
            <div role="tablist" aria-label="النماذج" className="flex flex-wrap gap-2">
              {exams.models.map((model, index) => (
                <button
                  key={`${model.label}-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={index === activeIndex}
                  onClick={() => setActiveIndex(index)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
                    index === activeIndex
                      ? "bg-sky-100 text-sky-700"
                      : "border border-line bg-white text-ink-soft hover:bg-surface-muted"
                  )}
                >
                  نموذج {model.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
              <input
                type="checkbox"
                checked={showAnswers}
                onChange={(e) => setShowAnswers(e.target.checked)}
                className="h-4 w-4 accent-sky-600"
              />
              إظهار الإجابات
            </label>
          </div>

          <div className="space-y-4 p-5">
            <p className="text-sm font-semibold text-ink-soft">
              الدرجة الكلية للنموذج: {toArabicDigits(totalMarks(activeModel))}
            </p>

            {activeModel.questions.map((question) => (
              <article
                key={question.number}
                className="rounded-lg border border-line bg-white p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold text-sky-700">
                    السؤال {toArabicDigits(question.number)}
                  </h3>
                  <span className="badge-sky">{toArabicDigits(question.marks)} درجة</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{question.text}</p>

                {showAnswers ? (
                  <div className="mt-3 space-y-1.5 rounded-lg border border-success-100 bg-success-50 px-3 py-2.5 text-sm">
                    <p className="whitespace-pre-wrap text-success-700">
                      <strong>الإجابة:</strong> {question.answer}
                    </p>
                    {question.solution_steps.trim() ? (
                      <p className="whitespace-pre-wrap text-ink-soft">
                        <strong>خطوات الحل:</strong> {question.solution_steps}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
        }
