-- pgTAP: report_templates, reports, report_shares and the reports and
-- report-assets buckets (migration order step 6; D43). Covers cross-school
-- read and write for every table and both buckets; each role's access (the
-- class teacher writing drafts for their own class and submitting; the head
-- returning, approving, writing the head's comment, publishing and
-- withdrawing; the school admin reading all and writing none; subject
-- teachers and a hod reading their classes' drafts and a hod every
-- published report; parents and learners reading only published, not
-- withdrawn, reports of their own children or themselves, never another
-- child's or a sibling's); the state machine; immutability after publish
-- for every writer; no deletes; corrections as version + 1; the audit row;
-- templates and their defaults; and the stamp and signature uploads.
--
-- Since D44 signed-in users change reports only through the workflow
-- functions (28_report_workflow.test.sql): the user writes below run as the
-- table owner with the user's id, as those functions do, and direct writes
-- through the API are refused.
--
-- Fixture (rolled back at the end). School A: Alice (admin), Hank (head),
-- Tina (class teacher of 4 Blue), Sam (teaches Maths in 4 Blue), Hope (hod,
-- teaches English in 3 Green only), Gina (class teacher of 3 Green), Pat
-- (parent of Lungi in 4 Blue and her brother Luka in 3 Green), Polly
-- (parent of Lerato in 4 Blue), Lara (Lungi's own login), Lars (Luka's own
-- login). School B: Bob (admin), Bert (head), Bea (class teacher of its 4
-- Blue), Pam (parent of its learner). Terms: A Term 2 (past) and Term 3
-- (open), an A vacation school, B Term 3.
--
-- Reports: Lungi Term 2 v1 (withdrawn) and v2 (published), Lungi Term 3
-- (published), Luka Term 2 (published), Luka Term 3 (draft), Lerato Term 3
-- (published), Lerato vacation (submitted), school B's learner (published).
-- Each published report has its PDF in the reports bucket.
begin;

select plan(138);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('e7000000-0000-0000-0000-000000000001', 'alice@reports.test'),
  ('e7000000-0000-0000-0000-000000000002', 'hank@reports.test'),
  ('e7000000-0000-0000-0000-000000000003', 'tina@reports.test'),
  ('e7000000-0000-0000-0000-000000000004', 'sam@reports.test'),
  ('e7000000-0000-0000-0000-000000000005', 'hope@reports.test'),
  ('e7000000-0000-0000-0000-000000000006', 'gina@reports.test'),
  ('e7000000-0000-0000-0000-000000000007', 'pat@reports.test'),
  ('e7000000-0000-0000-0000-000000000008', 'polly@reports.test'),
  ('e7000000-0000-0000-0000-000000000009', 'lara@reports.test'),
  ('e7000000-0000-0000-0000-00000000000a', 'lars@reports.test'),
  ('e7000000-0000-0000-0000-00000000000b', 'bob@reports.test'),
  ('e7000000-0000-0000-0000-00000000000c', 'bert@reports.test'),
  ('e7000000-0000-0000-0000-00000000000d', 'bea@reports.test'),
  ('e7000000-0000-0000-0000-00000000000e', 'pam@reports.test')
) as u (id, email);

insert into public.schools (id, slug, name, stage, timezone, status)
values
  ('a0000000-0000-0000-0000-00000000000a', 'reports-a-test', 'School A', 'secondary', 'Africa/Harare', 'active'),
  ('b0000000-0000-0000-0000-00000000000b', 'reports-b-test', 'School B', 'secondary', 'Africa/Harare', 'active');

insert into public.memberships (school_id, user_id, role, status)
values
  ('a0000000-0000-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000002', 'head', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000004', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000005', 'hod', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000006', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000007', 'parent', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000008', 'parent', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000009', 'learner', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e7000000-0000-0000-0000-00000000000a', 'learner', 'active'),
  ('b0000000-0000-0000-0000-00000000000b', 'e7000000-0000-0000-0000-00000000000b', 'school_admin', 'active'),
  ('b0000000-0000-0000-0000-00000000000b', 'e7000000-0000-0000-0000-00000000000c', 'head', 'active'),
  ('b0000000-0000-0000-0000-00000000000b', 'e7000000-0000-0000-0000-00000000000d', 'teacher', 'active'),
  ('b0000000-0000-0000-0000-00000000000b', 'e7000000-0000-0000-0000-00000000000e', 'parent', 'active');

insert into public.grading_scales (id, school_id, name, stage) values
  ('a1000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', 'Scale', 'o_level'),
  ('a1000000-0000-0000-0000-0000000000bb', 'b0000000-0000-0000-0000-00000000000b', 'Scale', 'o_level');
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values
  ('a2000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', 'Form 4', 'o_level', 'a1000000-0000-0000-0000-0000000000aa'),
  ('a2000000-0000-0000-0000-0000000000bb', 'b0000000-0000-0000-0000-00000000000b', 'Form 4', 'o_level', 'a1000000-0000-0000-0000-0000000000bb');
insert into public.academic_years (id, school_id, label, starts_on, ends_on) values
  ('a3000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', '2026', '2026-01-13', '2026-12-04'),
  ('a3000000-0000-0000-0000-0000000000bb', 'b0000000-0000-0000-0000-00000000000b', '2026', '2026-01-13', '2026-12-04');
insert into public.terms (id, school_id, academic_year_id, name, kind, starts_on, ends_on, status) values
  ('70000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'Term 2', 'term', '2026-05-05', '2026-08-07', 'closed'),
  ('70000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'Term 3', 'term', '2026-09-08', '2026-12-04', 'open'),
  ('70000000-0000-0000-0000-0000000000a6', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'Vacation', 'vacation', '2026-04-14', '2026-04-24', 'closed'),
  ('70000000-0000-0000-0000-0000000000b3', 'b0000000-0000-0000-0000-00000000000b', 'a3000000-0000-0000-0000-0000000000bb', 'Term 3', 'term', '2026-09-08', '2026-12-04', 'open');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ('c4000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'a2000000-0000-0000-0000-0000000000aa', '4 Blue', 'e7000000-0000-0000-0000-000000000003'),
  ('c3000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'a2000000-0000-0000-0000-0000000000aa', '3 Green', 'e7000000-0000-0000-0000-000000000006'),
  ('cb000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'a3000000-0000-0000-0000-0000000000bb', 'a2000000-0000-0000-0000-0000000000bb', '4 Blue', 'e7000000-0000-0000-0000-00000000000d');
insert into public.subjects (id, school_id, code, name, stage_scope) values
  ('d1000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', 'MATH', 'Mathematics', 'secondary'),
  ('d2000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', 'ENG', 'English', 'secondary');
insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values
  ('c5000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-0000000000a1', 'd1000000-0000-0000-0000-0000000000aa', 'e7000000-0000-0000-0000-000000000004'),
  ('c5000000-0000-0000-0000-000000000032', 'a0000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-0000000000a1', 'd2000000-0000-0000-0000-0000000000aa', 'e7000000-0000-0000-0000-000000000005');

insert into public.learners (id, school_id, learner_number, first_name, last_name, user_id) values
  ('f1000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'A-01', 'Lungi', 'Moyo', 'e7000000-0000-0000-0000-000000000009'),
  ('f2000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', 'A-02', 'Luka', 'Moyo', 'e7000000-0000-0000-0000-00000000000a'),
  ('f3000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-00000000000a', 'A-03', 'Lerato', 'Dube', null),
  ('fb000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'B-01', 'Bee', 'Learner', null);
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id) values
  ('e1000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-0000000000a1', 'c4000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000aa'),
  ('e2000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', 'f2000000-0000-0000-0000-0000000000a2', 'c3000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000aa'),
  ('e3000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-0000000000a3', 'c4000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000aa'),
  ('eb000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'fb000000-0000-0000-0000-0000000000b1', 'cb000000-0000-0000-0000-0000000000b1', 'a3000000-0000-0000-0000-0000000000bb');
insert into public.guardians (id, school_id, full_name, user_id) values
  ('9a000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'Pat Moyo', 'e7000000-0000-0000-0000-000000000007'),
  ('9a000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', 'Polly Dube', 'e7000000-0000-0000-0000-000000000008'),
  ('9b000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'Pam B', 'e7000000-0000-0000-0000-00000000000e');
insert into public.guardian_links (school_id, guardian_id, learner_id, relationship, is_primary) values
  ('a0000000-0000-0000-0000-00000000000a', '9a000000-0000-0000-0000-0000000000a1', 'f1000000-0000-0000-0000-0000000000a1', 'mother', true),
  ('a0000000-0000-0000-0000-00000000000a', '9a000000-0000-0000-0000-0000000000a1', 'f2000000-0000-0000-0000-0000000000a2', 'mother', true),
  ('a0000000-0000-0000-0000-00000000000a', '9a000000-0000-0000-0000-0000000000a2', 'f3000000-0000-0000-0000-0000000000a3', 'mother', true),
  ('b0000000-0000-0000-0000-00000000000b', '9b000000-0000-0000-0000-0000000000b1', 'fb000000-0000-0000-0000-0000000000b1', 'mother', true);

-- How many rows a write changed, or the error it raised. A write that RLS
-- hides changes 0 rows; the trigger refuses some writes outright. Either
-- way the test still runs on when a policy is too open (a leak shows as a
-- failed test, not an aborted run).
create function pg_temp.rows_changed(p_sql text)
returns text language plpgsql as $$
declare
  n bigint;
begin
  execute 'with w as (' || p_sql || ' returning 1) select count(*) from w' into n;
  return n::text;
exception when others then
  return 'error ' || sqlstate;
end;
$$;
grant execute on function pg_temp.rows_changed(text) to authenticated, anon;

-- Reports, made and moved through the workflow as the table owner (no
-- user, like the server).
create function pg_temp.template(p_school uuid, p_kind public.term_kind)
returns uuid language sql as $$
  select id from public.report_templates where school_id = p_school and term_kind = p_kind;
$$;

create function pg_temp.publish(p_id uuid)
returns void language sql as $$
  update public.reports set status = 'submitted' where id = p_id;
  update public.reports set status = 'approved' where id = p_id;
  update public.reports
  set status = 'published',
      snapshot = '{"subjects": []}',
      pdf_path = school_id || '/' || id || '/v' || version || '.pdf'
  where id = p_id;
$$;

insert into public.reports (id, school_id, term_id, enrolment_id, template_id) values
  ('a5000000-0000-0000-0000-000000000121', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a2', 'e1000000-0000-0000-0000-0000000000a1', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'term'));
select pg_temp.publish('a5000000-0000-0000-0000-000000000121');
update public.reports set status = 'withdrawn', withdrawn_reason = 'Wrong maths mark'
where id = 'a5000000-0000-0000-0000-000000000121';

insert into public.reports (id, school_id, term_id, enrolment_id, template_id) values
  ('a5000000-0000-0000-0000-000000000122', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a2', 'e1000000-0000-0000-0000-0000000000a1', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'term')),
  ('a5000000-0000-0000-0000-000000000131', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a3', 'e1000000-0000-0000-0000-0000000000a1', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'term')),
  ('a5000000-0000-0000-0000-000000000221', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a2', 'e2000000-0000-0000-0000-0000000000a2', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'term')),
  ('a5000000-0000-0000-0000-000000000231', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a3', 'e2000000-0000-0000-0000-0000000000a2', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'term')),
  ('a5000000-0000-0000-0000-000000000331', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a3', 'e3000000-0000-0000-0000-0000000000a3', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'term')),
  ('a5000000-0000-0000-0000-000000000361', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a6', 'e3000000-0000-0000-0000-0000000000a3', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'vacation')),
  ('b5000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-0000000000b3', 'eb000000-0000-0000-0000-0000000000b1', pg_temp.template('b0000000-0000-0000-0000-00000000000b', 'term'));
select pg_temp.publish(id) from public.reports
where id in ('a5000000-0000-0000-0000-000000000122', 'a5000000-0000-0000-0000-000000000131',
             'a5000000-0000-0000-0000-000000000221', 'a5000000-0000-0000-0000-000000000331',
             'b5000000-0000-0000-0000-0000000000b1');
update public.reports set status = 'submitted' where id = 'a5000000-0000-0000-0000-000000000361';

-- PDFs in the reports bucket for every published or withdrawn report.
insert into storage.objects (bucket_id, name)
select 'reports', pdf_path from public.reports where pdf_path is not null;

-- A share for each school (no API access at all).
insert into public.report_shares (school_id, report_id, token_hash, expires_at) values
  ('a0000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-000000000131', repeat('a', 64), now() + interval '7 days'),
  ('b0000000-0000-0000-0000-00000000000b', 'b5000000-0000-0000-0000-0000000000b1', repeat('b', 64), now() + interval '7 days');

-- Templates: three per school with the REPORT_LAYOUT defaults ------------------------------

select is((select count(*) from public.report_templates where school_id = 'a0000000-0000-0000-0000-00000000000a'), 3::bigint, 'a new school gets one template per term kind');
select is((select sections from public.report_templates where school_id = 'a0000000-0000-0000-0000-00000000000a' and term_kind = 'term'),
  '{"subject_comments": true, "teacher_signature": true, "average_position": true, "attendance": false, "class_comment": true, "head_comment": true, "head_signature": true, "school_stamp": true, "grading_key": true, "legal_line": true, "verification": true}'::jsonb,
  'the term template starts with the term defaults');
select is((select sections from public.report_templates where school_id = 'a0000000-0000-0000-0000-00000000000a' and term_kind = 'vacation'),
  '{"subject_comments": true, "teacher_signature": true, "average_position": false, "attendance": false, "class_comment": false, "head_comment": false, "head_signature": true, "school_stamp": true, "grading_key": true, "legal_line": true, "verification": true}'::jsonb,
  'the vacation template has no position, class comment or head''s comment');
select is((select comment_label from public.report_templates where school_id = 'a0000000-0000-0000-0000-00000000000a' and term_kind = 'term'), 'Teacher''s comment', 'the comment column is "Teacher''s comment" by default (Q28)');
select ok((select count(*) from public.report_templates rt where rt.school_id not in ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b')) = 3 * (select count(*) from public.schools where id not in ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b')), 'every existing school has its three templates');
select throws_ok($$ update public.report_templates set term_kind = 'mock' where school_id = 'a0000000-0000-0000-0000-00000000000a' and term_kind = 'term' $$, '23514', null, 'a template''s term kind never changes');

-- Workflow and immutability for every writer (the owner, like the server) ---------------

select is((select version from public.reports where id = 'a5000000-0000-0000-0000-000000000122'), 2, 'a correction after a withdrawal is version 2');
select ok((select reference_code ~ '^[A-HJ-NP-Z2-9]{10}$' and verification_code ~ '^[A-HJ-NP-Z2-9]{24}$' from public.reports where id = 'a5000000-0000-0000-0000-000000000131'), 'the database sets the reference and verification codes');
select throws_ok($$ update public.reports set snapshot = '{"changed": true}' where id = 'a5000000-0000-0000-0000-000000000131' $$, '23514', null, 'a published report''s snapshot cannot change, even for the server');
select throws_ok($$ update public.reports set pdf_path = null where id = 'a5000000-0000-0000-0000-000000000131' $$, '23514', null, 'a published report''s pdf_path cannot change, even for the server');
select throws_ok($$ update public.reports set head_comment = 'Late' where id = 'a5000000-0000-0000-0000-000000000131' $$, '23514', null, 'nothing else on a published report changes either');
select throws_ok($$ update public.reports set status = 'approved' where id = 'a5000000-0000-0000-0000-000000000131' $$, '23514', null, 'a published report cannot go back to approved');
select throws_ok($$ update public.reports set withdrawn_reason = 'Again' where id = 'a5000000-0000-0000-0000-000000000121' $$, '23514', null, 'a withdrawn report never changes');
select throws_ok($$ update public.reports set status = 'draft' where id = 'a5000000-0000-0000-0000-000000000121' $$, '23514', null, 'a withdrawn report never comes back');
select throws_ok($$ update public.reports set status = 'withdrawn' where id = 'a5000000-0000-0000-0000-000000000331' $$, '23514', null, 'withdrawing needs a reason');
select throws_ok($$ update public.reports set status = 'approved' where id = 'a5000000-0000-0000-0000-000000000231' $$, '23514', null, 'a draft cannot skip to approved');
select throws_ok($$ update public.reports set status = 'published', snapshot = '{}' where id = 'a5000000-0000-0000-0000-000000000231' $$, '23514', null, 'a draft cannot skip to published');
select throws_ok($$ update public.reports set version = 5 where id = 'a5000000-0000-0000-0000-000000000231' $$, '23514', null, 'a report''s version never changes');
select throws_ok($$ update public.reports set pdf_path = school_id || '/' || id || '/v1.pdf' where id = 'a5000000-0000-0000-0000-000000000231' $$, '23514', null, 'a draft has no PDF');
select throws_ok($$ insert into public.reports (school_id, term_id, enrolment_id, template_id, status) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a6', 'e1000000-0000-0000-0000-0000000000a1', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'vacation'), 'published') $$, '23514', null, 'a report starts as a draft');
select throws_ok($$ insert into public.reports (school_id, term_id, enrolment_id, template_id) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a3', 'e1000000-0000-0000-0000-0000000000a1', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'term')) $$, '23505', null, 'no second version while the first is live');
select throws_ok($$ insert into public.reports (school_id, term_id, enrolment_id, template_id) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a6', 'e1000000-0000-0000-0000-0000000000a1', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'term')) $$, '23514', null, 'a vacation report uses the vacation template');
select throws_ok($$ insert into public.reports (school_id, term_id, enrolment_id, template_id) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000b3', 'e1000000-0000-0000-0000-0000000000a1', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'term')) $$, '23503', null, 'a report cannot use another school''s term');
select throws_ok($$ delete from public.reports where id = 'a5000000-0000-0000-0000-000000000231' $$, 'P0001', 'reports are never deleted; withdraw the report instead', 'reports are never deleted, even by the owner');
select throws_ok($$ truncate public.reports cascade $$, 'P0001', 'reports are never deleted; withdraw the report instead', 'reports are never truncated');

set local role authenticated;

-- Hank (head): reads all, returns, approves, comments, publishes, withdraws ----------------
select set_config('request.jwt.claim.sub', 'e7000000-0000-0000-0000-000000000002', true);

select is((select count(*) from public.reports), 7::bigint, 'head reads every report of the school, every state');
select is((select count(*) from public.report_templates), 3::bigint, 'head reads the school''s templates');
select throws_ok($$ update public.reports set average_percent = 50 where id = 'a5000000-0000-0000-0000-000000000231' $$, '42501', null, 'head cannot change a draft (the class teacher''s)');
select throws_ok($$ insert into public.reports (school_id, term_id, enrolment_id, template_id) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a6', 'e1000000-0000-0000-0000-0000000000a1', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'vacation')) $$, '42501', null, 'head cannot make a draft');
reset role; -- as the workflow functions run: the owner, with the user's id
select throws_ok($$ update public.reports set status = 'draft' where id = 'a5000000-0000-0000-0000-000000000361' $$, '23514', 'say why the report is returned', 'returning needs a note');
select lives_ok($$ update public.reports set head_comment = 'Keep it up' where id = 'a5000000-0000-0000-0000-000000000361' $$, 'head writes the head''s comment on a submitted report');
select lives_ok($$ update public.reports set status = 'draft', return_note = 'Check the maths line' where id = 'a5000000-0000-0000-0000-000000000361' $$, 'head returns a submitted report with a note');
set local role authenticated;
select is((select (status, returned_by)::text from public.reports where id = 'a5000000-0000-0000-0000-000000000361'), '(draft,e7000000-0000-0000-0000-000000000002)', 'the returned report is a draft again, returned by the head');
select is(pg_temp.rows_changed($$ update public.reports set average_percent = 50 where school_id = 'b0000000-0000-0000-0000-00000000000b' $$), 'error 42501', 'head cannot write reports through the API, even school B''s');
select is((select count(*) from public.reports where school_id = 'b0000000-0000-0000-0000-00000000000b'), 0::bigint, 'head cannot read school B''s reports');
select throws_ok($$ delete from public.reports where id = 'a5000000-0000-0000-0000-000000000231' $$, '42501', null, 'head cannot delete a report');
select throws_ok($$ select count(*) from public.report_shares $$, '42501', null, 'head cannot read report_shares');
select is((select count(*) from storage.objects where bucket_id = 'reports'), 5::bigint, 'head can see every PDF of the school, withdrawn too');
select is((select count(*) from storage.objects where bucket_id = 'reports' and name like 'b0000000-0000-0000-0000-00000000000b/%'), 0::bigint, 'head cannot see school B''s PDFs');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('reports', 'a0000000-0000-0000-0000-00000000000a/x/v1.pdf') $$, '42501', null, 'head cannot write to the reports bucket (server only)');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('report-assets', 'a0000000-0000-0000-0000-00000000000a/head-signature-1.png') $$, '42501', null, 'head cannot upload the signature image (school admin does)');

-- Tina (class teacher of 4 Blue): drafts for her class, submits ---------------------------
select set_config('request.jwt.claim.sub', 'e7000000-0000-0000-0000-000000000003', true);

select is((select count(*) from public.reports), 5::bigint, 'class teacher reads her class''s reports, every state');
select is((select count(*) from public.reports where enrolment_id = 'e2000000-0000-0000-0000-0000000000a2'), 0::bigint, 'class teacher cannot read another class''s reports');
reset role; -- as the workflow functions run: the owner, with the user's id
select lives_ok($$ update public.reports set average_percent = 61.5, class_position = 2, class_size = 30, snapshot = '{"subjects": [1]}' where id = 'a5000000-0000-0000-0000-000000000361' $$, 'class teacher changes a draft of her class');
select throws_ok($$ update public.reports set head_comment = 'Mine' where id = 'a5000000-0000-0000-0000-000000000361' $$, '23514', null, 'class teacher cannot write the head''s comment');
select throws_ok($$ update public.reports set approved_by = auth.uid(), status = 'approved' where id = 'a5000000-0000-0000-0000-000000000361' $$, '23514', null, 'class teacher cannot approve her own draft');
select lives_ok($$ update public.reports set status = 'submitted' where id = 'a5000000-0000-0000-0000-000000000361' $$, 'class teacher submits a draft');
set local role authenticated;
select is((select (status, submitted_by)::text from public.reports where id = 'a5000000-0000-0000-0000-000000000361'), '(submitted,e7000000-0000-0000-0000-000000000003)', 'the submission is stamped with the class teacher');
select is(pg_temp.rows_changed($$ update public.reports set average_percent = 70 where id = 'a5000000-0000-0000-0000-000000000361' $$), 'error 42501', 'class teacher cannot change a submitted report');
select is(pg_temp.rows_changed($$ update public.reports set status = 'draft', return_note = 'Mine' where id = 'a5000000-0000-0000-0000-000000000361' $$), 'error 42501', 'class teacher cannot take back a submitted report');
select throws_ok($$ insert into public.reports (school_id, term_id, enrolment_id, template_id) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a6', 'e2000000-0000-0000-0000-0000000000a2', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'vacation')) $$, '42501', null, 'class teacher cannot make a draft for another class');
select throws_ok($$ insert into public.reports (school_id, term_id, enrolment_id, template_id) values ('b0000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-0000000000b3', 'eb000000-0000-0000-0000-0000000000b1', pg_temp.template('b0000000-0000-0000-0000-00000000000b', 'term')) $$, '42501', null, 'class teacher cannot make a draft in school B');
reset role; -- as the workflow functions run: the owner, with the user's id
select lives_ok($$ insert into public.reports (id, school_id, term_id, enrolment_id, template_id, version, reference_code, verification_code) values ('a5000000-0000-0000-0000-000000000161', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a6', 'e1000000-0000-0000-0000-0000000000a1', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'vacation'), 9, 'CHOSEN', 'CHOSEN') $$, 'class teacher makes a draft for her class');
set local role authenticated;
select is((select (version, reference_code is null and verification_code is null, created_by)::text from public.reports where id = 'a5000000-0000-0000-0000-000000000161'), '(1,t,e7000000-0000-0000-0000-000000000003)', 'the database chooses the version and author, not the caller, and a draft has no codes');
select is(pg_temp.rows_changed($$ update public.reports set snapshot = '{}' where id = 'a5000000-0000-0000-0000-000000000131' $$), 'error 42501', 'class teacher cannot change a published report');
select throws_ok($$ select count(*) from public.report_shares $$, '42501', null, 'class teacher cannot read report_shares');
select is((select count(*) from public.report_templates), 3::bigint, 'class teacher reads the school''s templates');
select is_empty($$ update public.report_templates set footer_text = 'x' returning 1 $$, 'class teacher cannot change a template');

-- Hank again: approve, publish with the PDF, withdraw, and the correction -----------------
select set_config('request.jwt.claim.sub', 'e7000000-0000-0000-0000-000000000002', true);

reset role; -- as the workflow functions run: the owner, with the user's id
select lives_ok($$ update public.reports set status = 'approved' where id = 'a5000000-0000-0000-0000-000000000361' $$, 'head approves a submitted report');
select throws_ok($$ update public.reports set status = 'published', snapshot = null where id = 'a5000000-0000-0000-0000-000000000361' $$, '23514', null, 'publishing needs the snapshot');
select lives_ok($$ update public.reports set status = 'published', snapshot = '{"subjects": [1], "head": "Keep it up"}', pdf_path = school_id || '/' || id || '/v1.pdf' where id = 'a5000000-0000-0000-0000-000000000361' $$, 'head publishes an approved report with its snapshot and PDF');
select is((select (published_by, approved_by)::text from public.reports where id = 'a5000000-0000-0000-0000-000000000361'), '(e7000000-0000-0000-0000-000000000002,e7000000-0000-0000-0000-000000000002)', 'approval and publication are stamped with the head');
select throws_ok($$ update public.reports set snapshot = '{"subjects": []}' where id = 'a5000000-0000-0000-0000-000000000361' $$, '23514', null, 'head cannot change a published snapshot');
select throws_ok($$ update public.reports set pdf_path = school_id || '/' || id || '/v2.pdf' where id = 'a5000000-0000-0000-0000-000000000361' $$, '23514', null, 'head cannot change a published pdf_path');
select lives_ok($$ update public.reports set status = 'withdrawn', withdrawn_reason = 'Wrong English grade' where id = 'a5000000-0000-0000-0000-000000000331' $$, 'head withdraws a published report with a reason');
select is((select (status, withdrawn_by)::text from public.reports where id = 'a5000000-0000-0000-0000-000000000331'), '(withdrawn,e7000000-0000-0000-0000-000000000002)', 'the withdrawal is stamped with the head');
select ok((select snapshot -> 'subjects' = '[]' and pdf_path is not null from public.reports where id = 'a5000000-0000-0000-0000-000000000331'), 'the withdrawn version keeps its snapshot and PDF');

select set_config('request.jwt.claim.sub', 'e7000000-0000-0000-0000-000000000003', true);
select lives_ok($$ insert into public.reports (id, school_id, term_id, enrolment_id, template_id) values ('a5000000-0000-0000-0000-000000000332', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a3', 'e3000000-0000-0000-0000-0000000000a3', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'term')) $$, 'class teacher issues the correction as a new draft');
select is((select version from public.reports where id = 'a5000000-0000-0000-0000-000000000332'), 2, 'the correction is version 2');
select throws_ok($$ insert into public.reports (school_id, term_id, enrolment_id, template_id) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a3', 'e3000000-0000-0000-0000-0000000000a3', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'term')) $$, '23505', null, 'only one live version per learner and term');
set local role authenticated;

-- Sam (subject teacher in 4 Blue): reads its drafts, writes nothing -----------------------
select set_config('request.jwt.claim.sub', 'e7000000-0000-0000-0000-000000000004', true);

select is((select count(*) from public.reports where enrolment_id in ('e1000000-0000-0000-0000-0000000000a1', 'e3000000-0000-0000-0000-0000000000a3')), 7::bigint, 'subject teacher reads every report of a class he teaches, drafts too');
select is((select count(*) from public.reports where enrolment_id = 'e2000000-0000-0000-0000-0000000000a2'), 0::bigint, 'subject teacher cannot read a class he does not teach');
select is(pg_temp.rows_changed($$ update public.reports set average_percent = 1 where id = 'a5000000-0000-0000-0000-000000000332' $$), 'error 42501', 'subject teacher cannot change a draft');
select throws_ok($$ insert into public.reports (school_id, term_id, enrolment_id, template_id) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a6', 'e3000000-0000-0000-0000-0000000000a3', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'vacation')) $$, '42501', null, 'subject teacher cannot make a draft');
select is((select count(*) from storage.objects where bucket_id = 'reports'), 4::bigint, 'subject teacher sees only his classes'' PDFs');

-- Hope (hod, teaches only in 3 Green): her classes' drafts, every published report --------
select set_config('request.jwt.claim.sub', 'e7000000-0000-0000-0000-000000000005', true);

select is((select count(*) from public.reports where id = 'a5000000-0000-0000-0000-000000000231'), 1::bigint, 'hod reads a draft of a class she teaches');
select is((select count(*) from public.reports where id = 'a5000000-0000-0000-0000-000000000332'), 0::bigint, 'hod cannot read a draft of a class she does not teach');
select is((select count(*) from public.reports where id in ('a5000000-0000-0000-0000-000000000131', 'a5000000-0000-0000-0000-000000000361')), 2::bigint, 'hod reads published reports of other classes');
select is((select count(*) from public.reports where id = 'a5000000-0000-0000-0000-000000000331'), 0::bigint, 'hod cannot read a withdrawn report of a class she does not teach');
select is(pg_temp.rows_changed($$ update public.reports set average_percent = 1 where id = 'a5000000-0000-0000-0000-000000000231' $$), 'error 42501', 'hod cannot change a draft');
select is((select count(*) from public.reports where school_id = 'b0000000-0000-0000-0000-00000000000b'), 0::bigint, 'hod cannot read school B''s published reports');

-- Alice (school admin): reads all, writes no report; owns the templates and uploads -------
select set_config('request.jwt.claim.sub', 'e7000000-0000-0000-0000-000000000001', true);

select is((select count(*) from public.reports), 9::bigint, 'school admin reads every report of the school');
select is((select count(*) from public.reports where school_id = 'b0000000-0000-0000-0000-00000000000b'), 0::bigint, 'school admin cannot read school B''s reports');
select is(pg_temp.rows_changed($$ update public.reports set average_percent = 1 where id = 'a5000000-0000-0000-0000-000000000332' $$), 'error 42501', 'school admin cannot change a draft');
select is(pg_temp.rows_changed($$ update public.reports set status = 'approved' where id = 'a5000000-0000-0000-0000-000000000231' $$), 'error 42501', 'school admin cannot move a report on');
select throws_ok($$ insert into public.reports (school_id, term_id, enrolment_id, template_id) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a6', 'e2000000-0000-0000-0000-0000000000a2', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'vacation')) $$, '42501', null, 'school admin cannot make a draft');
select throws_ok($$ select count(*) from public.report_shares $$, '42501', null, 'school admin cannot read report_shares');
select throws_ok($$ insert into public.report_shares (school_id, report_id, token_hash, expires_at) values ('a0000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-000000000131', repeat('c', 64), now()) $$, '42501', null, 'school admin cannot write report_shares');

select is((select count(*) from public.report_templates), 3::bigint, 'school admin reads only her school''s templates');
select lives_ok($$ update public.report_templates set sections = sections || '{"average_position": false}', footer_text = 'Issued by the school.', comment_label = 'Tutor''s comment' where school_id = 'a0000000-0000-0000-0000-00000000000a' and term_kind = 'term' $$, 'school admin changes a template''s sections, footer and comment label');
select is((select (sections ->> 'average_position', comment_label)::text from public.report_templates where school_id = 'a0000000-0000-0000-0000-00000000000a' and term_kind = 'term'), '(false,"Tutor''s comment")', 'the template change is saved');
select throws_ok($$ update public.report_templates set sections = sections - 'verification' where school_id = 'a0000000-0000-0000-0000-00000000000a' and term_kind = 'term' $$, '23514', null, 'a template must list every section');
select throws_ok($$ update public.report_templates set sections = sections || '{"grading_key": "yes"}' where school_id = 'a0000000-0000-0000-0000-00000000000a' and term_kind = 'term' $$, '23514', null, 'each section is true or false');
select throws_ok($$ update public.report_templates set sections = sections || '{"class_comment": true}' where school_id = 'a0000000-0000-0000-0000-00000000000a' and term_kind = 'vacation' $$, '23514', null, 'a vacation report cannot show a class teacher''s comment (Q8)');
select throws_ok($$ update public.report_templates set comment_label = '' where school_id = 'a0000000-0000-0000-0000-00000000000a' and term_kind = 'term' $$, '23514', null, 'the comment label cannot be empty');
select is_empty($$ update public.report_templates set footer_text = 'Hacked' where school_id = 'b0000000-0000-0000-0000-00000000000b' returning 1 $$, 'school admin cannot change school B''s templates');
select throws_ok($$ insert into public.report_templates (school_id, term_kind, name, sections) values ('a0000000-0000-0000-0000-00000000000a', 'mock', 'Second', private.default_report_sections('mock')) $$, '42501', null, 'school admin cannot add a template (one per kind, made for her)');
select throws_ok($$ delete from public.report_templates where school_id = 'a0000000-0000-0000-0000-00000000000a' $$, '42501', null, 'school admin cannot delete a template');

select lives_ok($$ insert into storage.objects (bucket_id, name) values ('report-assets', 'a0000000-0000-0000-0000-00000000000a/stamp-1791700000000.png') $$, 'school admin uploads the stamp');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('report-assets', 'a0000000-0000-0000-0000-00000000000a/head-signature-1791700000000.webp') $$, 'school admin uploads the head''s signature');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('report-assets', 'b0000000-0000-0000-0000-00000000000b/stamp-1791700000000.png') $$, '42501', null, 'school admin cannot upload into school B''s folder');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('report-assets', 'a0000000-0000-0000-0000-00000000000a/logo.png') $$, '42501', null, 'only stamp and head-signature objects go in report-assets');
select is((select count(*) from storage.objects where bucket_id = 'report-assets'), 0::bigint, 'nobody reads the stamp or signature through the API (rendering only)');
select is_empty($$ update storage.objects set name = 'a0000000-0000-0000-0000-00000000000a/stamp-2.png' where bucket_id = 'report-assets' returning 1 $$, 'an uploaded stamp is never replaced in place');
select lives_ok($$ update public.schools set stamp_path = 'a0000000-0000-0000-0000-00000000000a/stamp-1791700000000.png', head_signature_path = 'a0000000-0000-0000-0000-00000000000a/head-signature-1791700000000.webp' where id = 'a0000000-0000-0000-0000-00000000000a' $$, 'school admin points the school at the new images');
select throws_ok($$ update public.schools set stamp_path = 'b0000000-0000-0000-0000-00000000000b/stamp-1791700000000.png' where id = 'a0000000-0000-0000-0000-00000000000a' $$, '23514', null, 'the stamp path must be in the school''s own folder');
select is((select count(*) from storage.objects where bucket_id = 'reports'), 5::bigint, 'school admin sees every PDF of the school');

-- Pat (parent of Lungi and Luka): only their published, live reports ---------------------
select set_config('request.jwt.claim.sub', 'e7000000-0000-0000-0000-000000000007', true);

select is((select array_agg(id::text order by id) from public.reports),
  array['a5000000-0000-0000-0000-000000000122', 'a5000000-0000-0000-0000-000000000131', 'a5000000-0000-0000-0000-000000000221'],
  'parent reads only her children''s published reports');
select is((select count(*) from public.reports where id = 'a5000000-0000-0000-0000-000000000121'), 0::bigint, 'parent cannot read a withdrawn version');
select is((select count(*) from public.reports where id = 'a5000000-0000-0000-0000-000000000231'), 0::bigint, 'parent cannot read her child''s draft');
select is((select count(*) from public.reports where enrolment_id = 'e3000000-0000-0000-0000-0000000000a3'), 0::bigint, 'parent cannot read another child''s report');
select is((select count(*) from public.report_templates), 0::bigint, 'parent reads no templates');
select is(pg_temp.rows_changed($$ update public.reports set average_percent = 1 where id = 'a5000000-0000-0000-0000-000000000131' $$), 'error 42501', 'parent cannot change a report');
select is((select array_agg(name order by name) from storage.objects where bucket_id = 'reports'),
  (select array_agg(pdf_path order by pdf_path) from public.reports where status = 'published'),
  'parent sees exactly the PDFs of her children''s published reports');
select ok(public.is_guardian_of('f2000000-0000-0000-0000-0000000000a2') and not public.is_guardian_of('f3000000-0000-0000-0000-0000000000a3'), 'is_guardian_of: her son yes, another child no');
select ok(not public.is_own_learner('f1000000-0000-0000-0000-0000000000a1'), 'is_own_learner: a parent is not her child');

-- Polly (parent of Lerato only) ------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'e7000000-0000-0000-0000-000000000008', true);

select is((select array_agg(id::text order by id) from public.reports), array['a5000000-0000-0000-0000-000000000361'], 'another parent reads only her own child''s published report, not the withdrawn one');
select is((select count(*) from storage.objects where bucket_id = 'reports' and name like '%a5000000-0000-0000-0000-000000000131%'), 0::bigint, 'another parent cannot see the first parent''s child''s PDF');

-- Lara (Lungi's own login) and Lars (Luka's) ------------------------------------------------
select set_config('request.jwt.claim.sub', 'e7000000-0000-0000-0000-000000000009', true);

select is((select array_agg(id::text order by id) from public.reports), array['a5000000-0000-0000-0000-000000000122', 'a5000000-0000-0000-0000-000000000131'], 'learner reads only her own published reports');
select is((select count(*) from public.reports where id = 'a5000000-0000-0000-0000-000000000221'), 0::bigint, 'learner cannot read her brother''s published report');
select is((select count(*) from storage.objects where bucket_id = 'reports'), 2::bigint, 'learner sees only her own PDFs');
select ok(public.is_own_learner('f1000000-0000-0000-0000-0000000000a1') and not public.is_own_learner('f2000000-0000-0000-0000-0000000000a2') and not public.is_guardian_of('f2000000-0000-0000-0000-0000000000a2'), 'is_own_learner: herself yes, her brother no');

select set_config('request.jwt.claim.sub', 'e7000000-0000-0000-0000-00000000000a', true);
select is((select array_agg(id::text order by id) from public.reports), array['a5000000-0000-0000-0000-000000000221'], 'her brother reads only his own published report');

-- School B people see nothing of school A ------------------------------------------------------
select set_config('request.jwt.claim.sub', 'e7000000-0000-0000-0000-00000000000e', true);
select is((select array_agg(id::text) from public.reports), array['b5000000-0000-0000-0000-0000000000b1'], 'school B''s parent reads only her own child''s report');
select is((select count(*) from storage.objects where bucket_id = 'reports' and name like 'a0000000-0000-0000-0000-00000000000a/%'), 0::bigint, 'school B''s parent cannot see school A''s PDFs');

select set_config('request.jwt.claim.sub', 'e7000000-0000-0000-0000-00000000000b', true);
select is((select count(*) from public.reports where school_id = 'a0000000-0000-0000-0000-00000000000a'), 0::bigint, 'school B''s admin cannot read school A''s reports');
select is((select count(*) from public.report_templates where school_id = 'a0000000-0000-0000-0000-00000000000a'), 0::bigint, 'school B''s admin cannot read school A''s templates');
select is_empty($$ update public.report_templates set footer_text = 'Hacked' where school_id = 'a0000000-0000-0000-0000-00000000000a' returning 1 $$, 'school B''s admin cannot change school A''s templates');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('report-assets', 'a0000000-0000-0000-0000-00000000000a/stamp-1791700000001.png') $$, '42501', null, 'school B''s admin cannot upload a stamp for school A');

select set_config('request.jwt.claim.sub', 'e7000000-0000-0000-0000-00000000000c', true);
select is(pg_temp.rows_changed($$ update public.reports set status = 'withdrawn', withdrawn_reason = 'x' where school_id = 'a0000000-0000-0000-0000-00000000000a' $$), 'error 42501', 'school B''s head cannot withdraw school A''s reports');
select is((select count(*) from storage.objects where bucket_id = 'reports'), 1::bigint, 'school B''s head sees only school B''s PDF');

select set_config('request.jwt.claim.sub', 'e7000000-0000-0000-0000-00000000000d', true);
select throws_ok($$ insert into public.reports (school_id, term_id, enrolment_id, template_id) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a6', 'e1000000-0000-0000-0000-0000000000a1', pg_temp.template('a0000000-0000-0000-0000-00000000000a', 'vacation')) $$, '42501', null, 'school B''s class teacher cannot make a draft in school A');

-- Anonymous ----------------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*) from public.reports) + (select count(*) from public.report_templates), 0::bigint, 'anonymous reads no reports or templates');
select throws_ok($$ select count(*) from public.report_shares $$, '42501', null, 'anonymous cannot read report_shares');
select is((select count(*) from storage.objects where bucket_id in ('reports', 'report-assets')), 0::bigint, 'anonymous sees no report files');

-- Audit --------------------------------------------------------------------------------------------
reset role;

select is(
  (select count(*) from public.audit_log
   where table_name = 'reports' and row_id = 'a5000000-0000-0000-0000-000000000161' and action = 'insert'
     and actor_id = 'e7000000-0000-0000-0000-000000000003'
     and learner_id = 'f1000000-0000-0000-0000-0000000000a1' and class_id = 'c4000000-0000-0000-0000-0000000000a1'),
  1::bigint,
  'a new draft writes an audit row with its author, learner and class'
);
select is(
  (select array_agg(new_data ->> 'status' order by id) from public.audit_log
   where table_name = 'reports' and row_id = 'a5000000-0000-0000-0000-000000000361' and action = 'update'
     and actor_id is not null),
  array['submitted', 'draft', 'draft', 'submitted', 'approved', 'published'],
  'every change to a report is audited, each state move with who made it'
);
select is(
  (select (old_data ->> 'status') || ' to ' || (new_data ->> 'status') || ': ' || (new_data ->> 'withdrawn_reason')
   from public.audit_log
   where table_name = 'reports' and row_id = 'a5000000-0000-0000-0000-000000000331' and action = 'update'
     and actor_id = 'e7000000-0000-0000-0000-000000000002'),
  'published to withdrawn: Wrong English grade',
  'a withdrawal is audited with its reason'
);

select * from finish();
rollback;
