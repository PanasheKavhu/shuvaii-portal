-- Phase 3 gate review fixes (D37).
--
-- 1. Marks, maximums and weights keep at most 2 decimal places, as the
--    screens and uploads allow, so the TypeScript and SQL results agree.
-- 2. An assessment name is used once per class subject and term, so a
--    double tap cannot add the usual set twice and templates read back.
-- 3. One band per result: a grade level may point at a scale that is not
--    the default, and so not checked for overlaps (D21); an overlap used to
--    give two result rows and count the subject twice in the average.
-- 4. Who entered a mark, who wrote a class comment, and a subject comment's
--    teacher and signature time are set by the database only. A signed-in
--    update that leaves the content alone keeps them as they were.
-- 5. A learner who has transferred, left or graduated keeps their marks and
--    comments, but signed-in users can no longer add or change them (the
--    screens already refused, D32; now the API does too).
-- 6. The term lock reason (term locked, term closed, deadline passed) is
--    worked out in one place, private.term_lock_reason().

-- 1. Decimal places ------------------------------------------------------------------

alter table public.marks
  add constraint marks_score_two_decimals check (score = round(score, 2));
alter table public.assessments
  add constraint assessments_max_mark_two_decimals check (max_mark = round(max_mark, 2)),
  add constraint assessments_weight_two_decimals check (weight_percent = round(weight_percent, 2));

-- 2. Assessment names ----------------------------------------------------------------

create unique index assessments_term_class_subject_name_key
  on public.assessments (term_id, class_subject_id, lower(btrim(name)));

-- 3. One band per result ----------------------------------------------------------------

-- As in 20261009070747_grade_calculations.sql, with the band picked by a
-- lateral join (the highest band that covers the mark) instead of a plain
-- join that returned a row per matching band.
create or replace function private.class_term_subject_results(p_class_id uuid, p_term_id uuid)
returns table (
  school_id uuid,
  term_id uuid,
  class_id uuid,
  enrolment_id uuid,
  class_subject_id uuid,
  subject_id uuid,
  weighted_percent numeric,
  rounded_mark int,
  grade text,
  grade_remark text,
  result_status text,
  incomplete_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  with class_term as (
    select c.id as class_id, c.school_id, t.id as term_id, gl.grading_scale_id
    from public.classes c
    join public.terms t
      on t.id = p_term_id and t.academic_year_id = c.academic_year_id and t.school_id = c.school_id
    join public.grade_levels gl on gl.id = c.grade_level_id
    where c.id = p_class_id
  ),
  term_subjects as (
    select cs.id as class_subject_id, cs.subject_id, sum(a.weight_percent) as total_weight
    from class_term ct
    join public.class_subjects cs on cs.class_id = ct.class_id
    join public.assessments a on a.class_subject_id = cs.id and a.term_id = ct.term_id
    group by cs.id, cs.subject_id
  ),
  takes as (
    select e.id as enrolment_id, ts.class_subject_id, ts.subject_id, ts.total_weight
    from class_term ct
    join public.enrolments e on e.class_id = ct.class_id
    join public.enrolment_subjects es on es.enrolment_id = e.id
    join term_subjects ts on ts.class_subject_id = es.class_subject_id
  ),
  sums as (
    select
      tk.enrolment_id,
      tk.class_subject_id,
      tk.subject_id,
      tk.total_weight,
      count(*) filter (where m.status = 'absent') as absent,
      count(*) filter (where m.status = 'excused') as excused,
      count(*) filter (where m.id is null) as missing,
      sum(round(m.score * a.weight_percent, 20) / a.max_mark)
        filter (where m.status = 'present') as raw
    from takes tk
    join class_term ct on true
    join public.assessments a
      on a.class_subject_id = tk.class_subject_id and a.term_id = ct.term_id
    left join public.marks m
      on m.assessment_id = a.id and m.enrolment_id = tk.enrolment_id
    group by tk.enrolment_id, tk.class_subject_id, tk.subject_id, tk.total_weight
  ),
  judged as (
    select
      s.*,
      case
        when s.total_weight <> 100 then 'weights_not_100'
        when s.absent > 0 then 'absent'
        when s.excused > 0 then 'excused'
        when s.missing > 0 then 'missing_mark'
      end as reason
    from sums s
  )
  select
    ct.school_id,
    ct.term_id,
    ct.class_id,
    j.enrolment_id,
    j.class_subject_id,
    j.subject_id,
    case when j.reason is null then private.round_half_up(j.raw, 2) end,
    case when j.reason is null then private.round_half_up(j.raw)::int end,
    b.grade,
    b.remark,
    case when j.reason is null then 'complete' else 'incomplete' end,
    j.reason
  from judged j
  cross join class_term ct
  left join lateral (
    select gb.grade, gb.remark
    from public.grading_bands gb
    where j.reason is null
      and gb.scale_id = ct.grading_scale_id
      and private.round_half_up(j.raw) between gb.min_mark and gb.max_mark
    order by gb.min_mark desc, gb.max_mark desc
    limit 1
  ) b on true;
$$;

-- 4 and 5. Authorship and leavers -------------------------------------------------------

-- Runs after each table's own check trigger (triggers fire in name order:
-- *_check, then *_protect). Calls with no user (the seed, server jobs) are
-- trusted, as in the check triggers.
create function private.protect_marks_and_comments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_table_name = 'marks' then
    v_changed := tg_op = 'INSERT' or (new.score, new.status) is distinct from (old.score, old.status);
  else
    v_changed := tg_op = 'INSERT' or (new.comment, new.status) is distinct from (old.comment, old.status);
  end if;

  if not v_changed then
    -- Nothing a person wrote has changed, so nor has who wrote it or when.
    if tg_table_name = 'marks' then
      new.entered_by := old.entered_by;
    elsif tg_table_name = 'subject_comments' then
      new.teacher_id := old.teacher_id;
      new.signed_at := old.signed_at;
    else
      new.author_id := old.author_id;
    end if;
    return new;
  end if;

  if exists (
    select 1 from public.enrolments e
    where e.id = new.enrolment_id
      and e.status in ('transferred', 'left', 'graduated')
  ) then
    raise exception 'this learner has left the class, so their marks and comments are read-only'
      using errcode = 'check_violation';
  end if;

  if tg_table_name = 'subject_comments' then
    -- The class subject's teacher signs it; with no teacher yet, whoever wrote it.
    new.teacher_id := coalesce(
      (select cs.teacher_id from public.class_subjects cs where cs.id = new.class_subject_id),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

revoke execute on function private.protect_marks_and_comments() from public;

create trigger marks_protect
  before insert or update on public.marks
  for each row execute function private.protect_marks_and_comments();
create trigger subject_comments_protect
  before insert or update on public.subject_comments
  for each row execute function private.protect_marks_and_comments();
create trigger class_comments_protect
  before insert or update on public.class_comments
  for each row execute function private.protect_marks_and_comments();

-- 6. One term lock reason -----------------------------------------------------------------

-- Why teachers are locked out of a term's marks and comments: term_locked,
-- term_closed, deadline_passed (a date in the school's time zone), or null.
create function private.term_lock_reason(p_term_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when t.status = 'locked' then 'term_locked'
      when t.status = 'closed' then 'term_closed'
      when t.marks_deadline is not null
           and (now() at time zone s.timezone)::date > t.marks_deadline then 'deadline_passed'
    end
  from public.terms t
  join public.schools s on s.id = t.school_id
  where t.id = p_term_id;
$$;

revoke execute on function private.term_lock_reason(uuid) from public;
grant execute on function private.term_lock_reason(uuid) to authenticated;

create or replace function private.marks_are_locked(p_term_id uuid, p_class_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.term_lock_reason(p_term_id) is not null
    and not private.class_subject_is_unlocked(p_term_id, p_class_subject_id);
$$;

create or replace function public.marks_lock(p_class_subject_id uuid, p_term_id uuid)
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
    private.term_lock_reason(t.id),
    t.marks_deadline,
    u.reason,
    u.unlocked_at,
    p.full_name
  from public.terms t
  left join public.class_subject_unlocks u
    on u.term_id = t.id and u.class_subject_id = p_class_subject_id and u.relocked_at is null
  left join public.profiles p on p.id = u.unlocked_by
  where t.id = p_term_id
    and t.school_id = v_school_id;
end;
$$;

create or replace function public.class_comment_lock(p_class_id uuid, p_term_id uuid)
returns table (teachers_locked boolean, lock_reason text, marks_deadline date)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_school_id uuid;
begin
  select c.school_id into v_school_id from public.classes c where c.id = p_class_id;
  if v_school_id is null or auth.uid() is null
     or not (private.is_admin_or_head(v_school_id) or public.is_class_teacher(p_class_id)) then
    return;
  end if;

  return query
  select
    private.term_marks_are_locked(t.id),
    private.term_lock_reason(t.id),
    t.marks_deadline
  from public.terms t
  where t.id = p_term_id
    and t.school_id = v_school_id;
end;
$$;
