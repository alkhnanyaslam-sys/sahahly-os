import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import type { AiRubric, BoundingBox } from "@/types/database";

const DEFAULT_MODEL = "gemini-2.5-flash";

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("متغير البيئة GEMINI_API_KEY غير مضبوط.");
  }
  return new GoogleGenAI({ apiKey });
}

function getModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

/** ملف يُرسل للنموذج: إما صورة أو PDF بصيغة base64. */
export interface InlineFile {
  mimeType: string;
  base64: string;
}

/**
 * يحمّل ملفًا من رابط (Supabase signed URL مثلًا) ويحوّله إلى base64.
 */
export async function fetchAsInlineFile(url: string): Promise<InlineFile> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`تعذر تحميل الملف (${response.status}).`);
  }
  const contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim() ||
    "application/octet-stream";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { mimeType: contentType, base64: buffer.toString("base64") };
}

function filePart(file: InlineFile) {
  return { inlineData: { mimeType: file.mimeType, data: file.base64 } };
}

function parseJson<T>(text: string | undefined, schema: z.ZodType<T>): T {
  if (!text) {
    throw new Error("لم يرجع نموذج الذكاء الاصطناعي أي رد.");
  }
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    throw new Error("رد الذكاء الاصطناعي ليس JSON صالحًا.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("رد الذكاء الاصطناعي لا يطابق الصيغة المطلوبة.");
  }
  return parsed.data;
}

/* ------------------------------------------------------------------ */
/* التصحيح                                                              */
/* ------------------------------------------------------------------ */

const boundingBoxSchema = z
  .array(z.number())
  .length(4)
  .transform((v) => v.map((n) => Math.min(1000, Math.max(0, Math.round(n)))) as BoundingBox);

const gradedQuestionSchema = z.object({
  question_number: z.number().int(),
  topic_tag: z.string().default(""),
  max_mark: z.number().min(0),
  awarded_mark: z.number().min(0),
  is_correct: z.boolean(),
  ai_comment: z.string().default(""),
  page_index: z.number().int().min(0).default(0),
  bounding_box: boundingBoxSchema.nullable().default(null),
});

const gradingResultSchema = z.object({
  questions: z.array(gradedQuestionSchema).min(1),
  feedback_summary: z.string().default(""),
});

export type GradedQuestion = z.infer<typeof gradedQuestionSchema>;
export type GradingResult = z.infer<typeof gradingResultSchema>;

const gradingResponseSchema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question_number: { type: Type.INTEGER },
          topic_tag: { type: Type.STRING },
          max_mark: { type: Type.NUMBER },
          awarded_mark: { type: Type.NUMBER },
          is_correct: { type: Type.BOOLEAN },
          ai_comment: { type: Type.STRING },
          page_index: { type: Type.INTEGER },
          bounding_box: {
            type: Type.ARRAY,
            items: { type: Type.NUMBER },
            nullable: true,
          },
        },
        required: [
          "question_number",
          "topic_tag",
          "max_mark",
          "awarded_mark",
          "is_correct",
          "ai_comment",
          "page_index",
          "bounding_box",
        ],
      },
    },
    feedback_summary: { type: Type.STRING },
  },
  required: ["questions", "feedback_summary"],
};

export interface GradeSubmissionInput {
  /** صور إجابات الطالب بالترتيب (كل عنصر = صفحة). */
  studentPages: InlineFile[];
  /** نموذج الإجابة (صورة أو PDF) إن وُجد. */
  markScheme?: InlineFile | null;
  /** الـ rubric المهيكل إن وُجد. */
  rubric?: AiRubric | null;
  totalMarks: number;
  subject?: string;
}

/**
 * يصحح ورقة طالب مكتوبة بخط اليد ويعيد درجات كل سؤال مع إحداثيات العلامات.
 */
export async function gradeSubmission(
  input: GradeSubmissionInput
): Promise<GradingResult> {
  const ai = getClient();

  const instructions = [
    "أنت مصحح امتحانات خبير يعمل لدى مدرس مصري. صحح ورقة الطالب المكتوبة بخط اليد بدقة وعدالة.",
    input.subject ? `المادة: ${input.subject}.` : "",
    `المجموع الكلي للدرجات: ${input.totalMarks}.`,
    "القواعد:",
    "1) استخرج كل سؤال أجاب عنه الطالب بالترتيب، وحدد رقمه.",
    "2) قارن خطوات الحل بنموذج الإجابة؛ امنح درجات جزئية على الخطوات الصحيحة حتى لو النتيجة النهائية خاطئة.",
    "3) is_correct تساوي true فقط عند نيل الدرجة النهائية للسؤال.",
    "4) ai_comment: تعليق عربي قصير ومحدد (جملة أو جملتان) يوضح الخطأ أو سبب خصم الدرجة.",
    "5) topic_tag: اسم الدرس أو المهارة التي يقيسها السؤال بالعربية.",
    "6) page_index: رقم الصفحة (يبدأ من 0) التي يظهر فيها حل السؤال حسب ترتيب الصور المرفقة.",
    "7) bounding_box: [ymin, xmin, ymax, xmax] بقيم من 0 إلى 1000 تحيط بحل السؤال في الصفحة، أو null إن تعذر تحديده.",
    "8) لا تتجاوز awarded_mark قيمة max_mark، ولا تجعل مجموع max_mark يتجاوز المجموع الكلي.",
    "9) إن كان الخط غير مقروء في سؤال ما فامنح 0 واذكر ذلك في التعليق.",
    "10) feedback_summary: ملخص عربي من 2-3 جمل لأداء الطالب ونقاط قوته وضعفه.",
    "أعد الرد بصيغة JSON فقط وفق المخطط المحدد.",
  ]
    .filter(Boolean)
    .join("\n");

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ text: instructions }];

  if (input.rubric && input.rubric.questions.length > 0) {
    parts.push({
      text: `الـ rubric المعتمد من المدرس (JSON):\n${JSON.stringify(input.rubric)}`,
    });
  }

  if (input.markScheme) {
    parts.push({ text: "نموذج الإجابة المعتمد:" });
    parts.push(filePart(input.markScheme));
  }

  parts.push({
    text: `ورقة الطالب (${input.studentPages.length} صفحة بالترتيب، الأولى رقمها 0):`,
  });
  input.studentPages.forEach((page, index) => {
    parts.push({ text: `الصفحة ${index}:` });
    parts.push(filePart(page));
  });

  const response = await ai.models.generateContent({
    model: getModel(),
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: "application/json",
      responseSchema: gradingResponseSchema,
      temperature: 0.1,
    },
  });

  const result = parseJson(response.text, gradingResultSchema);

  const maxPage = Math.max(0, input.studentPages.length - 1);
  const questions = result.questions.map((q) => {
    const maxMark = q.max_mark;
    const awarded = Math.min(q.awarded_mark, maxMark);
    return {
      ...q,
      awarded_mark: awarded,
      is_correct: q.is_correct && awarded >= maxMark,
      page_index: Math.min(q.page_index, maxPage),
    };
  });

  return { ...result, questions };
}

/* ------------------------------------------------------------------ */
/* مولد الامتحانات الموازية                                              */
/* ------------------------------------------------------------------ */

const examQuestionSchema = z.object({
  number: z.number().int(),
  text: z.string(),
  marks: z.number().min(0),
  answer: z.string(),
  solution_steps: z.string().default(""),
});

const examModelSchema = z.object({
  label: z.string(),
  questions: z.array(examQuestionSchema).min(1),
});

const generatedExamsSchema = z.object({
  title: z.string().default(""),
  models: z.array(examModelSchema).min(1),
});

export type GeneratedExams = z.infer<typeof generatedExamsSchema>;

const examResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    models: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                number: { type: Type.INTEGER },
                text: { type: Type.STRING },
                marks: { type: Type.NUMBER },
                answer: { type: Type.STRING },
                solution_steps: { type: Type.STRING },
              },
              required: ["number", "text", "marks", "answer", "solution_steps"],
            },
          },
        },
        required: ["label", "questions"],
      },
    },
  },
  required: ["title", "models"],
};

export interface GenerateExamInput {
  sourceText?: string;
  sourceFile?: InlineFile | null;
  subject?: string;
  modelsCount?: number;
}

/**
 * يولّد نماذج امتحانية موازية (أ، ب، ج) بأرقام وصياغة مختلفة مع نماذج الإجابة.
 */
export async function generateParallelExams(
  input: GenerateExamInput
): Promise<GeneratedExams> {
  if (!input.sourceText?.trim() && !input.sourceFile) {
    throw new Error("يجب إدخال نص الامتحان أو رفع صورته.");
  }

  const ai = getClient();
  const count = input.modelsCount ?? 3;
  const labels = ["أ", "ب", "ج", "د", "هـ"].slice(0, count);

  const instructions = [
    "أنت خبير في إعداد الامتحانات للمدرسين في مصر.",
    input.subject ? `المادة: ${input.subject}.` : "",
    `من الامتحان المرفق ولّد ${count} نماذج موازية بعناوين: ${labels.join("، ")}.`,
    "القواعد:",
    "1) حافظ على نفس عدد الأسئلة ونفس مستوى الصعوبة ونفس الدرس المقاس والتوزيع الدرجات لكل سؤال.",
    "2) غيّر الأرقام والمعطيات والصياغة والأمثلة في كل نموذج بحيث تختلف الإجابة النهائية عن النموذج الأصلي وعن باقي النماذج.",
    "3) اكتب لكل سؤال الإجابة النهائية وخطوات الحل المختصرة بدقة وتحقق منها حسابيًا.",
    "4) اللغة عربية واضحة، وحافظ على الرموز الرياضية والعلمية بصيغة نصية مقروءة.",
    "أعد الرد بصيغة JSON فقط وفق المخطط المحدد.",
  ]
    .filter(Boolean)
    .join("\n");

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ text: instructions }];

  if (input.sourceText?.trim()) {
    parts.push({ text: `نص الامتحان:\n${input.sourceText.trim()}` });
  }
  if (input.sourceFile) {
    parts.push({ text: "الامتحان المرفق:" });
    parts.push(filePart(input.sourceFile));
  }

  const response = await ai.models.generateContent({
    model: getModel(),
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: "application/json",
      responseSchema: examResponseSchema,
      temperature: 0.7,
    },
  });

  return parseJson(response.text, generatedExamsSchema);
}

/* ------------------------------------------------------------------ */
/* استخراج الـ rubric من نموذج الإجابة                                    */
/* ------------------------------------------------------------------ */

const rubricSchema = z.object({
  questions: z.array(
    z.object({
      question_number: z.number().int(),
      topic_tag: z.string().default(""),
      max_mark: z.number().min(0),
      model_answer: z.string(),
      marking_notes: z.string().optional(),
    })
  ),
});

const rubricResponseSchema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question_number: { type: Type.INTEGER },
          topic_tag: { type: Type.STRING },
          max_mark: { type: Type.NUMBER },
          model_answer: { type: Type.STRING },
          marking_notes: { type: Type.STRING },
        },
        required: ["question_number", "topic_tag", "max_mark", "model_answer"],
      },
    },
  },
  required: ["questions"],
};

/**
 * يحوّل ملف نموذج الإجابة (صورة/PDF) إلى rubric مهيكل يُخزَّن في assessments.ai_rubric.
 */
export async function extractRubric(
  markScheme: InlineFile,
  totalMarks: number
): Promise<AiRubric> {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: getModel(),
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "استخرج من نموذج الإجابة المرفق قائمة الأسئلة بالترتيب.",
              `المجموع الكلي للدرجات: ${totalMarks}.`,
              "لكل سؤال: رقمه، اسم الدرس/المهارة بالعربية، الدرجة الكاملة، الإجابة النموذجية بخطوات الحل، وملاحظات توزيع الدرجات الجزئية إن وُجدت.",
              "أعد الرد بصيغة JSON فقط وفق المخطط المحدد.",
            ].join("\n"),
          },
          filePart(markScheme),
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: rubricResponseSchema,
      temperature: 0.1,
    },
  });

  return parseJson(response.text, rubricSchema);
}
