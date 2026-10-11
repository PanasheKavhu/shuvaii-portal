-- Report workflow (US-6.1 drafts, US-6.2 submit, approve and return, US-6.3
-- publish, US-5.4 the head's comment, US-6.7 vacation reports; D44).
--
-- Every change to a report now goes through the functions below; signed-in
-- users have no insert or update privilege on `reports` any more. Each
-- function checks the caller's role and the reports' current state, and the
-- `reports_check` trigger still enforces the state machine and who may make
-- each change underneath, for every writer.
--
--   report_gaps(class, term)              what each learner still lacks
--   generate_report_drafts(class, term)   class teacher: one draft per learner
--   submit_class_reports(class, term)     class teacher: drafts to submitted
--   return_class_reports(class, term, note)  head: submitted back to draft
--   set_report_head_comment(report, text) head: the head's comment
--   set_report_result_not_available(report, class subject, on)
--                                         head: the explicit "result not
--                                         available" line (REPORT_LAYOUT 4)
--   approve_class_reports(class, term)    head: submitted to approved
--   publish_class_reports(class, term)    head: approved to published, with
--                                         the frozen snapshot and codes
--   report_class_overview(term)           head and admin: counts per class
--
-- "Head" is the `head` role, which covers the head, deputy and senior
-- master (Q11, Q16, D39). A hod does not approve yet (D44).
--
-- A draft's `snapshot` holds what the report says (subject lines, average,
-- position, comments) as generated from subject_results(),
-- class_positions() and the comments; regenerating refreshes it. The head
-- reviews exactly that, and publishing completes it with the template,
-- grading key, branding, head's comment and codes, then freezes it.
-- Published reports have no PDF until US-6.4 (`pdf_path` stays null and the
-- server sets it once, later).

-- Codes are assigned when a report is published, not when it is drafted --------

alter table public.reports
  alter column reference_code drop not null,
  alter column verification_code drop not null,
  drop constraint reports_published_is_complete,
  add constraint reports_published_is_complete check (
    status not in ('published', 'withdrawn')
    or (snapshot is not null and reference_code is not null and verification_code is not null)
  );

-- The head's comment shares its line with the signature and stamp
-- (REPORT_LAYOUT section 3): three lines of about 65 characters. Mirrored in
-- src/lib/reports/workflow.ts.
alter table public.reports
  drop constraint reports_head_comment_check,
  add constraint reports_head_comment_check check (char_length(head_comment) <= 200);

-- No direct writes from the API: the workflow functions are the only way in.
drop policy reports_insert on public.reports;
drop policy reports_update on public.reports;
revoke insert, update on public.reports from anon, authenticated;

-- The trigger ---------------------------------------------------------------------
--
-- As in 20261011110000_reports.sql, except: the codes are chosen when the
-- report is published and copied into the snapshot with the version and
-- publication time; a published report may get its PDF path once, from the
-- server, and nothing else; and the snapshot changes only while a draft
-- (generation), while submitted (the head's "result not available" lines)
-- or on publishing.

create or replace function private.check_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_term public.terms;
  v_class_id uuid;
  v_is_head boolean;
  v_is_class_teacher boolean;
  v_frozen text[] := array['status', 'withdrawn_reason', 'withdrawn_by', 'withdrawn_at', 'updated_at'];
begin
  if tg_op = 'INSERT' then
    -- Signed in: only the class teacher makes drafts, for their own class
    -- (checked first, so nothing about another class's reports leaks).
    if v_uid is not null
       and new.enrolment_id not in (select private.my_class_teacher_enrolment_ids()) then
      raise exception 'only the class teacher makes a draft report' using errcode = '42501';
    end if;

    select * into v_term from public.terms where id = new.term_id and school_id = new.school_id;
    select e.class_id into v_class_id
    from public.enrolments e
    where e.id = new.enrolment_id and e.school_id = new.school_id
      and e.academic_year_id = v_term.academic_year_id;
    if v_term.id is not null and v_class_id is null
       and exists (select 1 from public.enrolments where id = new.enrolment_id and school_id = new.school_id) then
      raise exception 'the learner is not enrolled in this term''s year'
        using errcode = 'check_violation';
    end if;
    if v_term.id is not null and not exists (
      select 1 from public.report_templates rt
      where rt.id = new.template_id and rt.school_id = new.school_id and rt.term_kind = v_term.kind
    ) and exists (select 1 from public.report_templates where id = new.template_id and school_id = new.school_id) then
      raise exception 'the template is for another kind of term'
        using errcode = 'check_violation';
    end if;

    if new.status <> 'draft' then
      raise exception 'a report starts as a draft' using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from public.reports r
      where r.term_id = new.term_id and r.enrolment_id = new.enrolment_id and r.status <> 'withdrawn'
    ) then
      raise exception 'this learner already has a report for this term; withdraw it before issuing a new version'
        using errcode = 'unique_violation';
    end if;

    select coalesce(max(r.version), 0) + 1 into new.version
    from public.reports r
    where r.term_id = new.term_id and r.enrolment_id = new.enrolment_id;
    new.reference_code := null;
    new.verification_code := null;
    new.created_by := v_uid;
    new.created_at := now();
    new.head_comment := null;
    new.pdf_path := null;
    new.submitted_by := null; new.submitted_at := null;
    new.return_note := null; new.returned_by := null; new.returned_at := null;
    new.approved_by := null; new.approved_at := null;
    new.published_by := null; new.published_at := null;
    new.withdrawn_reason := null; new.withdrawn_by := null; new.withdrawn_at := null;
    return new;
  end if;

  -- UPDATE -----------------------------------------------------------------------

  if old.status = 'withdrawn' then
    raise exception 'a withdrawn report never changes' using errcode = 'check_violation';
  end if;
  if old.status = 'published' then
    -- The server stores the PDF once (US-6.4); nothing else changes but a
    -- withdrawal.
    if v_uid is null and old.pdf_path is null then
      v_frozen := v_frozen || 'pdf_path';
    end if;
    if to_jsonb(new) - v_frozen is distinct from to_jsonb(old) - v_frozen
       or new.status not in ('published', 'withdrawn') then
      raise exception 'a published report cannot change; withdraw it and issue a new version'
        using errcode = 'check_violation';
    end if;
  end if;

  if (new.term_id, new.enrolment_id, new.version, new.created_by, new.created_at)
     is distinct from
     (old.term_id, old.enrolment_id, old.version, old.created_by, old.created_at)
     or (old.reference_code is not null
         and (new.reference_code, new.verification_code)
             is distinct from (old.reference_code, old.verification_code)) then
    raise exception 'a report''s learner, term, version and codes never change'
      using errcode = 'check_violation';
  end if;

  if not (new.status = old.status
          or (old.status, new.status) in (
            ('draft', 'submitted'), ('submitted', 'draft'), ('submitted', 'approved'),
            ('approved', 'published'), ('published', 'withdrawn'))) then
    raise exception 'a report cannot go from % to %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- Stamps and codes are the database's: keep them unless this change sets them.
  new.reference_code := old.reference_code; new.verification_code := old.verification_code;
  new.submitted_by := old.submitted_by; new.submitted_at := old.submitted_at;
  new.returned_by := old.returned_by; new.returned_at := old.returned_at;
  new.approved_by := old.approved_by; new.approved_at := old.approved_at;
  new.published_by := old.published_by; new.published_at := old.published_at;
  new.withdrawn_by := old.withdrawn_by; new.withdrawn_at := old.withdrawn_at;

  if new.template_id is distinct from old.template_id
     or (new.average_percent, new.class_position, new.class_size)
        is distinct from (old.average_percent, old.class_position, old.class_size) then
    if old.status <> 'draft' then
      raise exception 'only a draft report''s template and results can change'
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from public.report_templates rt join public.terms t on t.kind = rt.term_kind
      where rt.id = new.template_id and t.id = new.term_id
    ) then
      raise exception 'the template is for another kind of term'
        using errcode = 'check_violation';
    end if;
  end if;
  if new.snapshot is distinct from old.snapshot
     and not (old.status in ('draft', 'submitted')
              or (old.status = 'approved' and new.status = 'published')) then
    raise exception 'an approved report''s contents change only when it is published'
      using errcode = 'check_violation';
  end if;
  if new.pdf_path is distinct from old.pdf_path and old.status not in ('approved', 'published') then
    raise exception 'the PDF is stored when the report is published'
      using errcode = 'check_violation';
  end if;
  if new.return_note is distinct from old.return_note
     and not (old.status = 'submitted' and new.status = 'draft') then
    raise exception 'a return note is written when the head returns a report'
      using errcode = 'check_violation';
  end if;
  if new.withdrawn_reason is distinct from old.withdrawn_reason and new.status <> 'withdrawn' then
    raise exception 'a withdrawal reason is written when a report is withdrawn'
      using errcode = 'check_violation';
  end if;
  if new.head_comment is distinct from old.head_comment and old.status not in ('submitted', 'approved') then
    raise exception 'the head''s comment is written while the report is submitted or approved'
      using errcode = 'check_violation';
  end if;

  case
    when old.status = 'draft' and new.status = 'submitted' then
      new.submitted_by := v_uid; new.submitted_at := now();
    when old.status = 'submitted' and new.status = 'draft' then
      if length(trim(coalesce(new.return_note, ''))) = 0 then
        raise exception 'say why the report is returned' using errcode = 'check_violation';
      end if;
      new.returned_by := v_uid; new.returned_at := now();
    when old.status = 'submitted' and new.status = 'approved' then
      new.approved_by := v_uid; new.approved_at := now();
    when old.status = 'approved' and new.status = 'published' then
      new.published_by := v_uid; new.published_at := now();
      new.reference_code := private.new_report_code(10);
      new.verification_code := private.new_report_code(24);
      if new.snapshot is not null then
        new.snapshot := new.snapshot || jsonb_build_object(
          'reference_code', new.reference_code,
          'verification_code', new.verification_code,
          'version', new.version,
          'published_at', new.published_at);
      end if;
    when old.status = 'published' and new.status = 'withdrawn' then
      new.withdrawn_by := v_uid; new.withdrawn_at := now();
    else
      null;
  end case;

  if v_uid is null then
    return new;
  end if;

  -- Who may make this change. The workflow functions check first; this
  -- holds the line for each role whatever calls it.
  v_is_head := public.has_role(new.school_id, 'head');
  v_is_class_teacher := new.enrolment_id in (select private.my_class_teacher_enrolment_ids());

  if old.status = 'draft' then
    if not v_is_class_teacher then
      raise exception 'only the class teacher changes or submits a draft report'
        using errcode = '42501';
    end if;
  elsif not v_is_head then
    raise exception 'only the head returns, approves, publishes or withdraws a report'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Shared pieces ----------------------------------------------------------------------

-- The class and term a workflow call is about: the term must be in the
-- class's year and school. Raises when they do not match or do not exist,
-- without saying which, so nothing about another school leaks.
create function private.report_class_term(p_class_id uuid, p_term_id uuid)
returns table (school_id uuid, kind public.term_kind, template_id uuid, sections jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  return query
  select c.school_id, t.kind, rt.id, rt.sections
  from public.classes c
  join public.terms t
    on t.id = p_term_id and t.academic_year_id = c.academic_year_id and t.school_id = c.school_id
  join public.report_templates rt on rt.school_id = c.school_id and rt.term_kind = t.kind
  where c.id = p_class_id;
  if not found then
    raise exception 'that class and term were not found' using errcode = '22023';
  end if;
end;
$$;

-- Learners a report is made for: still in the class (not transferred, left
-- or graduated), as on the class teacher's screen (D32).
create function private.report_learners(p_class_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id from public.enrolments e
  where e.class_id = p_class_id and e.status not in ('transferred', 'left', 'graduated');
$$;

-- What each learner of a class still lacks for a report this term, one row
-- per gap, exactly: a learner with no results; a subject with no result
-- (why, and which assessments); a subject comment missing or not marked
-- done; the class teacher's comment missing or not marked done. Comments
-- are needed only where the term's template shows them (a vacation report
-- has no class comment, Q8).
create function private.report_gaps(p_class_id uuid, p_term_id uuid)
returns table (
  enrolment_id uuid,
  gap text,
  class_subject_id uuid,
  subject_name text,
  reason text,
  assessment_names text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with ct as (
    select rct.sections from private.report_class_term(p_class_id, p_term_id) rct
  ),
  members as (
    select id from private.report_learners(p_class_id) as id
  ),
  results as (
    select r.*, s.name as subject_name, s.sort_order
    from private.class_term_subject_results(p_class_id, p_term_id) r
    join public.class_subjects cs on cs.id = r.class_subject_id
    join public.subjects s on s.id = cs.subject_id
    where r.enrolment_id in (select id from members)
  ),
  gaps as (
    select m.id as enrolment_id, 'no_results' as gap, null::uuid as class_subject_id,
           null::text as subject_name, null::text as reason, null::text[] as assessment_names,
           0 as rank, 0 as sort_order
    from members m
    where not exists (select 1 from results r where r.enrolment_id = m.id)
    union all
    select r.enrolment_id, 'result', r.class_subject_id, r.subject_name, r.incomplete_reason,
           (select coalesce(array_agg(a.name order by a.sort_order, a.name), '{}')
            from public.assessments a
            left join public.marks mk on mk.assessment_id = a.id and mk.enrolment_id = r.enrolment_id
            where a.class_subject_id = r.class_subject_id and a.term_id = p_term_id
              and r.incomplete_reason <> 'weights_not_100'
              and (mk.id is null or mk.status <> 'present')),
           1, r.sort_order
    from results r
    where r.result_status = 'incomplete'
    union all
    select r.enrolment_id, 'subject_comment', r.class_subject_id, r.subject_name,
           case when sc.id is null then 'missing' else 'not_done' end, null, 2, r.sort_order
    from results r
    cross join ct
    left join public.subject_comments sc
      on sc.term_id = p_term_id and sc.enrolment_id = r.enrolment_id
     and sc.class_subject_id = r.class_subject_id
    where (ct.sections ->> 'subject_comments')::boolean
      and (sc.id is null or sc.status <> 'submitted')
    union all
    select m.id, 'class_comment', null, null,
           case when cc.id is null then 'missing' else 'not_done' end, null, 3, 0
    from members m
    cross join ct
    left join public.class_comments cc on cc.term_id = p_term_id and cc.enrolment_id = m.id
    where (ct.sections ->> 'class_comment')::boolean
      and (cc.id is null or cc.status <> 'submitted')
  )
  select g.enrolment_id, g.gap, g.class_subject_id, g.subject_name, g.reason, g.assessment_names
  from gaps g
  order by g.enrolment_id, g.sort_order, g.subject_name, g.rank;
$$;

-- What each learner's report says, as generated now: one jsonb per
-- enrolment, keyed by enrolment id. Subject lines in subject order with the
-- rounded mark, grade, the subject teacher's comment (when marked done),
-- the teacher's name and the signed date (Q10); average, position and class
-- size and the class teacher's comment where the template shows them.
create function private.report_draft_contents(p_class_id uuid, p_term_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ct as (
    select c.name as class_name, gl.name as level_name, y.label as year_label,
           t.name as term_name, t.kind, t.starts_on, t.ends_on, rt.sections
    from public.classes c
    join public.grade_levels gl on gl.id = c.grade_level_id
    join public.academic_years y on y.id = c.academic_year_id
    join public.terms t on t.id = p_term_id
    join public.report_templates rt on rt.school_id = c.school_id and rt.term_kind = t.kind
    where c.id = p_class_id
  ),
  lines as (
    select r.enrolment_id,
           jsonb_agg(jsonb_build_object(
             'class_subject_id', r.class_subject_id,
             'subject', s.name,
             'mark', r.rounded_mark,
             'grade', r.grade,
             'remark', r.grade_remark,
             'status', r.result_status,
             'reason', r.incomplete_reason,
             'comment', case when (ct.sections ->> 'subject_comments')::boolean
                              and sc.status = 'submitted' then sc.comment end,
             'teacher', coalesce(tp.full_name, cp.full_name),
             'signed_at', case when sc.status = 'submitted' then sc.signed_at end,
             'not_available', false
           ) order by s.sort_order, s.name) as subjects
    from private.class_term_subject_results(p_class_id, p_term_id) r
    cross join ct
    join public.class_subjects cs on cs.id = r.class_subject_id
    join public.subjects s on s.id = cs.subject_id
    left join public.subject_comments sc
      on sc.term_id = p_term_id and sc.enrolment_id = r.enrolment_id
     and sc.class_subject_id = r.class_subject_id
    left join public.profiles tp on tp.id = sc.teacher_id
    left join public.profiles cp on cp.id = cs.teacher_id
    group by r.enrolment_id
  )
  select coalesce(jsonb_object_agg(e.id, jsonb_build_object(
    'learner', jsonb_build_object(
      'name', l.first_name || ' ' || l.last_name,
      'first_name', l.first_name,
      'last_name', l.last_name,
      'learner_number', l.learner_number),
    'class', ct.class_name,
    'grade_level', ct.level_name,
    'year', ct.year_label,
    'term', jsonb_build_object(
      'name', ct.term_name, 'kind', ct.kind, 'starts_on', ct.starts_on, 'ends_on', ct.ends_on),
    'subjects', coalesce(ln.subjects, '[]'::jsonb),
    'average', case when (ct.sections ->> 'average_position')::boolean then p.average end,
    'position', case when (ct.sections ->> 'average_position')::boolean then p."position" end,
    'class_size', case when (ct.sections ->> 'average_position')::boolean then p.class_size end,
    'class_comment', case when (ct.sections ->> 'class_comment')::boolean
                           and cc.status = 'submitted' then cc.comment end,
    'generated_at', now()
  )), '{}'::jsonb)
  from private.report_learners(p_class_id) as m(id)
  cross join ct
  join public.enrolments e on e.id = m.id
  join public.learners l on l.id = e.learner_id
  left join lines ln on ln.enrolment_id = e.id
  left join private.class_term_positions(p_class_id, p_term_id) p on p.enrolment_id = e.id
  left join public.class_comments cc on cc.term_id = p_term_id and cc.enrolment_id = e.id;
$$;

-- The published snapshot: the draft's contents completed with everything
-- printed on the report, from the template, grading key and school as they
-- are now. A subject the head marked "result not available" prints as such,
-- with no mark or grade. Parts the template turns off are left out.
create function private.report_published_snapshot(p_report_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select r.snapshot
    || jsonb_build_object(
      'kind', t.kind,
      'subjects', (
        select coalesce(jsonb_agg(
          case when (line ->> 'status') = 'incomplete'
            then line || jsonb_build_object('mark', null, 'grade', null, 'remark', null,
                                            'not_available', true)
            else line
          end
          - case when (rt.sections ->> 'subject_comments')::boolean then '' else 'comment' end
          order by ord), '[]'::jsonb)
        from jsonb_array_elements(r.snapshot -> 'subjects') with ordinality as x(line, ord)),
      'average', case when (rt.sections ->> 'average_position')::boolean then r.snapshot -> 'average' end,
      'position', case when (rt.sections ->> 'average_position')::boolean then r.snapshot -> 'position' end,
      'class_size', case when (rt.sections ->> 'average_position')::boolean then r.snapshot -> 'class_size' end,
      'class_comment', case when (rt.sections ->> 'class_comment')::boolean then r.snapshot -> 'class_comment' end,
      'head_comment', case when (rt.sections ->> 'head_comment')::boolean then r.head_comment end,
      'template', jsonb_build_object(
        'name', rt.name,
        'sections', rt.sections,
        'footer_text', rt.footer_text,
        'comment_label', rt.comment_label),
      'grading_key', jsonb_build_object(
        'scale', gs.name,
        'level', gl.name,
        'bands', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'grade', b.grade, 'min_mark', b.min_mark, 'max_mark', b.max_mark, 'remark', b.remark)
            order by b.min_mark desc, b.grade), '[]'::jsonb)
          from public.grading_bands b where b.scale_id = gs.id)),
      'school', jsonb_build_object(
        'name', s.name,
        'motto', s.motto,
        'address', s.address,
        'phone', s.phone,
        'email', s.email,
        'logo_path', s.logo_path,
        'primary_color', s.primary_color,
        'accent_color', s.accent_color,
        'footer_text', s.report_footer_text,
        'stamp_path', s.stamp_path,
        'head_signature_path', s.head_signature_path),
      'head_name', hp.full_name
    )
  from public.reports r
  join public.terms t on t.id = r.term_id
  join public.report_templates rt on rt.id = r.template_id
  join public.enrolments e on e.id = r.enrolment_id
  join public.classes c on c.id = e.class_id
  join public.grade_levels gl on gl.id = c.grade_level_id
  join public.grading_scales gs on gs.id = gl.grading_scale_id
  join public.schools s on s.id = r.school_id
  left join public.profiles hp on hp.id = auth.uid()
  where r.id = p_report_id;
$$;

-- Whether a report has a subject with no result that the head has not
-- marked "result not available" (it cannot be approved, REPORT_LAYOUT 4).
create function private.report_has_open_gap(p_snapshot jsonb)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1 from jsonb_array_elements(coalesce(p_snapshot -> 'subjects', '[]'::jsonb)) line
    where line ->> 'status' = 'incomplete'
      and not coalesce((line ->> 'not_available')::boolean, false)
  );
$$;

revoke execute on function private.report_class_term(uuid, uuid) from public;
revoke execute on function private.report_learners(uuid) from public;
revoke execute on function private.report_gaps(uuid, uuid) from public;
revoke execute on function private.report_draft_contents(uuid, uuid) from public;
revoke execute on function private.report_published_snapshot(uuid) from public;

-- Reads -------------------------------------------------------------------------------

create function public.report_gaps(p_class_id uuid, p_term_id uuid)
returns table (
  enrolment_id uuid,
  gap text,
  class_subject_id uuid,
  subject_name text,
  reason text,
  assessment_names text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  select c.school_id into v_school_id from public.classes c where c.id = p_class_id;
  if v_school_id is null or auth.uid() is null
     or not (private.is_admin_or_head(v_school_id) or public.is_class_teacher(p_class_id)) then
    return;
  end if;
  return query select * from private.report_gaps(p_class_id, p_term_id);
end;
$$;

comment on function public.report_gaps(uuid, uuid) is
  'What each learner of a class still lacks for this term''s report: no results, a subject without a result, a subject or class comment missing or not done (D44). Class teacher, school admin and head.';

-- Per class of the term's year: learners still in the class and how many
-- reports are in each state (withdrawn ones are not counted).
create function public.report_class_overview(p_term_id uuid)
returns table (
  class_id uuid,
  class_name text,
  class_teacher_name text,
  learners int,
  drafts int,
  submitted int,
  approved int,
  published int,
  returned int
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, p.full_name,
         (select count(*) from private.report_learners(c.id))::int,
         count(r.id) filter (where r.status = 'draft')::int,
         count(r.id) filter (where r.status = 'submitted')::int,
         count(r.id) filter (where r.status = 'approved')::int,
         count(r.id) filter (where r.status = 'published')::int,
         count(r.id) filter (where r.status = 'draft' and r.returned_at is not null)::int
  from public.terms t
  join public.classes c on c.academic_year_id = t.academic_year_id and c.school_id = t.school_id
  left join public.profiles p on p.id = c.class_teacher_id
  left join public.enrolments e on e.class_id = c.id
  left join public.reports r on r.enrolment_id = e.id and r.term_id = t.id and r.status <> 'withdrawn'
  where t.id = p_term_id
    and auth.uid() is not null
    and private.is_admin_or_head(t.school_id)
  group by c.id, c.name, p.full_name
  order by c.name;
$$;

comment on function public.report_class_overview(uuid) is
  'Per class of the term''s year: learners and reports in each state (D44). School admin and head.';

-- Transitions ---------------------------------------------------------------------------

-- US-6.1: one draft per learner of the class with nothing missing; a draft
-- is refreshed when generated again. Learners with a gap are skipped and
-- reported; with p_include_incomplete_results a learner whose only gaps are
-- subjects without a result still gets a draft, for the head to approve
-- with "result not available" lines. Reports already submitted, approved or
-- published are left alone. Returns one row per learner of the class.
create function public.generate_report_drafts(
  p_class_id uuid,
  p_term_id uuid,
  p_include_incomplete_results boolean default false
)
returns table (enrolment_id uuid, outcome text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ct record;
  v_contents jsonb;
  v_member uuid;
  v_report public.reports;
  v_content jsonb;
  v_skip uuid[];
begin
  if not public.is_class_teacher(p_class_id) then
    raise exception 'only the class teacher generates draft reports' using errcode = '42501';
  end if;
  select * into v_ct from private.report_class_term(p_class_id, p_term_id);
  v_contents := private.report_draft_contents(p_class_id, p_term_id);

  v_skip := array(
    select distinct g.enrolment_id from private.report_gaps(p_class_id, p_term_id) g
    where g.gap <> 'result' or not coalesce(p_include_incomplete_results, false));

  for v_member in select id from private.report_learners(p_class_id) as id loop
    select * into v_report from public.reports r
    where r.term_id = p_term_id and r.enrolment_id = v_member and r.status <> 'withdrawn';

    if v_report.id is not null and v_report.status <> 'draft' then
      enrolment_id := v_member; outcome := v_report.status::text;
    elsif v_member = any (v_skip) then
      enrolment_id := v_member; outcome := 'missing';
    else
      v_content := v_contents -> v_member::text;
      if v_report.id is null then
        insert into public.reports (school_id, term_id, enrolment_id, template_id, snapshot,
                                    average_percent, class_position, class_size)
        values (v_ct.school_id, p_term_id, v_member, v_ct.template_id, v_content,
                (v_content ->> 'average')::numeric, (v_content ->> 'position')::int,
                (v_content ->> 'class_size')::int);
        enrolment_id := v_member; outcome := 'created';
      else
        update public.reports
        set template_id = v_ct.template_id,
            snapshot = v_content,
            average_percent = (v_content ->> 'average')::numeric,
            class_position = (v_content ->> 'position')::int,
            class_size = (v_content ->> 'class_size')::int
        where id = v_report.id;
        enrolment_id := v_member; outcome := 'refreshed';
      end if;
    end if;
    return next;
  end loop;
end;
$$;

comment on function public.generate_report_drafts(uuid, uuid, boolean) is
  'US-6.1: the class teacher makes or refreshes a draft report for each learner with nothing missing (D44).';

-- US-6.2: the class teacher submits every draft of the class to the head.
create function public.submit_class_reports(p_class_id uuid, p_term_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not public.is_class_teacher(p_class_id) then
    raise exception 'only the class teacher submits the class''s reports' using errcode = '42501';
  end if;
  perform private.report_class_term(p_class_id, p_term_id);
  update public.reports r set status = 'submitted'
  where r.term_id = p_term_id and r.status = 'draft'
    and r.enrolment_id in (select e.id from public.enrolments e where e.class_id = p_class_id);
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'there are no draft reports to submit' using errcode = 'P0001';
  end if;
  return n;
end;
$$;

-- The head (head, deputy or senior master), or a refusal.
create function private.require_report_head(p_school_id uuid, p_what text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_school_id is null or not public.has_role(p_school_id, 'head') then
    raise exception 'only the head %', p_what using errcode = '42501';
  end if;
end;
$$;

revoke execute on function private.require_report_head(uuid, text) from public;

-- The class's school for a head, checked before anything about the class
-- is looked at.
create function private.head_class_term(p_class_id uuid, p_term_id uuid, p_what text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  select c.school_id into v_school_id from public.classes c where c.id = p_class_id;
  perform private.require_report_head(v_school_id, p_what);
  perform private.report_class_term(p_class_id, p_term_id);
  return v_school_id;
end;
$$;

revoke execute on function private.head_class_term(uuid, uuid, text) from public;

-- US-6.2: the head sends the class's submitted reports back to the class
-- teacher as drafts, with a note the class teacher sees.
create function public.return_class_reports(p_class_id uuid, p_term_id uuid, p_note text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := trim(coalesce(p_note, ''));
  n int;
begin
  perform private.head_class_term(p_class_id, p_term_id, 'returns reports');
  if length(v_note) = 0 then
    raise exception 'say why the reports are returned' using errcode = 'check_violation';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'keep the note to 500 characters' using errcode = 'check_violation';
  end if;
  update public.reports r set status = 'draft', return_note = v_note
  where r.term_id = p_term_id and r.status = 'submitted'
    and r.enrolment_id in (select e.id from public.enrolments e where e.class_id = p_class_id);
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'there are no submitted reports to return' using errcode = 'P0001';
  end if;
  return n;
end;
$$;

-- US-6.2: the head approves every submitted report of the class, unless one
-- still has a subject without a result that is not marked "result not
-- available" (then nothing is approved).
create function public.approve_class_reports(p_class_id uuid, p_term_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open int;
  n int;
begin
  perform private.head_class_term(p_class_id, p_term_id, 'approves reports');
  select count(*) into v_open
  from public.reports r
  join public.enrolments e on e.id = r.enrolment_id
  where e.class_id = p_class_id and r.term_id = p_term_id and r.status = 'submitted'
    and private.report_has_open_gap(r.snapshot);
  if v_open > 0 then
    raise exception '% has a subject without a result: mark it "result not available" or return the reports',
      case when v_open = 1 then '1 report' else v_open || ' reports' end
      using errcode = 'check_violation';
  end if;
  update public.reports r set status = 'approved'
  where r.term_id = p_term_id and r.status = 'submitted'
    and r.enrolment_id in (select e.id from public.enrolments e where e.class_id = p_class_id);
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'there are no submitted reports to approve' using errcode = 'P0001';
  end if;
  return n;
end;
$$;

-- US-6.3: the head publishes every approved report of the class: each gets
-- its frozen snapshot, reference and verification codes (by the trigger).
create function public.publish_class_reports(p_class_id uuid, p_term_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  perform private.head_class_term(p_class_id, p_term_id, 'publishes reports');
  update public.reports r
  set status = 'published', snapshot = private.report_published_snapshot(r.id)
  where r.term_id = p_term_id and r.status = 'approved'
    and r.enrolment_id in (select e.id from public.enrolments e where e.class_id = p_class_id);
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'there are no approved reports to publish' using errcode = 'P0001';
  end if;
  return n;
end;
$$;

-- A report the head may change: in the head's school and submitted or
-- approved (or only submitted).
create function private.head_report(p_report_id uuid, p_states public.report_status[], p_what text)
returns public.reports
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_report public.reports;
begin
  select * into v_report from public.reports where id = p_report_id;
  perform private.require_report_head(v_report.school_id, p_what);
  if v_report.status <> all (p_states) then
    raise exception 'this report is % and cannot be changed here', v_report.status
      using errcode = 'check_violation';
  end if;
  return v_report;
end;
$$;

revoke execute on function private.head_report(uuid, public.report_status[], text) from public;

-- US-5.4: the head's comment on one learner's report, while it is submitted
-- or approved, where the template has one (not on a vacation report by
-- default). An empty comment removes it.
create function public.set_report_head_comment(p_report_id uuid, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.reports;
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
begin
  v_report := private.head_report(p_report_id, array['submitted', 'approved']::public.report_status[],
                                   'writes the head''s comment');
  if not exists (
    select 1 from public.report_templates rt
    where rt.id = v_report.template_id and (rt.sections ->> 'head_comment')::boolean
  ) then
    raise exception 'this report has no head''s comment' using errcode = 'check_violation';
  end if;
  if char_length(v_comment) > 200 then
    raise exception 'keep the head''s comment to 200 characters' using errcode = 'check_violation';
  end if;
  update public.reports set head_comment = v_comment where id = p_report_id;
end;
$$;

-- REPORT_LAYOUT section 4: the head explicitly marks a subject without a
-- result as "result not available" (or takes that back) on a submitted
-- report, so the report can be approved.
create function public.set_report_result_not_available(
  p_report_id uuid,
  p_class_subject_id uuid,
  p_not_available boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.reports;
begin
  v_report := private.head_report(p_report_id, array['submitted']::public.report_status[],
                                   'marks a result not available');
  if not exists (
    select 1 from jsonb_array_elements(v_report.snapshot -> 'subjects') line
    where line ->> 'class_subject_id' = p_class_subject_id::text and line ->> 'status' = 'incomplete'
  ) then
    raise exception 'only a subject without a result can be marked "result not available"'
      using errcode = 'check_violation';
  end if;
  update public.reports
  set snapshot = jsonb_set(snapshot, '{subjects}', (
    select jsonb_agg(
      case when line ->> 'class_subject_id' = p_class_subject_id::text
        then line || jsonb_build_object('not_available', coalesce(p_not_available, false))
        else line
      end order by ord)
    from jsonb_array_elements(snapshot -> 'subjects') with ordinality as x(line, ord)))
  where id = p_report_id;
end;
$$;

revoke execute on function public.report_gaps(uuid, uuid) from public, anon;
revoke execute on function public.report_class_overview(uuid) from public, anon;
revoke execute on function public.generate_report_drafts(uuid, uuid, boolean) from public, anon;
revoke execute on function public.submit_class_reports(uuid, uuid) from public, anon;
revoke execute on function public.return_class_reports(uuid, uuid, text) from public, anon;
revoke execute on function public.approve_class_reports(uuid, uuid) from public, anon;
revoke execute on function public.publish_class_reports(uuid, uuid) from public, anon;
revoke execute on function public.set_report_head_comment(uuid, text) from public, anon;
revoke execute on function public.set_report_result_not_available(uuid, uuid, boolean) from public, anon;
grant execute on function public.report_gaps(uuid, uuid) to authenticated;
grant execute on function public.report_class_overview(uuid) to authenticated;
grant execute on function public.generate_report_drafts(uuid, uuid, boolean) to authenticated;
grant execute on function public.submit_class_reports(uuid, uuid) to authenticated;
grant execute on function public.return_class_reports(uuid, uuid, text) to authenticated;
grant execute on function public.approve_class_reports(uuid, uuid) to authenticated;
grant execute on function public.publish_class_reports(uuid, uuid) to authenticated;
grant execute on function public.set_report_head_comment(uuid, text) to authenticated;
grant execute on function public.set_report_result_not_available(uuid, uuid, boolean) to authenticated;
