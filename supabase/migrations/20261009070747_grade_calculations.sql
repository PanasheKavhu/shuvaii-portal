-- Calculations (migration order step 5, second half; DATA_MODEL section 6,
-- GRADING_AND_WEIGHTS section 4; D31). One place computes the numbers the
-- marks grid, the reports and the portal show:
--
--   public.subject_results(class, term)  a result per enrolment and class subject
--   public.class_positions(class, term)  average and position per enrolment
--
-- Both return a whole class in one call (set-based, no per-learner calls).
-- All arithmetic is numeric, never float.
--
-- Rules:
-- * Only class subjects with at least one assessment in the term have a
--   result for it, for every learner of the class who takes the subject.
-- * Subject result = sum of score / max_mark * weight_percent, rounded half
--   up to a whole mark, graded from the bands of the scale of the class's
--   grade level (both ends of a band included).
-- * Incomplete (no mark, no grade, left out of average and position) when
--   the weights do not add up to 100 (weights_not_100), or any assessment is
--   absent, excused or has no mark (absent, excused, missing_mark; Q6), in
--   that order of precedence.
-- * Average = mean of the learner's completed rounded results, one decimal,
--   half up. Position = competition rank on that average (1, 2, 2, 4; Q7)
--   among learners whose enrolment is still current (not transferred or
--   left) and who have an average; class_size counts those current
--   learners. Vacation terms have averages but no positions (Q8).
--
-- Access: security definer, because a subject teacher's RLS view of a class
-- holds only their own subject, which would give wrong averages and
-- positions. Instead each function checks the caller once: subject results
-- for school admin, head and the class teacher (every subject of the
-- class) or the class subject's teacher (that subject); averages and
-- positions for school admin, head and the class teacher only. Anyone else
-- gets no rows. Parents and learners get nothing until Phase 4.

-- Exact rounding --------------------------------------------------------------
-- score * weight is exact; each division is carried to at least 20 decimal
-- places, and the sum is cut to 12 places before rounding, so a result that
-- is exactly 69.5 rounds to 70 even when a division such as 2/3 does not
-- terminate. src/lib/grading/decimal.ts does the same with exact fractions.

create function private.round_half_up(p_value numeric, p_places int default 0)
returns numeric
language sql
immutable
strict
set search_path = ''
as $$
  -- numeric round() rounds halves away from zero, which is half up for the
  -- non-negative values used here.
  select round(round(p_value, 12), p_places);
$$;

-- Subject results for one class and term, for everyone. Callers check access.
create function private.class_term_subject_results(p_class_id uuid, p_term_id uuid)
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
  left join public.grading_bands b
    on j.reason is null
    and b.scale_id = ct.grading_scale_id
    and private.round_half_up(j.raw) between b.min_mark and b.max_mark;
$$;

-- Averages and positions for one class and term, for everyone. Callers check access.
create function private.class_term_positions(p_class_id uuid, p_term_id uuid)
returns table (
  school_id uuid,
  term_id uuid,
  class_id uuid,
  enrolment_id uuid,
  subjects_counted int,
  average numeric,
  "position" int,
  class_size int
)
language sql
stable
security definer
set search_path = public
as $$
  with class_term as (
    select c.id as class_id, c.school_id, t.id as term_id, t.kind <> 'vacation' as ranked
    from public.classes c
    join public.terms t
      on t.id = p_term_id and t.academic_year_id = c.academic_year_id and t.school_id = c.school_id
    where c.id = p_class_id
  ),
  averages as (
    select
      e.id as enrolment_id,
      ct.ranked and e.status not in ('transferred', 'left') as in_class,
      count(r.rounded_mark)::int as subjects_counted,
      private.round_half_up(avg(r.rounded_mark), 1) as average
    from class_term ct
    join public.enrolments e on e.class_id = ct.class_id
    left join private.class_term_subject_results(p_class_id, p_term_id) r
      on r.enrolment_id = e.id and r.result_status = 'complete'
    group by e.id, ct.ranked, e.status
  ),
  ranks as (
    select a.enrolment_id, rank() over (order by a.average desc)::int as pos
    from averages a
    where a.in_class and a.average is not null
  )
  select
    ct.school_id,
    ct.term_id,
    ct.class_id,
    a.enrolment_id,
    a.subjects_counted,
    a.average,
    r.pos,
    case when ct.ranked then (count(*) filter (where a.in_class) over ())::int end
  from averages a
  cross join class_term ct
  left join ranks r on r.enrolment_id = a.enrolment_id;
$$;

revoke execute on function private.round_half_up(numeric, int) from public;
revoke execute on function private.class_term_subject_results(uuid, uuid) from public;
revoke execute on function private.class_term_positions(uuid, uuid) from public;

-- Public entry points -----------------------------------------------------------

create function public.subject_results(p_class_id uuid, p_term_id uuid)
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
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_school_id uuid;
  v_whole_class boolean;
begin
  select c.school_id into v_school_id from public.classes c where c.id = p_class_id;
  if v_school_id is null or auth.uid() is null then
    return;
  end if;
  v_whole_class := private.is_admin_or_head(v_school_id) or public.is_class_teacher(p_class_id);

  return query
  select r.*
  from private.class_term_subject_results(p_class_id, p_term_id) r
  where v_whole_class
     or r.class_subject_id in (select private.my_marks_class_subject_ids());
end;
$$;

comment on function public.subject_results(uuid, uuid) is
  'Subject result per learner and class subject of a class for a term (D31). Admin, head and class teacher see every subject; a subject teacher sees their own.';

create function public.class_positions(p_class_id uuid, p_term_id uuid)
returns table (
  school_id uuid,
  term_id uuid,
  class_id uuid,
  enrolment_id uuid,
  subjects_counted int,
  average numeric,
  "position" int,
  class_size int
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
  select c.school_id into v_school_id from public.classes c where c.id = p_class_id;
  if v_school_id is null or auth.uid() is null
     or not (private.is_admin_or_head(v_school_id) or public.is_class_teacher(p_class_id)) then
    return;
  end if;

  return query
  select p.* from private.class_term_positions(p_class_id, p_term_id) p;
end;
$$;

comment on function public.class_positions(uuid, uuid) is
  'Average of completed subjects and competition-ranked position per learner of a class for a term (D31). No positions for vacation terms. Admin, head and class teacher only.';

revoke execute on function public.subject_results(uuid, uuid) from public, anon;
revoke execute on function public.class_positions(uuid, uuid) from public, anon;
grant execute on function public.subject_results(uuid, uuid) to authenticated;
grant execute on function public.class_positions(uuid, uuid) to authenticated;
