-- Staff roles need the person's own say (Phase 2 review, D27).
--
-- 1. A new staff role starts `invited` for everyone except someone who
--    already has an active role in that school; the person accepts on
--    /welcome. my_pending_invites() names the schools and roles waiting
--    (an invitee cannot read the school yet), and decline_my_invites()
--    lets them say no, which disables those memberships.
-- 2. update_staff_profile(): a school admin may only edit the name and
--    phone of someone whose memberships are all in that school. A teacher
--    who also works elsewhere, or a platform admin, edits their own.
-- 3. school_staff(): shows a phone number only for someone with an active
--    role in the school, or whose memberships are all in it, so adding an
--    address does not reveal another school's colleague's number.

-- 1. Pending invites -----------------------------------------------------------------

create function public.my_pending_invites()
returns table (school_name text, role public.app_role)
language sql
stable
security definer
set search_path = public
as $$
  select s.name, m.role
  from public.memberships m
  join public.schools s on s.id = m.school_id
  where m.user_id = auth.uid()
    and m.status = 'invited'
  order by s.name, m.role;
$$;

comment on function public.my_pending_invites() is
  'The calling user''s invited memberships, with school names, for the accept page (D27).';

revoke execute on function public.my_pending_invites() from public, anon;
grant execute on function public.my_pending_invites() to authenticated;

create function public.decline_my_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  declined integer;
begin
  if auth.uid() is null then
    return 0;
  end if;

  update public.memberships
  set status = 'disabled'
  where user_id = auth.uid()
    and status = 'invited';

  get diagnostics declined = row_count;
  return declined;
end;
$$;

comment on function public.decline_my_invites() is
  'Turns down the calling user''s invited memberships (they become disabled). Returns how many (D27).';

revoke execute on function public.decline_my_invites() from public, anon;
grant execute on function public.decline_my_invites() to authenticated;

-- 2. Editing a staff member's profile -------------------------------------------------

create or replace function public.update_staff_profile(
  p_school_id uuid,
  p_user_id uuid,
  p_full_name text,
  p_phone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  before public.profiles;
  after public.profiles;
begin
  if not public.has_role(p_school_id, 'school_admin') then
    raise exception 'only the school admin can edit staff details' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.memberships
    where school_id = p_school_id
      and user_id = p_user_id
      and role in ('school_admin', 'head', 'hod', 'teacher')
  ) then
    raise exception 'that person is not on this school''s staff' using errcode = '42501';
  end if;
  -- Profiles are global: only someone who belongs to this school alone is
  -- the school's to edit.
  if exists (
    select 1 from public.memberships
    where user_id = p_user_id
      and school_id <> p_school_id
  ) or exists (select 1 from public.platform_admins where user_id = p_user_id) then
    raise exception 'staff_shared' using errcode = '42501',
      hint = 'This person also belongs to another school; they edit their own details.';
  end if;
  if length(trim(coalesce(p_full_name, ''))) not between 2 and 120 then
    raise exception 'enter the full name' using errcode = 'check_violation';
  end if;
  if p_phone is not null and p_phone !~ '^\+?\d{7,15}$' then
    raise exception 'enter a valid phone number' using errcode = 'check_violation';
  end if;

  select * into before from public.profiles where id = p_user_id;
  update public.profiles
  set full_name = trim(p_full_name), phone = p_phone
  where id = p_user_id
  returning * into after;

  insert into public.audit_log (school_id, actor_id, table_name, row_id, action, event, old_data, new_data)
  values (
    p_school_id, auth.uid(), 'profiles', p_user_id, 'event', 'staff_details_changed',
    jsonb_build_object('full_name', before.full_name, 'phone', before.phone),
    jsonb_build_object('full_name', after.full_name, 'phone', after.phone)
  );
end;
$$;

-- 3. Staff list ------------------------------------------------------------------------

create or replace function public.school_staff(p_school_id uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  full_name text,
  email text,
  phone text,
  role public.app_role,
  status public.membership_status,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.user_id,
    p.full_name,
    p.email,
    case
      when exists (
        select 1 from public.memberships here
        where here.user_id = m.user_id and here.school_id = p_school_id and here.status = 'active'
      ) or not exists (
        select 1 from public.memberships elsewhere
        where elsewhere.user_id = m.user_id and elsewhere.school_id <> p_school_id
      ) then p.phone
    end,
    m.role,
    m.status,
    m.created_at
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  where m.school_id = p_school_id
    and m.role in ('school_admin', 'head', 'hod', 'teacher')
    and private.is_admin_or_head(p_school_id)
  order by p.full_name, p.email, m.role;
$$;
