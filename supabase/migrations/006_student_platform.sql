-- منصة الطلاب: الملفات الشخصية، المواد، جلسات الكويز، مفاتيح الإجابات

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  language text not null default 'ar'
    check (language in ('ar', 'en', 'fr', 'de')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (name, language)
);

insert into public.subjects (name, language, sort_order) values
  ('الرياضيات', 'ar', 1), ('العلوم', 'ar', 2), ('اللغة العربية', 'ar', 3),
  ('الفيزياء', 'ar', 4), ('الكيمياء', 'ar', 5), ('الأحياء', 'ar', 6),
  ('التاريخ', 'ar', 7), ('الجغرافيا', 'ar', 8),
  ('Mathematics', 'en', 1), ('Science', 'en', 2), ('English', 'en', 3),
  ('Physics', 'en', 4), ('Chemistry', 'en', 5), ('Biology', 'en', 6),
  ('History', 'en', 7), ('Geography', 'en', 8)
on conflict (name, language) do nothing;

create table if not exists public.student_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 100),
  age integer not null check (age between 5 and 80),
  study_language text not null check (study_language in ('ar', 'en', 'fr', 'de')),
  subject_id uuid references public.subjects (id) on delete set null,
  whatsapp text not null check (char_length(whatsapp) between 8 and 20),
  country text not null check (char_length(country) between 2 and 60),
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  topic text,
  language text not null default 'ar',
  difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard')),
  num_questions integer not null check (num_questions between 3 and 30),
  time_limit_minutes integer not null check (time_limit_minutes between 1 and 120),
  status text not null default 'generating'
    check (status in ('generating', 'ready', 'in_progress', 'submitted', 'expired', 'failed')),
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  score integer,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_answer_keys (
  session_id uuid primary key references public.quiz_sessions (id) on delete cascade,
  answer_key jsonb not null
);

create index if not exists quiz_sessions_user_idx
  on public.quiz_sessions (user_id, created_at desc);

alter table public.student_profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.quiz_sessions enable row level security;
alter table public.quiz_answer_keys enable row level security;

drop policy if exists student_profiles_own_select on public.student_profiles;
create policy student_profiles_own_select on public.student_profiles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists student_profiles_own_update on public.student_profiles;
create policy student_profiles_own_update on public.student_profiles
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists subjects_read_active on public.subjects;
create policy subjects_read_active on public.subjects
  for select to authenticated, anon using (is_active = true);

drop policy if exists quiz_sessions_own_select on public.quiz_sessions;
create policy quiz_sessions_own_select on public.quiz_sessions
  for select to authenticated using (user_id = auth.uid());
