-- Report PDFs (US-6.4; D45): the server stores a published report's PDF
-- once and records its path. The report_workflow trigger meant to allow
-- exactly that, but `v_frozen || 'pdf_path'` read the literal as an array
-- and failed, so no published report could get its PDF path. Same function
-- as in 20261011120000_report_workflow.sql with the element typed as text;
-- nothing else changes.

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
      v_frozen := v_frozen || 'pdf_path'::text;
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
