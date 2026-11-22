import { z } from "zod";
import { GoogleGenAI, Type } from "@google/genai";
import { createAdminClient } from "@/lib/supabase/server";
import { requireApiStudent, studentAuthErrorResponse } from "@/lib/student-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAILY_LIMIT = 10;

const bodySchema = z.object({
  subject: z.string().trim().min(2).max(100),
  topic: z.string().trim().max(200).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  num_questions: z.number().int().min(3).max(20),
  time_limit_minutes: z.number().int().min(1).max(120),
});

const LANGUAGE_NAMES: Record<string, string> = {
  ar: "العربية",
  en: "English",
  fr: "Français",
  de: "Deutsch",
};

const generatedSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(3),
        options: z.array(z.string().min(1)).length(4),
        correct_index: z.number().int().min(0).max(3),
        explanation: z.string().default(""),
      })
    )
    .min(1),
});

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correct_index: { type: Type.INTEGER },
          explanation: { type: Type.STRING },
        },
        required: ["question", "options", "correct_index", "explanation"],
      },
    },
  },
  required: ["questions"],
};

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json({ error: "طلب غير مسموح." }, { status: 403 });
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
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "البيانات غير صالحة." },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "الخدمة غير مهيأة حاليًا." }, { status: 503 });
  }

  const admin = createAdminClient();

  // الحد اليومي (بتوقيت UTC تقريبًا كفاية كبداية)
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from("quiz_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", student.userId)
    .gte("created_at", since.toISOString());

  if ((count ?? 0) >= DAILY_LIMIT) {
    return Response.json(
      { error: `وصلت للحد اليومي (${DAILY_LIMIT} كويزات). عُد غدًا.` },
      { status: 429 }
    );
  }

  const { data: session, error: insertError } = await admin
    .from("quiz_sessions")
    .insert({
      user_id: student.userId,
      subject: input.subject,
      topic: input.topic || null,
      language: student.studyLanguage,
      difficulty: input.difficulty,
      num_questions: input.num_questions,
      time_limit_minutes: input.time_limit_minutes,
      status: "generating",
    })
    .select("id")
    .single();

  if (insertError || !session) {
    return Response.json({ error: "تعذر إنشاء الكويز." }, { status: 500 });
  }

  const difficultyText =
    input.difficulty === "easy"
      ? "سهل (أساسي)"
      : input.difficulty === "hard"
        ? "صعب (مستويات عليا)"
        : "متوسط";

  const prompt = [
    `أنت معلم خبير. أنشئ كويز اختيار من متعدد بلغة: ${
      LANGUAGE_NAMES[student.studyLanguage] ?? "العربية"
    }.`,
    `المادة: ${input.subject}.`,
    input.topic ? `الموضوع/الدرس: ${input.topic}.` : "",
    `عدد الأسئلة: ${input.num_questions}. المستوى: ${difficultyText}.`,
    `عمر الطالب: ${student.age} سنة، فاجعل الصياغة مناسبة له.`,
    "القواعد:",
    "1) كل سؤال له 4 خيارات بالضبط وإجابة صحيحة واحدة فقط.",
    "2) correct_index رقم من 0 إلى 3 يشير إلى الخيار الصحيح.",
    "3) وزّع الإجابات الصحيحة بين الأرقام ولا تجعلها كلها في موضع واحد.",
    "4) explanation: شرح موجز (جملة أو جملتان) لسبب صحة الإجابة.",
    "5) تأكد من صحة المعلومات والحسابات، ولا تكرر الأسئلة.",
    "أعد JSON فقط وفق المخطط.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.7,
      },
    });

    const text = (response.text ?? "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");
    const generated = generatedSchema.parse(JSON.parse(text));
    const items = generated.questions.slice(0, input.num_questions);

    const publicQuestions = items.map((q, index) => ({
      id: index + 1,
      question: q.question,
      options: q.options,
    }));
    const answerKey = items.map((q, index) => ({
      id: index + 1,
      correct_index: q.correct_index,
      explanation: q.explanation,
    }));

    const { error: keyError } = await admin
      .from("quiz_answer_keys")
      .insert({ session_id: session.id, answer_key: answerKey });
    if (keyError) throw new Error("key");

    const { error: updateError } = await admin
      .from("quiz_sessions")
      .update({
        questions: publicQuestions,
        num_questions: publicQuestions.length,
        status: "ready",
      })
      .eq("id", session.id);
    if (updateError) throw new Error("update");

    return Response.json({ ok: true, session_id: session.id }, { status: 201 });
  } catch {
    await admin
      .from("quiz_sessions")
      .update({ status: "failed" })
      .eq("id", session.id);
    return Response.json(
      { error: "تعذر توليد الأسئلة. حاول مرة أخرى." },
      { status: 502 }
    );
  }
}
