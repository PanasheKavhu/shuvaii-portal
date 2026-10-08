-- Phase 2 review fixes (D28).
--
-- 1. Leavers lose their login: when a learner's status leaves 'active',
--    their learner membership in that school is disabled, and it comes back
--    if they return. Sign in also checks the learner's status (server).
-- 2. redeem_parent_invite() no longer re-activates a parent membership the
--    school disabled: it refuses with 'membership_disabled'.
-- 3. Guardians, guardian links and enrolments are audited like learners, so
--    unlinking a parent (the one hard delete on people data) leaves a record
--    of who did it, when, and the link as it was.

-- 1. Leavers ---------------------------------------------------------------------------

create function private.sync_learner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null or new.status is not distinct from old.status then
    return null;
  end if;
  if new.status <> 'active' then
    update public.memberships
    set status = 'disabled'
    where school_id = new.school_id and user_id = new.user_id and role = 'learner'
      and status <> 'disabled';
  elsif old.status <> 'active' then
    update public.memberships
    set status = 'active'
    where school_id = new.school_id and user_id = new.user_id and role = 'learner'
      and status = 'disabled';
  end if;
  return null;
end;
$$;

comment on function private.sync_learner_membership() is
  'Disables a learner''s login membership when they leave (status not active) and restores it when they return (D28).';

create trigger learners_sync_membership
  after update of status on public.learners
  for each row execute function private.sync_learner_membership();

-- 2. Parent codes do not undo a school's decision --------------------------------------

create or replace function public.redeem_parent_invite(p_code_hash text)
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

  update public.invites set accepted_at = now(), accepted_by = auth.uid() where id = i.id;

  insert into public.audit_log (school_id, actor_id, table_name, row_id, action, event, new_data)
  values (
    i.school_id, auth.uid(), 'invites', i.id, 'event', 'parent_invite_accepted',
    jsonb_build_object('guardian_id', g.id, 'membership_id', member_id)
  );

  return i.school_id;
end;
$$;

-- 3. Audit -------------------------------------------------------------------------------

create trigger guardians_audit
  after insert or update or delete on public.guardians
  for each row execute function private.audit_row_change();

create trigger guardian_links_audit
  after insert or update or delete on public.guardian_links
  for each row execute function private.audit_row_change();

create trigger enrolments_audit
  after insert or update or delete on public.enrolments
  for each row execute function private.audit_row_change();

-- 4. Primary guardian in one step ------------------------------------------------------------
--
-- Clearing the old primary and setting the new one in one call, so a failure
-- between them cannot leave a learner with no primary guardian. Security
-- invoker: RLS decides who may write the links.

create function public.set_primary_guardian(p_link_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  learner uuid;
begin
  select learner_id into learner from public.guardian_links where id = p_link_id;
  if learner is null then
    raise exception 'guardian link not found' using errcode = 'P0002';
  end if;
  update public.guardian_links set is_primary = false
  where learner_id = learner and id <> p_link_id and is_primary;
  update public.guardian_links set is_primary = true where id = p_link_id;
  if not found then
    raise exception 'guardian link not found' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.set_primary_guardian(uuid) is
  'Makes this link its learner''s only primary guardian, in one step (D28). RLS applies.';

revoke execute on function public.set_primary_guardian(uuid) from public, anon;
grant execute on function public.set_primary_guardian(uuid) to authenticated;

-- 5. Large imports within the statement timeout ------------------------------------------
--
-- A 1,000-learner file ran past the API's 8-second statement timeout: each
-- of its ~8,000 row inserts re-ran the RLS helper functions. The function
-- already checks the caller is the school's admin or head before writing,
-- and checks every guardian and class id belongs to that school, so it now
-- runs as its owner and skips the per-row policy checks. Triggers (audit,
-- same-class subject checks) still run for every row.

alter function public.import_learners(uuid, jsonb, jsonb) security definer;
