import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const revalidate = 300;

const LANGUAGES = ["ar", "en", "fr", "de"] as const;

export async function GET(request: Request) {
  const language = new URL(request.url).searchParams.get("language");
  const admin = createAdminClient();

  let subjectsQuery = admin
    .from("subjects")
    .select("id, name, language")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (language && (LANGUAGES as readonly string[]).includes(language)) {
    subjectsQuery = subjectsQuery.eq("language", language);
  }

  const [subjects, systems, stages, grades, tracks] = await Promise.all([
    subjectsQuery,
    admin
      .from("education_systems")
      .select("id, country, name")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    admin
      .from("education_stages")
      .select("id, system_id, name")
      .order("sort_order", { ascending: true }),
    admin
      .from("education_grades")
      .select("id, stage_id, name, has_tracks")
      .order("sort_order", { ascending: true }),
    admin
      .from("education_tracks")
      .select("id, grade_id, name")
      .order("sort_order", { ascending: true }),
  ]);

  if (
    subjects.error ||
    systems.error ||
    stages.error ||
    grades.error ||
    tracks.error
  ) {
    return Response.json(
      { error: "تعذر تحميل الخيارات. حاول مرة أخرى." },
      { status: 500 }
    );
  }

  return Response.json({
    subjects: subjects.data ?? [],
    systems: systems.data ?? [],
    stages: stages.data ?? [],
    grades: grades.data ?? [],
    tracks: tracks.data ?? [],
  });
}
