import { z } from "zod";

/* ------------------------------------------------------------------ */
/* أنواع أساسية قابلة لإعادة الاستخدام                                  */
/* ------------------------------------------------------------------ */

export const uuidSchema = z.string().uuid("المعرّف غير صالح.");

export const studentCodeSchema = z
  .string()
  .trim()
  .min(3, "كود الطالب قصير جدًا.")
  .max(32, "كود الطالب طويل جدًا.")
  .regex(/^[A-Za-z0-9_-]+$/, "كود الطالب يحتوي على رموز غير مسموحة.");

export const egyptPhoneSchema = z
  .string()
  .trim()
  .regex(
    /^(?:\+?20|0)?1[0125]\d{8}$/,
    "رقم الهاتف غير صالح (مثال: 01012345678)."
  );

export const monthKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "صيغة الشهر يجب أن تكون YYYY-MM.");

export const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ يجب أن تكون YYYY-MM-DD.");

/* ------------------------------------------------------------------ */
/* التسليمات                                                            */
/* ------------------------------------------------------------------ */

export const createSubmissionSchema = z.object({
  student_code: studentCodeSchema,
  assessment_id: uuidSchema,
  /** مسارات الملفات داخل حاوية raw-submissions بعد رفعها. */
  file_paths: z
    .array(z.string().min(1).max(512))
    .min(1, "يجب رفع صورة واحدة على الأقل.")
    .max(20, "الحد الأقصى 20 ملفًا لكل تسليم."),
});

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

/* ------------------------------------------------------------------ */
/* الاعتماد والمراجعة                                                    */
/* ------------------------------------------------------------------ */

export const approveQuestionSchema = z.object({
  question_number: z.number().int().min(0),
  awarded_mark: z.number().min(0),
  ai_comment: z.string().max(1000).nullable().optional(),
});

export const approveSubmissionSchema = z.object({
  questions: z.array(approveQuestionSchema).min(1, "لا توجد أسئلة للاعتماد."),
  feedback_summary: z.string().max(2000).nullable().optional(),
  send_to_parent: z.boolean().default(true),
});

export type ApproveSubmissionInput = z.infer<typeof approveSubmissionSchema>;

/* ------------------------------------------------------------------ */
/* الحضور                                                               */
/* ------------------------------------------------------------------ */

export const attendanceScanSchema = z.object({
  student_code: studentCodeSchema,
  group_id: uuidSchema.nullable().optional(),
  session_date: dateKeySchema.optional(),
  /** تسجيل الحضور كحصة تعويضية يدويًا. */
  is_makeup: z.boolean().optional(),
});

export type AttendanceScanInput = z.infer<typeof attendanceScanSchema>;

/* ------------------------------------------------------------------ */
/* الذكاء الاصطناعي                                                     */
/* ------------------------------------------------------------------ */

export const aiGradeSchema = z.object({
  submission_id: uuidSchema,
});

export const generateExamSchema = z.object({
  source_text: z.string().trim().max(20000).optional(),
  /** مسار ملف الامتحان المرفوع (صورة/PDF) في حاوية mark-schemes. */
  source_file_path: z.string().min(1).max(512).optional(),
  models_count: z.number().int().min(1).max(5).default(3),
});

export type GenerateExamInput = z.infer<typeof generateExamSchema>;

/* ------------------------------------------------------------------ */
/* الواتساب                                                             */
/* ------------------------------------------------------------------ */

export const whatsappSendSchema = z.object({
  student_id: uuidSchema.nullable().optional(),
  recipient_phone: z.string().min(8).max(20),
  message_type: z.enum(["grade_report", "attendance_alert", "payment_reminder"]),
  message: z.string().trim().min(1).max(4000),
  document_url: z.string().url().optional(),
  document_filename: z.string().max(200).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export type WhatsAppSendInput = z.infer<typeof whatsappSendSchema>;

/* ------------------------------------------------------------------ */
/* الطلاب والمجموعات والمدفوعات                                          */
/* ------------------------------------------------------------------ */

export const groupSchema = z.object({
  name: z.string().trim().min(2, "اسم المجموعة قصير جدًا.").max(100),
  grade_level: z.string().trim().min(1, "المرحلة الدراسية مطلوبة.").max(100),
  schedule_info: z.string().trim().max(300).nullable().optional(),
});

export type GroupInput = z.infer<typeof groupSchema>;

export const studentSchema = z.object({
  name: z.string().trim().min(2, "اسم الطالب قصير جدًا.").max(120),
  student_code: studentCodeSchema.optional(),
  group_id: uuidSchema.nullable().optional(),
  student_phone: egyptPhoneSchema.nullable().optional().or(z.literal("")),
  parent_phone: egyptPhoneSchema,
  is_active: z.boolean().default(true),
});

export type StudentInput = z.infer<typeof studentSchema>;

export const paymentSchema = z.object({
  student_id: uuidSchema,
  month: monthKeySchema,
  amount: z.number().min(0, "المبلغ لا يمكن أن يكون سالبًا."),
  status: z.enum(["paid", "partial", "unpaid"]),
});

export type PaymentInput = z.infer<typeof paymentSchema>;

/* ------------------------------------------------------------------ */
/* الامتحانات والواجبات                                                  */
/* ------------------------------------------------------------------ */

export const assessmentSchema = z.object({
  title: z.string().trim().min(2, "العنوان قصير جدًا.").max(150),
  type: z.enum(["homework", "quiz", "mock_exam"]),
  group_id: uuidSchema.nullable().optional(),
  total_marks: z.number().positive("الدرجة الكلية يجب أن تكون أكبر من صفر."),
  mark_scheme_url: z.string().max(512).nullable().optional(),
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
});

export type AssessmentInput = z.infer<typeof assessmentSchema>;

/* ------------------------------------------------------------------ */
/* الدخول والتسجيل                                                      */
/* ------------------------------------------------------------------ */

export const loginSchema = z.object({
  email: z.string().trim().email("البريد الإلكتروني غير صالح."),
  password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل."),
});

export const signupSchema = z.object({
  name: z.string().trim().min(2, "الاسم قصير جدًا.").max(100),
  subject: z.string().trim().min(2, "المادة مطلوبة.").max(100),
  phone: egyptPhoneSchema,
  email: z.string().trim().email("البريد الإلكتروني غير صالح."),
  password: z.string().min(8, "كلمة المرور 8 أحرف على الأقل."),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;

/* ------------------------------------------------------------------ */
/* أدوات مساعدة                                                         */
/* ------------------------------------------------------------------ */

/**
 * يحوّل أول خطأ في نتيجة zod إلى رسالة عربية مناسبة للعرض.
 */
export function firstZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "البيانات المدخلة غير صالحة.";
                                      }
