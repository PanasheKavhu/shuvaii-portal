-- pgTAP: storing a published report's PDF (US-6.4; D45). The server (no
-- signed-in user) records `pdf_path` once on a published report, in the
-- shape {school_id}/{report_id}/v{version}.pdf, and nothing else changes
-- with it; the path never changes again; nobody signed in can set it; a
-- withdrawn report gets none. Migration 20261011130000_report_pdf_path_fix.
--
-- Fixture (rolled back at the end): one school, class, learner and term,
-- with two reports moved to published as the table owner (like the server).
begin;

select plan(9);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  'e9000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'hank@pdfs.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''
);

insert into public.schools (id, slug, name, stage, status)
values ('a0000000-0000-0000-0000-0000000000a9', 'pdfs-a-test', 'PDF High', 'secondary', 'active');
insert into public.memberships (school_id, user_id, role, status)
values ('a0000000-0000-0000-0000-0000000000a9', 'e9000000-0000-0000-0000-000000000002', 'head', 'active');
insert into public.grading_scales (id, school_id, name, stage)
values ('a1000000-0000-0000-0000-0000000000a9', 'a0000000-0000-0000-0000-0000000000a9', 'Key', 'o_level');
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id)
values ('a2000000-0000-0000-0000-0000000000a9', 'a0000000-0000-0000-0000-0000000000a9', 'Form 4', 'o_level', 'a1000000-0000-0000-0000-0000000000a9');
insert into public.academic_years (id, school_id, label, starts_on, ends_on)
values ('a3000000-0000-0000-0000-0000000000a9', 'a0000000-0000-0000-0000-0000000000a9', '2026', '2026-01-13', '2026-12-04');
insert into public.terms (id, school_id, academic_year_id, name, kind, starts_on, ends_on, status)
values
  ('79000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a9', 'a3000000-0000-0000-0000-0000000000a9', 'Term 1', 'term', '2026-01-13', '2026-04-09', 'open'),
  ('79000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000a9', 'a3000000-0000-0000-0000-0000000000a9', 'Term 2', 'term', '2026-05-05', '2026-08-06', 'open');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name)
values ('c9100000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a9', 'a3000000-0000-0000-0000-0000000000a9', 'a2000000-0000-0000-0000-0000000000a9', '4 Blue');
insert into public.learners (id, school_id, learner_number, first_name, last_name)
values ('f9000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a9', 'P-01', 'Lungi', 'Moyo');
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id)
values ('e9100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a9', 'f9000000-0000-0000-0000-000000000001', 'c9100000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000a9');

-- Two reports (Term 1 and Term 2), published by the server without a PDF.
insert into public.reports (id, school_id, term_id, enrolment_id, template_id, snapshot)
select r.id::uuid, 'a0000000-0000-0000-0000-0000000000a9', r.term::uuid,
       'e9100000-0000-0000-0000-000000000001', t.id, '{"subjects": []}'
from (values
  ('a5900000-0000-0000-0000-000000000001', '79000000-0000-0000-0000-0000000000a1'),
  ('a5900000-0000-0000-0000-000000000002', '79000000-0000-0000-0000-0000000000a2')
) as r (id, term)
join public.report_templates t
  on t.school_id = 'a0000000-0000-0000-0000-0000000000a9' and t.term_kind = 'term';
update public.reports set status = 'submitted' where school_id = 'a0000000-0000-0000-0000-0000000000a9';
update public.reports set status = 'approved' where school_id = 'a0000000-0000-0000-0000-0000000000a9';
update public.reports set status = 'published' where school_id = 'a0000000-0000-0000-0000-0000000000a9';

create function pg_temp.path(p_id text, p_version int default 1)
returns text language sql as $$
  select 'a0000000-0000-0000-0000-0000000000a9/' || p_id || '/v' || p_version || '.pdf';
$$;
grant execute on function pg_temp.path(text, int) to authenticated;

-- The server ------------------------------------------------------------------------------

select throws_ok(
  $$ update public.reports set pdf_path = pg_temp.path('a5900000-0000-0000-0000-000000000001', 2)
     where id = 'a5900000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a path for another version is refused');
select throws_ok(
  $$ update public.reports set pdf_path = pg_temp.path('a5900000-0000-0000-0000-000000000001'), head_comment = 'Late note'
     where id = 'a5900000-0000-0000-0000-000000000001' $$,
  '23514', null, 'nothing else changes with the PDF path');
select lives_ok(
  $$ update public.reports set pdf_path = pg_temp.path('a5900000-0000-0000-0000-000000000001')
     where id = 'a5900000-0000-0000-0000-000000000001' and status = 'published' and pdf_path is null $$,
  'the server records a published report''s PDF path');
select is(
  (select pdf_path from public.reports where id = 'a5900000-0000-0000-0000-000000000001'),
  pg_temp.path('a5900000-0000-0000-0000-000000000001'),
  'the path is stored');
select throws_ok(
  $$ update public.reports set pdf_path = null where id = 'a5900000-0000-0000-0000-000000000001' $$,
  '23514', null, 'the stored path cannot be cleared');
select lives_ok(
  $$ update public.reports set pdf_path = pg_temp.path('a5900000-0000-0000-0000-000000000001')
     where id = 'a5900000-0000-0000-0000-000000000001' $$,
  'writing the same path again (a retry) changes nothing and is allowed');

-- Signed in ---------------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'e9000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_ok(
  $$ update public.reports set pdf_path = pg_temp.path('a5900000-0000-0000-0000-000000000002')
     where id = 'a5900000-0000-0000-0000-000000000002' $$,
  '42501', null, 'the head cannot record a PDF path; only the server does');
reset role;
select set_config('request.jwt.claim.sub', '', true);

-- Withdrawn ---------------------------------------------------------------------------------

update public.reports set status = 'withdrawn', withdrawn_reason = 'Wrong mark'
where id = 'a5900000-0000-0000-0000-000000000002';
select throws_ok(
  $$ update public.reports set pdf_path = pg_temp.path('a5900000-0000-0000-0000-000000000002')
     where id = 'a5900000-0000-0000-0000-000000000002' $$,
  '23514', null, 'a withdrawn report gets no PDF');
select is(
  (select pdf_path from public.reports where id = 'a5900000-0000-0000-0000-000000000002'),
  null, 'the withdrawn report still has none');

select * from finish();
rollback;
