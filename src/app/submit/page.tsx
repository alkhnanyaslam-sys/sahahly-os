"use client";

import Link from "next/link";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  GraduationCap,
  ImagePlus,
  Loader2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { siteConfig } from "@/config/site";
import { cn, formatDateTimeAr } from "@/lib/utils";

interface AvailableAssessment {
  id: string;
  title: string;
  type: "homework" | "quiz" | "mock_exam";
  total_marks: number;
  deadline: string | null;
}

interface StudentInfo {
  name: string;
  group_name: string | null;
}

interface UploadTarget {
  path: string;
  token: string;
  signed_url: string;
}

type Step = "code" | "select" | "done";

const TYPE_LABELS: Record<AvailableAssessment["type"], string> = {
  homework: "واجب",
  quiz: "اختبار قصير",
  mock_exam: "امتحان تجريبي",
};

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILES = 20;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const RAW_BUCKET = "raw-submissions";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

export default function SubmitPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("code");
  const [studentCode, setStudentCode] = useState("");
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [assessments, setAssessments] = useState<AvailableAssessment[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const code = studentCode.trim();
    if (code.length < 3) {
      setError("اكتب كود الطالب كما هو مطبوع على بطاقتك.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/submissions/available", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_code: code }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        student?: StudentInfo;
        assessments?: AvailableAssessment[];
      };

      if (!response.ok || !body.student) {
        setError(body.error ?? "تعذر التحقق من الكود. حاول مرة أخرى.");
        return;
      }

      setStudent(body.student);
      setAssessments(body.assessments ?? []);
      setSelectedId(body.assessments?.[0]?.id ?? "");
      setStudentCode(code);
      setStep("select");
    } catch {
      setError("تعذر الاتصال بالخادم. تأكد من الإنترنت وحاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (picked.length === 0) return;

    const invalidType = picked.find((file) => !ACCEPTED_TYPES.includes(file.type));
    if (invalidType) {
      setError(`الملف "${invalidType.name}" غير مدعوم. الصيغ المقبولة: JPG, PNG, WEBP, PDF.`);
      return;
    }

    const tooBig = picked.find((file) => file.size > MAX_FILE_SIZE);
    if (tooBig) {
      setError(`الملف "${tooBig.name}" أكبر من 10 ميجابايت.`);
      return;
    }

    const merged = [...files, ...picked];
    if (merged.length > MAX_FILES) {
      setError(`الحد الأقصى ${MAX_FILES} ملفًا لكل تسليم.`);
      return;
    }
    setFiles(merged);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUpload() {
    setError(null);

    if (!selectedId) {
      setError("اختر الواجب الذي تريد تسليمه.");
      return;
    }
    if (files.length === 0) {
      setError("أضف صورة أو ملف PDF واحدًا على الأقل.");
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const urlResponse = await fetch("/api/submissions/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_code: studentCode,
          assessment_id: selectedId,
          files: files.map((file) => ({ content_type: file.type })),
        }),
      });
      const urlBody = (await urlResponse.json().catch(() => ({}))) as {
        error?: string;
        uploads?: UploadTarget[];
      };

      if (!urlResponse.ok || !urlBody.uploads || urlBody.uploads.length !== files.length) {
        setError(urlBody.error ?? "تعذر تجهيز رفع الملفات. حاول مرة أخرى.");
        setUploading(false);
        return;
      }

      const supabase = createClient();
      const uploads = urlBody.uploads;

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const target = uploads[i];
        if (!file || !target) continue;

        const { error: uploadError } = await supabase.storage
          .from(RAW_BUCKET)
          .uploadToSignedUrl(target.path, target.token, file, {
            contentType: file.type,
          });

        if (uploadError) {
          setError(`فشل رفع الملف "${file.name}". حاول مرة أخرى.`);
          setUploading(false);
          return;
        }

        setProgress(Math.round(((i + 1) / files.length) * 100));
      }

      const createResponse = await fetch("/api/submissions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_code: studentCode,
          assessment_id: selectedId,
          file_paths: uploads.map((upload) => upload.path),
        }),
      });
      const createBody = (await createResponse.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!createResponse.ok) {
        setError(createBody.error ?? "تعذر إتمام التسليم. حاول مرة أخرى.");
        setUploading(false);
        return;
      }

      setStep("done");
    } catch {
      setError("حدث خطأ أثناء الرفع. تأكد من الإنترنت وحاول مرة أخرى.");
    } finally {
      setUploading(false);
    }
  }

  function resetAll() {
    setStep("code");
    setStudentCode("");
    setStudent(null);
    setAssessments([]);
    setSelectedId("");
    setFiles([]);
    setError(null);
    setProgress(0);
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-10rem)] w-full max-w-xl flex-col px-4 py-8 sm:py-12">
      <Link href="/" className="flex items-center justify-center gap-2 text-sky-600">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-600 text-white">
          <GraduationCap size={22} aria-hidden="true" />
        </span>
        <span dir="ltr" lang="en" className="font-latin text-xl font-bold">
          {siteConfig.name}
        </span>
      </Link>

      <h1 className="mt-6 text-center text-2xl font-bold text-ink">بوابة تسليم الطلاب</h1>
      <p className="mt-1 text-center text-sm text-ink-muted">
        سلّم حلك بسهولة من الموبايل، بدون تسجيل حساب.
      </p>

      <div className="card mt-6 p-5 sm:p-6">
        {step === "code" ? (
          <form onSubmit={handleCodeSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="student-code" className="label">
                كود الطالب
              </label>
              <input
                id="student-code"
                type="text"
                dir="ltr"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                className="input text-center text-lg tracking-widest"
                placeholder="ST-0001"
                value={studentCode}
                onChange={(e) => setStudentCode(e.target.value)}
                disabled={loading}
                required
              />
              <p className="mt-1.5 text-xs text-ink-muted">
                ستجد الكود مطبوعًا على بطاقتك أو اسأل مدرسك.
              </p>
            </div>

            {error ? <ErrorBox message={error} /> : null}

            <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  جارٍ التحقق...
                </>
              ) : (
                "متابعة"
              )}
            </button>
          </form>
        ) : null}

        {step === "select" && student ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-3">
              <p className="text-sm text-ink-muted">أهلًا بك</p>
              <p className="text-lg font-bold text-sky-800">{student.name}</p>
              {student.group_name ? (
                <p className="text-sm text-ink-soft">{student.group_name}</p>
              ) : null}
            </div>

            {assessments.length === 0 ? (
              <div className="rounded-lg border border-line bg-surface-muted px-4 py-6 text-center">
                <p className="font-semibold text-ink-soft">لا توجد واجبات متاحة للتسليم الآن.</p>
                <p className="mt-1 text-sm text-ink-muted">
                  إما أنك سلّمت كل الواجبات أو انتهت مواعيدها.
                </p>
              </div>
            ) : (
              <>
                <fieldset>
                  <legend className="label">اختر الواجب</legend>
                  <div className="space-y-2">
                    {assessments.map((assessment) => (
                      <label
                        key={assessment.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                          selectedId === assessment.id
                            ? "border-sky-500 bg-sky-50"
                            : "border-line bg-white hover:bg-surface-muted"
                        )}
                      >
                        <input
                          type="radio"
                          name="assessment"
                          value={assessment.id}
                          checked={selectedId === assessment.id}
                          onChange={() => setSelectedId(assessment.id)}
                          disabled={uploading}
                          className="mt-1.5 h-4 w-4 accent-sky-600"
                        />
                        <span className="flex-1">
                          <span className="block font-semibold text-ink">{assessment.title}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                            <span className="badge-sky">{TYPE_LABELS[assessment.type]}</span>
                            <span>الدرجة: {assessment.total_marks}</span>
                            {assessment.deadline ? (
                              <span>آخر موعد: {formatDateTimeAr(assessment.deadline)}</span>
                            ) : null}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <span className="label">صور الحل أو ملف PDF</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    multiple
                    className="sr-only"
                    onChange={handleFilesChange}
                    disabled={uploading}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-sky-200 bg-sky-50 px-4 py-6 text-sky-700 transition-colors hover:bg-sky-100"
                  >
                    <ImagePlus size={28} aria-hidden="true" />
                    <span className="text-sm font-semibold">اضغط لالتقاط صورة أو اختيار ملفات</span>
                    <span className="text-xs text-ink-muted">
                      JPG / PNG / WEBP / PDF — حتى 10 ميجابايت للملف
                    </span>
                  </button>

                  {files.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {files.map((file, index) => (
                        <li
                          key={`${file.name}-${index}`}
                          className="flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-2"
                        >
                          <FileText size={18} className="shrink-0 text-sky-600" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span dir="ltr" className="block truncate text-left text-sm text-ink">
                              {file.name}
                            </span>
                            <span className="text-xs text-ink-muted">{formatSize(file.size)}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            disabled={uploading}
                            aria-label={`حذف ${file.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-danger-50 hover:text-danger-600"
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {uploading ? (
                  <div aria-live="polite">
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-semibold text-ink-soft">جارٍ رفع الحل...</span>
                      <span className="text-ink-muted">{progress}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-sky-100">
                      <div
                        className="h-full rounded-full bg-sky-600 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                ) : null}

                {error ? <ErrorBox message={error} /> : null}

                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading || files.length === 0}
                  className="btn-primary w-full py-3"
                >
                  {uploading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      جارٍ الإرسال...
                    </>
                  ) : (
                    <>
                      <UploadCloud size={18} aria-hidden="true" />
                      تسليم الحل
                    </>
                  )}
                </button>
              </>
            )}

            {assessments.length === 0 && error ? <ErrorBox message={error} /> : null}

            <button
              type="button"
              onClick={resetAll}
              disabled={uploading}
              className="w-full text-center text-sm font-semibold text-ink-muted hover:text-sky-600"
            >
              تغيير الكود
            </button>
          </div>
        ) : null}

        {step === "done" ? (
          <div className="py-4 text-center" role="status">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-100 text-success-600">
              <CheckCircle2 size={36} aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-xl font-bold text-ink">تم استلام حلك بنجاح</h2>
            <p className="mt-2 text-sm text-ink-soft">
              سيراجع المدرس حلك وتصلك النتيجة مع ولي الأمر على واتساب بعد التصحيح.
            </p>
            <button type="button" onClick={resetAll} className="btn-secondary mt-6">
              تسليم واجب آخر
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function ErrorBox({ message }: { message: string }) {
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
