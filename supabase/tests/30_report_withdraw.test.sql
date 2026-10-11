-- pgTAP: withdrawing and reissuing a published report (US-6.6; D46).
-- public.withdraw_report(): only the school's head, only a published report,
-- only with a reason; the old version becomes withdrawn (stamped, reason
-- kept, snapshot, codes and PDF untouched, never changing again), its share
-- links end, and version + 1 is made as a draft from the current marks and
-- comments. The new draft goes through submit, approve and publish again
-- with new codes. One live version per learner and term holds throughout.
-- The school still reads the old versions and their PDFs; a parent and the
-- learner see only the newest published one. A learner who left the class
-- cannot be reissued, so nothing is withdrawn. Audited.
-- Migration 20261011140000_report_withdraw_and_reissue.
--
-- Fixture (rolled back at the end). School A: Alice (admin), Hank (head),
-- Tina (class teacher of 4 Blue, teaches its Maths), Pat (Lungi's parent),
-- Lara (Lungi's own login). School B: Bert (head). 4 Blue: Lungi and Lindo,
-- each with a Maths Exam mark and their comments done, both published for
-- Term 1 by the usual workflow.
begin;

select plan(49);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('ea000000-0000-0000-0000-000000000001', 'alice@withdraw.test'),
  ('ea000000-0000-0000-0000-000000000002', 'hank@withdraw.test'),
  ('ea000000-0000-0000-0000-000000000003', 'tina@withdraw.test'),
  ('ea000000-0000-0000-0000-000000000007', 'pat@withdraw.test'),
  ('ea000000-0000-0000-0000-000000000009', 'lara@withdraw.test'),
  ('ea000000-0000-0000-0000-00000000000c', 'bert@withdraw.test')
) as u (id, email);

insert into public.schools (id, slug, name, stage, timezone, status) values
  ('a0000000-0000-0000-0000-0000000000aa', 'withdraw-a-test', 'Withdraw High', 'secondary', 'Africa/Harare', 'active'),
  ('b0000000-0000-0000-0000-0000000000ba', 'withdraw-b-test', 'Other High', 'secondary', 'Africa/Harare', 'active');
insert into public.memberships (school_id, user_id, role, status) values
  ('a0000000-0000-0000-0000-0000000000aa', 'ea000000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a0000000-0000-0000-0000-0000000000aa', 'ea000000-0000-0000-0000-000000000002', 'head', 'active'),
  ('a0000000-0000-0000-0000-0000000000aa', 'ea000000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-0000000000aa', 'ea000000-0000-0000-0000-000000000007', 'parent', 'active'),
  ('a0000000-0000-0000-0000-0000000000aa', 'ea000000-0000-0000-0000-000000000009', 'learner', 'active'),
  ('b0000000-0000-0000-0000-0000000000ba', 'ea000000-0000-0000-0000-00000000000c', 'head', 'active');

insert into public.grading_scales (id, school_id, name, stage)
values ('a1000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-0000000000aa', 'Key', 'o_level');
insert into public.grading_bands (school_id, scale_id, grade, min_mark, max_mark)
select 'a0000000-0000-0000-0000-0000000000aa', 'a1000000-0000-0000-0000-0000000000aa', g, lo, hi
from (values ('A', 70, 100), ('B', 60, 69), ('C', 50, 59), ('D', 45, 49), ('E', 40, 44), ('U', 0, 39)) as b (g, lo, hi);
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id)
values ('a2000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-0000000000aa', 'Form 4', 'o_level', 'a1000000-0000-0000-0000-0000000000aa');
insert into public.academic_years (id, school_id, label, starts_on, ends_on)
values ('a3000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-0000000000aa', '2026', '2026-01-13', '2026-12-04');
insert into public.terms (id, school_id, academic_year_id, name, kind, starts_on, ends_on, status)
values ('7a000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000aa', 'a3000000-0000-0000-0000-0000000000aa', 'Term 1', 'term', '2026-01-13', '2026-04-09', 'open');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id)
values ('ca000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000aa', 'a3000000-0000-0000-0000-0000000000aa', 'a2000000-0000-0000-0000-0000000000aa', '4 Blue', 'ea000000-0000-0000-0000-000000000003');
insert into public.subjects (id, school_id, code, name, stage_scope, sort_order)
values ('da000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000aa', 'MATH', 'Mathematics', 'secondary', 1);
insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id)
values ('cb000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000aa', 'ca000000-0000-0000-0000-0000000000a1', 'da000000-0000-0000-0000-0000000000a1', 'ea000000-0000-0000-0000-000000000003');
insert into public.learners (id, school_id, learner_number, first_name, last_name, user_id) values
  ('fa000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000aa', 'X-01', 'Lungi', 'Moyo', 'ea000000-0000-0000-0000-000000000009'),
  ('fa000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000aa', 'X-02', 'Lindo', 'Ncube', null);
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id) values
  ('ea100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000aa', 'fa000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000aa'),
  ('ea100000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000aa', 'fa000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000aa');
insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id) values
  ('a0000000-0000-0000-0000-0000000000aa', 'ea100000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-0000000000aa', 'ea100000-0000-0000-0000-000000000002', 'cb000000-0000-0000-0000-000000000001');
insert into public.guardians (id, school_id, full_name, user_id)
values ('9aa00000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000aa', 'Pat Moyo', 'ea000000-0000-0000-0000-000000000007');
insert into public.guardian_links (school_id, guardian_id, learner_id, relationship, is_primary)
values ('a0000000-0000-0000-0000-0000000000aa', '9aa00000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'mother', true);

insert into public.assessments (id, school_id, term_id, class_subject_id, name, type, max_mark, weight_percent, sort_order)
values ('aa100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000aa', '7a000000-0000-0000-0000-0000000000a1', 'cb000000-0000-0000-0000-000000000001', 'Exam', 'exam', 100, 100, 1);
insert into public.marks (id, school_id, assessment_id, enrolment_id, score) values
  ('aa200000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000aa', 'aa100000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000001', 45),
  ('aa200000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000aa', 'aa100000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000002', 60);
insert into public.subject_comments (school_id, term_id, enrolment_id, class_subject_id, teacher_id, comment, status, signed_at)
select 'a0000000-0000-0000-0000-0000000000aa', '7a000000-0000-0000-0000-0000000000a1', e, 'cb000000-0000-0000-0000-000000000001',
       'ea000000-0000-0000-0000-000000000003', 'Good work.', 'submitted', now()
from unnest(array['ea100000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000002']::uuid[]) e;
insert into public.class_comments (school_id, term_id, enrolment_id, comment, status)
select 'a0000000-0000-0000-0000-0000000000aa', '7a000000-0000-0000-0000-0000000000a1', e, 'A fine term.', 'submitted'
from unnest(array['ea100000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-000000000002']::uuid[]) e;

create function pg_temp.as_user(p_id text)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_id, true);
$$;
-- A learner's report of a given version for Term 1.
create function pg_temp.v(p_enrolment text, p_version int)
returns public.reports language sql as $$
  select * from public.reports
  where enrolment_id = p_enrolment::uuid and term_id = '7a000000-0000-0000-0000-0000000000a1' and version = p_version;
$$;
create function pg_temp.lungi() returns text language sql as $$ select 'ea100000-0000-0000-0000-000000000001' $$;
create function pg_temp.lindo() returns text language sql as $$ select 'ea100000-0000-0000-0000-000000000002' $$;
grant execute on function pg_temp.as_user(text) to authenticated;
grant execute on function pg_temp.v(text, int) to authenticated;
grant execute on function pg_temp.lungi() to authenticated;
grant execute on function pg_temp.lindo() to authenticated;

-- Publish both reports the usual way, then the server stores Lungi's PDF.
set local role authenticated;
select pg_temp.as_user('ea000000-0000-0000-0000-000000000003');
do $$
begin
  perform public.generate_report_drafts('ca000000-0000-0000-0000-0000000000a1', '7a000000-0000-0000-0000-0000000000a1');
  perform public.submit_class_reports('ca000000-0000-0000-0000-0000000000a1', '7a000000-0000-0000-0000-0000000000a1');
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000002');
  perform public.approve_class_reports('ca000000-0000-0000-0000-0000000000a1', '7a000000-0000-0000-0000-0000000000a1');
  perform public.publish_class_reports('ca000000-0000-0000-0000-0000000000a1', '7a000000-0000-0000-0000-0000000000a1');
end
$$;
reset role;
select pg_temp.as_user('');
update public.reports set pdf_path = school_id || '/' || id || '/v1.pdf'
where enrolment_id = pg_temp.lungi()::uuid and version = 1;
insert into storage.objects (bucket_id, name) select 'reports', pdf_path from pg_temp.v(pg_temp.lungi(), 1);
-- Two share links for version 1: one live, one revoked last week.
insert into public.report_shares (school_id, report_id, token_hash, expires_at, revoked_at)
select school_id, id, repeat(s.c, 64), now() + interval '7 days', s.revoked
from pg_temp.v(pg_temp.lungi(), 1),
     (values ('a', null::timestamptz), ('b', now() - interval '7 days')) as s (c, revoked);

create temporary table v1 on commit drop as select * from pg_temp.v(pg_temp.lungi(), 1);
grant select on v1 to authenticated;

select is((select status::text from v1), 'published', 'fixture: Lungi''s version 1 is published with its PDF');

-- The marks are corrected after publishing: Lungi's Exam was 75, not 45.
update public.marks set score = 75 where id = 'aa200000-0000-0000-0000-000000000001';

-- Who may withdraw -----------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('ea000000-0000-0000-0000-000000000003');
select throws_ok($$ select public.withdraw_report((select id from v1), 'Wrong mark') $$, '42501', null, 'the class teacher cannot withdraw a report');
select pg_temp.as_user('ea000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.withdraw_report((select id from v1), 'Wrong mark') $$, '42501', null, 'the school admin cannot withdraw a report');
select pg_temp.as_user('ea000000-0000-0000-0000-000000000007');
select throws_ok($$ select public.withdraw_report((select id from v1), 'Wrong mark') $$, '42501', null, 'a parent cannot withdraw a report');
select pg_temp.as_user('ea000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.withdraw_report((select id from v1), 'Wrong mark') $$, '42501', null, 'another school''s head cannot withdraw it');
select pg_temp.as_user('');
select throws_ok($$ select public.withdraw_report((select id from v1), 'Wrong mark') $$, '42501', null, 'nobody signed out can withdraw it');

select pg_temp.as_user('ea000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.withdraw_report((select id from v1), '   ') $$, '23514', 'say why the report is withdrawn', 'a reason is required');
select throws_ok($$ select public.withdraw_report((select id from v1), repeat('x', 501)) $$, '23514', 'keep the reason to 500 characters', 'the reason has a limit');
select is((select status::text from pg_temp.v(pg_temp.lungi(), 1)), 'published', 'refused attempts change nothing');

-- Withdrawing ----------------------------------------------------------------------------------

create temporary table v2_id on commit drop as
select public.withdraw_report((select id from v1), '  Wrong Mathematics mark.  ') as id;
grant select on v2_id to authenticated;

select is((select status::text from pg_temp.v(pg_temp.lungi(), 1)), 'withdrawn', 'version 1 is withdrawn');
select is((select withdrawn_reason from pg_temp.v(pg_temp.lungi(), 1)), 'Wrong Mathematics mark.', 'with the reason, trimmed');
select is((select withdrawn_by from pg_temp.v(pg_temp.lungi(), 1)), 'ea000000-0000-0000-0000-000000000002'::uuid, 'stamped with the head');
select isnt((select withdrawn_at from pg_temp.v(pg_temp.lungi(), 1)), null, 'and the time');
select is(
  (select (snapshot, pdf_path, reference_code, verification_code, published_at)::text from pg_temp.v(pg_temp.lungi(), 1)),
  (select (snapshot, pdf_path, reference_code, verification_code, published_at)::text from v1),
  'its snapshot, PDF, codes and publication stay exactly as they were');

reset role;
select pg_temp.as_user('');
select is(
  (select count(*)::int from public.report_shares where report_id = (select id from v1) and revoked_at is null),
  0, 'its share links are ended');
select ok(
  (select revoked_at < now() - interval '6 days' from public.report_shares where token_hash = repeat('b', 64)),
  'a link revoked earlier keeps its own time');
set local role authenticated;
select pg_temp.as_user('ea000000-0000-0000-0000-000000000002');

-- The reissued draft
select is((select id from pg_temp.v(pg_temp.lungi(), 2)), (select id from v2_id), 'withdraw_report returns version 2');
select is((select status::text from pg_temp.v(pg_temp.lungi(), 2)), 'draft', 'version 2 starts as a draft');
select is((select created_by from pg_temp.v(pg_temp.lungi(), 2)), 'ea000000-0000-0000-0000-000000000002'::uuid, 'made by the head');
select ok(
  (select reference_code is null and verification_code is null and pdf_path is null and head_comment is null
   from pg_temp.v(pg_temp.lungi(), 2)),
  'with no codes, PDF or head''s comment yet');
select is(
  (select (snapshot -> 'subjects' -> 0 ->> 'mark') || ' ' || (snapshot -> 'subjects' -> 0 ->> 'grade') from pg_temp.v(pg_temp.lungi(), 2)),
  '75 A', 'from the current marks');
select is((select snapshot ->> 'class_comment' from pg_temp.v(pg_temp.lungi(), 2)), 'A fine term.', 'and the current comments');
select is((select class_position from pg_temp.v(pg_temp.lungi(), 2)), 1, 'with the position from the current marks');

-- State rules ----------------------------------------------------------------------------------

select throws_ok($$ select public.withdraw_report((select id from v1), 'Again') $$, '23514', null, 'a withdrawn report cannot be withdrawn again');
select throws_ok($$ select public.withdraw_report((select id from v2_id), 'Too soon') $$, '23514', null, 'a draft cannot be withdrawn');
reset role;
select throws_ok(
  $$ update public.reports set withdrawn_reason = 'Changed' where id = (select id from v1) $$,
  '23514', 'a withdrawn report never changes', 'a withdrawn report never changes, even for the server');
select pg_temp.as_user('ea000000-0000-0000-0000-000000000002');
select throws_ok(
  $$ insert into public.reports (school_id, term_id, enrolment_id, template_id)
     select school_id, term_id, enrolment_id, template_id from v1 $$,
  '23505', null, 'the head cannot make another version while version 2 is live');
select throws_ok(
  $$ insert into public.reports (school_id, term_id, enrolment_id, template_id)
     select school_id, term_id, pg_temp.lindo()::uuid, template_id from v1 $$,
  '42501', null, 'the head makes a draft only when reissuing a withdrawn report');
select pg_temp.as_user('');
set local role authenticated;
select throws_ok(
  $$ insert into public.reports (school_id, term_id, enrolment_id, template_id)
     select school_id, term_id, enrolment_id, template_id from v1 $$,
  '42501', null, 'nobody signed in writes reports directly');

-- Who sees what in between: the family nothing, the school both versions.
select pg_temp.as_user('ea000000-0000-0000-0000-000000000007');
select is((select count(*)::int from public.reports), 0, 'while version 2 is a draft, the parent sees no report');
select pg_temp.as_user('ea000000-0000-0000-0000-000000000003');
select is(
  (select array_agg(version || ' ' || status order by version) from public.reports where enrolment_id = pg_temp.lungi()::uuid),
  array['1 withdrawn', '2 draft'], 'the class teacher sees the old version and the new draft');

-- Approve and publish again --------------------------------------------------------------------

select is(public.submit_class_reports('ca000000-0000-0000-0000-0000000000a1', '7a000000-0000-0000-0000-0000000000a1'), 1,
  'the class teacher submits the reissued draft (only that one)');
select pg_temp.as_user('ea000000-0000-0000-0000-000000000002');
select is(public.approve_class_reports('ca000000-0000-0000-0000-0000000000a1', '7a000000-0000-0000-0000-0000000000a1'), 1,
  'the head approves it');
select is(public.publish_class_reports('ca000000-0000-0000-0000-0000000000a1', '7a000000-0000-0000-0000-0000000000a1'), 1,
  'and publishes it');
select is((select snapshot ->> 'version' from pg_temp.v(pg_temp.lungi(), 2)), '2', 'the published snapshot says version 2 (printed as Amended)');
select ok(
  (select v2.verification_code is not null and v2.verification_code <> v1.verification_code
          and v2.reference_code <> v1.reference_code
   from pg_temp.v(pg_temp.lungi(), 2) v2, v1),
  'with new codes, so the old verification code stays withdrawn');
select is((select status::text from public.reports where verification_code = (select verification_code from v1)), 'withdrawn',
  'the old verification code finds the withdrawn version');

-- Who sees what now ------------------------------------------------------------------------------

select pg_temp.as_user('ea000000-0000-0000-0000-000000000007');
select is((select array_agg(version) from public.reports), array[2], 'the parent sees only the newest published version');
select is((select count(*)::int from storage.objects where bucket_id = 'reports'), 0, 'and cannot open the withdrawn version''s PDF');
select pg_temp.as_user('ea000000-0000-0000-0000-000000000009');
select is((select array_agg(version) from public.reports), array[2], 'the learner sees only the newest published version');
select pg_temp.as_user('ea000000-0000-0000-0000-000000000001');
select is(
  (select array_agg(version || ' ' || status order by version) from public.reports where enrolment_id = pg_temp.lungi()::uuid),
  array['1 withdrawn', '2 published'], 'the school admin still sees every version');
select is((select count(*)::int from storage.objects where bucket_id = 'reports'), 1, 'and the withdrawn version''s PDF');
select pg_temp.as_user('ea000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.reports), 0, 'another school''s head sees none of it');

-- Version 3 --------------------------------------------------------------------------------------

select pg_temp.as_user('ea000000-0000-0000-0000-000000000002');
select lives_ok($$ select public.withdraw_report((select id from v2_id), 'Wrong comment') $$, 'version 2 can be withdrawn in turn');
select is(
  (select array_agg(version || ' ' || status order by version) from public.reports where enrolment_id = pg_temp.lungi()::uuid),
  array['1 withdrawn', '2 withdrawn', '3 draft'], 'which makes version 3 as a draft');

-- A learner no longer in the class --------------------------------------------------------------

reset role;
select pg_temp.as_user('');
update public.enrolments set status = 'left' where id = pg_temp.lindo()::uuid;
set local role authenticated;
select pg_temp.as_user('ea000000-0000-0000-0000-000000000002');
select throws_ok(
  $$ select public.withdraw_report((select id from pg_temp.v(pg_temp.lindo(), 1)), 'Wrong mark') $$,
  '23514', 'this learner is no longer in the class, so the report cannot be reissued',
  'a learner who left the class cannot be reissued');
select is((select status::text from pg_temp.v(pg_temp.lindo(), 1)), 'published', 'so their report stays published');

-- Audit --------------------------------------------------------------------------------------------

reset role;
select is(
  (select array_agg(a.new_data ->> 'status' || ' ' || coalesce(a.reason, a.new_data ->> 'withdrawn_reason', '') order by a.id)
   from public.audit_log a
   where a.table_name = 'reports' and a.row_id = (select id from v1)
     and a.actor_id = 'ea000000-0000-0000-0000-000000000002' and a.old_data ->> 'status' = 'published'),
  array['withdrawn Wrong Mathematics mark.'], 'the withdrawal is audited with the head and the reason');
select is(
  (select count(*)::int from public.audit_log a
   where a.table_name = 'reports' and a.action = 'insert' and a.row_id = (select id from v2_id)
     and a.actor_id = 'ea000000-0000-0000-0000-000000000002'),
  1, 'and so is the reissued draft');

select * from finish();
rollback;
