-- Sahahly OS — owner access, broadcasts, support, and platform controls (003)
-- Apply separately after review. This migration is not applied automatically.

begin;

-- Store a SHA-256 fingerprint of the normalized login email, never the raw address or password.
create table if not exists public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  email_fingerprint bytea not null check (octet_length(email_fingerprint) = 32),
  ip_address inet not null,
  user_agent text,
  attempt_type text not null check (attempt_type in ('success', 'failure', 'locked')),
  attempted_at timestamptz not null default now(),
  locked_until timestamptz,
  request_id uuid
);

create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience_scope text not null default 'all' check (audience_scope in ('all', 'plan')),
  plan_id uuid references public.plans (id) on delete restrict,
  delivery_channel text not null default 'dashboard'
    check (delivery_channel in ('dashboard', 'whatsapp', 'both')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references public.platform_admins (user_id) on delete set null,
  updated_by uuid references public.platform_admins (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broadcasts_plan_scope_check check (
    (audience_scope = 'all' and plan_id is null)
    or (audience_scope = 'plan' and plan_id is not null)
  ),
  constraint broadcasts_time_range_check check (ends_at is null or ends_at > starts_at)
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  subject text not null,
  teacher_message text not null,
  admin_reply text,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'waiting_for_teacher', 'resolved', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid references public.platform_admins (user_id) on delete set null,
  last_replied_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_settings
  add column if not exists terms_of_service text,
  add column if not exists maintenance_mode boolean not null default false,
  add column if not exists maintenance_message text not null default 'المنصة تحت الصيانة مؤقتًا. يرجى المحاولة لاحقًا.',
  add column if not exists registration_enabled boolean not null default true,
  add column if not exists default_trial_days integer not null default 14 check (default_trial_days >= 0),
  add column if not exists require_owner_mfa boolean not null default false,
  add column if not exists owner_idle_timeout_seconds integer not null default 43200
    check (owner_idle_timeout_seconds between 300 and 43200);

alter table public.admin_audit_log
  add column if not exists ip_address inet,
  add column if not exists user_agent text,
  add column if not exists outcome text check (outcome in ('success', 'failure', 'blocked')),
  add column if not exists details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object');

create index if not exists login_attempts_pair_recent_idx
  on public.login_attempts (ip_address, email_fingerprint, attempted_at desc)
  where attempt_type = 'failure';
create index if not exists login_attempts_recent_idx
  on public.login_attempts (attempted_at desc);
create index if not exists broadcasts_live_window_idx
  on public.broadcasts (status, starts_at, ends_at);
create index if not exists broadcasts_plan_status_idx
  on public.broadcasts (plan_id, status, starts_at desc)
  where plan_id is not null;
create index if not exists support_tickets_status_created_idx
  on public.support_tickets (status, created_at desc);
create index if not exists support_tickets_teacher_created_idx
  on public.support_tickets (teacher_id, created_at desc);
create index if not exists support_tickets_assignee_status_idx
  on public.support_tickets (assigned_to, status, updated_at desc);
create index if not exists admin_audit_log_outcome_created_idx
  on public.admin_audit_log (outcome, created_at desc);
create index if not exists admin_audit_log_actor_created_idx
  on public.admin_audit_log (actor_id, created_at desc);
create index if not exists admin_audit_log_action_created_idx
  on public.admin_audit_log (action, created_at desc);

alter table public.login_attempts enable row level security;
alter table public.broadcasts enable row level security;
alter table public.support_tickets enable row level security;

revoke all on table public.login_attempts from anon, authenticated;
revoke all on table public.broadcasts from anon, authenticated;
revoke all on table public.support_tickets from anon, authenticated;
revoke all on table public.platform_settings from anon, authenticated;
revoke all on table public.admin_audit_log from anon, authenticated;

grant all on table public.login_attempts to service_role;
grant all on table public.broadcasts to service_role;
grant all on table public.support_tickets to service_role;
grant all on table public.platform_settings to service_role;
grant all on table public.admin_audit_log to service_role;

commit;
