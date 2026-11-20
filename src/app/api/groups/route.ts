import { createAdminClient } from "@/lib/supabase/server";
import { authErrorResponse, requireApiAuth } from "@/lib/auth";
import { firstZodError, groupSchema, uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * إدارة مجموعات المدرس (كل العمليات مقيّدة بـ teacher_id الخاص بالمستخدم الحالي):
 * - POST: إنشاء مجموعة جديدة.
 * - PATCH: تعديل مجموعة (يتطلب id في الطلب).
 * - DELETE: حذف مجموعة (يتطلب id في الرابط ?id=...). الطلاب التابعون لها لا يُحذفون،
 *   بل يصبحون بلا مجموعة.
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

export async function POST(request: Request) {
  const { auth, response } = await authorize();
  if (!auth) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "صيغة الطلب غير صالحة." }, { status: 400 });
  }

  const parsed = groupSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("groups")
    .insert({
      teacher_id: auth.teacherId,
      name: parsed.data.name,
      grade_level: parsed.data.grade_level,
      schedule_info: parsed.data.schedule_info || null,
    })
    .select("id, name, grade_level, schedule_info")
    .single();

  if (error || !data) {
    return Response.json({ error: "تعذر إنشاء المجموعة." }, { status: 500 });
  }

  return Response.json({ ok: true, group: data }, { status: 201 });
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
    return Response.json({ error: "معرّف المجموعة غير صالح." }, { status: 400 });
  }

  const parsed = groupSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("groups")
    .update({
      name: parsed.data.name,
      grade_level: parsed.data.grade_level,
      schedule_info: parsed.data.schedule_info || null,
    })
    .eq("id", idCheck.data)
    .eq("teacher_id", auth.teacherId)
    .select("id, name, grade_level, schedule_info")
    .maybeSingle();

  if (error) {
    return Response.json({ error: "تعذر تعديل المجموعة." }, { status: 500 });
  }

  if (!data) {
    return Response.json({ error: "لم يتم العثور على المجموعة." }, { status: 404 });
  }

  return Response.json({ ok: true, group: data }, { status: 200 });
}

export async function DELETE(request: Request) {
  const { auth, response } = await authorize();
  if (!auth) return response;

  const idCheck = uuidSchema.safeParse(new URL(request.url).searchParams.get("id"));
  if (!idCheck.success) {
    return Response.json({ error: "معرّف المجموعة غير صالح." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: group } = await admin
    .from("groups")
    .select("id")
    .eq("id", idCheck.data)
    .eq("teacher_id", auth.teacherId)
    .maybeSingle();

  if (!group) {
    return Response.json({ error: "لم يتم العثور على المجموعة." }, { status: 404 });
  }

  const { error: detachError } = await admin
    .from("students")
    .update({ group_id: null })
    .eq("group_id", group.id)
    .eq("teacher_id", auth.teacherId);

  if (detachError) {
    return Response.json({ error: "تعذر فك ارتباط الطلاب بالمجموعة." }, { status: 500 });
  }

  const { error: deleteError } = await admin
    .from("groups")
    .delete()
    .eq("id", group.id)
    .eq("teacher_id", auth.teacherId);

  if (deleteError) {
    return Response.json(
      { error: "تعذر حذف المجموعة. قد تكون مرتبطة بسجلات أخرى." },
      { status: 409 }
    );
  }

  return Response.json({ ok: true }, { status: 200 });
}
