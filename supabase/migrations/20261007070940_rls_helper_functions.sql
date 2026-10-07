-- RLS helper functions (docs/DATA_MODEL.md section 7) and the policies for
-- the tables created so far: schools, profiles, platform_admins,
-- memberships. Default is deny: a table with RLS enabled and no matching
-- policy returns/accepts nothing, which is how anonymous users end up
-- seeing nothing everywhere below.
--
-- Each function is security definer and stable: security definer so it can
-- read memberships/platform_admins without re-triggering the RLS policies
-- that call it (which would recurse), stable so the planner can reuse the
-- result within one statement. search_path is pinned to stop a caller
-- hijacking an unqualified reference inside the function body.

-- Not one of the three named helpers below, but needed by them: looks up
-- any user's active school ids, bypassing RLS. Without this, profiles_select
-- would have to join public.memberships directly to see a colleague's
-- membership row, which memberships' own RLS (admin/head only) would hide
-- from an ordinary teacher — breaking "readable by anyone who shares a
-- school" for everyone except admins and heads. See docs/DECISIONS.md.
-- It lives in the private schema so it is not an RPC endpoint: otherwise any
-- signed-in user could list any other user's schools by calling it.
create function private.school_ids_for(p_user_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select school_id
  from public.memberships
  where user_id = p_user_id
    and status = 'active';
$$;

create function public.current_school_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select private.school_ids_for(auth.uid());
$$;

comment on function public.current_school_ids() is
  'School ids the current user has an active membership in, any role.';

create function public.has_role(p_school_id uuid, p_role public.app_role)
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
  );
$$;

comment on function public.has_role(uuid, public.app_role) is
  'Whether the current user has an active membership with this role in this school.';

create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
  );
$$;

comment on function public.is_platform_admin() is 'Whether the current user is a super admin.';

-- Anonymous callers resolve auth.uid() to null, so every function above
-- returns empty/false for them; grant execute anyway so calling the
-- function from a policy never errors for anon.
revoke execute on function private.school_ids_for(uuid) from public;
grant execute on function private.school_ids_for(uuid) to anon, authenticated;
grant execute on function public.current_school_ids() to anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to anon, authenticated;
grant execute on function public.is_platform_admin() to anon, authenticated;

-- schools ---------------------------------------------------------------
-- Read: members of that school, or a platform admin.
-- Write: platform admin (branding and anything else), or that school's
-- school_admin. Which columns a school_admin may change is enforced by a
-- trigger in tenancy_write_guards.sql (branding, slug, status and flags are
-- platform-admin only).
-- Create: platform admin only. Delete: none — school deletion is a
-- super-admin operation done offline, outside RLS.

create policy schools_select on public.schools
  for select
  to authenticated
  using (id in (select public.current_school_ids()) or public.is_platform_admin());

create policy schools_insert on public.schools
  for insert
  to authenticated
  with check (public.is_platform_admin());

create policy schools_update on public.schools
  for update
  to authenticated
  using (public.is_platform_admin() or public.has_role(id, 'school_admin'))
  with check (public.is_platform_admin() or public.has_role(id, 'school_admin'));

-- profiles ----------------------------------------------------------------
-- Read: the person themselves, or anyone sharing an active membership in
-- the same school. Platform admins get no blanket read: profiles hold
-- personal data (learners, parents), and the data model gives super admins
-- no tenant data by default. Write: the person themselves, own row only,
-- and only full_name/phone (column grants in tenancy_write_guards.sql).
-- No insert/delete policy: rows are created only by the
-- on_auth_user_created trigger (security definer, bypasses RLS).

create policy profiles_select on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from private.school_ids_for(profiles.id) as their_school
      where their_school in (select public.current_school_ids())
    )
  );

create policy profiles_update on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- platform_admins -----------------------------------------------------------
-- Read: a platform admin may see the roster (and themselves). No
-- insert/update/delete policy: granting or revoking super admin is done by
-- the service role outside the API.

create policy platform_admins_select on public.platform_admins
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

-- memberships ---------------------------------------------------------------
-- Read: that school's school_admin or head, a platform admin, or your own
-- membership row. Write: that school's school_admin, or a platform admin.
-- No delete policy: disable a membership with status instead (rule 6);
-- the self-role-change trigger on this table additionally blocks anyone,
-- including a school_admin, from changing their own role.

create policy memberships_select on public.memberships
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or public.has_role(school_id, 'school_admin')
    or public.has_role(school_id, 'head')
    or user_id = auth.uid()
  );

create policy memberships_insert on public.memberships
  for insert
  to authenticated
  with check (public.is_platform_admin() or public.has_role(school_id, 'school_admin'));

create policy memberships_update on public.memberships
  for update
  to authenticated
  using (public.is_platform_admin() or public.has_role(school_id, 'school_admin'))
  with check (public.is_platform_admin() or public.has_role(school_id, 'school_admin'));
