import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { authErrorResponse, requireApiAuth } from "@/lib/auth";
import { firstZodError, studentCodeSchema, uuidSchema } from "@/lib/validation";
import { chunk, normalizeEgyptPhone } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ROWS = 1000;
const INSERT_BATCH_SIZE = 100;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const importRowSchema = z.object({
  name: z.string().trim().min(2).max(120),
  parent_phone: z.string().trim().min(8).max(20),
  student_phone: z.string().trim().max(20).nullable().optional(),
  student_code: z.string().trim().max(32).nullable().optional(),
  group_name: z.string().trim().max(100).nullable().optional(),
});

const importSchema = z.object({
  /** مجموعة افتراضية تُطبَّق على الصفوف التي لا تحدد مجموعة بالاسم. */
  default_group_id: uuidSchema.nullable().optional(),
  rows: z
    .array(z.unknown())
    .min(1, "الملف لا يحتوي على أي صفوف.")
    .max(MAX_ROWS, `الحد الأقصى ${MAX_ROWS} طالب في الاستيراد الواحد.`),
});

interface RowError {
  row: number;
  error: string;
}

function randomCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = "ST-";
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

/**
 * استيراد طلاب من ملف Excel/CSV (يُحلَّل في المتصفح ثم تُرسل الصفوف هنا):
 * 1) صلاحية students.manage فقط، وكل البيانات تُربط بمدرس المستخدم الحالي.
 * 2) كل صف يُتحقق منه منفردًا؛ الصفوف غير الصالحة تُرجع في errors دون إيقاف الباقي.
 * 3) المجموعة تُحدد باسمها (group_name) ضمن مجموعات المدرس، وإلا تُستخدم المجموعة الافتراضية.
 * 4) الكود إن لم يُحدد يُولَّد تلقائيًا؛ والأكواد المكررة (داخل الملف أو في القاعدة) تُرفض.
 * 5) الإدخال على دفعات، وفشل دفعة يُعاد محاولته صفًا صفًا لتحديد الصف المعيب.
 */
export async function POST(request: Request) {
  let auth;
  try {
    auth = await requireApiAuth("students.manage");
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    return Response.json({ error: "تعذر التحقق من الهوية." }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صالحة." }, { status: 400 });
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const { default_group_id, rows } = parsed.data;
  const admin = createAdminClient();

  const { data: groups, error: groupsError } = await admin
    .from("groups")
    .select("id, name")
    .eq("teacher_id", auth.teacherId);

  if (groupsError) {
    return Response.json({ error: "تعذر جلب المجموعات." }, { status: 500 });
  }

  const groupByName = new Map(
    (groups ?? []).map((group) => [group.name.trim().toLowerCase(), group.id])
  );
  const validGroupIds = new Set((groups ?? []).map((group) => group.id));

  if (default_group_id && !validGroupIds.has(default_group_id)) {
    return Response.json({ error: "المجموعة الافتراضية غير موجودة." }, { status: 404 });
  }

  const { data: existingCodes, error: codesError } = await admin
    .from("students")
    .select("student_code")
    .eq("teacher_id", auth.teacherId);

  if (codesError) {
    return Response.json({ error: "تعذر التحقق من الأكواد الحالية." }, { status: 500 });
  }

  const usedCodes = new Set((existingCodes ?? []).map((row) => row.student_code));
  const errors: RowError[] = [];

  interface PreparedRow {
    rowNumber: number;
    record: {
      teacher_id: string;
      group_id: string | null;
      student_code: string;
      name: string;
      student_phone: string | null;
      parent_phone: string;
      is_active: boolean;
    };
  }

  const prepared: PreparedRow[] = [];

  rows.forEach((raw, index) => {
    // رقم الصف كما يراه المستخدم في Excel (الصف الأول عناوين).
    const rowNumber = index + 2;

    const rowParsed = importRowSchema.safeParse(raw);
    if (!rowParsed.success) {
      errors.push({ row: rowNumber, error: "الاسم أو رقم ولي الأمر مفقود أو غير صالح." });
      return;
    }

    const row = rowParsed.data;

    const parentPhone = normalizeEgyptPhone(row.parent_phone);
    if (!parentPhone) {
      errors.push({ row: rowNumber, error: "رقم ولي الأمر غير صالح." });
      return;
    }

    let studentPhone: string | null = null;
    if (row.student_phone) {
      studentPhone = normalizeEgyptPhone(row.student_phone);
      if (!studentPhone) {
        errors.push({ row: rowNumber, error: "رقم الطالب غير صالح." });
        return;
      }
    }

    let groupId: string | null = default_group_id ?? null;
    if (row.group_name) {
      const found = groupByName.get(row.group_name.trim().toLowerCase());
      if (!found) {
        errors.push({ row: rowNumber, error: `المجموعة "${row.group_name}" غير موجودة.` });
        return;
      }
      groupId = found;
    }

    let code: string;
    if (row.student_code) {
      const codeCheck = studentCodeSchema.safeParse(row.student_code);
      if (!codeCheck.success) {
        errors.push({ row: rowNumber, error: "كود الطالب غير صالح." });
        return;
      }
      code = codeCheck.data;
      if (usedCodes.has(code)) {
        errors.push({ row: rowNumber, error: `الكود ${code} مستخدم بالفعل.` });
        return;
      }
    } else {
      code = randomCode();
      while (usedCodes.has(code)) code = randomCode();
    }
    usedCodes.add(code);

    prepared.push({
      rowNumber,
      record: {
        teacher_id: auth.teacherId,
        group_id: groupId,
        student_code: code,
        name: row.name,
        student_phone: studentPhone,
        parent_phone: parentPhone,
        is_active: true,
      },
    });
  });

  let imported = 0;

  for (const batch of chunk(prepared, INSERT_BATCH_SIZE)) {
    const { error: batchError } = await admin
      .from("students")
      .insert(batch.map((item) => item.record));

    if (!batchError) {
      imported += batch.length;
      continue;
    }

    for (const item of batch) {
      const { error: rowError } = await admin.from("students").insert(item.record);
      if (rowError) {
        errors.push({
          row: item.rowNumber,
          error:
            rowError.code === "23505"
              ? "الكود مستخدم بالفعل."
              : "تعذر حفظ هذا الصف.",
        });
      } else {
        imported += 1;
      }
    }
  }

  errors.sort((a, b) => a.row - b.row);

  return Response.json(
    {
      ok: true,
      imported,
      failed: errors.length,
      errors: errors.slice(0, 50),
    },
    { status: imported > 0 ? 201 : 200 }
  );
                          }
