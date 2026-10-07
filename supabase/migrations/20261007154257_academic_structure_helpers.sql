-- Enums and helpers shared by the academic structure tables (migration
-- order step 3 in docs/DATA_MODEL.md): grading_scales, grading_bands,
-- grade_levels, academic_years, terms, classes, subjects, class_subjects.
--
-- Access rule for all of them (D20): staff of the school (school_admin, head,
-- hod, teacher) read; only that school's school_admin writes. Parents and
-- learners get no direct read: what they need reaches them through published
-- report snapshots.

create type public.level_stage as enum ('ecd', 'primary', 'o_level', 'a_level');
create type public.term_kind as enum ('term', 'vacation', 'mock');
create type public.term_status as enum ('planned', 'open', 'locked', 'closed');

create function public.is_staff(p_school_id uuid)
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
  );
$$;

comment on function public.is_staff(uuid) is
  'Whether the current user is active staff (school_admin, head, hod or teacher) of this school.';

grant execute on function public.is_staff(uuid) to anon, authenticated;

-- Whether a person may be given teaching work (class teacher, class subject
-- teacher) in a school: an active `teacher` or `hod` membership there. Heads
-- of department teach too (D20). Security definer because the caller (a
-- school admin) is checking someone else's membership.
create function private.is_active_teacher(p_school_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = p_user_id
      and school_id = p_school_id
      and role in ('teacher', 'hod')
      and status = 'active'
  );
$$;

revoke execute on function private.is_active_teacher(uuid, uuid) from public;
grant execute on function private.is_active_teacher(uuid, uuid) to authenticated;

-- A row never moves to another school. Composite foreign keys already keep a
-- child in its parent's school; this stops an admin of two schools moving a
-- whole tree, and makes the rule explicit.
create function private.keep_school_id()
returns trigger
language plpgsql
as $$
begin
  if new.school_id is distinct from old.school_id then
    raise exception 'a row''s school cannot change';
  end if;
  return new;
end;
$$;
