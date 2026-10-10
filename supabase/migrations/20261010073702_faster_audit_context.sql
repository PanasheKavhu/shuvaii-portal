-- Faster audit context on insert (D35, D37).
--
-- The Phase 3 gate's full e2e runs saw the 1,000-learner import hit the
-- API's 8-second statement timeout again: it writes about 4,000 audit rows
-- (learners, enrolments, guardians, links), and the before-insert trigger
-- that fills learner_id, class_id and class_subject_id called the set-
-- returning private.audit_context() for each, about 0.5 ms a row (4.7 s for
-- the import on an idle database, 2.7 s with the trigger off). The trigger
-- now does the same lookups inline and returns at once for tables with no
-- context (guardians, memberships, console events). private.audit_context()
-- stays for the one-off backfill in 20261009143000_audit_log_screen.sql.

create or replace function private.audit_log_fill_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb;
  v_enrolment uuid;
  v_learner uuid;
  v_class uuid;
  v_class_subject uuid;
begin
  if new.table_name not in (
    'marks', 'subject_comments', 'class_comments', 'enrolments', 'learners',
    'guardian_links', 'assessments', 'class_subject_unlocks'
  ) then
    return new;
  end if;

  d := coalesce(new.new_data, new.old_data);
  case new.table_name
    when 'marks' then
      v_enrolment := (d ->> 'enrolment_id')::uuid;
      select a.class_subject_id into v_class_subject
      from public.assessments a where a.id = (d ->> 'assessment_id')::uuid;
    when 'subject_comments' then
      v_enrolment := (d ->> 'enrolment_id')::uuid;
      v_class_subject := (d ->> 'class_subject_id')::uuid;
    when 'class_comments' then
      v_enrolment := (d ->> 'enrolment_id')::uuid;
    when 'enrolments' then
      v_learner := (d ->> 'learner_id')::uuid;
      v_class := (d ->> 'class_id')::uuid;
    when 'learners' then
      v_learner := new.row_id;
    when 'guardian_links' then
      v_learner := (d ->> 'learner_id')::uuid;
    else -- assessments, class_subject_unlocks
      v_class_subject := (d ->> 'class_subject_id')::uuid;
  end case;

  if v_enrolment is not null then
    select e.learner_id, e.class_id into v_learner, v_class
    from public.enrolments e where e.id = v_enrolment;
  end if;
  if v_class is null and v_class_subject is not null then
    select cs.class_id into v_class from public.class_subjects cs where cs.id = v_class_subject;
  end if;
  if v_class is null and v_learner is not null then
    select e.class_id into v_class
    from public.enrolments e
    where e.learner_id = v_learner
    order by e.created_at desc
    limit 1;
  end if;

  new.learner_id := coalesce(new.learner_id, v_learner);
  new.class_id := coalesce(new.class_id, v_class);
  new.class_subject_id := coalesce(new.class_subject_id, v_class_subject);
  return new;
end;
$$;
