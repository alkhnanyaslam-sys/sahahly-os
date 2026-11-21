-- Sahahly OS — super-admin, plans, subscriptions, usage, and audit schema (002)
-- Apply separately after reviewing. This file is not applied automatically.

begin;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_monthly numeric(10, 2) not null default 0 check (price_monthly >= 0),
  price_yearly numeric(10, 2) not null default 0 check (price_yearly >= 0),
  currency text not null default 'EGP' check (currency ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  is_public boolean not null default true,
  sort_order integer not null default 0,
  trial_days integer not null default 0 check (trial_days >= 0),
  features jsonb not null default '{"ai_grading": false, "whatsapp_reports": false, "qr_attendance": false, "analytics": false, "exam_generator": false, "import_excel": false, "custom_branding": false, "priority_support": false}'::jsonb
    check (jsonb_typeof(features) = 'object'),
  limits jsonb not null default '{"max_students": 0, "max_groups": 0, "max_assistants": 0, "ai_gradings_per_month": 0, "exam_generations_per_month": 0, "whatsapp_messages_per_month": 0, "storage_mb": 0}'::jsonb
    check (jsonb_typeof(limits) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete restrict,
  status text not null check (status in ('trial', 'active', 'past_due', 'canceled', 'expired')),
  billing_cycle text not null check (billing_cycle in ('monthly', 'yearly')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  trial_ends_at timestamptz,
  price_paid numeric(10, 2) not null default 0 check (price_paid >= 0),
  payment_method text check (payment_method in ('cash', 'instapay', 'vodafone_cash', 'bank', 'other')),
  notes text,
  overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(overrides) = 'object'),
  granted_by uuid references public.platform_admins (user_id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.subscriptions (id) on delete set null,
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  actor_id uuid references public.platform_admins (user_id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  note text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.usage_counters (
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  metric text not null check (metric in ('ai_gradings', 'exam_generations', 'whatsapp_messages', 'storage_mb')),
  value bigint not null default 0 check (value >= 0),
  updated_at timestamptz not null default now(),
  primary key (teacher_id, month, metric)
);

create table if not exists public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  owner_whatsapp text,
  platform_name text not null default 'Sahahly OS',
  currency text not null default 'EGP' check (currency ~ '^[A-Z]{3}$'),
  currency_rates jsonb not null default '{}'::jsonb check (jsonb_typeof(currency_rates) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.platform_admins (user_id) on delete set null
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.platform_admins (user_id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.assessments
  add column if not exists archived_at timestamptz;

create index if not exists plans_active_public_order_idx
  on public.plans (is_active, is_public, sort_order);
create index if not exists subscriptions_teacher_started_idx
  on public.subscriptions (teacher_id, starts_at desc, created_at desc);
create index if not exists subscriptions_status_end_idx
  on public.subscriptions (status, ends_at);
create index if not exists subscription_events_teacher_created_idx
  on public.subscription_events (teacher_id, created_at desc);
create index if not exists subscription_events_created_idx
  on public.subscription_events (created_at desc);
create index if not exists usage_counters_month_metric_idx
  on public.usage_counters (month desc, metric);
create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_entity_idx
  on public.admin_audit_log (entity_type, entity_id, created_at desc);
create index if not exists assessments_teacher_archived_created_idx
  on public.assessments (teacher_id, archived_at, created_at desc);

alter table public.platform_admins enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.usage_counters enable row level security;
alter table public.platform_settings enable row level security;
alter table public.admin_audit_log enable row level security;

revoke all on table public.platform_admins from anon, authenticated;
revoke all on table public.plans from anon, authenticated;
revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.subscription_events from anon, authenticated;
revoke all on table public.usage_counters from anon, authenticated;
revoke all on table public.platform_settings from anon, authenticated;
revoke all on table public.admin_audit_log from anon, authenticated;

grant select on table public.plans to anon, authenticated;
grant all on table public.platform_admins to service_role;
grant all on table public.plans to service_role;
grant all on table public.subscriptions to service_role;
grant all on table public.subscription_events to service_role;
grant all on table public.usage_counters to service_role;
grant all on table public.platform_settings to service_role;
grant all on table public.admin_audit_log to service_role;

drop policy if exists plans_public_active_select on public.plans;
create policy plans_public_active_select on public.plans
  for select to anon, authenticated
  using (is_active and is_public);

create or replace function public.sync_teacher_subscription_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_teacher_id uuid;
  v_teacher_ids uuid[];
  v_subscription_status text;
begin
  if tg_op = 'UPDATE' and new.teacher_id is distinct from old.teacher_id then
    v_teacher_ids := array[new.teacher_id, old.teacher_id];
  else
    v_teacher_ids := array[coalesce(new.teacher_id, old.teacher_id)];
  end if;

  foreach v_teacher_id in array v_teacher_ids loop
    select case
      when s.status = 'active' and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now()) then 'active'
      when s.status = 'trial' and s.starts_at <= now() and coalesce(s.trial_ends_at, s.ends_at) > now() then 'trial'
      else 'expired'
    end
    into v_subscription_status
    from public.subscriptions as s
    where s.teacher_id = v_teacher_id
      and (
        (s.status = 'active' and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now()))
        or (s.status = 'trial' and s.starts_at <= now() and coalesce(s.trial_ends_at, s.ends_at) > now())
      )
    order by s.starts_at desc, s.created_at desc
    limit 1;

    update public.teachers
    set subscription_status = coalesce(v_subscription_status, 'expired')
    where id = v_teacher_id;

    v_subscription_status := null;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.sync_teacher_subscription_status() from public, anon, authenticated;

drop trigger if exists subscriptions_sync_teacher_status on public.subscriptions;
create trigger subscriptions_sync_teacher_status
after insert or update of teacher_id, status, starts_at, ends_at, trial_ends_at or delete
on public.subscriptions
for each row execute function public.sync_teacher_subscription_status();

insert into public.platform_settings (id)
values (1)
on conflict (id) do nothing;

commit;

-- Bootstrap the first platform administrator manually after confirming the owner's auth account:
-- Replace owner@example.com with the exact email, then execute this statement separately.
-- insert into public.platform_admins (user_id)
-- select u.id from auth.users as u where lower(u.email) = lower('owner@example.com')
-- on conflict (user_id) do nothing;
