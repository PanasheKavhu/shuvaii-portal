-- Phase 4 gate review fixes (D48).
--
-- 1. The reports policy and portal_reports() called
--    private.family_can_read_report() once per report row: Postgres never
--    inlines it (it has a SET clause and a sub-select), so a parent's read
--    re-ran their family lookup for every report of every school, about
--    1.4 ms a row. private.family_report_ids() narrows to the family's own
--    enrolments first (computed once) and applies the one family rule only
--    to those rows; the policy and portal_reports() read it once per query.
--    family_can_read_report() stays the only place the rule is written.
-- 2. open_report_share() checks the link owner's family link itself
--    (is_family_user_of), since family_can_read_report() reads auth.uid().
--    A per-school rule added to the one (fees, Q19) must be added to the
--    other; both comments now say so.

create function private.family_report_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.id
  from public.reports r
  where r.enrolment_id in (select private.my_family_enrolment_ids())
    and private.family_can_read_report(r.status, r.enrolment_id);
$$;

comment on function private.family_report_ids() is
  'The reports the current user may read as the learner or a linked parent: the family rule (family_can_read_report) applied to their own enrolments only, so policies read it once per query (D48).';

revoke execute on function private.family_report_ids() from public;
grant execute on function private.family_report_ids() to authenticated;

drop policy reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (
    private.is_admin_or_head(school_id)
    or enrolment_id in (select private.my_teaching_enrolment_ids())
    or (status = 'published' and public.has_role(school_id, 'hod'))
    or id in (select private.family_report_ids())
  );

create or replace function public.portal_reports(p_school_id uuid)
returns table (
  report_id uuid,
  learner_id uuid,
  is_own boolean,
  learner_name text,
  class_name text,
  year_label text,
  term_name text,
  term_kind public.term_kind,
  version int,
  published_at timestamptz,
  has_pdf boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, e.learner_id,
         e.learner_id in (select private.my_own_learner_ids()),
         r.snapshot -> 'learner' ->> 'name', r.snapshot ->> 'class', r.snapshot ->> 'year',
         r.snapshot -> 'term' ->> 'name', t.kind, r.version, r.published_at, r.pdf_path is not null
  from public.reports r
  join public.enrolments e on e.id = r.enrolment_id
  join public.terms t on t.id = r.term_id
  join public.academic_years y on y.id = t.academic_year_id
  where r.school_id = p_school_id
    and auth.uid() is not null
    and r.id in (select private.family_report_ids())
  order by y.starts_on desc, t.starts_on desc, r.snapshot -> 'learner' ->> 'name', r.published_at desc;
$$;

comment on function private.family_can_read_report(public.report_status, uuid) is
  'Whether the current user may read this report as the learner or a linked parent: published only (Q19: no fee rule). The one place the family rule is written; policies read it through family_report_ids() (D48). A per-school rule added here must also go into open_report_share().';

comment on function public.open_report_share(text) is
  'US-7.3: the server opens a share link by its token hash; nothing for a revoked, expired or withdrawn one, or once the link''s owner is no longer the learner or a linked parent. Logs the open (D47). A per-school rule added to private.family_can_read_report() must also go here (D48).';
