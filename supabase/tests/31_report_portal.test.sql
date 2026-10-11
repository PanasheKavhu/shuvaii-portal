-- pgTAP: the learner and parent portal and share links (US-7.1 to US-7.5;
-- D47). Migration 20261011150000_report_portal_and_shares.
--
-- portal_reports() lists only the caller's own children's and their own
-- published reports, newest year first; nobody reads another family's
-- report, its PDF or any share row; a learner never reads a sibling's. Share
-- links are made only by the family, return the token once and store its
-- hash, list and revoke only for their owner, and open (service role only)
-- only while live: a revoked, expired or withdrawn link opens nothing. Opens
-- are logged with no personal data. A parent keeps a child's reports after
-- the child leaves; the learner's own access ends with their login.
--
-- Fixture (rolled back at the end). School A: Hank (head), Tina (class
-- teacher), Pat (parent of Lungi and Lindo), Quinn (parent of Kuda), Lara
-- (Lungi's own login), Lex (Lindo's own login). School B: Bea (a parent
-- there). Lungi has a 2025 Term 3 report (class 3 Blue) and every learner a
-- 2026 Term 1 report (4 Blue), all published with PDFs.
begin;

select plan(56);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('eb000000-0000-0000-0000-000000000002', 'hank@portal.test'),
  ('eb000000-0000-0000-0000-000000000003', 'tina@portal.test'),
  ('eb000000-0000-0000-0000-000000000007', 'pat@portal.test'),
  ('eb000000-0000-0000-0000-000000000008', 'quinn@portal.test'),
  ('eb000000-0000-0000-0000-000000000009', 'lara@portal.test'),
  ('eb000000-0000-0000-0000-00000000000a', 'lex@portal.test'),
  ('eb000000-0000-0000-0000-00000000000b', 'bea@portal.test')
) as u (id, email);

insert into public.schools (id, slug, name, stage, timezone, status) values
  ('a0000000-0000-0000-0000-0000000000ab', 'portal-a-test', 'Portal High', 'secondary', 'Africa/Harare', 'active'),
  ('b0000000-0000-0000-0000-0000000000bb', 'portal-b-test', 'Other High', 'secondary', 'Africa/Harare', 'active');
insert into public.memberships (school_id, user_id, role, status) values
  ('a0000000-0000-0000-0000-0000000000ab', 'eb000000-0000-0000-0000-000000000002', 'head', 'active'),
  ('a0000000-0000-0000-0000-0000000000ab', 'eb000000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-0000000000ab', 'eb000000-0000-0000-0000-000000000007', 'parent', 'active'),
  ('a0000000-0000-0000-0000-0000000000ab', 'eb000000-0000-0000-0000-000000000008', 'parent', 'active'),
  ('a0000000-0000-0000-0000-0000000000ab', 'eb000000-0000-0000-0000-000000000009', 'learner', 'active'),
  ('a0000000-0000-0000-0000-0000000000ab', 'eb000000-0000-0000-0000-00000000000a', 'learner', 'active'),
  ('b0000000-0000-0000-0000-0000000000bb', 'eb000000-0000-0000-0000-00000000000b', 'parent', 'active');

insert into public.grading_scales (id, school_id, name, stage)
values ('a1000000-0000-0000-0000-0000000000ab', 'a0000000-0000-0000-0000-0000000000ab', 'Key', 'o_level');
insert into public.grading_bands (school_id, scale_id, grade, min_mark, max_mark)
select 'a0000000-0000-0000-0000-0000000000ab', 'a1000000-0000-0000-0000-0000000000ab', g, lo, hi
from (values ('A', 70, 100), ('B', 60, 69), ('C', 50, 59), ('D', 45, 49), ('E', 40, 44), ('U', 0, 39)) as b (g, lo, hi);
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values
  ('a2000000-0000-0000-0000-0000000000ab', 'a0000000-0000-0000-0000-0000000000ab', 'Form 4', 'o_level', 'a1000000-0000-0000-0000-0000000000ab'),
  ('a2000000-0000-0000-0000-0000000000ac', 'a0000000-0000-0000-0000-0000000000ab', 'Form 3', 'o_level', 'a1000000-0000-0000-0000-0000000000ab');
insert into public.academic_years (id, school_id, label, starts_on, ends_on) values
  ('a3000000-0000-0000-0000-000000002025', 'a0000000-0000-0000-0000-0000000000ab', '2025', '2025-01-14', '2025-12-05'),
  ('a3000000-0000-0000-0000-000000002026', 'a0000000-0000-0000-0000-0000000000ab', '2026', '2026-01-13', '2026-12-04');
insert into public.terms (id, school_id, academic_year_id, name, kind, starts_on, ends_on, status) values
  ('7b000000-0000-0000-0000-000000002503', 'a0000000-0000-0000-0000-0000000000ab', 'a3000000-0000-0000-0000-000000002025', 'Term 3', 'term', '2025-09-09', '2025-12-05', 'open'),
  ('7b000000-0000-0000-0000-000000002601', 'a0000000-0000-0000-0000-0000000000ab', 'a3000000-0000-0000-0000-000000002026', 'Term 1', 'term', '2026-01-13', '2026-04-09', 'open');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ('cc000000-0000-0000-0000-000000002503', 'a0000000-0000-0000-0000-0000000000ab', 'a3000000-0000-0000-0000-000000002025', 'a2000000-0000-0000-0000-0000000000ac', '3 Blue', 'eb000000-0000-0000-0000-000000000003'),
  ('cc000000-0000-0000-0000-000000002601', 'a0000000-0000-0000-0000-0000000000ab', 'a3000000-0000-0000-0000-000000002026', 'a2000000-0000-0000-0000-0000000000ab', '4 Blue', 'eb000000-0000-0000-0000-000000000003');
insert into public.subjects (id, school_id, code, name, stage_scope, sort_order)
values ('db000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000ab', 'MATH', 'Mathematics', 'secondary', 1);
insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values
  ('cd000000-0000-0000-0000-000000002503', 'a0000000-0000-0000-0000-0000000000ab', 'cc000000-0000-0000-0000-000000002503', 'db000000-0000-0000-0000-0000000000a1', 'eb000000-0000-0000-0000-000000000003'),
  ('cd000000-0000-0000-0000-000000002601', 'a0000000-0000-0000-0000-0000000000ab', 'cc000000-0000-0000-0000-000000002601', 'db000000-0000-0000-0000-0000000000a1', 'eb000000-0000-0000-0000-000000000003');
insert into public.learners (id, school_id, learner_number, first_name, last_name, user_id) values
  ('fb000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000ab', 'P-01', 'Lungi', 'Moyo', 'eb000000-0000-0000-0000-000000000009'),
  ('fb000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000ab', 'P-02', 'Lindo', 'Moyo', 'eb000000-0000-0000-0000-00000000000a'),
  ('fb000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-0000000000ab', 'P-03', 'Kuda', 'Ncube', null);
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id) values
  ('eb100000-0000-0000-0000-000000002501', 'a0000000-0000-0000-0000-0000000000ab', 'fb000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000002503', 'a3000000-0000-0000-0000-000000002025'),
  ('eb100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000ab', 'fb000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000002601', 'a3000000-0000-0000-0000-000000002026'),
  ('eb100000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000ab', 'fb000000-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-000000002601', 'a3000000-0000-0000-0000-000000002026'),
  ('eb100000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-0000000000ab', 'fb000000-0000-0000-0000-000000000003', 'cc000000-0000-0000-0000-000000002601', 'a3000000-0000-0000-0000-000000002026');
insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id) values
  ('a0000000-0000-0000-0000-0000000000ab', 'eb100000-0000-0000-0000-000000002501', 'cd000000-0000-0000-0000-000000002503'),
  ('a0000000-0000-0000-0000-0000000000ab', 'eb100000-0000-0000-0000-000000000001', 'cd000000-0000-0000-0000-000000002601'),
  ('a0000000-0000-0000-0000-0000000000ab', 'eb100000-0000-0000-0000-000000000002', 'cd000000-0000-0000-0000-000000002601'),
  ('a0000000-0000-0000-0000-0000000000ab', 'eb100000-0000-0000-0000-000000000003', 'cd000000-0000-0000-0000-000000002601');
insert into public.guardians (id, school_id, full_name, user_id) values
  ('9ab00000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000ab', 'Pat Moyo', 'eb000000-0000-0000-0000-000000000007'),
  ('9ab00000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000ab', 'Quinn Ncube', 'eb000000-0000-0000-0000-000000000008'),
  ('9ab00000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-0000000000bb', 'Bea Other', 'eb000000-0000-0000-0000-00000000000b');
insert into public.guardian_links (school_id, guardian_id, learner_id, relationship, is_primary) values
  ('a0000000-0000-0000-0000-0000000000ab', '9ab00000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'mother', true),
  ('a0000000-0000-0000-0000-0000000000ab', '9ab00000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000002', 'mother', true),
  ('a0000000-0000-0000-0000-0000000000ab', '9ab00000-0000-0000-0000-000000000002', 'fb000000-0000-0000-0000-000000000003', 'father', true);

-- One Exam per class subject, a mark and finished comments for every learner.
insert into public.assessments (id, school_id, term_id, class_subject_id, name, type, max_mark, weight_percent, sort_order) values
  ('ab100000-0000-0000-0000-000000002503', 'a0000000-0000-0000-0000-0000000000ab', '7b000000-0000-0000-0000-000000002503', 'cd000000-0000-0000-0000-000000002503', 'Exam', 'exam', 100, 100, 1),
  ('ab100000-0000-0000-0000-000000002601', 'a0000000-0000-0000-0000-0000000000ab', '7b000000-0000-0000-0000-000000002601', 'cd000000-0000-0000-0000-000000002601', 'Exam', 'exam', 100, 100, 1);
insert into public.marks (school_id, assessment_id, enrolment_id, score) values
  ('a0000000-0000-0000-0000-0000000000ab', 'ab100000-0000-0000-0000-000000002503', 'eb100000-0000-0000-0000-000000002501', 58),
  ('a0000000-0000-0000-0000-0000000000ab', 'ab100000-0000-0000-0000-000000002601', 'eb100000-0000-0000-0000-000000000001', 66),
  ('a0000000-0000-0000-0000-0000000000ab', 'ab100000-0000-0000-0000-000000002601', 'eb100000-0000-0000-0000-000000000002', 71),
  ('a0000000-0000-0000-0000-0000000000ab', 'ab100000-0000-0000-0000-000000002601', 'eb100000-0000-0000-0000-000000000003', 49);
insert into public.subject_comments (school_id, term_id, enrolment_id, class_subject_id, teacher_id, comment, status, signed_at)
select 'a0000000-0000-0000-0000-0000000000ab', t, e, cs, 'eb000000-0000-0000-0000-000000000003', 'Good work.', 'submitted', now()
from (values
  ('7b000000-0000-0000-0000-000000002503'::uuid, 'eb100000-0000-0000-0000-000000002501'::uuid, 'cd000000-0000-0000-0000-000000002503'::uuid),
  ('7b000000-0000-0000-0000-000000002601', 'eb100000-0000-0000-0000-000000000001', 'cd000000-0000-0000-0000-000000002601'),
  ('7b000000-0000-0000-0000-000000002601', 'eb100000-0000-0000-0000-000000000002', 'cd000000-0000-0000-0000-000000002601'),
  ('7b000000-0000-0000-0000-000000002601', 'eb100000-0000-0000-0000-000000000003', 'cd000000-0000-0000-0000-000000002601')
) as x (t, e, cs);
insert into public.class_comments (school_id, term_id, enrolment_id, comment, status)
select 'a0000000-0000-0000-0000-0000000000ab', t, e, 'A fine term.', 'submitted'
from (values
  ('7b000000-0000-0000-0000-000000002503'::uuid, 'eb100000-0000-0000-0000-000000002501'::uuid),
  ('7b000000-0000-0000-0000-000000002601', 'eb100000-0000-0000-0000-000000000001'),
  ('7b000000-0000-0000-0000-000000002601', 'eb100000-0000-0000-0000-000000000002'),
  ('7b000000-0000-0000-0000-000000002601', 'eb100000-0000-0000-0000-000000000003')
) as x (t, e);

create function pg_temp.as_user(p_id text)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_id, true);
$$;
-- Each learner's 2026 Term 1 report (version 1), by the enrolment's last
-- digit, read from a table filled once publishing is done.
create temporary table term1 (enrolment text, id uuid) on commit drop;
create function pg_temp.r(p_enrolment text)
returns uuid language sql as $$
  select id from term1 where enrolment = p_enrolment;
$$;
grant select on term1 to authenticated, anon, service_role;
create function pg_temp.sha(p_token text)
returns text language sql as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;
grant execute on function pg_temp.as_user(text) to authenticated, anon, service_role;
grant execute on function pg_temp.r(text) to authenticated, anon, service_role;
grant execute on function pg_temp.sha(text) to authenticated, anon, service_role;

-- Publish both classes the usual way; the server then stores every PDF.
set local role authenticated;
do $$
declare
  c record;
begin
  for c in select * from (values
    ('cc000000-0000-0000-0000-000000002503'::uuid, '7b000000-0000-0000-0000-000000002503'::uuid),
    ('cc000000-0000-0000-0000-000000002601', '7b000000-0000-0000-0000-000000002601')) as x (class_id, term_id)
  loop
    perform pg_temp.as_user('eb000000-0000-0000-0000-000000000003');
    perform public.generate_report_drafts(c.class_id, c.term_id);
    perform public.submit_class_reports(c.class_id, c.term_id);
    perform pg_temp.as_user('eb000000-0000-0000-0000-000000000002');
    perform public.approve_class_reports(c.class_id, c.term_id);
    perform public.publish_class_reports(c.class_id, c.term_id);
  end loop;
end
$$;
reset role;
select pg_temp.as_user('');
update public.reports set pdf_path = school_id || '/' || id || '/v1.pdf'
where school_id = 'a0000000-0000-0000-0000-0000000000ab';
insert into storage.objects (bucket_id, name)
select 'reports', pdf_path from public.reports where school_id = 'a0000000-0000-0000-0000-0000000000ab';
insert into term1
select right(enrolment_id::text, 1), id from public.reports
where term_id = '7b000000-0000-0000-0000-000000002601';

select is(
  (select count(*)::int from public.reports where school_id = 'a0000000-0000-0000-0000-0000000000ab' and status = 'published' and pdf_path is not null),
  4, 'fixture: four published reports with PDFs');

-- The portal's list ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('eb000000-0000-0000-0000-000000000007');
select is(
  array(select learner_name || ' ' || year_label || ' ' || term_name from public.portal_reports('a0000000-0000-0000-0000-0000000000ab')),
  array['Lindo Moyo 2026 Term 1', 'Lungi Moyo 2026 Term 1', 'Lungi Moyo 2025 Term 3'],
  'a parent lists both children''s reports, newest year first, earlier years included');
select is(
  (select count(*)::int from public.portal_reports('a0000000-0000-0000-0000-0000000000ab') where learner_id = 'fb000000-0000-0000-0000-000000000003'),
  0, 'not another family''s');
select is(
  (select count(*)::int from public.portal_reports('a0000000-0000-0000-0000-0000000000ab') where is_own), 0,
  'none of them are the parent''s own');
select is(
  (select bool_and(has_pdf and version = 1) from public.portal_reports('a0000000-0000-0000-0000-0000000000ab')), true,
  'each says it has a PDF and its version');
select is((select count(*)::int from public.reports where enrolment_id = 'eb100000-0000-0000-0000-000000000003'), 0,
  'a parent cannot read another family''s report');
select is((select count(*)::int from storage.objects where bucket_id = 'reports' and name like '%' || pg_temp.r('3') || '%'), 0,
  'or its PDF');
select is((select count(*)::int from storage.objects where bucket_id = 'reports'), 3,
  'but opens their own children''s PDFs');
select is((select count(*)::int from public.reports where id = pg_temp.r('3') and pdf_path is not null), 0,
  'and never sees another family''s PDF path');
select throws_ok($$ select count(*) from public.report_shares $$, '42501', null, 'a parent cannot read report_shares');
select throws_ok($$ select count(*) from public.report_share_opens $$, '42501', null, 'or report_share_opens');

select pg_temp.as_user('eb000000-0000-0000-0000-000000000009');
select is(
  array(select learner_name || ' ' || term_name || ' ' || is_own from public.portal_reports('a0000000-0000-0000-0000-0000000000ab')),
  array['Lungi Moyo Term 1 true', 'Lungi Moyo Term 3 true'],
  'a learner lists only their own reports');
select is((select count(*)::int from public.reports where enrolment_id = 'eb100000-0000-0000-0000-000000000002'), 0,
  'a learner cannot read a sibling''s report');
select is((select count(*)::int from storage.objects where bucket_id = 'reports' and name like '%' || pg_temp.r('2') || '%'), 0,
  'or the sibling''s PDF');
select throws_ok($$ select count(*) from public.report_shares $$, '42501', null, 'a learner cannot read report_shares');

select pg_temp.as_user('eb000000-0000-0000-0000-000000000008');
select is(
  array(select learner_name from public.portal_reports('a0000000-0000-0000-0000-0000000000ab')),
  array['Kuda Ncube'], 'the other parent lists only their child');

select pg_temp.as_user('eb000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.portal_reports('a0000000-0000-0000-0000-0000000000ab')), 0,
  'a parent in another school lists nothing here');
select is((select count(*)::int from public.reports), 0, 'and reads no report');

select pg_temp.as_user('eb000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.portal_reports('a0000000-0000-0000-0000-0000000000ab')), 0,
  'staff get no portal list');

reset role;
set local role anon;
select throws_ok($$ select * from public.portal_reports('a0000000-0000-0000-0000-0000000000ab') $$, '42501', null,
  'anonymous callers cannot list reports');
reset role;

-- Making share links ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('eb000000-0000-0000-0000-000000000007');
create temporary table pat_link on commit drop as
select * from public.create_report_share(pg_temp.r('1'));
reset role;

select is((select length(token) from pat_link), 43, 'the token is 43 characters (32 random bytes)');
select ok((select token ~ '^[A-Za-z0-9_-]{43}$' from pat_link), 'and safe in a link');
select is(
  (select (token_hash, created_by, report_id)::text from public.report_shares where id = (select share_id from pat_link)),
  (select (pg_temp.sha(token), 'eb000000-0000-0000-0000-000000000007'::uuid, pg_temp.r('1'))::text from pat_link),
  'only the token''s SHA-256 hash is stored, with its owner and report');
select ok(
  (select expires_at between now() + interval '7 days' - interval '1 minute' and now() + interval '7 days' from pat_link),
  'it lasts 7 days');
select is(
  (select count(*)::int from public.report_shares s, pat_link p where s.token_hash = p.token), 0,
  'the token itself is stored nowhere');

grant select on pat_link to authenticated, service_role;
set local role authenticated;
select throws_ok(format($$ select public.create_report_share(%L) $$, pg_temp.r('3')), '42501', null,
  'a parent cannot share another family''s report');
select pg_temp.as_user('eb000000-0000-0000-0000-000000000009');
select throws_ok(format($$ select public.create_report_share(%L) $$, pg_temp.r('2')), '42501', null,
  'a learner cannot share a sibling''s report');
select lives_ok(format($$ select public.create_report_share(%L) $$, pg_temp.r('1')), 'a learner shares their own report');
select pg_temp.as_user('eb000000-0000-0000-0000-00000000000b');
select throws_ok(format($$ select public.create_report_share(%L) $$, pg_temp.r('1')), '42501', null,
  'another school''s parent cannot share it');
select pg_temp.as_user('eb000000-0000-0000-0000-000000000002');
select throws_ok(format($$ select public.create_report_share(%L) $$, pg_temp.r('1')), '42501', null,
  'the head does not make family share links');

-- The owner's links ------------------------------------------------------------------------------

select pg_temp.as_user('eb000000-0000-0000-0000-000000000007');
select is(
  array(select share_id from public.my_report_shares(pg_temp.r('1'))),
  array(select share_id from pat_link), 'the parent sees their own live link, not the learner''s');
select pg_temp.as_user('eb000000-0000-0000-0000-000000000008');
select is((select count(*)::int from public.my_report_shares(pg_temp.r('1'))), 0, 'another parent sees none');
select throws_ok($$ select public.revoke_report_share((select share_id from pat_link)) $$, '42501', null,
  'and cannot revoke it');
select pg_temp.as_user('eb000000-0000-0000-0000-000000000009');
select throws_ok($$ select public.revoke_report_share((select share_id from pat_link)) $$, '42501', null,
  'nor can the learner revoke the parent''s link');

-- Opening a link --------------------------------------------------------------------------------

select throws_ok($$ select * from public.open_report_share((select pg_temp.sha(token) from pat_link)) $$, '42501', null,
  'a signed-in user cannot open links through the API');
reset role;
set local role anon;
select throws_ok($$ select * from public.open_report_share(repeat('a', 64)) $$, '42501', null,
  'nor can an anonymous caller');
reset role;

set local role service_role;
select is(
  (select pdf_path from public.open_report_share((select pg_temp.sha(token) from pat_link))),
  (select pdf_path from public.reports where id = pg_temp.r('1')),
  'the server opens a live link to its PDF');
select is((select count(*)::int from public.open_report_share(repeat('c', 64))), 0, 'an unknown link opens nothing');
reset role;
select is(
  (select count(*)::int from public.report_share_opens where share_id = (select share_id from pat_link)), 1,
  'each open is logged once');
select is(
  (select array_agg(column_name::text order by column_name::text) from information_schema.columns
   where table_schema = 'public' and table_name = 'report_share_opens'),
  array['id', 'opened_at', 'school_id', 'share_id'],
  'with no personal data: which link and when');

set local role authenticated;
select pg_temp.as_user('eb000000-0000-0000-0000-000000000007');
select is((select opens from public.my_report_shares(pg_temp.r('1'))), 1, 'the owner sees how often it opened');
select lives_ok($$ select public.revoke_report_share((select share_id from pat_link)) $$, 'the owner revokes it');
select is((select count(*)::int from public.my_report_shares(pg_temp.r('1'))), 0, 'and it leaves their live links');
reset role;
set local role service_role;
select is((select count(*)::int from public.open_report_share((select pg_temp.sha(token) from pat_link))), 0,
  'a revoked link opens nothing');
reset role;

-- An expired link.
set local role authenticated;
create temporary table old_link on commit drop as
select * from public.create_report_share(pg_temp.r('1'));
reset role;
update public.report_shares set expires_at = now() - interval '1 second' where id = (select share_id from old_link);
grant select on old_link to service_role;
set local role service_role;
select is((select count(*)::int from public.open_report_share((select pg_temp.sha(token) from old_link))), 0,
  'an expired link opens nothing');
reset role;

-- At most ten live links per person and report.
set local role authenticated;
select lives_ok($$ select public.create_report_share(pg_temp.r('1')) from generate_series(1, 10) $$, 'ten live links are allowed');
select throws_ok($$ select public.create_report_share(pg_temp.r('1')) $$, '23514', null, 'an eleventh is refused');

-- Withdrawing the report ends its links -------------------------------------------------------------

create temporary table lindo_link on commit drop as
select * from public.create_report_share(pg_temp.r('2'));
reset role;
grant select on lindo_link to authenticated, service_role;
set local role authenticated;
select pg_temp.as_user('eb000000-0000-0000-0000-000000000002');
select lives_ok($$ select public.withdraw_report(pg_temp.r('2'), 'Wrong mark') $$, 'the head withdraws Lindo''s report');
reset role;
select isnt((select revoked_at from public.report_shares where id = (select share_id from lindo_link)), null,
  'its share links are revoked');
set local role service_role;
select is((select count(*)::int from public.open_report_share((select pg_temp.sha(token) from lindo_link))), 0,
  'and open nothing');
reset role;
set local role authenticated;
select pg_temp.as_user('eb000000-0000-0000-0000-000000000007');
select is(
  (select count(*)::int from public.portal_reports('a0000000-0000-0000-0000-0000000000ab') where learner_id = 'fb000000-0000-0000-0000-000000000002'),
  0, 'the parent sees neither the withdrawn version nor the new draft');
select is((select count(*)::int from public.reports where enrolment_id = 'eb100000-0000-0000-0000-000000000002'), 0,
  'and reads no row of either');

-- A learner who leaves ------------------------------------------------------------------------------

select pg_temp.as_user('eb000000-0000-0000-0000-000000000009');
create temporary table lara_link on commit drop as
select * from public.create_report_share(pg_temp.r('1'));
reset role;
grant select on lara_link to service_role;
update public.learners set status = 'left' where id = 'fb000000-0000-0000-0000-000000000001';

set local role authenticated;
select pg_temp.as_user('eb000000-0000-0000-0000-000000000007');
select is(
  (select count(*)::int from public.portal_reports('a0000000-0000-0000-0000-0000000000ab') where learner_id = 'fb000000-0000-0000-0000-000000000001'),
  2, 'a parent keeps a child''s published reports after the child leaves');
select is((select count(*)::int from storage.objects where bucket_id = 'reports'), 2, 'and their PDFs');
select pg_temp.as_user('eb000000-0000-0000-0000-000000000009');
select is((select count(*)::int from public.portal_reports('a0000000-0000-0000-0000-0000000000ab')), 0,
  'the learner who left no longer reads their own');
reset role;
set local role service_role;
select is((select count(*)::int from public.open_report_share((select pg_temp.sha(token) from lara_link))), 0,
  'and their own share links stop working');
reset role;

select * from finish();
rollback;
