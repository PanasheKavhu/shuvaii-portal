-- Two-factor sign in for super admin, school admin and head (SPEC section 5;
-- D54). The second factor is Supabase Auth's TOTP (authenticator app); this
-- migration adds what Auth does not do for us:
--
-- 1. The database treats a session that has not passed the second step
--    (`aal1` in its JWT) as holding none of the three roles. public.has_role()
--    answers false for school_admin and head, and public.is_platform_admin()
--    answers false, so every policy and function built on them (nearly all
--    of them) refuses those roles' reads and writes until the session is
--    `aal2`. The two storage helpers that check those roles inline get the
--    same rule. Teachers, hods, parents and learners are unaffected.
-- 2. `mfa_recovery_codes`: ten single-use codes per person, stored only as
--    hashes, written and read by the server through two service-role-only
--    functions. Using one deletes the person's factor so they must enrol
--    again.
-- 3. `reset_two_factor()`: a super admin removes another person's factor,
--    recovery codes and sessions, recorded in `two_factor_resets` and in the
--    audit log of each school where the person is a school admin or head.

-- 1. Assurance level ------------------------------------------------------------

-- True only when the request's JWT says `aal1`. Real Supabase Auth tokens
-- always carry `aal`; the service role's key and plain SQL (no JWT) carry
-- none and are not held back. pgTAP files that set only
-- `request.jwt.claim.sub` behave as before.
create function private.session_is_aal1()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal1';
$$;

revoke execute on function private.session_is_aal1() from public;
grant execute on function private.session_is_aal1() to anon, authenticated, service_role;

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
  and not (p_role in ('school_admin', 'head') and private.session_is_aal1());
$$;

comment on function public.has_role(uuid, public.app_role) is
  'Whether the current user has an active membership with this role in this school. School admin and head count only in an aal2 session (D54).';

create or replace function public.is_platform_admin()
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
  )
  and not private.session_is_aal1();
$$;

comment on function public.is_platform_admin() is
  'Whether the current user is a super admin, in an aal2 session (D54).';

create or replace function private.is_admin_or_head_folder(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.school_id::text = (storage.foldername(p_name))[1]
      and m.user_id = auth.uid()
      and m.role in ('school_admin', 'head')
      and m.status = 'active'
  )
  and not private.session_is_aal1();
$$;

create or replace function private.is_report_asset_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_name ~ '^[0-9a-f-]{36}/(stamp|head-signature)-[0-9]{1,15}\.(png|jpg|webp)$'
    and exists (
      select 1
      from public.memberships m
      where m.school_id::text = split_part(p_name, '/', 1)
        and m.user_id = auth.uid()
        and m.role = 'school_admin'
        and m.status = 'active'
    )
    and not private.session_is_aal1();
$$;

-- 2. Recovery codes ---------------------------------------------------------------

-- Not a tenant table: a person's second factor belongs to their account, not
-- to a school (listed as an exception in docs/DATA_MODEL.md). Only the
-- service role reads or writes it, through the two functions below.
create table public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- SHA-256 of "<user id>:<normalised code>" (src/lib/auth/recovery-codes.ts).
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, code_hash)
);

comment on table public.mfa_recovery_codes is
  'Single-use two-factor recovery codes, hashed. Service role only, through replace_recovery_codes() and use_recovery_code() (D54).';

alter table public.mfa_recovery_codes enable row level security;

revoke all on table public.mfa_recovery_codes from anon, authenticated;

-- Whether the person has a confirmed authenticator app.
create function private.has_verified_totp(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.mfa_factors
    where user_id = p_user_id and factor_type = 'totp' and status = 'verified'
  );
$$;

revoke execute on function private.has_verified_totp(uuid) from public;

-- Replaces all of a person's recovery codes with ten new ones, right after
-- they confirm their authenticator app.
create function public.replace_recovery_codes(p_user_id uuid, p_hashes text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if cardinality(p_hashes) is distinct from 10
    or (select count(distinct h) from unnest(p_hashes) as h) <> 10
  then
    raise exception 'ten different recovery codes are needed' using errcode = '22023';
  end if;
  if not private.has_verified_totp(p_user_id) then
    raise exception 'no confirmed authenticator app' using errcode = '22023';
  end if;

  delete from public.mfa_recovery_codes where user_id = p_user_id;
  insert into public.mfa_recovery_codes (user_id, code_hash)
  select p_user_id, h from unnest(p_hashes) as h;
end;
$$;

comment on function public.replace_recovery_codes(uuid, text[]) is
  'Stores ten new hashed recovery codes for a person with a confirmed authenticator app, replacing any old ones. Service role only (D54).';

-- Uses one recovery code. When it is unused, marks it used, deletes the
-- person's factors and their other codes, so they must enrol again, and
-- answers true. Anything else answers false and changes nothing.
create function public.use_recovery_code(p_user_id uuid, p_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mfa_recovery_codes
  set used_at = now()
  where user_id = p_user_id and code_hash = p_hash and used_at is null;
  if not found then
    return false;
  end if;

  delete from public.mfa_recovery_codes where user_id = p_user_id and used_at is null;
  delete from auth.mfa_factors where user_id = p_user_id;
  return true;
end;
$$;

comment on function public.use_recovery_code(uuid, text) is
  'Uses one unused recovery code: removes the person''s factors and other codes so they enrol again. Service role only (D54).';

revoke execute on function public.replace_recovery_codes(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.use_recovery_code(uuid, text) from public, anon, authenticated;
grant execute on function public.replace_recovery_codes(uuid, text[]) to service_role;
grant execute on function public.use_recovery_code(uuid, text) to service_role;

-- 3. Resets by a super admin ------------------------------------------------------

create table public.two_factor_resets (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  reset_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.two_factor_resets is
  'Every two-factor reset made from the super-admin console: whose, by whom, when. Append-only; platform admins read (D54).';

create index two_factor_resets_user_id_idx on public.two_factor_resets (user_id, created_at desc);

alter table public.two_factor_resets enable row level security;

create policy two_factor_resets_select on public.two_factor_resets
  for select
  to authenticated
  using (public.is_platform_admin());

revoke insert, update, delete, truncate on public.two_factor_resets from anon, authenticated, service_role;

create function private.two_factor_resets_are_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'two_factor_resets is append-only';
end;
$$;

create trigger two_factor_resets_no_update_delete
  before update or delete on public.two_factor_resets
  for each row
  execute function private.two_factor_resets_are_append_only();

-- Removes another person's authenticator app, recovery codes and sessions,
-- so they sign in again and must enrol a new app. Super admin (aal2) only;
-- not for one's own factor (the super admin's own recovery codes are the
-- fallback). Recorded in two_factor_resets and, as a `two_factor_reset`
-- event, in the audit log of each school where the person is a school
-- admin or head.
create function public.reset_two_factor(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'only a platform admin can reset two-factor sign in' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'use your own recovery codes' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'unknown person' using errcode = '22023';
  end if;

  delete from auth.mfa_factors where user_id = p_user_id;
  delete from public.mfa_recovery_codes where user_id = p_user_id;
  -- Ends every session (refresh tokens go with them), so the next request
  -- signs the person out and they enrol again after signing in.
  delete from auth.sessions where user_id = p_user_id;

  insert into public.two_factor_resets (user_id, reset_by) values (p_user_id, auth.uid());

  insert into public.audit_log (school_id, actor_id, table_name, row_id, action, event)
  select distinct m.school_id, auth.uid(), 'profiles', p_user_id, 'event', 'two_factor_reset'
  from public.memberships m
  where m.user_id = p_user_id
    and m.role in ('school_admin', 'head')
    and m.status = 'active';
end;
$$;

comment on function public.reset_two_factor(uuid) is
  'Super admin only: removes another person''s authenticator app, recovery codes and sessions so they enrol again; recorded in two_factor_resets and the audit log (D54).';

revoke execute on function public.reset_two_factor(uuid) from public, anon;
grant execute on function public.reset_two_factor(uuid) to authenticated;

-- Whether each person has a confirmed authenticator app, and when it was
-- last reset, for the console. Super admin (aal2) only; others get no rows.
create function public.two_factor_status(p_user_ids uuid[])
returns table (user_id uuid, enrolled boolean, last_reset_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    private.has_verified_totp(u.id),
    (select max(r.created_at) from public.two_factor_resets r where r.user_id = u.id)
  from unnest(p_user_ids) as u (id)
  where public.is_platform_admin();
$$;

comment on function public.two_factor_status(uuid[]) is
  'For the super-admin console: whether each person has a confirmed authenticator app and when it was last reset (D54).';

revoke execute on function public.two_factor_status(uuid[]) from public, anon;
grant execute on function public.two_factor_status(uuid[]) to authenticated;
