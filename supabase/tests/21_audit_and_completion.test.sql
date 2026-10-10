-- pgTAP: the audit log screen's context columns and page function (D35),
-- and completion tracking (US-4.8, D36).
--
-- Audit: rows about marks, comments, assessments, unlocks and learners get
-- their learner, class and class subject filled in; public.audit_entries()
-- answers only a school admin or head of the school (never another school,
-- a teacher or anonymous users), resolves names, filters by learner, class,
-- actor and date, and pages without repeating a row.
-- Completion: counts of missing marks, subject comments and class comments
-- and the weight total per class subject and class, leavers left out; admin
-- and head see the whole school, a teacher or hod only their own class
-- subjects and classes, another school nothing.
--
-- Fixture (rolled back). School A: Alice (admin), Hank (head), Sam (teaches
-- Maths in 4 Blue and is its class teacher), Hope (hod, teaches English in
-- 4 Blue). School B: Bob (admin). 4 Blue has Tendai (takes Maths and
-- English) and Ruva, who has left. Maths has two assessments (40% + 60%),
-- English one (50%). An open term and a vacation term.
begin;

select plan(41);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', jsonb_build_object('full_name', u.name), now(), now(), '', '', '', ''
from (values
  ('e5000000-0000-0000-0000-000000000001', 'alice@audit.test', 'Alice Admin'),
  ('e5000000-0000-0000-0000-000000000002', 'hank@audit.test', 'Hank Head'),
  ('e5000000-0000-0000-0000-000000000003', 'sam@audit.test', 'Sam Moyo'),
  ('e5000000-0000-0000-0000-000000000004', 'hope@audit.test', 'Hope Dube'),
  ('e5000000-0000-0000-0000-000000000005', 'bob@audit.test', 'Bob Admin')
) as u (id, email, name);

insert into public.schools (id, slug, name, stage, timezone, status)
values
  ('a0000000-0000-0000-0000-00000000000a', 'audit-a-test', 'School A', 'secondary', 'Africa/Harare', 'active'),
  ('b0000000-0000-0000-0000-00000000000b', 'audit-b-test', 'School B', 'secondary', 'Africa/Harare', 'active');

insert into public.memberships (school_id, user_id, role, status)
values
  ('a0000000-0000-0000-0000-00000000000a', 'e5000000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e5000000-0000-0000-0000-000000000002', 'head', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e5000000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e5000000-0000-0000-0000-000000000004', 'hod', 'active'),
  ('b0000000-0000-0000-0000-00000000000b', 'e5000000-0000-0000-0000-000000000005', 'school_admin', 'active');

insert into public.grading_scales (id, school_id, name, stage) values
  ('a1000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', 'Scale', 'o_level');
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values
  ('a2000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', 'Form 4', 'o_level', 'a1000000-0000-0000-0000-0000000000aa');
insert into public.academic_years (id, school_id, label, starts_on, ends_on) values
  ('a3000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', '2026', '2026-01-13', '2026-12-04');
insert into public.terms (id, school_id, academic_year_id, name, kind, starts_on, ends_on, marks_deadline, status) values
  ('70000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'Open', 'term', '2026-09-08', '2026-12-04', current_date + 30, 'open'),
  ('70000000-0000-0000-0000-0000000000a6', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'Vacation', 'vacation', '2026-04-14', '2026-04-24', current_date + 30, 'open');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ('c4000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'a2000000-0000-0000-0000-0000000000aa', '4 Blue', 'e5000000-0000-0000-0000-000000000003');
insert into public.subjects (id, school_id, code, name, stage_scope) values
  ('d1000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', 'MATH', 'Mathematics', 'secondary'),
  ('d2000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', 'ENG', 'English', 'secondary');
insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values
  ('c5000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-0000000000a1', 'd1000000-0000-0000-0000-0000000000aa', 'e5000000-0000-0000-0000-000000000003'),
  ('c5000000-0000-0000-0000-000000000042', 'a0000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-0000000000a1', 'd2000000-0000-0000-0000-0000000000aa', 'e5000000-0000-0000-0000-000000000004');
insert into public.learners (id, school_id, learner_number, first_name, last_name) values
  ('f4000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'A001', 'Tendai', 'Ncube'),
  ('f4000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', 'A002', 'Ruva', 'Left');
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id, status) values
  ('e4000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'f4000000-0000-0000-0000-0000000000a1', 'c4000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000aa', 'enrolled'),
  ('e4000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', 'f4000000-0000-0000-0000-0000000000a2', 'c4000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000aa', 'enrolled');
insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id) values
  ('a0000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000041'),
  ('a0000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000042'),
  ('a0000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-0000000000a2', 'c5000000-0000-0000-0000-000000000041');
update public.enrolments set status = 'left' where id = 'e4000000-0000-0000-0000-0000000000a2';
insert into public.assessments (id, school_id, term_id, class_subject_id, name, type, max_mark, weight_percent) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000041', 'Test 1', 'test', 30, 40),
  ('a5000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000041', 'Exam', 'exam', 100, 60),
  ('a5000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000042', 'Essay', 'assignment', 50, 50);

set local role authenticated;

-- Sam enters and changes Tendai's Test 1 mark and writes his comment ---------------
select set_config('request.jwt.claim.sub', 'e5000000-0000-0000-0000-000000000003', true);
insert into public.marks (id, school_id, assessment_id, enrolment_id, score, status) values
  ('3a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-0000000000a1', 21, 'present');
update public.marks set score = 23 where id = '3a000000-0000-0000-0000-000000000001';
insert into public.subject_comments (school_id, term_id, enrolment_id, class_subject_id, comment) values
  ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'e4000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000041', 'Good');

-- Hank unlocks English; Alice renames Tendai ----------------------------------
select set_config('request.jwt.claim.sub', 'e5000000-0000-0000-0000-000000000002', true);
select public.unlock_class_subject('c5000000-0000-0000-0000-000000000042', '70000000-0000-0000-0000-0000000000a1', 'Re-marked');
select set_config('request.jwt.claim.sub', 'e5000000-0000-0000-0000-000000000001', true);
update public.learners set last_name = 'Ncube-Moyo' where id = 'f4000000-0000-0000-0000-0000000000a1';

-- Context columns ----------------------------------------------------------------
select results_eq(
  $$ select learner_id, class_id, class_subject_id from public.audit_log
     where table_name = 'marks' and row_id = '3a000000-0000-0000-0000-000000000001' and action = 'update' $$,
  $$ values ('f4000000-0000-0000-0000-0000000000a1'::uuid, 'c4000000-0000-0000-0000-0000000000a1'::uuid, 'c5000000-0000-0000-0000-000000000041'::uuid) $$,
  'a mark change records its learner, class and class subject');
select results_eq(
  $$ select learner_id, class_id, class_subject_id from public.audit_log where table_name = 'subject_comments' $$,
  $$ values ('f4000000-0000-0000-0000-0000000000a1'::uuid, 'c4000000-0000-0000-0000-0000000000a1'::uuid, 'c5000000-0000-0000-0000-000000000041'::uuid) $$,
  'a subject comment records its learner, class and class subject');
select results_eq(
  $$ select class_id, class_subject_id from public.audit_log
     where table_name = 'assessments' and row_id = 'a5000000-0000-0000-0000-000000000003' $$,
  $$ values ('c4000000-0000-0000-0000-0000000000a1'::uuid, 'c5000000-0000-0000-0000-000000000042'::uuid) $$,
  'an assessment records its class and class subject');
select results_eq(
  $$ select class_id, class_subject_id, reason from public.audit_log where event = 'marks_unlocked' and school_id = 'a0000000-0000-0000-0000-00000000000a' $$,
  $$ values ('c4000000-0000-0000-0000-0000000000a1'::uuid, 'c5000000-0000-0000-0000-000000000042'::uuid, 'Re-marked') $$,
  'an unlock event records its class and class subject');
select results_eq(
  $$ select learner_id, class_id from public.audit_log
     where table_name = 'learners' and action = 'update' and row_id = 'f4000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('f4000000-0000-0000-0000-0000000000a1'::uuid, 'c4000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'a learner change records the learner and their class');
select results_eq(
  $$ select learner_id, class_id from public.audit_log
     where table_name = 'enrolments' and action = 'update' and row_id = 'e4000000-0000-0000-0000-0000000000a2' $$,
  $$ values ('f4000000-0000-0000-0000-0000000000a2'::uuid, 'c4000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'an enrolment change records its learner and class');

-- audit_entries: who may read ------------------------------------------------------
-- Alice (admin of A)
select ok((select count(*) from public.audit_entries('a0000000-0000-0000-0000-00000000000a', p_limit => 200)) > 0,
  'admin reads her school''s audit page');
select is((select count(*) from public.audit_entries('b0000000-0000-0000-0000-00000000000b')), 0::bigint,
  'admin of A reads nothing of school B''s audit log');
select results_eq(
  $$ select actor_name, learner_name, learner_number, class_name, subject_name, assessment_name, term_name
     from public.audit_entries('a0000000-0000-0000-0000-00000000000a',
                               p_learner_id => 'f4000000-0000-0000-0000-0000000000a1')
     where table_name = 'marks' and action = 'update' $$,
  $$ values ('Sam Moyo', 'Tendai Ncube-Moyo', 'A001', '4 Blue', 'Mathematics', 'Test 1', 'Open') $$,
  'a mark change comes with the names for plain words');
select results_eq(
  $$ select (old_data ->> 'score')::numeric, (new_data ->> 'score')::numeric
     from public.audit_entries('a0000000-0000-0000-0000-00000000000a')
     where table_name = 'marks' and action = 'update' $$,
  $$ values (21::numeric, 23::numeric) $$,
  'a mark change carries the old and new value');
select is(
  (select count(*) from public.audit_entries('a0000000-0000-0000-0000-00000000000a',
     p_learner_id => 'f4000000-0000-0000-0000-0000000000a1', p_limit => 200)
   where learner_name is distinct from 'Tendai Ncube-Moyo'),
  0::bigint, 'the learner filter returns only that learner''s rows');
select ok(
  (select count(*) from public.audit_entries('a0000000-0000-0000-0000-00000000000a',
     p_learner_id => 'f4000000-0000-0000-0000-0000000000a1', p_limit => 200)) >= 4,
  'the learner filter finds the learner''s marks, comment, enrolment and learner rows');
select is(
  (select count(*) from public.audit_entries('a0000000-0000-0000-0000-00000000000a',
     p_class_id => 'c4000000-0000-0000-0000-0000000000a1', p_limit => 200)
   where class_name is distinct from '4 Blue'),
  0::bigint, 'the class filter returns only that class''s rows');
select results_eq(
  $$ select table_name, action::text from public.audit_entries('a0000000-0000-0000-0000-00000000000a',
       p_actor_id => 'e5000000-0000-0000-0000-000000000003') order by id $$,
  $$ values ('marks', 'insert'), ('marks', 'update'), ('subject_comments', 'insert') $$,
  'the actor filter returns only that person''s changes');
select is(
  (select count(*) from public.audit_entries('a0000000-0000-0000-0000-00000000000a', p_from => current_date + 2)),
  0::bigint, 'nothing is newer than the day after tomorrow');
select ok(
  (select count(*) from public.audit_entries('a0000000-0000-0000-0000-00000000000a',
     p_from => current_date - 1, p_to => current_date + 1)) > 0,
  'today''s changes fall inside a date range around today');
select is(
  (select count(*) from public.audit_entries('a0000000-0000-0000-0000-00000000000a', p_to => current_date - 2)),
  0::bigint, 'nothing is older than the fixture');

-- Paging: two pages of two never repeat and follow newest first.
create temporary table page_one as
  select id, created_at from public.audit_entries('a0000000-0000-0000-0000-00000000000a', p_limit => 2);
select is((select count(*) from page_one), 2::bigint, 'the page size is respected');
select is(
  (select count(*) from public.audit_entries('a0000000-0000-0000-0000-00000000000a',
     p_before_at => (select min(created_at) from page_one where id = (select min(id) from page_one)),
     p_before_id => (select min(id) from page_one), p_limit => 2) p
   where p.id in (select id from page_one)),
  0::bigint, 'the next page repeats no row');
select ok(
  (select max(id) from public.audit_entries('a0000000-0000-0000-0000-00000000000a',
     p_before_at => (select min(created_at) from page_one where id = (select min(id) from page_one)),
     p_before_id => (select min(id) from page_one), p_limit => 2))
  < (select min(id) from page_one),
  'the next page is older');

-- Hank (head) reads too.
select set_config('request.jwt.claim.sub', 'e5000000-0000-0000-0000-000000000002', true);
select ok((select count(*) from public.audit_entries('a0000000-0000-0000-0000-00000000000a')) > 0,
  'head reads the audit page');
-- Sam (teacher) reads nothing.
select set_config('request.jwt.claim.sub', 'e5000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.audit_entries('a0000000-0000-0000-0000-00000000000a')), 0::bigint,
  'a teacher reads nothing from the audit page');
-- Bob (admin of B) reads nothing of A.
select set_config('request.jwt.claim.sub', 'e5000000-0000-0000-0000-000000000005', true);
select is((select count(*) from public.audit_entries('a0000000-0000-0000-0000-00000000000a')), 0::bigint,
  'admin of B reads nothing of school A''s audit log');
select is((select count(*) from public.audit_log where school_id = 'a0000000-0000-0000-0000-00000000000a'), 0::bigint,
  'admin of B reads no school A audit rows directly either');

-- Completion -----------------------------------------------------------------------
-- Alice: whole school. Maths: 1 learner still in class (Ruva left) x 2
-- assessments, 1 mark in = 1 missing; comment is a draft = 1 missing.
-- English: 1 learner x 1 assessment, none in; weights 50.
select set_config('request.jwt.claim.sub', 'e5000000-0000-0000-0000-000000000001', true);
select results_eq(
  $$ select subject_name, teacher_name, learners, assessments, total_weight, marks_missing, comments_missing
     from public.completion_class_subjects('70000000-0000-0000-0000-0000000000a1') $$,
  $$ values ('English', 'Hope Dube', 1, 1, 50::numeric, 1, 1), ('Mathematics', 'Sam Moyo', 1, 2, 100::numeric, 1, 1) $$,
  'admin sees every class subject with what is missing, leavers left out');
select results_eq(
  $$ select class_name, class_teacher_name, learners, class_comments_missing
     from public.completion_classes('70000000-0000-0000-0000-0000000000a1') $$,
  $$ values ('4 Blue', 'Sam Moyo', 1, 1) $$,
  'admin sees each class with its missing class comments');
select results_eq(
  $$ select class_comments_missing from public.completion_classes('70000000-0000-0000-0000-0000000000a6') $$,
  $$ values (null::int) $$,
  'a vacation term has no class comments to miss');

-- Sam marks his comment done, enters the exam and writes the class comment.
select set_config('request.jwt.claim.sub', 'e5000000-0000-0000-0000-000000000003', true);
update public.subject_comments set status = 'submitted'
  where enrolment_id = 'e4000000-0000-0000-0000-0000000000a1' and class_subject_id = 'c5000000-0000-0000-0000-000000000041';
insert into public.marks (school_id, assessment_id, enrolment_id, score, status) values
  ('a0000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-000000000002', 'e4000000-0000-0000-0000-0000000000a1', null, 'absent');
insert into public.class_comments (school_id, term_id, enrolment_id, comment, status) values
  ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'e4000000-0000-0000-0000-0000000000a1', 'A good term.', 'submitted');

select results_eq(
  $$ select subject_name, marks_missing, comments_missing
     from public.completion_class_subjects('70000000-0000-0000-0000-0000000000a1') $$,
  $$ values ('Mathematics', 0, 0) $$,
  'a teacher sees only the class subjects they teach, and the counts drop (absent counts as entered)');
select results_eq(
  $$ select class_name, class_comments_missing from public.completion_classes('70000000-0000-0000-0000-0000000000a1') $$,
  $$ values ('4 Blue', 0) $$,
  'a class teacher sees their class, and the class comment count drops');

-- Hope (hod): her English only, no classes.
select set_config('request.jwt.claim.sub', 'e5000000-0000-0000-0000-000000000004', true);
select results_eq(
  $$ select subject_name from public.completion_class_subjects('70000000-0000-0000-0000-0000000000a1') $$,
  $$ values ('English') $$,
  'a hod sees only the class subjects they teach');
select is_empty($$ select 1 from public.completion_classes('70000000-0000-0000-0000-0000000000a1') $$,
  'a hod who is no class teacher sees no classes');

-- Hank (head): whole school.
select set_config('request.jwt.claim.sub', 'e5000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.completion_class_subjects('70000000-0000-0000-0000-0000000000a1')), 2::bigint,
  'head sees every class subject');
select is((select count(*) from public.completion_classes('70000000-0000-0000-0000-0000000000a1')), 1::bigint,
  'head sees every class');

-- Bob (admin of B): nothing of school A.
select set_config('request.jwt.claim.sub', 'e5000000-0000-0000-0000-000000000005', true);
select is_empty($$ select 1 from public.completion_class_subjects('70000000-0000-0000-0000-0000000000a1') $$,
  'admin of B sees no class subjects of school A');
select is_empty($$ select 1 from public.completion_classes('70000000-0000-0000-0000-0000000000a1') $$,
  'admin of B sees no classes of school A');

-- Not signed in: no rows; anonymous: no access at all.
select set_config('request.jwt.claim.sub', '', true);
select is_empty($$ select 1 from public.completion_class_subjects('70000000-0000-0000-0000-0000000000a1') $$,
  'a caller with no user sees no class subjects');
select is_empty($$ select 1 from public.audit_entries('a0000000-0000-0000-0000-00000000000a') $$,
  'a caller with no user sees no audit rows');
reset role;
set local role anon;
select throws_ok($$ select * from public.audit_entries('a0000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'anonymous users cannot call audit_entries');
select throws_ok($$ select * from public.completion_class_subjects('70000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'anonymous users cannot call completion_class_subjects');
select throws_ok($$ select * from public.completion_classes('70000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'anonymous users cannot call completion_classes');
reset role;

-- The new columns did not open history to edits.
select throws_ok($$ update public.audit_log set learner_id = null where school_id = 'a0000000-0000-0000-0000-00000000000a' $$,
  'P0001', 'audit_log is append-only', 'audit rows stay append-only');

select * from finish();
rollback;
