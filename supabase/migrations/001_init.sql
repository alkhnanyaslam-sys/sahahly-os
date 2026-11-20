-- ============================================================
-- Sahahly OS - المخطط الكامل لقاعدة البيانات (الإصدار 001)
-- شغّله مرة واحدة من Supabase Dashboard > SQL Editor
-- أو عبر: supabase db push
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- 1) الجداول
-- ============================================================

create table public.teachers (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  subject text not null,
  phone text not null unique,
  subscription_status text not null default 'trial'
    check (subscription_status in ('trial', 'active', 'expired')),
  created_at timestamptz not null default now()
);

create table public.assistants (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null check (role in ('admin', 'grader', 'receptionist')),
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  name text not null,
  grade_level text not null,
  schedule_info text,
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  group_id uuid references public.groups (id) on delete set null,
  student_code text not null unique,
  name text not null,
  student_phone text,
  parent_phone text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  group_id uuid references public.groups (id) on delete set null,
  title text not null,
  type text not null check (type in ('homework', 'quiz', 'mock_exam')),
  total_marks numeric(7, 2) not null check (total_marks > 0),
  mark_scheme_url text,
  ai_rubric jsonb,
  deadline timestamptz,
  created_at timestamptz not null default now()
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  raw_files_urls jsonb not null default '[]'::jsonb,
  graded_pdf_url text,
  status text not null default 'pending_ai'
    check (status in ('pending_ai', 'needs_review', 'approved', 'sent_to_parent')),
  ai_score numeric(7, 2),
  final_score numeric(7, 2),
  ai_feedback_summary text,
  reviewed_by uuid,
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (assessment_id, student_id)
);

create table public.question_grades (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  question_number integer not null,
  topic_tag text,
  max_mark numeric(7, 2) not null check (max_mark >= 0),
  awarded_mark numeric(7, 2) not null check (awarded_mark >= 0),
  is_correct boolean not null,
  ai_comment text,
  bounding_box jsonb,
  -- رقم الصفحة (يبدأ من 0) التي يظهر فيها حل السؤال؛ مضاف على المواصفات الأصلية
  page_index integer not null default 0 check (page_index >= 0),
  unique (submission_id, question_number)
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  group_id uuid references public.groups (id) on delete set null,
  session_date date not null,
  status text not null check (status in ('present', 'absent', 'late', 'makeup_session')),
  scanned_at timestamptz not null default now()
);

-- منع تسجيل نفس الطالب مرتين في نفس اليوم والمجموعة (حتى مع group_id فارغ)
create unique index attendance_unique_session
  on public.attendance (
    student_id,
    session_date,
    coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  status text not null check (status in ('paid', 'partial', 'unpaid')),
  paid_at timestamptz,
  unique (student_id, month)
);

create table public.whatsapp_logs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  student_id uuid references public.students (id) on delete set null,
  recipient_phone text not null,
  message_type text not null
    check (message_type in ('grade_report', 'attendance_alert', 'payment_reminder')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  sent_at timestamptz
);

-- ============================================================
-- 2) الفهارس
-- ============================================================

create index assistants_teacher_idx on public.assistants (teacher_id);
create index groups_teacher_idx on public.groups (teacher_id);
create index students_teacher_idx on public.students (teacher_id);
create index students_group_idx on public.students (group_id);
create index assessments_teacher_idx on public.assessments (teacher_id, created_at desc);
create index submissions_assessment_idx on public.submissions (assessment_id, status);
create index submissions_student_idx on public.submissions (student_id);
create index question_grades_submission_idx on public.question_grades (submission_id);
create index attendance_teacher_date_idx on public.attendance (teacher_id, session_date);
create index payments_teacher_month_idx on public.payments (teacher_id, month);
create index whatsapp_logs_teacher_idx on public.whatsapp_logs (teacher_id, sent_at desc);

-- ============================================================
-- 3) دالة تحديد المدرس الحالي (للمدرس نفسه أو مساعده)
-- ============================================================

create or replace function public.current_teacher_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select t.id from public.teachers t where t.id = auth.uid()),
    (
      select a.teacher_id
      from public.assistants a
      where a.id = auth.uid()
         or lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      limit 1
    )
  );
$$;

revoke all on function public.current_teacher_id() from public;
grant execute on function public.current_teacher_id() to authenticated;

-- ============================================================
-- 4) Row Level Security (عزل بيانات كل مدرس وفريقه)
--    ملاحظة: الأدوار التفصيلية (grader / receptionist ...) تُفرض في الـ API،
--    أما RLS فتضمن ألا يصل أي مستخدم لبيانات مدرس آخر.
-- ============================================================

alter table public.teachers enable row level security;
alter table public.assistants enable row level security;
alter table public.groups enable row level security;
alter table public.students enable row level security;
alter table public.assessments enable row level security;
alter table public.submissions enable row level security;
alter table public.question_grades enable row level security;
alter table public.attendance enable row level security;
alter table public.payments enable row level security;
alter table public.whatsapp_logs enable row level security;

-- المدرس: يقرأ سجله (أو سجل مدرس المساعد) ويعدّل سجله فقط
create policy teachers_select on public.teachers
  for select to authenticated
  using (id = (select public.current_teacher_id()));

create policy teachers_update_own on public.teachers
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- المساعدون: الجميع في الفريق يقرأ، وصاحب الحساب فقط يدير
create policy assistants_select on public.assistants
  for select to authenticated
  using (teacher_id = (select public.current_teacher_id()));

create policy assistants_owner_write on public.assistants
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

-- الجداول المرتبطة مباشرة بـ teacher_id
create policy groups_tenant on public.groups
  for all to authenticated
  using (teacher_id = (select public.current_teacher_id()))
  with check (teacher_id = (select public.current_teacher_id()));

create policy students_tenant on public.students
  for all to authenticated
  using (teacher_id = (select public.current_teacher_id()))
  with check (teacher_id = (select public.current_teacher_id()));

create policy assessments_tenant on public.assessments
  for all to authenticated
  using (teacher_id = (select public.current_teacher_id()))
  with check (teacher_id = (select public.current_teacher_id()));

create policy attendance_tenant on public.attendance
  for all to authenticated
  using (teacher_id = (select public.current_teacher_id()))
  with check (teacher_id = (select public.current_teacher_id()));

create policy payments_tenant on public.payments
  for all to authenticated
  using (teacher_id = (select public.current_teacher_id()))
  with check (teacher_id = (select public.current_teacher_id()));

create policy whatsapp_logs_tenant on public.whatsapp_logs
  for all to authenticated
  using (teacher_id = (select public.current_teacher_id()))
  with check (teacher_id = (select public.current_teacher_id()));

-- التسليمات: عبر الواجب المرتبط بها
create policy submissions_tenant on public.submissions
  for all to authenticated
  using (
    exists (
      select 1 from public.assessments a
      where a.id = submissions.assessment_id
        and a.teacher_id = (select public.current_teacher_id())
    )
  )
  with check (
    exists (
      select 1 from public.assessments a
      where a.id = submissions.assessment_id
        and a.teacher_id = (select public.current_teacher_id())
    )
  );

-- درجات الأسئلة: عبر التسليم ثم الواجب
create policy question_grades_tenant on public.question_grades
  for all to authenticated
  using (
    exists (
      select 1
      from public.submissions s
      join public.assessments a on a.id = s.assessment_id
      where s.id = question_grades.submission_id
        and a.teacher_id = (select public.current_teacher_id())
    )
  )
  with check (
    exists (
      select 1
      from public.submissions s
      join public.assessments a on a.id = s.assessment_id
      where s.id = question_grades.submission_id
        and a.teacher_id = (select public.current_teacher_id())
    )
  );

-- ============================================================
-- 5) حاويات التخزين (كلها خاصة)
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('mark-schemes', 'mark-schemes', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('raw-submissions', 'raw-submissions', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('graded-pdfs', 'graded-pdfs', false, 20971520,
    array['application/pdf'])
on conflict (id) do nothing;

-- mark-schemes: المسار {teacher_id}/... ؛ الفريق يقرأ ويرفع داخل مجلد مدرسه فقط
create policy mark_schemes_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'mark-schemes'
    and (storage.foldername(name))[1] = (select public.current_teacher_id())::text
  );

create policy mark_schemes_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'mark-schemes'
    and (storage.foldername(name))[1] = (select public.current_teacher_id())::text
  );

create policy mark_schemes_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'mark-schemes'
    and (storage.foldername(name))[1] = (select public.current_teacher_id())::text
  );

create policy mark_schemes_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'mark-schemes'
    and (storage.foldername(name))[1] = (select public.current_teacher_id())::text
  );

-- graded-pdfs: المسار {teacher_id}/{submission_id}.pdf ؛ قراءة فقط (الكتابة من السيرفر)
create policy graded_pdfs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'graded-pdfs'
    and (storage.foldername(name))[1] = (select public.current_teacher_id())::text
  );

-- raw-submissions: المسار {student_id}/{assessment_id}/... ؛ المدرس وفريقه يقرؤون ملفات طلابهم
-- (رفع الطلاب يتم بروابط موقّعة من السيرفر، فلا حاجة لسياسة كتابة)
create policy raw_submissions_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'raw-submissions'
    and exists (
      select 1 from public.students st
      where st.id::text = (storage.foldername(name))[1]
        and st.teacher_id = (select public.current_teacher_id())
    )
  );
