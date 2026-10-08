-- Parent and learner sign in (SPEC US-1.2, US-1.3; docs/DECISIONS.md D7, D25, D26).
--
-- 1. invites: one-time parent codes (D7). A school admin creates one for a
--    guardian through create_parent_invite(); the plain code is shown to the
--    admin once and only its SHA-256 hash is stored. Whoever holds the code
--    can see a short preview (parent_invite_preview(), callable signed out)
--    and claim it once (redeem_parent_invite()), which links their account to
--    the guardian record, and so to every child linked to that guardian, and
--    gives them an active parent membership. Nobody writes the table
--    directly; school admin and head read it.
-- 2. Login links: learners.user_id and guardians.user_id can no longer be
--    written through the Data API. They change only through
--    redeem_parent_invite() and link_learner_login(), so an admin cannot
--    point a learner record at someone else's account and then reset that
--    account's PIN (D26).
-- 3. link_learner_login(): records a learner's own account (US-1.2) after
--    the server has made or reset it with the service role.
-- 4. sign_in_schools() and my_children(): the school list on the learner
--    sign-in form, and the parent placeholder page's list of linked children.

-- invites -------------------------------------------------------------------

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  role public.app_role not null,
  email text,
  phone text,
  guardian_id uuid,
  learner_id uuid,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  foreign key (guardian_id, school_id) references public.guardians (id, school_id),
  foreign key (learner_id, school_id) references public.learners (id, school_id),
  -- Staff are invited through Supabase Auth (D14) and learners get a PIN
  -- (D26), so for now every invite is a parent's, for one guardian record.
  constraint invites_parent_only check (role = 'parent' and guardian_id is not null),
  constraint invites_accepted_together check ((accepted_at is null) = (accepted_by is null))
);

comment on table public.invites is
  'One-time parent invite codes (US-1.3, D7). Only the code''s SHA-256 hash is stored. Written by create_parent_invite() and redeem_parent_invite() only.';

create index invites_school_id_idx on public.invites (school_id);
create index invites_guardian_id_idx on public.invites (guardian_id);

create trigger invites_keep_school_id before update on public.invites
  for each row execute function private.keep_school_id();

alter table public.invites enable row level security;

create policy invites_select on public.invites
  for select to authenticated
  using (private.is_admin_or_head(school_id));

-- No insert, update or delete policy, and no table writes for API roles:
-- the functions below are the only writers.
revoke insert, update, delete, truncate on public.invites from anon, authenticated;

-- Login links on learners and guardians (D26) ---------------------------------

revoke insert, update on public.learners from anon, authenticated;
grant insert (
  id, school_id, learner_number, first_name, last_name, date_of_birth, sex, status,
  admission_date
) on public.learners to authenticated;
grant update (
  learner_number, first_name, last_name, date_of_birth, sex, status, admission_date
) on public.learners to authenticated;

revoke insert, update on public.guardians from anon, authenticated;
grant insert (id, school_id, full_name, phone, email) on public.guardians to authenticated;
grant update (full_name, phone, email) on public.guardians to authenticated;

-- memberships: redeeming a parent invite gives the caller a membership of
-- their own, which guard_membership_insert() otherwise refuses. It allows
-- it only while redeem_parent_invite() has set a transaction-local flag; API
-- callers cannot set settings themselves.
create or replace function private.guard_membership_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and new.user_id = auth.uid()
     and not public.is_platform_admin()
     and coalesce(current_setting('sp.redeeming_invite', true), '') <> 'on' then
    raise exception 'members cannot grant themselves a membership';
  end if;
  return new;
end;
$$;

-- Parent invites ------------------------------------------------------------

-- How long a parent code stays valid (D25).
create function private.parent_invite_lifetime()
returns interval
language sql
immutable
as $$ select interval '14 days' $$;

-- A school admin makes a new code for one guardian. Any older code for the
-- same guardian that is still waiting stops working, so only the latest
-- slip handed out is valid. The server makes the code and passes its hash.
create function public.create_parent_invite(p_guardian_id uuid, p_code_hash text)
returns table (invite_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.guardians;
  new_id uuid;
  new_expiry timestamptz := now() + private.parent_invite_lifetime();
begin
  select * into g from public.guardians where id = p_guardian_id;
  if not found or not public.has_role(g.school_id, 'school_admin') then
    raise exception 'only the school admin can invite a parent' using errcode = '42501';
  end if;
  if g.user_id is not null then
    raise exception 'this guardian already has an account' using errcode = 'P0001';
  end if;

  update public.invites i
  set expires_at = now()
  where i.guardian_id = g.id and i.accepted_at is null and i.expires_at > now();

  insert into public.invites (school_id, role, email, phone, guardian_id, code_hash, expires_at, created_by)
  values (g.school_id, 'parent', g.email, g.phone, g.id, p_code_hash, new_expiry, auth.uid())
  returning id into new_id;

  insert into public.audit_log (school_id, actor_id, table_name, row_id, action, event, new_data)
  values (
    g.school_id, auth.uid(), 'invites', new_id, 'event', 'parent_invite_created',
    jsonb_build_object('guardian_id', g.id, 'expires_at', new_expiry)
  );

  return query select new_id, new_expiry;
end;
$$;

comment on function public.create_parent_invite(uuid, text) is
  'School admin: a new one-time parent code for a guardian (US-1.3). Older waiting codes for that guardian stop working.';

revoke execute on function public.create_parent_invite(uuid, text) from public, anon;
grant execute on function public.create_parent_invite(uuid, text) to authenticated;

-- What the holder of a code may see before claiming it, signed out or in:
-- whether it is usable and, only if it is, the school, the guardian's name
-- and email (to fill in the form) and how many children it links.
create function public.parent_invite_preview(p_code_hash text)
returns table (
  status text,
  school_name text,
  guardian_name text,
  guardian_email text,
  children integer
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
    return query select 'unknown'::text, null::text, null::text, null::text, null::integer;
  elsif i.accepted_at is not null then
    return query select 'used'::text, null::text, null::text, null::text, null::integer;
  elsif i.expires_at <= now() then
    return query select 'expired'::text, null::text, null::text, null::text, null::integer;
  else
    return query
      select 'valid'::text, s.name, g.full_name, g.email,
             (select count(*)::integer from public.guardian_links gl where gl.guardian_id = g.id)
      from public.guardians g
      join public.schools s on s.id = g.school_id
      where g.id = i.guardian_id;
  end if;
end;
$$;

comment on function public.parent_invite_preview(text) is
  'Status of a parent code (valid, used, expired, unknown) and, when valid, the school and guardian it is for.';

revoke execute on function public.parent_invite_preview(text) from public;
grant execute on function public.parent_invite_preview(text) to anon, authenticated;

-- The signed-in caller claims a code: their account becomes the guardian's
-- login and they get an active parent membership in that school. A code
-- works once; a guardian already linked to someone else stays theirs.
create function public.redeem_parent_invite(p_code_hash text)
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

  perform set_config('sp.redeeming_invite', 'on', true);
  insert into public.memberships (school_id, user_id, role, status)
  values (i.school_id, auth.uid(), 'parent', 'active')
  on conflict (school_id, user_id, role) do update set status = 'active'
  returning id into member_id;
  perform set_config('sp.redeeming_invite', '', true);

  update public.invites set accepted_at = now(), accepted_by = auth.uid() where id = i.id;

  insert into public.audit_log (school_id, actor_id, table_name, row_id, action, event, new_data)
  values (
    i.school_id, auth.uid(), 'invites', i.id, 'event', 'parent_invite_accepted',
    jsonb_build_object('guardian_id', g.id, 'membership_id', member_id)
  );

  return i.school_id;
end;
$$;

comment on function public.redeem_parent_invite(text) is
  'Signed-in caller claims a parent code: links them to the guardian and gives them an active parent membership. Returns the school id.';

revoke execute on function public.redeem_parent_invite(text) from public, anon;
grant execute on function public.redeem_parent_invite(text) to authenticated;

-- Learner logins ------------------------------------------------------------

-- Records a learner's own account after the server made it (or reset its
-- PIN) with the service role (D26). The account must be one the server made
-- for this learner: its app_metadata, which only the service role can set,
-- names the learner. Gives the account an active learner membership and
-- logs the PIN being set.
create function public.link_learner_login(p_learner_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.learners;
begin
  select * into l from public.learners where id = p_learner_id for update;
  if not found or not public.has_role(l.school_id, 'school_admin') then
    raise exception 'only the school admin can set a learner''s PIN' using errcode = '42501';
  end if;
  if l.user_id is not null and l.user_id <> p_user_id then
    raise exception 'this learner already has another account' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = p_user_id and u.raw_app_meta_data ->> 'learner_id' = p_learner_id::text
  ) then
    raise exception 'that account is not this learner''s' using errcode = 'P0001';
  end if;

  if l.user_id is null then
    update public.learners set user_id = p_user_id where id = l.id;
  end if;

  insert into public.memberships (school_id, user_id, role, status)
  values (l.school_id, p_user_id, 'learner', 'active')
  on conflict (school_id, user_id, role) do update set status = 'active';

  insert into public.audit_log (school_id, actor_id, table_name, row_id, action, event, new_data)
  values (
    l.school_id, auth.uid(), 'learners', l.id, 'event', 'learner_pin_set',
    jsonb_build_object('user_id', p_user_id)
  );
end;
$$;

comment on function public.link_learner_login(uuid, uuid) is
  'School admin: records the learner''s own account (made by the server for this learner) and logs the PIN being set.';

revoke execute on function public.link_learner_login(uuid, uuid) from public, anon;
grant execute on function public.link_learner_login(uuid, uuid) to authenticated;

-- Lookups for the sign-in pages -----------------------------------------------

-- Active schools for the learner sign-in form: names and slugs only.
create function public.sign_in_schools()
returns table (id uuid, name text, slug text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.slug from public.schools s where s.status = 'active' order by s.name;
$$;

revoke execute on function public.sign_in_schools() from public;
grant execute on function public.sign_in_schools() to anon, authenticated;

-- The caller's children in one school, through the guardian records linked
-- to their account. Names and learner numbers only; their reports come with
-- the parent portal (Phase 4).
create function public.my_children(p_school_id uuid)
returns table (learner_id uuid, first_name text, last_name text, learner_number text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct l.id, l.first_name, l.last_name, l.learner_number
  from public.guardians g
  join public.guardian_links gl on gl.guardian_id = g.id
  join public.learners l on l.id = gl.learner_id
  where g.user_id = auth.uid()
    and g.school_id = p_school_id
    and auth.uid() is not null
    and public.has_role(p_school_id, 'parent')
  order by l.first_name, l.last_name, l.learner_number;
$$;

revoke execute on function public.my_children(uuid) from public, anon;
grant execute on function public.my_children(uuid) to authenticated;
