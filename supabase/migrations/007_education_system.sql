-- النظام التعليمي: الدول، المراحل، الصفوف، الشعب، وربطها بالمواد وملف الطالب

create table if not exists public.education_systems (
  id uuid primary key default gen_random_uuid(),
  country text not null,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  unique (country, name)
);

create table if not exists public.education_stages (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.education_systems (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  unique (system_id, name)
);

create table if not exists public.education_grades (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.education_stages (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  has_tracks boolean not null default false,
  unique (stage_id, name)
);

create table if not exists public.education_tracks (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid not null references public.education_grades (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  unique (grade_id, name)
);

-- ربط المادة بالصف (وبالشعبة اختياريًا) لفلترة المواد تلقائيًا
create table if not exists public.subject_grades (
  subject_id uuid not null references public.subjects (id) on delete cascade,
  grade_id uuid not null references public.education_grades (id) on delete cascade,
  track_id uuid references public.education_tracks (id) on delete cascade
);
create unique index if not exists subject_grades_unique
  on public.subject_grades (
    subject_id, grade_id,
    coalesce(track_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

alter table public.student_profiles
  add column if not exists system_id uuid references public.education_systems (id) on delete set null,
  add column if not exists stage_id uuid references public.education_stages (id) on delete set null,
  add column if not exists grade_id uuid references public.education_grades (id) on delete set null,
  add column if not exists track_id uuid references public.education_tracks (id) on delete set null;

alter table public.education_systems enable row level security;
alter table public.education_stages enable row level security;
alter table public.education_grades enable row level security;
alter table public.education_tracks enable row level security;
alter table public.subject_grades enable row level security;

drop policy if exists edu_systems_read on public.education_systems;
create policy edu_systems_read on public.education_systems
  for select to anon, authenticated using (is_active = true);
drop policy if exists edu_stages_read on public.education_stages;
create policy edu_stages_read on public.education_stages
  for select to anon, authenticated using (true);
drop policy if exists edu_grades_read on public.education_grades;
create policy edu_grades_read on public.education_grades
  for select to anon, authenticated using (true);
drop policy if exists edu_tracks_read on public.education_tracks;
create policy edu_tracks_read on public.education_tracks
  for select to anon, authenticated using (true);
drop policy if exists subject_grades_read on public.subject_grades;
create policy subject_grades_read on public.subject_grades
  for select to anon, authenticated using (true);

-- بيانات مصر الأساسية
insert into public.education_systems (country, name, sort_order)
values ('مصر', 'التعليم العام', 1)
on conflict (country, name) do nothing;

insert into public.education_stages (system_id, name, sort_order)
select s.id, v.name, v.ord
from public.education_systems s,
  (values ('الابتدائية', 1), ('الإعدادية', 2), ('الثانوية', 3)) as v(name, ord)
where s.country = 'مصر' and s.name = 'التعليم العام'
on conflict (system_id, name) do nothing;

insert into public.education_grades (stage_id, name, sort_order, has_tracks)
select st.id, g.name, g.ord, g.tracks
from public.education_stages st
join (values
  ('الابتدائية', 'الصف الأول', 1, false), ('الابتدائية', 'الصف الثاني', 2, false),
  ('الابتدائية', 'الصف الثالث', 3, false), ('الابتدائية', 'الصف الرابع', 4, false),
  ('الابتدائية', 'الصف الخامس', 5, false), ('الابتدائية', 'الصف السادس', 6, false),
  ('الإعدادية', 'الصف الأول الإعدادي', 1, false),
  ('الإعدادية', 'الصف الثاني الإعدادي', 2, false),
  ('الإعدادية', 'الصف الثالث الإعدادي', 3, false),
  ('الثانوية', 'الصف الأول الثانوي', 1, false),
  ('الثانوية', 'الصف الثاني الثانوي', 2, true),
  ('الثانوية', 'الصف الثالث الثانوي', 3, true)
) as g(stage_name, name, ord, tracks) on g.stage_name = st.name
on conflict (stage_id, name) do nothing;

insert into public.education_tracks (grade_id, name, sort_order)
select gr.id, t.name, t.ord
from public.education_grades gr
join (values ('علمي', 1), ('أدبي', 2)) as t(name, ord) on true
where gr.has_tracks
on conflict (grade_id, name) do nothing;
