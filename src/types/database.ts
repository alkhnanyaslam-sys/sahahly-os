export type SubscriptionStatus = "trial" | "active" | "expired";
export type AssistantRole = "admin" | "grader" | "receptionist";
export type AssessmentType = "homework" | "quiz" | "mock_exam";
export type SubmissionStatus =
  | "pending_ai"
  | "needs_review"
  | "approved"
  | "sent_to_parent";
export type AttendanceStatus = "present" | "absent" | "late" | "makeup_session";
export type PaymentStatus = "paid" | "partial" | "unpaid";
export type WhatsAppMessageType =
  | "grade_report"
  | "attendance_alert"
  | "payment_reminder";
export type WhatsAppStatus = "queued" | "sent" | "failed";

/** [ymin, xmin, ymax, xmax] بقيم من 0 إلى 1000 (صيغة Gemini) */
export type BoundingBox = [number, number, number, number];

export interface AiRubricQuestion {
  question_number: number;
  topic_tag: string;
  max_mark: number;
  model_answer: string;
  marking_notes?: string;
}

export interface AiRubric {
  questions: AiRubricQuestion[];
}

export interface Teacher {
  id: string;
  name: string;
  subject: string;
  phone: string;
  subscription_status: SubscriptionStatus;
  created_at: string;
}

export interface Assistant {
  id: string;
  teacher_id: string;
  name: string;
  email: string;
  role: AssistantRole;
  created_at: string;
}

export interface Group {
  id: string;
  teacher_id: string;
  name: string;
  grade_level: string;
  schedule_info: string | null;
  created_at: string;
}

export interface Student {
  id: string;
  teacher_id: string;
  group_id: string | null;
  student_code: string;
  name: string;
  student_phone: string | null;
  parent_phone: string;
  is_active: boolean;
  created_at: string;
}

export interface Assessment {
  id: string;
  teacher_id: string;
  group_id: string | null;
  title: string;
  type: AssessmentType;
  total_marks: number;
  mark_scheme_url: string | null;
  ai_rubric: AiRubric | null;
  deadline: string | null;
  created_at: string;
}

export interface Submission {
  id: string;
  assessment_id: string;
  student_id: string;
  raw_files_urls: string[];
  graded_pdf_url: string | null;
  status: SubmissionStatus;
  ai_score: number | null;
  final_score: number | null;
  ai_feedback_summary: string | null;
  reviewed_by: string | null;
  submitted_at: string;
  approved_at: string | null;
}

export interface QuestionGrade {
  id: string;
  submission_id: string;
  question_number: number;
  topic_tag: string | null;
  max_mark: number;
  awarded_mark: number;
  is_correct: boolean;
  ai_comment: string | null;
  bounding_box: BoundingBox | null;
  page_index?: number | null;
}

export interface Attendance {
  id: string;
  teacher_id: string;
  student_id: string;
  group_id: string | null;
  session_date: string;
  status: AttendanceStatus;
  scanned_at: string;
}

export interface Payment {
  id: string;
  teacher_id: string;
  student_id: string;
  month: string;
  amount: number;
  status: PaymentStatus;
  paid_at: string | null;
}

export interface WhatsAppLog {
  id: string;
  teacher_id: string;
  student_id: string | null;
  recipient_phone: string;
  message_type: WhatsAppMessageType;
  payload: Record<string, unknown>;
  status: WhatsAppStatus;
  sent_at: string | null;
}

type TableDef<Row, Required extends keyof Row = never> = {
  Row: Row & Record<string, unknown>;
  Insert: (Pick<Row, Required> & Partial<Omit<Row, Required>>) & Record<string, unknown>;
  Update: Partial<Row> & Record<string, unknown>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      teachers: TableDef<Teacher, "name" | "subject" | "phone">;
      assistants: TableDef<Assistant, "teacher_id" | "name" | "email" | "role">;
      groups: TableDef<Group, "teacher_id" | "name" | "grade_level">;
      students: TableDef<
        Student,
        "teacher_id" | "student_code" | "name" | "parent_phone"
      >;
      assessments: TableDef<
        Assessment,
        "teacher_id" | "title" | "type" | "total_marks"
      >;
      submissions: TableDef<Submission, "assessment_id" | "student_id">;
      question_grades: TableDef<
        QuestionGrade,
        | "submission_id"
        | "question_number"
        | "max_mark"
        | "awarded_mark"
        | "is_correct"
      >;
      attendance: TableDef<
        Attendance,
        "teacher_id" | "student_id" | "session_date" | "status"
      >;
      payments: TableDef<
        Payment,
        "teacher_id" | "student_id" | "month" | "amount" | "status"
      >;
      whatsapp_logs: TableDef<
        WhatsAppLog,
        "teacher_id" | "recipient_phone" | "message_type" | "payload"
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
  }
