-- Reads for the marks entry screens (US-4.1, US-4.2, US-4.5; D32). No new
-- tables: three functions that answer what the screens need in one call
-- each, with the same access rules as the marks themselves (D30).
--
--   public.marks_progress(term)                 class subjects with marks progress
--   public.marks_lock(class_subject, term)      whether teachers are locked out, and why
--   public.marks_unlockers(school)              who a locked-out teacher should ask
--
-- "Still in the class" means an enrolment that is not transferred, left or
-- graduated; leavers' marks stay but are not counted as outstanding work.

-- Class subjects of the term's year the caller may enter or see marks for
-- (school admin and head: all; teacher or hod: those they teach or are
-- class teacher of, D30), with how many learners still in the class take
-- each, how many assessments it has this term and their total weight, and
-- how many of those learners' marks are entered (a score, absent or
-- excused). Security definer so the counts come from one pass instead of
-- re-running the marks policies per row; the caller check is the where
-- clause in `visible`.
create function public.marks_progress(p_term_id uuid)
returns table (
  class_subject_id uuid,
  class_id uuid,
  class_name text,
  subject_id uuid,
  subject_name text,
  teacher_id uuid,
  teacher_name text,
  learners int,
  assessments int,
  total_weight numeric,
  marks_entered int
)
language sql
stable
security definer
set search_path = public
as $$
  with term as (
    select t.id, t.academic_year_id, t.school_id
    from public.terms t
    where t.id = p_term_id
  ),
  visible as (
    select cs.id, cs.class_id, c.name as class_name, cs.subject_id, s.name as subject_name,
           s.sort_order, cs.teacher_id
    from term
    join public.classes c on c.academic_year_id = term.academic_year_id and c.school_id = term.school_id
    join public.class_subjects cs on cs.class_id = c.id
    join public.subjects s on s.id = cs.subject_id
    where auth.uid() is not null
      and (private.is_admin_or_head(term.school_id)
           or cs.id in (select private.my_marks_class_subject_ids()))
  ),
  takers as (
    select es.class_subject_id, es.enrolment_id
    from public.enrolment_subjects es
    join public.enrolments e on e.id = es.enrolment_id
    where es.class_subject_id in (select v.id from visible v)
      and e.status not in ('transferred', 'left', 'graduated')
  ),
  term_assessments as (
    select a.id, a.class_subject_id, a.weight_percent
    from public.assessments a
    where a.term_id = p_term_id
      and a.class_subject_id in (select v.id from visible v)
  ),
  entered as (
    select ta.class_subject_id, count(*) as n
    from public.marks m
    join term_assessments ta on ta.id = m.assessment_id
    join takers tk on tk.enrolment_id = m.enrolment_id and tk.class_subject_id = ta.class_subject_id
    group by ta.class_subject_id
  )
  select
    v.id,
    v.class_id,
    v.class_name,
    v.subject_id,
    v.subject_name,
    v.teacher_id,
    p.full_name,
    (select count(*) from takers tk where tk.class_subject_id = v.id)::int,
    (select count(*) from term_assessments ta where ta.class_subject_id = v.id)::int,
    coalesce((select sum(ta.weight_percent) from term_assessments ta where ta.class_subject_id = v.id), 0),
    coalesce((select en.n from entered en where en.class_subject_id = v.id), 0)::int
  from visible v
  left join public.profiles p on p.id = v.teacher_id
  order by v.class_name, v.sort_order, v.subject_name;
$$;

comment on function public.marks_progress(uuid) is
  'Class subjects of a term the caller may see marks for, with learners, assessments, total weight and marks entered (D32).';

-- Whether teachers are locked out of a class subject's marks for a term
-- (the same rule as the write triggers, private.marks_are_locked()), why
-- (term_locked, term_closed or deadline_passed, null when the term does not
-- lock it), and the open unlock if there is one. One row for school admin,
-- head and anyone who may see the class subject's marks; none otherwise.
-- An assessment's own is_locked is a column the screens read directly.
create function public.marks_lock(p_class_subject_id uuid, p_term_id uuid)
returns table (
  teachers_locked boolean,
  lock_reason text,
  marks_deadline date,
  unlock_reason text,
  unlocked_at timestamptz,
  unlocked_by_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_school_id uuid;
begin
  select cs.school_id into v_school_id from public.class_subjects cs where cs.id = p_class_subject_id;
  if v_school_id is null or auth.uid() is null
     or not (private.is_admin_or_head(v_school_id)
             or p_class_subject_id in (select private.my_marks_class_subject_ids())) then
    return;
  end if;

  return query
  select
    private.marks_are_locked(t.id, p_class_subject_id),
    case
      when t.status = 'locked' then 'term_locked'
      when t.status = 'closed' then 'term_closed'
      when t.marks_deadline is not null
           and (now() at time zone s.timezone)::date > t.marks_deadline then 'deadline_passed'
    end,
    t.marks_deadline,
    u.reason,
    u.unlocked_at,
    p.full_name
  from public.terms t
  join public.schools s on s.id = t.school_id
  left join public.class_subject_unlocks u
    on u.term_id = t.id and u.class_subject_id = p_class_subject_id and u.relocked_at is null
  left join public.profiles p on p.id = u.unlocked_by
  where t.id = p_term_id
    and t.school_id = v_school_id;
end;
$$;

comment on function public.marks_lock(uuid, uuid) is
  'Whether teachers are locked out of a class subject''s marks for a term, why, and any open unlock (D32).';

-- The school's active school admins and heads, by name, so a locked-out
-- teacher knows who can unlock their marks. Only for the school's active
-- staff; memberships themselves stay readable by admin and head only.
create function public.marks_unlockers(p_school_id uuid)
returns table (full_name text, role public.app_role)
language sql
stable
security definer
set search_path = public
as $$
  select distinct coalesce(p.full_name, p.email), m.role
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  where m.school_id = p_school_id
    and m.role in ('school_admin', 'head')
    and m.status = 'active'
    and public.is_staff(p_school_id)
  order by m.role, 1;
$$;

comment on function public.marks_unlockers(uuid) is
  'Names of the school''s active school admins and heads, for its staff (D32).';

revoke execute on function public.marks_progress(uuid) from public, anon;
revoke execute on function public.marks_lock(uuid, uuid) from public, anon;
revoke execute on function public.marks_unlockers(uuid) from public, anon;
grant execute on function public.marks_progress(uuid) to authenticated;
grant execute on function public.marks_lock(uuid, uuid) to authenticated;
grant execute on function public.marks_unlockers(uuid) to authenticated;
