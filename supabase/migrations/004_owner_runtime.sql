-- Owner runtime fields and atomic login-attempt accounting (004)
-- Requires migrations 002 and 003. Review and apply manually when the owner schema is ready.

begin;

alter table public.teachers
  add column if not exists is_suspended boolean not null default false;

alter table public.login_attempts
  add column if not exists completed_at timestamptz;

alter table public.login_attempts
  drop constraint if exists login_attempts_attempt_type_check;

alter table public.login_attempts
  add constraint login_attempts_attempt_type_check
  check (attempt_type in ('pending', 'success', 'failure', 'locked'));

create index if not exists login_attempts_pending_pair_idx
  on public.login_attempts (ip_address, email_fingerprint, attempted_at desc)
  where attempt_type in ('pending', 'failure');

create or replace function public.claim_owner_login_attempt(
  p_email_fingerprint bytea,
  p_ip_address inet,
  p_user_agent text,
  p_request_id uuid
)
returns table (attempt_id uuid, locked_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_locked_until timestamptz;
  v_attempt_count integer;
  v_attempt_id uuid;
begin
  if p_email_fingerprint is null or pg_catalog.octet_length(p_email_fingerprint) <> 32 then
    raise exception 'Invalid email fingerprint';
  end if;

  if p_ip_address is null or p_request_id is null then
    raise exception 'Missing login attempt context';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_ip_address::text || ':' || pg_catalog.encode(p_email_fingerprint, 'hex'),
      0
    )
  );

  select pg_catalog.max(la.locked_until)
    into v_locked_until
    from public.login_attempts as la
   where la.ip_address = p_ip_address
     and la.email_fingerprint = p_email_fingerprint
     and la.locked_until > v_now;

  if v_locked_until is null then
    select pg_catalog.count(*)::integer
      into v_attempt_count
      from public.login_attempts as la
     where la.ip_address = p_ip_address
       and la.email_fingerprint = p_email_fingerprint
       and la.attempted_at >= v_now - interval '15 minutes'
       and la.attempt_type in ('pending', 'failure');

    if v_attempt_count < 5 then
      insert into public.login_attempts (
        email_fingerprint,
        ip_address,
        user_agent,
        request_id,
        attempt_type,
        attempted_at
      )
      values (
        p_email_fingerprint,
        p_ip_address,
        left(p_user_agent, 512),
        p_request_id,
        'pending',
        v_now
      )
      returning id into v_attempt_id;

      return query select v_attempt_id, null::timestamptz;
      return;
    end if;

    v_locked_until := v_now + interval '15 minutes';

    insert into public.login_attempts (
      email_fingerprint,
      ip_address,
      user_agent,
      request_id,
      attempt_type,
      attempted_at,
      locked_until
    )
    values (
      p_email_fingerprint,
      p_ip_address,
      left(p_user_agent, 512),
      p_request_id,
      'locked',
      v_now,
      v_locked_until
    );
  else
    insert into public.login_attempts (
      email_fingerprint,
      ip_address,
      user_agent,
      request_id,
      attempt_type,
      attempted_at,
      locked_until
    )
    values (
      p_email_fingerprint,
      p_ip_address,
      left(p_user_agent, 512),
      p_request_id,
      'locked',
      v_now,
      v_locked_until
    );
  end if;

  insert into public.admin_audit_log (
    action,
    entity_type,
    ip_address,
    user_agent,
    outcome,
    details
  )
  values (
    'owner.login',
    'owner_auth',
    p_ip_address,
    left(p_user_agent, 512),
    'blocked',
    pg_catalog.jsonb_build_object('request_id', p_request_id)
  );

  return query select null::uuid, v_locked_until;
end;
$function$;

create or replace function public.complete_owner_login_attempt(
  p_attempt_id uuid,
  p_outcome text,
  p_actor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_ip_address inet;
  v_email_fingerprint bytea;
  v_user_agent text;
  v_request_id uuid;
  v_failure_count integer;
  v_locked_until timestamptz;
begin
  if p_outcome not in ('success', 'failure') then
    raise exception 'Invalid login outcome';
  end if;

  if p_outcome = 'success' and (
    p_actor_id is null
    or not exists (
      select 1
        from public.platform_admins as pa
       where pa.user_id = p_actor_id
    )
  ) then
    raise exception 'Platform admin membership required';
  end if;

  select la.ip_address, la.email_fingerprint, la.user_agent, la.request_id
    into v_ip_address, v_email_fingerprint, v_user_agent, v_request_id
    from public.login_attempts as la
   where la.id = p_attempt_id
     and la.attempt_type = 'pending'
   for update;

  if not found then
    raise exception 'Login attempt is not pending';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_ip_address::text || ':' || pg_catalog.encode(v_email_fingerprint, 'hex'),
      0
    )
  );

  update public.login_attempts
     set attempt_type = p_outcome,
         completed_at = v_now
   where id = p_attempt_id;

  if p_outcome = 'failure' then
    select pg_catalog.count(*)::integer
      into v_failure_count
      from public.login_attempts as la
     where la.ip_address = v_ip_address
       and la.email_fingerprint = v_email_fingerprint
       and la.attempted_at >= v_now - interval '15 minutes'
       and la.attempt_type = 'failure';

    if v_failure_count >= 5 then
      v_locked_until := v_now + interval '15 minutes';
      update public.login_attempts
         set locked_until = v_locked_until
       where id = p_attempt_id;
    end if;
  end if;

  insert into public.admin_audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    ip_address,
    user_agent,
    outcome,
    details
  )
  values (
    case when p_outcome = 'success' then p_actor_id else null end,
    'owner.login',
    'owner_auth',
    case when p_outcome = 'success' then p_actor_id::text else null end,
    v_ip_address,
    v_user_agent,
    p_outcome,
    pg_catalog.jsonb_build_object('request_id', v_request_id)
  );
end;
$function$;

create or replace function public.owner_set_teacher_suspension(
  p_teacher_id uuid,
  p_is_suspended boolean,
  p_actor_id uuid
)
returns table (teacher_id uuid, teacher_name text, is_suspended boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_name text;
  v_was_suspended boolean;
begin
  if p_teacher_id is null or p_is_suspended is null or p_actor_id is null then
    raise exception 'Missing teacher status context';
  end if;

  if p_teacher_id = p_actor_id then
    raise exception 'A platform owner cannot suspend their own account';
  end if;

  if not exists (
    select 1
      from public.platform_admins as pa
     where pa.user_id = p_actor_id
  ) then
    raise exception 'Platform admin membership required';
  end if;

  select t.name, t.is_suspended
    into v_name, v_was_suspended
    from public.teachers as t
   where t.id = p_teacher_id
   for update;

  if not found then
    raise exception 'Teacher not found';
  end if;

  if v_was_suspended is distinct from p_is_suspended then
    update public.teachers as t
       set is_suspended = p_is_suspended
     where t.id = p_teacher_id;

    insert into public.admin_audit_log (
      actor_id,
      action,
      entity_type,
      entity_id,
      before_data,
      after_data,
      outcome,
      details
    )
    values (
      p_actor_id,
      case when p_is_suspended then 'owner.teacher.suspend' else 'owner.teacher.activate' end,
      'teacher',
      p_teacher_id::text,
      pg_catalog.jsonb_build_object('is_suspended', v_was_suspended),
      pg_catalog.jsonb_build_object('is_suspended', p_is_suspended),
      'success',
      '{}'::jsonb
    );
  end if;

  return query
  select t.id, t.name, t.is_suspended
    from public.teachers as t
   where t.id = p_teacher_id;
end;
$function$;

revoke all on function public.claim_owner_login_attempt(bytea, inet, text, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_owner_login_attempt(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_owner_login_attempt(bytea, inet, text, uuid)
  to service_role;
grant execute on function public.complete_owner_login_attempt(uuid, text, uuid)
  to service_role;
revoke all on function public.owner_set_teacher_suspension(uuid, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.owner_set_teacher_suspension(uuid, boolean, uuid)
  to service_role;

commit;
