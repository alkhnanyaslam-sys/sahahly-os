import { createAdminClient } from "@/lib/supabase/server";
import { authErrorResponse, requireApiAuth } from "@/lib/auth";
import { firstZodError, studentSchema, uuidSchema } from "@/lib/validation";
import { normalizeEgyptPhone } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_CODE_ATTEMPTS = 8;

/**
 * إدارة طلاب المدرس (كل العمليات مقيّدة بـ teacher_id الخاص بالمستخدم الحالي):
 * - POST: إضافة طالب. إن لم يُرسل student_code يُولَّد كود فريد تلقائيًا.
 * - PATCH: تعديل بيانات طالب (يتطلب id في الطلب).
 * - DELETE: إيقاف تفعيل طالب (?id=...) بدل حذفه، للحفاظ على سجلات الحضور والدرجات.
 * كل العمليات تتطلب صلاحية students.manage.
 */

async function authorize() {
  try {
    return { auth: await requireApiAuth("students.manage"), response: null };
  } catch (error) {
    const response =
      authErrorResponse(error) ??
      Response.json({ error: "تعذر التحقق من الهوية." }, { status: 500 });
    return { auth: null, response };
  }
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

const STUDENT_COLUMNS =
  "id, name, student_code, group_id, student_phone, parent_phone, is_active";

export async function POST(request: Request) {
  const { auth, response } = await authorize();
  if (!auth) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صالحة." }, { status: 400 });
  }

  const parsed = studentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const input = parsed.data;
  const parentPhone = normalizeEgyptPhone(input.parent_phone);
  if (!parentPhone) {
    return Response.json({ error: "رقم ولي الأمر غير صالح." }, { status: 400 });
  }

  const studentPhone = input.student_phone
    ? normalizeEgyptPhone(input.student_phone)
    : null;
  if (input.student_phone && !studentPhone) {
    return Response.json({ error: "رقم الطالب غير صالح." }, { status: 400 });
  }

  const admin = createAdminClient();

  if (input.group_id) {
    const { data: group } = await admin
      .from("groups")
      .select("id")
      .eq("id", input.group_id)
      .eq("teacher_id", auth.teacherId)
      .maybeSingle();

    if (!group) {
      return Response.json({ error: "المجموعة غير موجودة." }, { status: 404 });
    }
  }

  const providedCode = input.student_code?.trim() || null;

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = providedCode ?? randomCode();

    const { data, error } = await admin
      .from("students")
      .insert({
        teacher_id: auth.teacherId,
        group_id: input.group_id ?? null,
        student_code: code,
        name: input.name,
        student_phone: studentPhone,
        parent_phone: parentPhone,
        is_active: input.is_active,
      })
      .select(STUDENT_COLUMNS)
      .single();

    if (!error && data) {
      return Response.json({ ok: true, student: data }, { status: 201 });
    }

    const isDuplicate = error?.code === "23505";
    if (isDuplicate && providedCode) {
      return Response.json(
        { error: "كود الطالب مستخدم بالفعل." },
        { status: 409 }
      );
    }
    if (!isDuplicate) {
      return Response.json({ error: "تعذر إضافة الطالب." }, { status: 500 });
    }
  }

  return Response.json(
    { error: "تعذر توليد كود فريد للطالب. حاول مرة أخرى." },
    { status: 500 }
  );
}

export async function PATCH(request: Request) {
  const { auth, response } = await authorize();
  if (!auth) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صالحة." }, { status: 400 });
  }

  const idCheck = uuidSchema.safeParse(
    typeof body === "object" && body !== null ? (body as { id?: unknown }).id : undefined
  );
  if (!idCheck.success) {
    return Response.json({ error: "معرّف الطالب غير صالح." }, { status: 400 });
  }

  const parsed = studentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const input = parsed.data;
  const parentPhone = normalizeEgyptPhone(input.parent_phone);
  if (!parentPhone) {
    return Response.json({ error: "رقم ولي الأمر غير صالح." }, { status: 400 });
  }

  const studentPhone = input.student_phone
    ? normalizeEgyptPhone(input.student_phone)
    : null;
  if (input.student_phone && !studentPhone) {
    return Response.json({ error: "رقم الطالب غير صالح." }, { status: 400 });
  }

  const admin = createAdminClient();

  if (input.group_id) {
    const { data: group } = await admin
      .from("groups")
      .select("id")
      .eq("id", input.group_id)
      .eq("teacher_id", auth.teacherId)
      .maybeSingle();

    if (!group) {
      return Response.json({ error: "المجموعة غير موجودة." }, { status: 404 });
    }
  }

  const update: Record<string, unknown> = {
    name: input.name,
    group_id: input.group_id ?? null,
    student_phone: studentPhone,
    parent_phone: parentPhone,
    is_active: input.is_active,
  };
  if (input.student_code?.trim()) {
    update.student_code = input.student_code.trim();
  }

  const { data, error } = await admin
    .from("students")
    .update(update)
    .eq("id", idCheck.data)
    .eq("teacher_id", auth.teacherId)
    .select(STUDENT_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: "كود الطالب مستخدم بالفعل." },
        { status: 409 }
      );
    }
    return Response.json({ error: "تعذر تعديل بيانات الطالب." }, { status: 500 });
  }

  if (!data) {
    return Response.json({ error: "لم يتم العثور على الطالب." }, { status: 404 });
  }

  return Response.json({ ok: true, student: data }, { status: 200 });
}

export async function DELETE(request: Request) {
  const { auth, response } = await authorize();
  if (!auth) return response;

  const idCheck = uuidSchema.safeParse(new URL(request.url).searchParams.get("id"));
  if (!idCheck.success) {
    return Response.json({ error: "معرّف الطالب غير صالح." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("students")
    .update({ is_active: false })
    .eq("id", idCheck.data)
    .eq("teacher_id", auth.teacherId)
    .select("id")
    .maybeSingle();

  if (error) {
    return Response.json({ error: "تعذر إيقاف الطالب." }, { status: 500 });
  }

  if (!data) {
    return Response.json({ error: "لم يتم العثور على الطالب." }, { status: 404 });
  }

  return Response.json({ ok: true }, { status: 200 });
}
