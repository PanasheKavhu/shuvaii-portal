-- Withdrawing and reissuing a published report (US-6.6; D46).
--
--   withdraw_report(report, reason)   head: published -> withdrawn with the
--                                     reason, its share links ended, and
--                                     version + 1 made as a draft from the
--                                     current marks and comments, all at once
--
-- The new draft then goes the usual way (class teacher submits, head
-- approves and publishes) and prints "Amended · version N". The withdrawn
-- version, its snapshot and its PDF stay: the school (admin, head, and the
-- class's teachers) still reads them, the audit screen links them, and
-- parents and learners never see a withdrawn report (reports_select), so
-- they see only the newest published version. The verification page says
-- "withdrawn" for the old code.
--
-- The trigger is the one in 20261011130000_report_pdf_path_fix.sql, with one
-- change: a signed-in head may insert a report when an earlier version for
-- the same learner and term is withdrawn (the reissue). Every other rule
-- (one live version, version = previous + 1, starts as a draft) is as before.

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
    -- The head may also insert the next version when reissuing a withdrawn
    -- report (US-6.6, public.withdraw_report()).
    if v_uid is not null
       and new.enrolment_id not in (select private.my_class_teacher_enrolment_ids())
       and not (public.has_role(new.school_id, 'head')
                and exists (
                  select 1 from public.reports r
                  where r.term_id = new.term_id and r.enrolment_id = new.enrolment_id
                    and r.school_id = new.school_id and r.status = 'withdrawn')) then
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

-- US-6.6: the head withdraws one published report with a reason and the
-- next version is made as a draft. A learner no longer in the class (moved,
-- left or graduated) cannot be reissued from the class's current results,
-- so the report is not withdrawn either. Returns the new draft's id.
create function public.withdraw_report(p_report_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := trim(coalesce(p_reason, ''));
  v_report public.reports;
  v_class_id uuid;
  v_ct record;
  v_content jsonb;
  v_new_id uuid;
begin
  v_report := private.head_report(p_report_id, array['published']::public.report_status[],
                                   'withdraws a report');
  if length(v_reason) = 0 then
    raise exception 'say why the report is withdrawn' using errcode = 'check_violation';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'keep the reason to 500 characters' using errcode = 'check_violation';
  end if;

  select e.class_id into v_class_id from public.enrolments e where e.id = v_report.enrolment_id;
  select * into v_ct from private.report_class_term(v_class_id, v_report.term_id);
  v_content := private.report_draft_contents(v_class_id, v_report.term_id)
               -> v_report.enrolment_id::text;
  if v_content is null then
    raise exception 'this learner is no longer in the class, so the report cannot be reissued'
      using errcode = 'check_violation';
  end if;

  update public.reports
  set status = 'withdrawn', withdrawn_reason = v_reason
  where id = p_report_id and status = 'published';
  if not found then
    raise exception 'this report is no longer published' using errcode = 'check_violation';
  end if;

  update public.report_shares
  set revoked_at = now()
  where report_id = p_report_id and revoked_at is null;

  insert into public.reports (school_id, term_id, enrolment_id, template_id, snapshot,
                              average_percent, class_position, class_size)
  values (v_report.school_id, v_report.term_id, v_report.enrolment_id, v_ct.template_id, v_content,
          (v_content ->> 'average')::numeric, (v_content ->> 'position')::int,
          (v_content ->> 'class_size')::int)
  returning id into v_new_id;
  return v_new_id;
end;
$$;

comment on function public.withdraw_report(uuid, text) is
  'US-6.6: the head withdraws a published report with a reason, ends its share links and makes the next version as a draft from the current marks and comments (D46).';

revoke execute on function public.withdraw_report(uuid, text) from public, anon;
grant execute on function public.withdraw_report(uuid, text) to authenticated;
