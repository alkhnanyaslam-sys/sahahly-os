import { normalizeEgyptPhone } from "@/lib/utils";

export type WhatsAppProvider = "ultramsg" | "cloud_api";

export interface SendTextInput {
  /** رقم المستلم بأي صيغة مصرية (سيتم تنظيفه تلقائيًا). */
  to: string;
  message: string;
}

export interface SendDocumentInput {
  to: string;
  /** رابط مباشر قابل للتحميل (مثل signed URL من Supabase). */
  documentUrl: string;
  filename: string;
  caption?: string;
}

export interface SendResult {
  ok: boolean;
  provider: WhatsAppProvider;
  providerMessageId?: string;
  error?: string;
}

function getProvider(): WhatsAppProvider {
  return process.env.WHATSAPP_PROVIDER === "cloud_api" ? "cloud_api" : "ultramsg";
}

function failure(provider: WhatsAppProvider, error: string): SendResult {
  return { ok: false, provider, error };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await response.json();
    return typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ */
/* UltraMsg                                                             */
/* ------------------------------------------------------------------ */

function ultraMsgConfig() {
  const instanceId = process.env.ULTRAMSG_INSTANCE_ID;
  const token = process.env.ULTRAMSG_TOKEN;
  if (!instanceId || !token) return null;
  return { instanceId, token };
}

async function ultraMsgPost(
  endpoint: "messages/chat" | "messages/document",
  fields: Record<string, string>
): Promise<SendResult> {
  const config = ultraMsgConfig();
  if (!config) {
    return failure("ultramsg", "إعدادات UltraMsg غير مكتملة.");
  }

  const body = new URLSearchParams({ token: config.token, ...fields });

  try {
    const response = await fetch(
      `https://api.ultramsg.com/${config.instanceId}/${endpoint}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }
    );
    const data = await readJson(response);

    if (!response.ok || data.error || data.sent === "false") {
      const reason =
        typeof data.error === "string"
          ? data.error
          : `فشل الإرسال (${response.status}).`;
      return failure("ultramsg", reason);
    }

    return {
      ok: true,
      provider: "ultramsg",
      providerMessageId: data.id !== undefined ? String(data.id) : undefined,
    };
  } catch (error) {
    return failure(
      "ultramsg",
      error instanceof Error ? error.message : "خطأ غير معروف في الاتصال."
    );
  }
}

/* ------------------------------------------------------------------ */
/* WhatsApp Cloud API (Meta)                                            */
/* ------------------------------------------------------------------ */

function cloudConfig() {
  const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken };
}

async function cloudPost(payload: Record<string, unknown>): Promise<SendResult> {
  const config = cloudConfig();
  if (!config) {
    return failure("cloud_api", "إعدادات WhatsApp Cloud API غير مكتملة.");
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
      }
    );
    const data = await readJson(response);

    if (!response.ok) {
      const errorObj = data.error as { message?: string } | undefined;
      return failure(
        "cloud_api",
        errorObj?.message ?? `فشل الإرسال (${response.status}).`
      );
    }

    const messages = data.messages as Array<{ id?: string }> | undefined;
    return {
      ok: true,
      provider: "cloud_api",
      providerMessageId: messages?.[0]?.id,
    };
  } catch (error) {
    return failure(
      "cloud_api",
      error instanceof Error ? error.message : "خطأ غير معروف في الاتصال."
    );
  }
}

/* ------------------------------------------------------------------ */
/* الواجهة الموحدة                                                      */
/* ------------------------------------------------------------------ */

export async function sendWhatsAppText(input: SendTextInput): Promise<SendResult> {
  const provider = getProvider();
  const phone = normalizeEgyptPhone(input.to);
  if (!phone) {
    return failure(provider, "رقم الهاتف غير صالح.");
  }
  if (!input.message.trim()) {
    return failure(provider, "نص الرسالة فارغ.");
  }

  if (provider === "cloud_api") {
    return cloudPost({
      to: phone,
      type: "text",
      text: { preview_url: false, body: input.message },
    });
  }

  return ultraMsgPost("messages/chat", {
    to: `+${phone}`,
    body: input.message,
  });
}

export async function sendWhatsAppDocument(
  input: SendDocumentInput
): Promise<SendResult> {
  const provider = getProvider();
  const phone = normalizeEgyptPhone(input.to);
  if (!phone) {
    return failure(provider, "رقم الهاتف غير صالح.");
  }

  if (provider === "cloud_api") {
    return cloudPost({
      to: phone,
      type: "document",
      document: {
        link: input.documentUrl,
        filename: input.filename,
        ...(input.caption ? { caption: input.caption } : {}),
      },
    });
  }

  return ultraMsgPost("messages/document", {
    to: `+${phone}`,
    filename: input.filename,
    document: input.documentUrl,
    caption: input.caption ?? "",
  });
}

/* ------------------------------------------------------------------ */
/* قوالب الرسائل العربية                                                 */
/* ------------------------------------------------------------------ */

export function buildGradeReportMessage(params: {
  studentName: string;
  assessmentTitle: string;
  score: number;
  totalMarks: number;
  feedbackSummary?: string | null;
  teacherName: string;
}): string {
  const lines = [
    `السلام عليكم ورحمة الله،`,
    `نفيدكم بنتيجة الطالب/ة *${params.studentName}* في *${params.assessmentTitle}*:`,
    `الدرجة: *${params.score} من ${params.totalMarks}*`,
  ];
  if (params.feedbackSummary?.trim()) {
    lines.push(`ملاحظات: ${params.feedbackSummary.trim()}`);
  }
  lines.push(`مرفق ملف الإجابة بعد التصحيح.`, `أ/ ${params.teacherName}`);
  return lines.join("\n");
}

export function buildAttendanceMessage(params: {
  studentName: string;
  status: "present" | "late" | "makeup_session";
  sessionDate: string;
  teacherName: string;
}): string {
  const statusText =
    params.status === "late"
      ? "حضر متأخرًا"
      : params.status === "makeup_session"
        ? "حضر حصة تعويضية"
        : "حضر";
  return [
    `السلام عليكم ورحمة الله،`,
    `نفيدكم بأن الطالب/ة *${params.studentName}* ${statusText} حصة اليوم (${params.sessionDate}).`,
    `أ/ ${params.teacherName}`,
  ].join("\n");
}

export function buildPaymentReminderMessage(params: {
  studentName: string;
  monthLabel: string;
  remainingAmount?: number;
  teacherName: string;
}): string {
  const lines = [
    `السلام عليكم ورحمة الله،`,
    `تذكير بسداد اشتراك شهر *${params.monthLabel}* للطالب/ة *${params.studentName}*.`,
  ];
  if (params.remainingAmount && params.remainingAmount > 0) {
    lines.push(`المبلغ المتبقي: *${params.remainingAmount} جنيه*.`);
  }
  lines.push(`شكرًا لتعاونكم،`, `أ/ ${params.teacherName}`);
  return lines.join("\n");
}
