-- Go-live preparation (D57 to D59): the privacy notice, retention clean-ups
-- and a database health check.
--
-- 1. Privacy notice (Q20, D57). A parent claiming a code accepts the
--    privacy notice; the invite records which version and when, nothing
--    more. redeem_parent_invite() now takes the version and refuses without
--    one. parent_invite_preview() also returns the school's slug, so the
--    join page links to that school's notice. privacy_notice_school() gives
--    the public /privacy page a school's name and data protection contact.
-- 2. Retention (D58, docs/RETENTION.md). Two clean-ups called daily by the
--    host's scheduler through /api/cron/retention with the service role:
--      prune_sign_in_attempts()    deletes sign-in attempts older than 30 days
--      expired_import_files()      lists `imports` files older than 30 days
--      forget_import_files(names)  after the route has deleted them through
--                                  the Storage API, clears the job's path
--    Storage refuses SQL deletes on storage.objects (its protect_delete
--    trigger), so files are removed through the API, not here. Nothing else
--    is deleted: audit_log, reports, marks and every other table are left
--    alone, and import_jobs rows stay with file_deleted_at set.
-- 3. health_check() for /healthz (D59): answers true when the database
--    answers, and nothing else.

-- 1. Privacy notice -------------------------------------------------------------------

alter table public.invites
  add column privacy_notice_version text
    check (privacy_notice_version is null or privacy_notice_version ~ '^[0-9a-z.-]{1,40}$'),
  add column privacy_accepted_at timestamptz,
  add constraint invites_privacy_together
    check ((privacy_notice_version is null) = (privacy_accepted_at is null));

comment on column public.invites.privacy_notice_version is
  'The privacy notice version the parent accepted when claiming this code (D57). Codes claimed before the notice existed have none.';

drop function public.redeem_parent_invite(text);

-- The signed-in caller claims a code: their account becomes the guardian's
-- login and they get an active parent membership in that school. A code
-- works once; a guardian already linked to someone else stays theirs; a
-- membership the school disabled stays disabled (D28). The caller must have
-- accepted the privacy notice, whose version is recorded on the invite.
create function public.redeem_parent_invite(p_code_hash text, p_privacy_version text)
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
  if not found then
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

comment on function public.redeem_parent_invite(text, text) is
  'Claims a parent code for the signed-in caller, recording the privacy notice version they accepted (US-1.3, D25, D57).';

revoke execute on function public.redeem_parent_invite(text, text) from public, anon;
grant execute on function public.redeem_parent_invite(text, text) to authenticated;

drop function public.parent_invite_preview(text);

create function public.parent_invite_preview(p_code_hash text)
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
  if not found then
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

comment on function public.parent_invite_preview(text) is
  'Status of a parent code (valid, used, expired, unknown) and, when valid, the school (name and slug) and guardian it is for.';

revoke execute on function public.parent_invite_preview(text) from public;
grant execute on function public.parent_invite_preview(text) to anon, authenticated;

-- What the public privacy notice prints for one school: its name and the
-- data protection contact the school published for this purpose (D56).
create function public.privacy_notice_school(p_slug text)
returns table (name text, slug text, privacy_contact_name text, privacy_contact_email text)
language sql
stable
security definer
set search_path = public
as $$
  select s.name, s.slug, s.privacy_contact_name, s.privacy_contact_email
  from public.schools s
  where s.slug = p_slug and s.status = 'active';
$$;

comment on function public.privacy_notice_school(text) is
  'An active school''s name and privacy notice contact, for the public /privacy page (Q20, D57).';

revoke execute on function public.privacy_notice_school(text) from public;
grant execute on function public.privacy_notice_school(text) to anon, authenticated;

-- 2. Retention ---------------------------------------------------------------------------

alter table public.import_jobs add column file_deleted_at timestamptz;

comment on column public.import_jobs.file_deleted_at is
  'When the uploaded file was deleted from the imports bucket by the 30-day clean-up (D58); file_path is then null.';

create function public.prune_sign_in_attempts()
returns integer
language sql
set search_path = public
as $$
  with gone as (
    delete from public.sign_in_attempts
    where created_at < now() - interval '30 days'
    returning 1
  )
  select count(*)::integer from gone;
$$;

comment on function public.prune_sign_in_attempts() is
  'Deletes sign-in attempts older than 30 days and returns how many (D58). Service role only.';

create function public.expired_import_files(p_limit integer default 500)
returns table (name text)
language sql
stable
set search_path = public
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'imports'
    and o.created_at < now() - interval '30 days'
  order by o.created_at
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

comment on function public.expired_import_files(integer) is
  'Names of imports bucket files older than 30 days, oldest first, at most 1000 (D58). Service role only.';

-- Called after the route deleted the files: clears the path of each job
-- whose file is really gone, so its page says it is no longer waiting.
create function public.forget_import_files(p_names text[])
returns integer
language sql
set search_path = public
as $$
  with forgotten as (
    update public.import_jobs j
    set file_path = null, file_deleted_at = now()
    where j.file_path = any (p_names)
      and not exists (
        select 1 from storage.objects o where o.bucket_id = 'imports' and o.name = j.file_path
      )
    returning 1
  )
  select count(*)::integer from forgotten;
$$;

comment on function public.forget_import_files(text[]) is
  'Clears file_path on import jobs whose imports file was deleted, and sets file_deleted_at (D58). Service role only.';

revoke execute on function public.prune_sign_in_attempts() from public, anon, authenticated;
revoke execute on function public.expired_import_files(integer) from public, anon, authenticated;
revoke execute on function public.forget_import_files(text[]) from public, anon, authenticated;
grant execute on function public.prune_sign_in_attempts() to service_role;
grant execute on function public.expired_import_files(integer) to service_role;
grant execute on function public.forget_import_files(text[]) to service_role;

-- 3. Health check ----------------------------------------------------------------------

create function public.health_check()
returns boolean
language sql
stable
set search_path = public
as $$
  select true;
$$;

comment on function public.health_check() is
  'Answers true when the database answers; used by /healthz (D59). Reads nothing.';

revoke execute on function public.health_check() from public;
grant execute on function public.health_check() to anon, authenticated, service_role;
