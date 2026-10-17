-- Suspending a school (D63). A suspended school keeps every row, but:
--   * it is missing from every public list (sign_in_schools() and
--     privacy_notice_school() already return active schools only);
--   * nobody can use it: the membership helpers behind the RLS policies
--     treat its memberships as inactive, so its staff, parents and learners
--     read and write nothing there (the app's loadAccess() already drops it);
--   * its parent codes read as unknown and cannot be redeemed.
-- Platform admins switch it with set_school_status(), recorded as the
-- console events school_suspended and school_reactivated. Reactivating
-- brings everything back. Deleting a school stays an offline operation
-- (scripts/delete-school.sql).

create function private.school_is_active(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.schools where id = p_school_id and status = 'active');
$$;

revoke execute on function private.school_is_active(uuid) from public;
grant execute on function private.school_is_active(uuid) to anon, authenticated, service_role;

-- Membership helpers: only memberships in active schools count. ------------------

create or replace function private.school_ids_for(p_user_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.school_id
  from public.memberships m
  join public.schools s on s.id = m.school_id and s.status = 'active'
  where m.user_id = p_user_id
    and m.status = 'active';
$$;

create or replace function public.has_role(p_school_id uuid, p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and school_id = p_school_id
      and role = p_role
      and status = 'active'
  )
  and private.school_is_active(p_school_id)
  and not (p_role in ('school_admin', 'head') and private.session_is_aal1());
$$;

comment on function public.has_role(uuid, public.app_role) is
  'Whether the current user has an active membership with this role in this active (not suspended) school. School admin and head count only in an aal2 session (D54).';

create or replace function public.is_staff(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and school_id = p_school_id
      and role in ('school_admin', 'head', 'hod', 'teacher')
      and status = 'active'
  )
  and private.school_is_active(p_school_id);
$$;

-- Switching the status ---------------------------------------------------------------

create function public.set_school_status(p_school_id uuid, p_status text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'only a platform admin can suspend or reactivate a school' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active', 'suspended') then
    raise exception 'unknown school status' using errcode = 'check_violation';
  end if;
  update public.schools set status = p_status where id = p_school_id and status <> p_status;
  if not found and not exists (select 1 from public.schools where id = p_school_id) then
    raise exception 'school not found' using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.set_school_status(uuid, text) is
  'Platform admin: suspends a school (active -> suspended) or reactivates it. Audited as school_suspended or school_reactivated.';

revoke execute on function public.set_school_status(uuid, text) from public, anon;
grant execute on function public.set_school_status(uuid, text) to authenticated;

-- Audit: the console events trigger (D18, D55) also records status changes. --------

create or replace function private.audit_school_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_branding jsonb;
  new_branding jsonb;
  old_features jsonb := '{}'::jsonb;
  new_features jsonb := '{}'::jsonb;
  f text;
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

  foreach f in array array['newsletter', 'attendance'] loop
    if coalesce((old.feature_flags ->> f)::boolean, private.feature_default(f))
       is distinct from coalesce((new.feature_flags ->> f)::boolean, private.feature_default(f)) then
      old_features := old_features
        || jsonb_build_object(f, coalesce((old.feature_flags ->> f)::boolean, private.feature_default(f)));
      new_features := new_features
        || jsonb_build_object(f, coalesce((new.feature_flags ->> f)::boolean, private.feature_default(f)));
    end if;
  end loop;
  if old.status is distinct from new.status then
    insert into public.audit_log (
      school_id, actor_id, table_name, row_id, action, event, old_data, new_data
    )
    values (new.id, auth.uid(), 'schools', new.id, 'event',
            case when new.status = 'suspended' then 'school_suspended' else 'school_reactivated' end,
            jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  end if;

  if new_features <> '{}'::jsonb then
    insert into public.audit_log (
      school_id, actor_id, table_name, row_id, action, event, old_data, new_data
    )
    values (new.id, auth.uid(), 'schools', new.id, 'event', 'feature_changed',
            old_features, new_features);
  end if;
  return null;
end;
$$;

-- Parent codes of a suspended school read as unknown. --------------------------------

create or replace function public.parent_invite_preview(p_code_hash text)
returns table (
  status text,
  school_name text,
  guardian_name text,
  guardian_email text,
  children integer,
  school_slug text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  i public.invites;
begin
  select * into i from public.invites where code_hash = p_code_hash;
  if not found or not private.school_is_active(i.school_id) then
    return query select 'unknown'::text, null::text, null::text, null::text, null::integer, null::text;
  elsif i.accepted_at is not null then
    return query select 'used'::text, null::text, null::text, null::text, null::integer, null::text;
  elsif i.expires_at <= now() then
    return query select 'expired'::text, null::text, null::text, null::text, null::integer, null::text;
  else
    return query
      select 'valid'::text, s.name, g.full_name, g.email,
             (select count(*)::integer from public.guardian_links gl where gl.guardian_id = g.id),
             s.slug
      from public.guardians g
      join public.schools s on s.id = g.school_id
      where g.id = i.guardian_id;
  end if;
end;
$$;

create or replace function public.redeem_parent_invite(p_code_hash text, p_privacy_version text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.invites;
  g public.guardians;
  member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in to use an invite' using errcode = '42501';
  end if;
  if p_privacy_version is null or p_privacy_version !~ '^[0-9a-z.-]{1,40}$' then
    raise exception 'privacy_not_accepted' using errcode = 'P0001';
  end if;

  select * into i from public.invites where code_hash = p_code_hash for update;
  if not found or not private.school_is_active(i.school_id) then
    raise exception 'invite_unknown' using errcode = 'P0001';
  elsif i.accepted_at is not null then
    raise exception 'invite_used' using errcode = 'P0001';
  elsif i.expires_at <= now() then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;

  select * into g from public.guardians where id = i.guardian_id for update;
  if g.user_id is not null and g.user_id <> auth.uid() then
    raise exception 'guardian_taken' using errcode = 'P0001';
  end if;

  update public.guardians set user_id = auth.uid() where id = g.id;

  if exists (
    select 1 from public.memberships
    where school_id = i.school_id and user_id = auth.uid() and role = 'parent' and status = 'disabled'
  ) then
    raise exception 'membership_disabled' using errcode = 'P0001';
  end if;

  perform set_config('sp.redeeming_invite', 'on', true);
  insert into public.memberships (school_id, user_id, role, status)
  values (i.school_id, auth.uid(), 'parent', 'active')
  on conflict (school_id, user_id, role) do update set status = 'active'
  returning id into member_id;
  perform set_config('sp.redeeming_invite', '', true);

  update public.invites
  set accepted_at = now(), accepted_by = auth.uid(),
      privacy_notice_version = p_privacy_version, privacy_accepted_at = now()
  where id = i.id;

  insert into public.audit_log (school_id, actor_id, table_name, row_id, action, event, new_data)
  values (
    i.school_id, auth.uid(), 'invites', i.id, 'event', 'parent_invite_accepted',
    jsonb_build_object(
      'guardian_id', g.id, 'membership_id', member_id, 'privacy_notice_version', p_privacy_version
    )
  );

  return i.school_id;
end;
$$;
