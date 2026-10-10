-- Completion tracking (US-4.8; D36): what is still missing for a term.
--
-- Two set-based functions, one row per class subject and one per class,
-- each a single query for the whole school however many classes it has.
-- School admin and head see every class subject and class of the term's
-- year; a teacher or hod sees the class subjects they teach and the classes
-- they are class teacher of. Learners counted are those who take the
-- subject (enrolment_subjects) and are still in the class, as on the grid
-- (D32).

create function public.completion_class_subjects(p_term_id uuid)
returns table (
  class_subject_id uuid,
  class_id uuid,
  class_name text,
  subject_name text,
  teacher_id uuid,
  teacher_name text,
  learners int,
  assessments int,
  total_weight numeric,
  marks_missing int,
  comments_missing int
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
    select cs.id, cs.class_id, c.name as class_name, s.name as subject_name, s.sort_order,
           cs.teacher_id
    from term
    join public.classes c on c.academic_year_id = term.academic_year_id and c.school_id = term.school_id
    join public.class_subjects cs on cs.class_id = c.id
    join public.subjects s on s.id = cs.subject_id
    where auth.uid() is not null
      and (private.is_admin_or_head(term.school_id)
           or (cs.teacher_id = auth.uid() and private.is_active_teacher(term.school_id, auth.uid())))
  ),
  takers as (
    select es.class_subject_id, es.enrolment_id
    from public.enrolment_subjects es
    join public.enrolments e on e.id = es.enrolment_id
    where es.class_subject_id in (select v.id from visible v)
      and e.status not in ('transferred', 'left', 'graduated')
  ),
  learner_counts as (
    select tk.class_subject_id, count(*) as n from takers tk group by tk.class_subject_id
  ),
  term_assessments as (
    select a.id, a.class_subject_id, a.weight_percent
    from public.assessments a
    where a.term_id = p_term_id
      and a.class_subject_id in (select v.id from visible v)
  ),
  assessment_counts as (
    select ta.class_subject_id, count(*) as n, sum(ta.weight_percent) as weight
    from term_assessments ta
    group by ta.class_subject_id
  ),
  marks_entered as (
    select ta.class_subject_id, count(*) as n
    from public.marks m
    join term_assessments ta on ta.id = m.assessment_id
    join takers tk on tk.enrolment_id = m.enrolment_id and tk.class_subject_id = ta.class_subject_id
    group by ta.class_subject_id
  ),
  comments_done as (
    select sc.class_subject_id, count(*) as n
    from public.subject_comments sc
    join takers tk on tk.enrolment_id = sc.enrolment_id and tk.class_subject_id = sc.class_subject_id
    where sc.term_id = p_term_id
      and sc.status = 'submitted'
    group by sc.class_subject_id
  )
  select
    v.id,
    v.class_id,
    v.class_name,
    v.subject_name,
    v.teacher_id,
    p.full_name,
    coalesce(lc.n, 0)::int,
    coalesce(ac.n, 0)::int,
    coalesce(ac.weight, 0),
    (coalesce(lc.n, 0) * coalesce(ac.n, 0) - coalesce(me.n, 0))::int,
    (coalesce(lc.n, 0) - coalesce(cd.n, 0))::int
  from visible v
  left join public.profiles p on p.id = v.teacher_id
  left join learner_counts lc on lc.class_subject_id = v.id
  left join assessment_counts ac on ac.class_subject_id = v.id
  left join marks_entered me on me.class_subject_id = v.id
  left join comments_done cd on cd.class_subject_id = v.id
  order by v.class_name, v.sort_order, v.subject_name;
$$;

comment on function public.completion_class_subjects(uuid) is
  'Per class subject of a term: learners, assessments, total weight, marks and subject comments still missing. Admin and head see all; a teacher their own class subjects (D36).';

create function public.completion_classes(p_term_id uuid)
returns table (
  class_id uuid,
  class_name text,
  class_teacher_id uuid,
  class_teacher_name text,
  learners int,
  -- Null in a vacation term, which has no class comments (Q8, D34).
  class_comments_missing int
)
language sql
stable
security definer
set search_path = public
as $$
  with term as (
    select t.id, t.academic_year_id, t.school_id, t.kind
    from public.terms t
    where t.id = p_term_id
  ),
  visible as (
    select c.id, c.name, c.class_teacher_id, term.kind
    from term
    join public.classes c on c.academic_year_id = term.academic_year_id and c.school_id = term.school_id
    where auth.uid() is not null
      and (private.is_admin_or_head(term.school_id)
           or (c.class_teacher_id = auth.uid()
               and private.is_active_teacher(term.school_id, auth.uid())))
  ),
  members as (
    select e.class_id, e.id as enrolment_id
    from public.enrolments e
    where e.class_id in (select v.id from visible v)
      and e.status not in ('transferred', 'left', 'graduated')
  ),
  learner_counts as (
    select m.class_id, count(*) as n from members m group by m.class_id
  ),
  comments_done as (
    select m.class_id, count(*) as n
    from public.class_comments cc
    join members m on m.enrolment_id = cc.enrolment_id
    where cc.term_id = p_term_id
      and cc.status = 'submitted'
    group by m.class_id
  )
  select
    v.id,
    v.name,
    v.class_teacher_id,
    p.full_name,
    coalesce(lc.n, 0)::int,
    case when v.kind = 'vacation' then null
         else (coalesce(lc.n, 0) - coalesce(cd.n, 0))::int end
  from visible v
  left join public.profiles p on p.id = v.class_teacher_id
  left join learner_counts lc on lc.class_id = v.id
  left join comments_done cd on cd.class_id = v.id
  order by v.name;
$$;

comment on function public.completion_classes(uuid) is
  'Per class of a term: learners still in the class and class comments still missing (null in a vacation term). Admin and head see all; a teacher the classes they are class teacher of (D36).';

revoke execute on function public.completion_class_subjects(uuid) from public, anon;
revoke execute on function public.completion_classes(uuid) from public, anon;
grant execute on function public.completion_class_subjects(uuid) to authenticated;
grant execute on function public.completion_classes(uuid) to authenticated;
