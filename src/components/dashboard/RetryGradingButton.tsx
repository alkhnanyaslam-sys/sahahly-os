"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCw } from "lucide-react";

const RETRY_DELAY_MS = 150_000;

export default function RetryGradingButton({
  submissionId,
  submittedAt,
}: {
  submissionId: string;
  submittedAt: string;
}) {
  const router = useRouter();
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const submittedAtMs = Date.parse(submittedAt);
    if (!Number.isFinite(submittedAtMs)) return;

    const timeout = window.setTimeout(
      () => setRetryAvailable(true),
      Math.max(0, submittedAtMs + RETRY_DELAY_MS - Date.now())
    );
    return () => window.clearTimeout(timeout);
  }, [submittedAt]);

  async function retryGrading() {
    setRetrying(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission_id: submissionId }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(body.error ?? "تعذرت إعادة التصحيح. حاول مرة أخرى.");
        setRetrying(false);
        return;
      }

      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
      setRetrying(false);
    }
  }

  if (!retryAvailable) {
    return <span className="text-xs text-ink-muted">جارٍ التصحيح...</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void retryGrading()}
        disabled={retrying}
        className="btn-secondary px-3 py-1.5"
      >
        {retrying ? (
          <Loader2 size={15} className="animate-spin" aria-hidden="true" />
        ) : (
          <RotateCw size={15} aria-hidden="true" />
        )}
        {retrying ? "جارٍ إعادة التصحيح..." : "إعادة المحاولة"}
      </button>
      {error ? (
        <span role="alert" className="max-w-48 text-xs text-danger-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}
