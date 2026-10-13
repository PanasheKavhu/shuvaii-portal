-- Per-school feature switches (US-10.3; D55). `schools.feature_flags` has
-- been there since the tenancy migration and is platform admin only (D3).
-- This migration gives it a shape, a default per feature, a console
-- function to switch one, an audit event, and makes a switched-off
-- newsletter really refused by the database, not only hidden by the app:
--
--   newsletter   default on.  Off: announcements, their files, reads and the
--                attachments bucket are closed to everyone in that school
--                (admin and head too), so my_announcements(), my_news(),
--                my_news_summary() and announcement_read_counts() return
--                nothing and every write is refused. Nothing is deleted;
--                switching it on again brings everything back.
--   attendance   default off. Stored only: attendance is not built yet
--                (Q25 is still open).
--
-- Payments get a key of their own when payments are built.

-- Shape and defaults ------------------------------------------------------------------

create function private.feature_default(p_feature text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_feature
    when 'newsletter' then true
    when 'attendance' then false
  end;
$$;

-- An object whose keys are known features and whose values are booleans.
create function private.feature_flags_are_valid(p_flags jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_flags) = 'object'
    and not exists (
      select 1
      from jsonb_each(p_flags) as f (key, value)
      where private.feature_default(f.key) is null
         or jsonb_typeof(f.value) <> 'boolean'
    );
$$;

alter table public.schools
  add constraint schools_feature_flags_valid check (private.feature_flags_are_valid(feature_flags));

-- Whether a feature is on for a school: its stored value, else the default.
create function private.school_feature_on(p_school_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (s.feature_flags ->> p_feature)::boolean from public.schools s where s.id = p_school_id),
    private.feature_default(p_feature)
  );
$$;

-- The schools where a feature is on, as a set read once per query (the D48
-- lesson: no function call per row in a policy).
create function private.schools_with_feature(p_feature text)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.schools s
  where coalesce((s.feature_flags ->> p_feature)::boolean, private.feature_default(p_feature));
$$;

revoke execute on function private.school_feature_on(uuid, text) from public;
revoke execute on function private.schools_with_feature(text) from public;
grant execute on function private.school_feature_on(uuid, text) to authenticated;
grant execute on function private.schools_with_feature(text) to authenticated;

-- Switching (console) -----------------------------------------------------------------

-- Platform admin only (at aal2, D54). The guard trigger on schools (D3)
-- refuses anyone else changing feature_flags too; the audit trigger below
-- records the change against the school.
create function public.set_school_feature(p_school_id uuid, p_feature text, p_on boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'only a platform admin can switch a school''s features' using errcode = '42501';
  end if;
  if private.feature_default(p_feature) is null or p_on is null then
    raise exception 'unknown feature' using errcode = 'check_violation';
  end if;
  update public.schools
  set feature_flags = feature_flags || jsonb_build_object(p_feature, p_on)
  where id = p_school_id
    and private.school_feature_on(id, p_feature) is distinct from p_on;
  if not found and not exists (select 1 from public.schools where id = p_school_id) then
    raise exception 'school not found' using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.set_school_feature(uuid, text, boolean) is
  'Platform admin: switches one feature on or off for a school (US-10.3). Audited as feature_changed.';

revoke execute on function public.set_school_feature(uuid, text, boolean) from public, anon;
grant execute on function public.set_school_feature(uuid, text, boolean) to authenticated;

-- Audit: the console events trigger (D18) also records feature changes, as
-- `feature_changed` with the old and new value of each changed feature.
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

-- Newsletter off: refused by the database ---------------------------------------------
--
-- Restrictive policies are ANDed with the existing permissive ones (D49), so
-- every read and write of these tables also needs the school's newsletter on.

create policy announcements_newsletter_on on public.announcements
  as restrictive
  for all to authenticated
  using (school_id in (select private.schools_with_feature('newsletter')))
  with check (school_id in (select private.schools_with_feature('newsletter')));

create policy announcement_attachments_newsletter_on on public.announcement_attachments
  as restrictive
  for all to authenticated
  using (school_id in (select private.schools_with_feature('newsletter')))
  with check (school_id in (select private.schools_with_feature('newsletter')));

create policy announcement_reads_newsletter_on on public.announcement_reads
  as restrictive
  for all to authenticated
  using (school_id in (select private.schools_with_feature('newsletter')))
  with check (school_id in (select private.schools_with_feature('newsletter')));

-- The attachments bucket: objects sit under {school_id}/..., and the folder
-- admin helper is security definer, so the bucket needs its own switch.
-- Other buckets are untouched.
create policy attachments_newsletter_on on storage.objects
  as restrictive
  for all to authenticated
  using (
    bucket_id <> 'attachments'
    or split_part(name, '/', 1) in (select id::text from private.schools_with_feature('newsletter') as id)
  )
  with check (
    bucket_id <> 'attachments'
    or split_part(name, '/', 1) in (select id::text from private.schools_with_feature('newsletter') as id)
  );

-- announcement_read_counts() is security definer, so it skips the policies
-- above; it gets the same switch.
create or replace function public.announcement_read_counts(p_school_id uuid)
returns table (announcement_id uuid, read_count integer, audience_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    (select count(*)::int from public.announcement_reads r
     where r.school_id = a.school_id and r.announcement_id = a.id),
    (select count(distinct u)::int
     from private.announcement_audience(a.school_id, a.audience, a.class_id) as u)
  from public.announcements a
  where a.school_id = p_school_id
    and private.is_admin_or_head(p_school_id)
    and private.school_feature_on(p_school_id, 'newsletter')
  order by coalesce(a.published_at, a.created_at) desc, a.id;
$$;
