"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Loader2,
  Wallet,
} from "lucide-react";
import { cn, currentMonthKey } from "@/lib/utils";

export interface AttendanceGroupOption {
  id: string;
  name: string;
  grade_level: string;
}

interface AttendanceScannerProps {
  groups: AttendanceGroupOption[];
  initialTodayCount: number;
}

interface ScanResponse {
  ok?: boolean;
  error?: string;
  already_recorded?: boolean;
  student?: { id: string; name: string };
  attendance_status?: "present" | "absent" | "late" | "makeup_session";
  is_makeup?: boolean;
  payment?: { month: string; status: "paid" | "partial" | "unpaid"; is_paid: boolean };
  whatsapp?: { sent: boolean; error?: string };
}

interface ScanOutcome {
  kind: "paid" | "unpaid" | "error";
  studentId?: string;
  studentName?: string;
  message: string;
  detail?: string;
  at: number;
}

interface RecentScan {
  key: string;
  name: string;
  paid: boolean;
  time: string;
}

const SCANNER_ELEMENT_ID = "attendance-qr-reader";
const DUPLICATE_WINDOW_MS = 3000;

function timeLabel(date: Date): string {
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Cairo",
  }).format(date);
}

export default function AttendanceScanner({
  groups,
  initialTodayCount,
}: AttendanceScannerProps) {
  const [manualCode, setManualCode] = useState("");
  const [groupId, setGroupId] = useState("");
  const [isMakeup, setIsMakeup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const [todayCount, setTodayCount] = useState(initialTodayCount);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  const busyRef = useRef(false);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const groupRef = useRef(groupId);
  const makeupRef = useRef(isMakeup);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    groupRef.current = groupId;
  }, [groupId]);

  useEffect(() => {
    makeupRef.current = isMakeup;
  }, [isMakeup]);

  const submitScan = useCallback(async (rawCode: string) => {
    const code = rawCode.trim();
    if (code.length < 3 || busyRef.current) return;

    const last = lastScanRef.current;
    const now = Date.now();
    if (last && last.code === code && now - last.at < DUPLICATE_WINDOW_MS) return;
    lastScanRef.current = { code, at: now };

    busyRef.current = true;
    setBusy(true);

    try {
      const response = await fetch("/api/attendance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_code: code,
          ...(groupRef.current ? { group_id: groupRef.current } : {}),
          ...(makeupRef.current ? { is_makeup: true } : {}),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as ScanResponse;

      if (!response.ok || !body.student || !body.payment) {
        setOutcome({
          kind: "error",
          message: body.error ?? "تعذر تسجيل الحضور. حاول مرة أخرى.",
          at: Date.now(),
        });
        return;
      }

      const paid = body.payment.is_paid;
      const details: string[] = [];
      if (body.already_recorded) details.push("تم تسجيل حضوره من قبل اليوم.");
      if (body.is_makeup) details.push("حصة تعويضية.");
      if (!paid && body.payment.status === "partial") details.push("الاشتراك مدفوع جزئيًا.");
      if (body.whatsapp && !body.whatsapp.sent && !body.already_recorded) {
        details.push("تعذر إرسال إشعار الواتساب لولي الأمر.");
      }

      setOutcome({
        kind: paid ? "paid" : "unpaid",
        studentId: body.student.id,
        studentName: body.student.name,
        message: paid ? "حاضر - الاشتراك مدفوع" : "حاضر - لم يسدد اشتراك الشهر",
        detail: details.join(" "),
        at: Date.now(),
      });

      if (!body.already_recorded) {
        setTodayCount((count) => count + 1);
        setRecent((prev) =>
          [
            {
              key: `${body.student?.id}-${Date.now()}`,
              name: body.student?.name ?? "",
              paid,
              time: timeLabel(new Date()),
            },
            ...prev,
          ].slice(0, 8)
        );
      }
    } catch {
      setOutcome({
        kind: "error",
        message: "تعذر الاتصال بالخادم. تأكد من الإنترنت.",
        at: Date.now(),
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
      setManualCode("");
      manualInputRef.current?.focus();
    }
  }, []);

  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        await scanner.stop();
      } catch {
        // الكاميرا متوقفة بالفعل.
      }
      try {
        scanner.clear();
      } catch {
        // لا يوجد عنصر لتنظيفه.
      }
    }
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          void submitScan(decodedText);
        },
        () => {
          // أخطاء قراءة الإطارات الفارغة متوقعة ولا تحتاج عرضًا.
        }
      );
      setCameraOn(true);
    } catch {
      scannerRef.current = null;
      setCameraOn(false);
      setCameraError("تعذر فتح الكاميرا. اسمح باستخدام الكاميرا للمتصفح أو استخدم الإدخال اليدوي.");
    }
  }, [submitScan]);

  useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    manualInputRef.current?.focus();
  }, []);

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitScan(manualCode);
  }

  async function handleQuickPay() {
    if (!outcome?.studentId) return;
    setPayingId(outcome.studentId);

    const amountInput = window.prompt("أدخل مبلغ الاشتراك المسدد (بالجنيه):");
    if (amountInput === null) {
      setPayingId(null);
      return;
    }

    const amount = Number(amountInput.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setOutcome({
        ...outcome,
        detail: "المبلغ غير صالح. أدخل رقمًا أكبر من صفر.",
        at: Date.now(),
      });
      setPayingId(null);
      return;
    }

    try {
      const response = await fetch("/api/payments/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: outcome.studentId,
          month: currentMonthKey(),
          amount,
          status: "paid",
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setOutcome({
          ...outcome,
          detail: body.error ?? "تعذر تسجيل الدفع.",
          at: Date.now(),
        });
        return;
      }

      setOutcome({
        kind: "paid",
        studentId: outcome.studentId,
        studentName: outcome.studentName,
        message: "حاضر - الاشتراك مدفوع",
        detail: "تم تسجيل الدفع.",
        at: Date.now(),
      });
      setRecent((prev) =>
        prev.map((item) =>
          item.key.startsWith(`${outcome.studentId}-`) ? { ...item, paid: true } : item
        )
      );
    } catch {
      setOutcome({
        ...outcome,
        detail: "تعذر الاتصال بالخادم أثناء تسجيل الدفع.",
        at: Date.now(),
      });
    } finally {
      setPayingId(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card p-5" aria-label="مسح كود الطالب">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="session-group" className="label">
              المجموعة (اختياري)
            </label>
            <select
              id="session-group"
              className="input"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              <option value="">مجموعة الطالب الأصلية</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} - {group.grade_level}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-end gap-2 pb-2.5 text-sm font-semibold text-ink-soft">
            <input
              type="checkbox"
              checked={isMakeup}
              onChange={(e) => setIsMakeup(e.target.checked)}
              className="h-4 w-4 accent-sky-600"
            />
            حصة تعويضية
          </label>
        </div>

        <form onSubmit={handleManualSubmit} className="mt-4 flex gap-2" noValidate>
          <div className="flex-1">
            <label htmlFor="manual-code" className="sr-only">
              كود الطالب
            </label>
            <input
              id="manual-code"
              ref={manualInputRef}
              type="text"
              dir="ltr"
              autoComplete="off"
              autoCapitalize="characters"
              className="input text-center text-lg tracking-widest"
              placeholder="امسح أو اكتب كود الطالب"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              disabled={busy}
            />
          </div>
          <button type="submit" className="btn-primary px-5" disabled={busy || manualCode.trim().length < 3}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : "تسجيل"}
          </button>
        </form>
        <p className="mt-1.5 text-xs text-ink-muted">
          قارئ الباركود يكتب الكود ويضغط Enter تلقائيًا، فاترك المؤشر داخل الخانة.
        </p>

        <div className="mt-5">
          <div
            id={SCANNER_ELEMENT_ID}
            className={cn(
              "overflow-hidden rounded-lg border border-line bg-surface-muted",
              cameraOn ? "block" : "hidden"
            )}
          />
          <button
            type="button"
            onClick={() => (cameraOn ? void stopCamera() : void startCamera())}
            className="btn-secondary mt-3 w-full"
          >
            {cameraOn ? (
              <>
                <CameraOff size={16} aria-hidden="true" />
                إيقاف الكاميرا
              </>
            ) : (
              <>
                <Camera size={16} aria-hidden="true" />
                تشغيل كاميرا الهاتف
              </>
            )}
          </button>
          {cameraError ? (
            <p role="alert" className="mt-2 text-sm text-danger-700">
              {cameraError}
            </p>
          ) : null}
        </div>
      </section>

      <section className="space-y-4" aria-label="نتيجة المسح">
        <div
          key={outcome?.at ?? "empty"}
          role="status"
          aria-live="polite"
          className={cn(
            "card p-5",
            outcome?.kind === "paid" && "border-success-600 bg-success-50",
            outcome?.kind === "unpaid" && "border-danger-600 bg-danger-50",
            outcome?.kind === "error" && "border-warning-600 bg-warning-50"
          )}
        >
          {!outcome ? (
            <p className="py-8 text-center text-sm text-ink-muted">
              ستظهر نتيجة آخر مسح هنا.
            </p>
          ) : (
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
                  outcome.kind === "paid" && "bg-success-600 text-white",
                  outcome.kind === "unpaid" && "bg-danger-600 text-white",
                  outcome.kind === "error" && "bg-warning-600 text-white"
                )}
              >
                {outcome.kind === "paid" ? (
                  <CheckCircle2 size={26} aria-hidden="true" />
                ) : (
                  <AlertTriangle size={26} aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                {outcome.studentName ? (
                  <p className="text-xl font-bold text-ink">{outcome.studentName}</p>
                ) : null}
                <p
                  className={cn(
                    "text-base font-semibold",
                    outcome.kind === "paid" && "text-success-700",
                    outcome.kind === "unpaid" && "text-danger-700",
                    outcome.kind === "error" && "text-warning-700"
                  )}
                >
                  {outcome.message}
                </p>
                {outcome.detail ? (
                  <p className="mt-1 text-sm text-ink-soft">{outcome.detail}</p>
                ) : null}
                {outcome.kind === "unpaid" && outcome.studentId ? (
                  <button
                    type="button"
                    onClick={handleQuickPay}
                    disabled={payingId === outcome.studentId}
                    className="btn-danger mt-3"
                  >
                    {payingId === outcome.studentId ? (
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Wallet size={16} aria-hidden="true" />
                    )}
                    تسجيل دفع سريع
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-base font-bold text-ink">آخر من سُجّل حضورهم</h2>
            <span className="badge-sky">اليوم: {todayCount}</span>
          </div>
          {recent.length > 0 ? (
            <ul className="divide-y divide-line">
              {recent.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="min-w-0 truncate text-sm font-semibold text-ink">
                    {item.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={item.paid ? "badge-success" : "badge-danger"}>
                      {item.paid ? "مدفوع" : "غير مدفوع"}
                    </span>
                    <span className="text-xs text-ink-muted">{item.time}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-ink-muted">
              لم يُسجَّل أي حضور في هذه الجلسة بعد.
            </p>
          )}
        </div>
      </section>
    </div>
  );
    }
