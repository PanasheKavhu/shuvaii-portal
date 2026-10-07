-- audit_log: append-only record of changes. See docs/DATA_MODEL.md section
-- 4.6 and docs/DECISIONS.md D18.
--
-- Rows are written only by security-definer code: the generic row trigger
-- below (attached to memberships now, and to marks, comments, reports,
-- assessments and learners as those tables land), the schools console-event
-- trigger, and log_invite_event() for invite emails. Nobody, not even the
-- service role, can update or delete a row.

create type public.audit_action as enum ('insert', 'update', 'delete', 'event');

create table public.audit_log (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools (id),
  actor_id uuid references public.profiles (id),
  table_name text not null,
  row_id uuid not null,
  action public.audit_action not null,
  -- Set only for action 'event': a named console event such as
  -- 'school_created'. Row changes say what happened through old/new data.
  event text,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamptz not null default now(),
  constraint audit_log_event_named check ((action = 'event') = (event is not null))
);

comment on table public.audit_log is
  'Append-only history of changes to audited rows and console events. Written by triggers and security-definer functions only.';
comment on column public.audit_log.actor_id is
  'auth.uid() of whoever made the change; null for the service role and plain SQL.';

create index audit_log_school_id_created_at_idx on public.audit_log (school_id, created_at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_id);

alter table public.audit_log enable row level security;

-- Read: that school's school_admin or head (SPEC section 3, "View audit
-- log"). No insert, update or delete policy for anyone.
create policy audit_log_select on public.audit_log
  for select
  to authenticated
  using (public.has_role(school_id, 'school_admin') or public.has_role(school_id, 'head'));

revoke insert, update, delete, truncate on public.audit_log from anon, authenticated, service_role;

-- Belt and braces: even a role that bypasses RLS and holds table grants
-- (postgres, service_role re-granted later) cannot rewrite history.
create function private.audit_log_is_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row
  execute function private.audit_log_is_append_only();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement
  execute function private.audit_log_is_append_only();

-- Generic row trigger: records who changed which row of which table, and the
-- row before and after. Attach it AFTER INSERT OR UPDATE OR DELETE to any
-- tenant table with a uuid `id` and a `school_id`.
create function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  any_row jsonb := coalesce(new_row, old_row);
begin
  if tg_op = 'UPDATE' and old_row = new_row then
    return null;
  end if;

  insert into public.audit_log (school_id, actor_id, table_name, row_id, action, old_data, new_data)
  values (
    (any_row ->> 'school_id')::uuid,
    auth.uid(),
    tg_table_name,
    (any_row ->> 'id')::uuid,
    lower(tg_op)::public.audit_action,
    old_row,
    new_row
  );
  return null;
end;
$$;

create trigger memberships_audit
  after insert or update or delete on public.memberships
  for each row
  execute function private.audit_row_change();

-- Console events on schools (SPEC US-10.1, US-1.5): a school being created
-- and its branding (logo, colours) changing. Recorded against the school
-- that changed (D18). Written by trigger so the event commits with the change.
create function private.audit_school_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_branding jsonb;
  new_branding jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (school_id, actor_id, table_name, row_id, action, event, new_data)
    values (new.id, auth.uid(), 'schools', new.id, 'event', 'school_created', to_jsonb(new));
    return null;
  end if;

  old_branding := jsonb_build_object(
    'logo_path', old.logo_path, 'primary_color', old.primary_color, 'accent_color', old.accent_color);
  new_branding := jsonb_build_object(
    'logo_path', new.logo_path, 'primary_color', new.primary_color, 'accent_color', new.accent_color);
  if old_branding is distinct from new_branding then
    insert into public.audit_log (
      school_id, actor_id, table_name, row_id, action, event, old_data, new_data
    )
    values (new.id, auth.uid(), 'schools', new.id, 'event', 'branding_changed',
            old_branding, new_branding);
  end if;
  return null;
end;
$$;

create trigger schools_audit_events
  after insert or update on public.schools
  for each row
  execute function private.audit_school_event();

-- Invite emails leave no row change of their own (a resend changes nothing
-- in the database), so the console records them through this function after
-- Auth has sent the email. Platform admins only; the membership must be a
-- school_admin one, and the event is logged against its school.
create function public.log_invite_event(p_membership_id uuid, p_event text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.memberships;
begin
  if not public.is_platform_admin() then
    raise exception 'only a platform admin can log invite events';
  end if;
  if p_event not in ('admin_invited', 'invite_resent') then
    raise exception 'unknown invite event %', p_event;
  end if;

  select * into m from public.memberships where id = p_membership_id and role = 'school_admin';
  if not found then
    raise exception 'no school_admin membership %', p_membership_id;
  end if;

  insert into public.audit_log (school_id, actor_id, table_name, row_id, action, event, new_data)
  values (
    m.school_id, auth.uid(), 'memberships', m.id, 'event', p_event,
    jsonb_build_object('user_id', m.user_id, 'role', m.role, 'status', m.status)
  );
end;
$$;

comment on function public.log_invite_event(uuid, text) is
  'Records an admin_invited or invite_resent console event against the membership''s school. Platform admins only.';

revoke execute on function public.log_invite_event(uuid, text) from public, anon;
grant execute on function public.log_invite_event(uuid, text) to authenticated;
