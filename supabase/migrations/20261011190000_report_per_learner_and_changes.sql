-- Phase 4 gate: two known gaps of the report workflow (D44, D48).
--
-- 1. The head returns or approves one learner's report, not only the whole
--    class: return_report(report, note) and approve_report(report). Same
--    rules as the class functions (head only, submitted only, a note to
--    return, no approval while a subject has no result and is not marked
--    "result not available"); the reports trigger stamps and audits each.
-- 2. report_changes_since_draft(class, term): the head's warning that a
--    learner's marks or comments changed after their report was made, so
--    the report no longer shows them. For each live draft, submitted or
--    approved report, the newest change to the learner's own marks, subject
--    comments or class comment for the term after the report's
--    generated_at. A classmate's change can still move positions; the
--    warning names the learners whose own results changed.

create function public.return_report(p_report_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := trim(coalesce(p_note, ''));
begin
  perform private.head_report(p_report_id, array['submitted']::public.report_status[], 'returns reports');
  if length(v_note) = 0 then
    raise exception 'say why the report is returned' using errcode = 'check_violation';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'keep the note to 500 characters' using errcode = 'check_violation';
  end if;
  update public.reports set status = 'draft', return_note = v_note where id = p_report_id;
end;
$$;

comment on function public.return_report(uuid, text) is
  'US-6.2: the head sends one submitted report back to the class teacher as a draft, with a note (D48).';

create function public.approve_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.reports;
begin
  v_report := private.head_report(p_report_id, array['submitted']::public.report_status[], 'approves reports');
  if private.report_has_open_gap(v_report.snapshot) then
    raise exception 'this report has a subject without a result: mark it "result not available" or return it'
      using errcode = 'check_violation';
  end if;
  update public.reports set status = 'approved' where id = p_report_id;
end;
$$;

comment on function public.approve_report(uuid) is
  'US-6.2: the head approves one submitted report (D48).';

create function public.report_changes_since_draft(p_class_id uuid, p_term_id uuid)
returns table (report_id uuid, changed_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform private.head_class_term(p_class_id, p_term_id, 'checks reports');
  return query
  with live as (
    select r.id, r.enrolment_id, (r.snapshot ->> 'generated_at')::timestamptz as made_at
    from public.reports r
    join public.enrolments e on e.id = r.enrolment_id
    where e.class_id = p_class_id and r.term_id = p_term_id
      and r.status in ('draft', 'submitted', 'approved')
  ),
  changes as (
    select m.enrolment_id, m.updated_at as at
    from public.marks m
    join public.assessments a on a.id = m.assessment_id
    where a.term_id = p_term_id and m.enrolment_id in (select enrolment_id from live)
    union all
    select sc.enrolment_id, sc.updated_at from public.subject_comments sc
    where sc.term_id = p_term_id and sc.enrolment_id in (select enrolment_id from live)
    union all
    select cc.enrolment_id, cc.updated_at from public.class_comments cc
    where cc.term_id = p_term_id and cc.enrolment_id in (select enrolment_id from live)
  )
  select l.id, max(c.at)
  from live l
  join changes c on c.enrolment_id = l.enrolment_id and c.at > l.made_at
  group by l.id;
end;
$$;

comment on function public.report_changes_since_draft(uuid, uuid) is
  'The head''s warning: live reports of a class whose learner''s own marks or comments changed after the report was made, and when (D48).';

revoke execute on function public.return_report(uuid, text) from public, anon;
revoke execute on function public.approve_report(uuid) from public, anon;
revoke execute on function public.report_changes_since_draft(uuid, uuid) from public, anon;
grant execute on function public.return_report(uuid, text) to authenticated;
grant execute on function public.approve_report(uuid) to authenticated;
grant execute on function public.report_changes_since_draft(uuid, uuid) to authenticated;
