import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { authErrorResponse, requireApiAuth } from "@/lib/auth";
import { extractRubric, fetchAsInlineFile } from "@/lib/gemini";
import { assessmentSchema, firstZodError, uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 120;

const SCHEME_BUCKET = "mark-schemes";
const SIGNED_URL_TTL_SECONDS = 60 * 5;

/**
 * إدارة الواجبات والامتحانات (كل العمليات مقيّدة بـ teacher_id الخاص بالمستخدم الحالي):
 * - POST: إنشاء واجب/اختبار/امتحان. إن أُرسل mark_scheme_url يُستخرج الـ rubric في الخلفية.
 * - PATCH: تعديل واجب (يتطلب id في الطلب). تغيير نموذج الإجابة يعيد استخراج الـ rubric.
 * - DELETE: حذف واجب وتسليماته ودرجاتها مع تنظيف الملفات المخزنة.
 * كل العمليات تتطلب صلاحية assessments.manage.
 *
 * مسار نموذج الإجابة يجب أن يكون داخل مجلد المدرس: {teacher_id}/... في حاوية mark-schemes.
 */

async function authorize() {
  try {
    return { auth: await requireApiAuth("assessments.manage"), response: null };
  } catch (error) {
    const response =
      authErrorResponse(error) ??
      Response.json({ error: "تعذر التحقق من الهوية." }, { status: 500 });
    return { auth: null, response };
  }
}

function normalizeSchemePath(path: string | null | undefined, teacherId: string) {
  if (!path) return { path: null, valid: true };
  const normalized = path.replace(/^\/+/, "");
  const valid = normalized.startsWith(`${teacherId}/`) && !normalized.includes("..");
  return { path: valid ? normalized : null, valid };
}

async function buildRubric(assessmentId: string, schemePath: string, totalMarks: number) {
  const admin = createAdminClient();
  try {
    const { data: signed, error } = await admin.storage
      .from(SCHEME_BUCKET)
      .createSignedUrl(schemePath, SIGNED_URL_TTL_SECONDS);
    if (error || !signed?.signedUrl) {
      throw new Error("تعذر الوصول إلى نموذج الإجابة.");
    }

    const file = await fetchAsInlineFile(signed.signedUrl);
    const rubric = await extractRubric(file, totalMarks);

    await admin
      .from("assessments")
      .update({ ai_rubric: rubric })
      .eq("id", assessmentId);
  } catch (error) {
    console.error(
      `[assessments] فشل استخراج الـ rubric للواجب ${assessmentId}: ${
        error instanceof Error ? error.message : "غير معروف"
      }`
    );
  }
}

const ASSESSMENT_COLUMNS =
  "id, group_id, title, type, total_marks, mark_scheme_url, deadline, created_at";

function storagePath(value: unknown, bucket: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  let path = value.trim();
  const marker = "/storage/v1/object/";
  const markerIndex = path.indexOf(marker);
  if (markerIndex >= 0) {
    const segments = path.slice(markerIndex + marker.length).split("?")[0].split("/").filter(Boolean);
    if (["public", "sign", "authenticated"].includes(segments[0] ?? "")) segments.shift();
    if (segments.shift() !== bucket) return null;
    try {
      path = decodeURIComponent(segments.join("/"));
    } catch {
      return null;
    }
  } else if (/^https?:\/\//i.test(path)) {
    return null;
  }

  path = path.replace(/^\/+/, "");
  if (!path || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    return null;
  }
  return path;
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

  const parsed = assessmentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const input = parsed.data;
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

  const scheme = normalizeSchemePath(input.mark_scheme_url, auth.teacherId);
  if (!scheme.valid) {
    return Response.json({ error: "مسار نموذج الإجابة غير صالح." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("assessments")
    .insert({
      teacher_id: auth.teacherId,
      group_id: input.group_id ?? null,
      title: input.title,
      type: input.type,
      total_marks: input.total_marks,
      mark_scheme_url: scheme.path,
      deadline: input.deadline ?? null,
    })
    .select(ASSESSMENT_COLUMNS)
    .single();

  if (error || !data) {
    return Response.json({ error: "تعذر إنشاء الواجب." }, { status: 500 });
  }

  if (scheme.path) {
    const schemePath = scheme.path;
    after(async () => {
      await buildRubric(data.id, schemePath, input.total_marks);
    });
  }

  return Response.json({ ok: true, assessment: data }, { status: 201 });
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
    return Response.json({ error: "معرّف الواجب غير صالح." }, { status: 400 });
  }

  const parsed = assessmentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 400 });
  }

  const input = parsed.data;
  const admin = createAdminClient();

  const { data: current } = await admin
    .from("assessments")
    .select("id, mark_scheme_url, total_marks")
    .eq("id", idCheck.data)
    .eq("teacher_id", auth.teacherId)
    .maybeSingle();

  if (!current) {
    return Response.json({ error: "لم يتم العثور على الواجب." }, { status: 404 });
  }

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

  const scheme = normalizeSchemePath(input.mark_scheme_url, auth.teacherId);
  if (!scheme.valid) {
    return Response.json({ error: "مسار نموذج الإجابة غير صالح." }, { status: 400 });
  }

  const schemeChanged = scheme.path !== current.mark_scheme_url;
  const marksChanged = Number(current.total_marks) !== input.total_marks;

  const update: Record<string, unknown> = {
    group_id: input.group_id ?? null,
    title: input.title,
    type: input.type,
    total_marks: input.total_marks,
    mark_scheme_url: scheme.path,
    deadline: input.deadline ?? null,
  };
  if (schemeChanged && !scheme.path) {
    update.ai_rubric = null;
  }

  const { data, error } = await admin
    .from("assessments")
    .update(update)
    .eq("id", idCheck.data)
    .eq("teacher_id", auth.teacherId)
    .select(ASSESSMENT_COLUMNS)
    .maybeSingle();

  if (error) {
    return Response.json({ error: "تعذر تعديل الواجب." }, { status: 500 });
  }

  if (!data) {
    return Response.json({ error: "لم يتم العثور على الواجب." }, { status: 404 });
  }

  if (scheme.path && (schemeChanged || marksChanged)) {
    const schemePath = scheme.path;
    after(async () => {
      await buildRubric(data.id, schemePath, input.total_marks);
    });
  }

  return Response.json({ ok: true, assessment: data }, { status: 200 });
}

export async function DELETE(request: Request) {
  const { auth, response } = await authorize();
  if (!auth) return response;

  const url = new URL(request.url);
  const idCheck = uuidSchema.safeParse(url.searchParams.get("id"));
  if (!idCheck.success) {
    return Response.json({ error: "معرّف الواجب غير صالح." }, { status: 400 });
  }

  const expectedSubmissionsValue = url.searchParams.get("submissions");
  const expectedSubmissions = Number(expectedSubmissionsValue);
  if (
    expectedSubmissionsValue === null ||
    !Number.isSafeInteger(expectedSubmissions) ||
    expectedSubmissions < 0
  ) {
    return Response.json({ error: "تعذر التحقق من عدد التسليمات. حدّث الصفحة." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: assessment } = await admin
    .from("assessments")
    .select("id, mark_scheme_url")
    .eq("id", idCheck.data)
    .eq("teacher_id", auth.teacherId)
    .maybeSingle();

  if (!assessment) {
    return Response.json({ error: "لم يتم العثور على الواجب." }, { status: 404 });
  }

  const { data: submissions, error: submissionsError } = await admin
    .from("submissions")
    .select("raw_files_urls, graded_pdf_url")
    .eq("assessment_id", assessment.id);

  if (submissionsError) {
    return Response.json({ error: "تعذر جلب التسليمات المرتبطة بالواجب." }, { status: 500 });
  }

  if ((submissions ?? []).length !== expectedSubmissions) {
    return Response.json(
      { error: "تغير عدد التسليمات منذ فتح الصفحة. حدّث القائمة وراجع تحذير الحذف." },
      { status: 409 }
    );
  }

  const rawFiles = (submissions ?? []).flatMap((submission) =>
    Array.isArray(submission.raw_files_urls) ? submission.raw_files_urls : []
  );
  const storageFiles = [
    {
      bucket: "mark-schemes",
      paths: [storagePath(assessment.mark_scheme_url, "mark-schemes")].filter(
        (path): path is string => Boolean(path)
      ),
    },
    {
      bucket: "raw-submissions",
      paths: Array.from(
        new Set(
          rawFiles
            .map((path) => storagePath(path, "raw-submissions"))
            .filter((path): path is string => Boolean(path))
        )
      ),
    },
    {
      bucket: "graded-pdfs",
      paths: Array.from(
        new Set(
          (submissions ?? [])
            .map((submission) => storagePath(submission.graded_pdf_url, "graded-pdfs"))
            .filter((path): path is string => Boolean(path))
        )
      ),
    },
  ];

  const { error } = await admin
    .from("assessments")
    .delete()
    .eq("id", assessment.id)
    .eq("teacher_id", auth.teacherId);

  if (error) {
    return Response.json({ error: "تعذر حذف الواجب والتسليمات المرتبطة به." }, { status: 500 });
  }

  const cleanupResults = await Promise.all(
    storageFiles.map(({ bucket, paths }) =>
      paths.length > 0 ? admin.storage.from(bucket).remove(paths) : Promise.resolve({ error: null })
    )
  );
  const fileCleanupWarning = cleanupResults.some((result) => Boolean(result.error));

  return Response.json(
    {
      ok: true,
      deleted_submissions: submissions?.length ?? 0,
      file_cleanup_warning: fileCleanupWarning,
    },
    { status: 200 }
  );
      }
