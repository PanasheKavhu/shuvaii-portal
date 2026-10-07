-- Write guards that RLS policies cannot express on their own, for the
-- tenancy tables. Policies decide which rows a user may write; these decide
-- which columns and values. All checks key off auth.uid(), which is null for
-- the service role and plain SQL sessions, so seeding and back-office work
-- are unaffected. See docs/DECISIONS.md D3-D5.

-- schools: a school_admin may edit only the school's own contact and report
-- details. Identity (slug, name, stage), branding (logo, colours), timezone,
-- feature flags and status are platform-admin only (SPEC US-1.5, US-10.1).
-- Without this a suspended school's admin could reactivate it.
create function private.guard_school_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_platform_admin() then
    return new;
  end if;

  if (new.id, new.slug, new.name, new.stage, new.logo_path, new.primary_color,
      new.accent_color, new.timezone, new.feature_flags, new.status)
     is distinct from
     (old.id, old.slug, old.name, old.stage, old.logo_path, old.primary_color,
      old.accent_color, old.timezone, old.feature_flags, old.status) then
    raise exception 'only a platform admin can change a school''s identity, branding, flags or status';
  end if;

  return new;
end;
$$;

create trigger schools_guard_update
  before update on public.schools
  for each row
  execute function private.guard_school_update();

-- memberships: the row's school and person never change; disable it and add
-- a new one instead (rule 6). Otherwise a school_admin could repoint someone
-- else's head membership at themselves and sidestep the self-role rule.
create function private.guard_membership_update()
returns trigger
language plpgsql
as $$
begin
  if new.school_id is distinct from old.school_id
     or new.user_id is distinct from old.user_id then
    raise exception 'a membership''s school and person cannot change';
  end if;
  return new;
end;
$$;

create trigger memberships_guard_update
  before update on public.memberships
  for each row
  execute function private.guard_membership_update();

-- memberships: nobody grants themselves a role. A school_admin adding a
-- membership for their own user id is the insert-side twin of changing their
-- own role. Platform admins may, since they bootstrap a new school.
create function private.guard_membership_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and new.user_id = auth.uid()
     and not public.is_platform_admin() then
    raise exception 'members cannot grant themselves a membership';
  end if;
  return new;
end;
$$;

create trigger memberships_guard_insert
  before insert on public.memberships
  for each row
  execute function private.guard_membership_insert();

-- profiles: a person may edit their own name and phone only. email mirrors
-- auth.users and is set by handle_new_user(); id and timestamps are system
-- owned. Supabase grants table-wide update by default, so narrow it here.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
