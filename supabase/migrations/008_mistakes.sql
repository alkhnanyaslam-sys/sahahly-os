-- سجل أخطاء الطالب + نوع الكويز

create table if not exists public.student_mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  topic text,
  question text not null,
  options jsonb not null,
  correct_index integer not null check (correct_index between 0 and 3),
  explanation text not null default '',
  times_wrong integer not null default 1,
  last_wrong_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- لا يتكرر نفس السؤال لنفس الطالب
  question_hash text not null,
  unique (user_id, question_hash)
);

create index if not exists student_mistakes_user_idx
  on public.student_mistakes (user_id, subject, last_wrong_at desc);

alter table public.quiz_sessions
  add column if not exists source text not null default 'ai'
  check (source in ('ai', 'mistakes'));

-- RLS: لا سياسات (الوصول من السيرفر فقط، لأن فيها الإجابات الصحيحة)
alter table public.student_mistakes enable row level security;
