import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { requireApiStudent, studentAuthErrorResponse } from "@/lib/student-auth";

export const runtime = "nodejs";

const GRACE_MS = 15_000;

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({
    action: z.literal("submit"),
    answers: z.record(z.string(), z.number().int().min(0).max(3)),
  }),
]);

interface PublicQuestion {
  id: number;
  question: string;
  options: string[];
}
interface AnswerKeyItem {
  id: number;
  correct_index: number;
  explanation: string;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!sameOrigin(request)) {
    return Response.json({ error: "طلب غير مسموح." }, { status: 403 });
  }

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "معرّف غير صالح." }, { status: 400 });
  }

  let student;
  try {
    student = await requireApiStudent();
  } catch (error) {
    const response = studentAuthErrorResponse(error);
    if (response) return response;
    return Response.json({ error: "تعذر التحقق من الهوية." }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صالحة." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "البيانات غير صالحة." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("quiz_sessions")
    .select(
      "id, user_id, subject, topic, status, questions, num_questions, time_limit_minutes, started_at"
    )
    .eq("id", id)
    .eq("user_id", student.userId)
    .maybeSingle();

  if (!session) {
    return Response.json({ error: "الكويز غير موجود." }, { status: 404 });
  }

  const limitMs = session.time_limit_minutes * 60_000;

  if (parsed.data.action === "start") {
    if (session.status === "ready") {
      const startedAt = new Date().toISOString();
      const { error } = await admin
        .from("quiz_sessions")
        .update({ status: "in_progress", started_at: startedAt })
        .eq("id", session.id)
        .eq("status", "ready");
      if (error) {
        return Response.json({ error: "تعذر بدء الكويز." }, { status: 500 });
      }
      return Response.json({
        ok: true,
        questions: session.questions as PublicQuestion[],
        remaining_ms: limitMs,
        subject: session.subject,
        topic: session.topic,
      });
    }

    if (session.status === "in_progress" && session.started_at) {
      const remaining = new Date(session.started_at).getTime() + limitMs - Date.now();
      return Response.json({
        ok: true,
        questions: session.questions as PublicQuestion[],
        remaining_ms: Math.max(0, remaining),
        subject: session.subject,
        topic: session.topic,
      });
    }

    return Response.json(
      { error: "لا يمكن بدء هذا الكويز.", status: session.status },
      { status: 409 }
    );
  }

  // submit
  if (session.status !== "in_progress" || !session.started_at) {
    return Response.json({ error: "لا يمكن تسليم هذا الكويز.", status: session.status }, { status: 409 });
  }

  const deadline = new Date(session.started_at).getTime() + limitMs;
  const late = Date.now() > deadline + GRACE_MS;

  const { data: keyRow } = await admin
    .from("quiz_answer_keys")
    .select("answer_key")
    .eq("session_id", session.id)
    .maybeSingle();

  if (!keyRow) {
    return Response.json({ error: "تعذر تصحيح الكويز." }, { status: 500 });
  }

  const key = keyRow.answer_key as AnswerKeyItem[];
  const answers = parsed.data.answers;

  let score = 0;
  const review = key.map((item) => {
    const chosen = answers[String(item.id)];
    const correct = chosen === item.correct_index;
    if (correct) score += 1;
    return {
      id: item.id,
      chosen: typeof chosen === "number" ? chosen : null,
      correct_index: item.correct_index,
      is_correct: correct,
      explanation: item.explanation,
    };
  });

  const { error: updateError } = await admin
    .from("quiz_sessions")
    .update({
      status: late ? "expired" : "submitted",
      answers,
      score,
      finished_at: new Date().toISOString(),
    })
    .eq("id", session.id)
    .eq("status", "in_progress");

  if (updateError) {
    return Response.json({ error: "تعذر حفظ النتيجة." }, { status: 500 });
  }

  return Response.json({
    ok: true,
    late,
    score,
    total: key.length,
    review,
  });
  }
