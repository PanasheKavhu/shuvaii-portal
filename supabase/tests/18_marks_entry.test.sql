-- pgTAP: reads for the marks entry screens (D32): public.marks_progress(),
-- public.marks_lock() and public.marks_unlockers(). Who sees which class
-- subjects, the progress counts (leavers left out), each lock reason and an
-- open unlock, the names a locked-out teacher is told to ask, and
-- cross-school and anonymous callers.
--
-- Fixture (rolled back at the end). School A: Alice (admin), Hank (head),
-- Dora (disabled admin), Tina (class teacher of 4 Blue, teaches nothing),
-- Sam (teaches Maths in 4 Blue), Olga (teaches English in 4 Blue), Pat
-- (parent). School B: Bob (admin) with his own class subject. 4 Blue:
-- L1 and L2 enrolled, L3 left; all take Maths, L1 also English. Term O
-- (open) has two Maths assessments weighing 40 + 50; marks: L1 both, L2 one
-- (absent), L3 one. Terms C (closed), K (locked), D (open, deadline passed).
begin;

select plan(27);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', jsonb_build_object('full_name', u.name), now(), now(), '', '', '', ''
from (values
  ('e8000000-0000-0000-0000-000000000001', 'alice@entry.test', 'Alice Admin'),
  ('e8000000-0000-0000-0000-000000000002', 'hank@entry.test', 'Hank Head'),
  ('e8000000-0000-0000-0000-000000000003', 'tina@entry.test', 'Tina Class'),
  ('e8000000-0000-0000-0000-000000000004', 'sam@entry.test', 'Sam Maths'),
  ('e8000000-0000-0000-0000-000000000005', 'olga@entry.test', 'Olga English'),
  ('e8000000-0000-0000-0000-000000000006', 'dora@entry.test', 'Dora Disabled'),
  ('e8000000-0000-0000-0000-000000000007', 'pat@entry.test', 'Pat Parent'),
  ('e8000000-0000-0000-0000-000000000009', 'bob@entry.test', 'Bob B')
) as u (id, email, name);

-- Profiles come from the signup trigger; make sure names are set either way.
update public.profiles p
set full_name = u.raw_user_meta_data ->> 'full_name'
from auth.users u
where u.id = p.id and u.email like '%@entry.test';

insert into public.schools (id, slug, name, stage, timezone, status)
values
  ('a8000000-0000-0000-0000-00000000000a', 'entry-a-test', 'School A', 'secondary', 'Africa/Harare', 'active'),
  ('b8000000-0000-0000-0000-00000000000b', 'entry-b-test', 'School B', 'secondary', 'Africa/Harare', 'active');

insert into public.memberships (school_id, user_id, role, status)
values
  ('a8000000-0000-0000-0000-00000000000a', 'e8000000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a8000000-0000-0000-0000-00000000000a', 'e8000000-0000-0000-0000-000000000002', 'head', 'active'),
  ('a8000000-0000-0000-0000-00000000000a', 'e8000000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('a8000000-0000-0000-0000-00000000000a', 'e8000000-0000-0000-0000-000000000004', 'teacher', 'active'),
  ('a8000000-0000-0000-0000-00000000000a', 'e8000000-0000-0000-0000-000000000005', 'teacher', 'active'),
  ('a8000000-0000-0000-0000-00000000000a', 'e8000000-0000-0000-0000-000000000006', 'school_admin', 'disabled'),
  ('a8000000-0000-0000-0000-00000000000a', 'e8000000-0000-0000-0000-000000000007', 'parent', 'active'),
  ('b8000000-0000-0000-0000-00000000000b', 'e8000000-0000-0000-0000-000000000009', 'school_admin', 'active');

insert into public.grading_scales (id, school_id, name, stage) values
  ('a8100000-0000-0000-0000-0000000000aa', 'a8000000-0000-0000-0000-00000000000a', 'O-Level', 'o_level'),
  ('a8100000-0000-0000-0000-0000000000bb', 'b8000000-0000-0000-0000-00000000000b', 'O-Level', 'o_level');
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values
  ('a8200000-0000-0000-0000-0000000000aa', 'a8000000-0000-0000-0000-00000000000a', 'Form 4', 'o_level', 'a8100000-0000-0000-0000-0000000000aa'),
  ('a8200000-0000-0000-0000-0000000000bb', 'b8000000-0000-0000-0000-00000000000b', 'Form 4', 'o_level', 'a8100000-0000-0000-0000-0000000000bb');
insert into public.academic_years (id, school_id, label, starts_on, ends_on) values
  ('a8300000-0000-0000-0000-0000000000aa', 'a8000000-0000-0000-0000-00000000000a', '2026', '2026-01-13', '2026-12-04'),
  ('a8300000-0000-0000-0000-0000000000bb', 'b8000000-0000-0000-0000-00000000000b', '2026', '2026-01-13', '2026-12-04');
insert into public.terms (id, school_id, academic_year_id, name, kind, starts_on, ends_on, marks_deadline, status) values
  ('78000000-0000-0000-0000-0000000000a1', 'a8000000-0000-0000-0000-00000000000a', 'a8300000-0000-0000-0000-0000000000aa', 'O', 'term', '2026-01-13', '2026-03-01', null, 'open'),
  ('78000000-0000-0000-0000-0000000000a2', 'a8000000-0000-0000-0000-00000000000a', 'a8300000-0000-0000-0000-0000000000aa', 'C', 'term', '2026-03-02', '2026-05-01', null, 'closed'),
  ('78000000-0000-0000-0000-0000000000a3', 'a8000000-0000-0000-0000-00000000000a', 'a8300000-0000-0000-0000-0000000000aa', 'K', 'term', '2026-05-02', '2026-07-01', null, 'locked'),
  ('78000000-0000-0000-0000-0000000000a4', 'a8000000-0000-0000-0000-00000000000a', 'a8300000-0000-0000-0000-0000000000aa', 'D', 'term', '2026-07-02', '2026-09-01', '2026-01-20', 'open'),
  ('78000000-0000-0000-0000-0000000000b1', 'b8000000-0000-0000-0000-00000000000b', 'a8300000-0000-0000-0000-0000000000bb', 'O', 'term', '2026-01-13', '2026-03-01', null, 'open');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ('c8400000-0000-0000-0000-0000000000a1', 'a8000000-0000-0000-0000-00000000000a', 'a8300000-0000-0000-0000-0000000000aa', 'a8200000-0000-0000-0000-0000000000aa', '4 Blue', 'e8000000-0000-0000-0000-000000000003'),
  ('c8400000-0000-0000-0000-0000000000b1', 'b8000000-0000-0000-0000-00000000000b', 'a8300000-0000-0000-0000-0000000000bb', 'a8200000-0000-0000-0000-0000000000bb', '4 Blue', null);
insert into public.subjects (id, school_id, code, name, stage_scope, sort_order) values
  ('d8000001-0000-0000-0000-0000000000aa', 'a8000000-0000-0000-0000-00000000000a', 'MATH', 'Mathematics', 'secondary', 1),
  ('d8000002-0000-0000-0000-0000000000aa', 'a8000000-0000-0000-0000-00000000000a', 'ENG', 'English', 'secondary', 2),
  ('d8b00000-0000-0000-0000-0000000000bb', 'b8000000-0000-0000-0000-00000000000b', 'MATH', 'Mathematics', 'secondary', 1);
insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values
  ('c8500000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-00000000000a', 'c8400000-0000-0000-0000-0000000000a1', 'd8000001-0000-0000-0000-0000000000aa', 'e8000000-0000-0000-0000-000000000004'),
  ('c8500000-0000-0000-0000-000000000002', 'a8000000-0000-0000-0000-00000000000a', 'c8400000-0000-0000-0000-0000000000a1', 'd8000002-0000-0000-0000-0000000000aa', 'e8000000-0000-0000-0000-000000000005'),
  ('c8500000-0000-0000-0000-0000000000b1', 'b8000000-0000-0000-0000-00000000000b', 'c8400000-0000-0000-0000-0000000000b1', 'd8b00000-0000-0000-0000-0000000000bb', null);

insert into public.learners (id, school_id, learner_number, first_name, last_name)
select ('f8400000-0000-0000-0000-00000000000' || n)::uuid, 'a8000000-0000-0000-0000-00000000000a', 'ENTRY-' || n, 'Learner', 'L' || n
from generate_series(1, 3) n;
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id, status)
select ('e8400000-0000-0000-0000-00000000000' || n)::uuid, 'a8000000-0000-0000-0000-00000000000a',
       ('f8400000-0000-0000-0000-00000000000' || n)::uuid, 'c8400000-0000-0000-0000-0000000000a1',
       'a8300000-0000-0000-0000-0000000000aa', case when n = 3 then 'left' else 'enrolled' end::public.enrolment_status
from generate_series(1, 3) n;
insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id)
select 'a8000000-0000-0000-0000-00000000000a', ('e8400000-0000-0000-0000-00000000000' || e)::uuid,
       ('c8500000-0000-0000-0000-00000000000' || s)::uuid
from (values (1, 1), (1, 2), (2, 1), (3, 1)) as x (e, s);

insert into public.assessments (id, school_id, term_id, class_subject_id, name, type, max_mark, weight_percent) values
  ('a8500000-0000-0000-0000-000000000011', 'a8000000-0000-0000-0000-00000000000a', '78000000-0000-0000-0000-0000000000a1', 'c8500000-0000-0000-0000-000000000001', 'Test', 'test', 30, 40),
  ('a8500000-0000-0000-0000-000000000012', 'a8000000-0000-0000-0000-00000000000a', '78000000-0000-0000-0000-0000000000a1', 'c8500000-0000-0000-0000-000000000001', 'Exam', 'exam', 100, 50),
  ('a8500000-0000-0000-0000-0000000000b1', 'b8000000-0000-0000-0000-00000000000b', '78000000-0000-0000-0000-0000000000b1', 'c8500000-0000-0000-0000-0000000000b1', 'Maths', 'exam', 100, 100);
insert into public.marks (school_id, assessment_id, enrolment_id, score, status) values
  ('a8000000-0000-0000-0000-00000000000a', 'a8500000-0000-0000-0000-000000000011', 'e8400000-0000-0000-0000-000000000001', 20, 'present'),
  ('a8000000-0000-0000-0000-00000000000a', 'a8500000-0000-0000-0000-000000000012', 'e8400000-0000-0000-0000-000000000001', 70, 'present'),
  ('a8000000-0000-0000-0000-00000000000a', 'a8500000-0000-0000-0000-000000000011', 'e8400000-0000-0000-0000-000000000002', null, 'absent'),
  ('a8000000-0000-0000-0000-00000000000a', 'a8500000-0000-0000-0000-000000000011', 'e8400000-0000-0000-0000-000000000003', 10, 'present');

set local role authenticated;

-- marks_progress ----------------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000001', true);
select results_eq(
  $$ select subject_name, teacher_name, learners, assessments, total_weight, marks_entered
     from public.marks_progress('78000000-0000-0000-0000-0000000000a1') $$,
  $$ values ('Mathematics', 'Sam Maths', 2, 2, 90::numeric, 3), ('English', 'Olga English', 1, 0, 0::numeric, 0) $$,
  'admin: every class subject, leavers not counted, absent counts as entered');

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.marks_progress('78000000-0000-0000-0000-0000000000a1')), 2::bigint,
  'head: every class subject');

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000004', true);
select results_eq(
  $$ select class_subject_id from public.marks_progress('78000000-0000-0000-0000-0000000000a1') $$,
  $$ values ('c8500000-0000-0000-0000-000000000001'::uuid) $$,
  'subject teacher: only the class subject they teach');

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000005', true);
select results_eq(
  $$ select class_subject_id from public.marks_progress('78000000-0000-0000-0000-0000000000a1') $$,
  $$ values ('c8500000-0000-0000-0000-000000000002'::uuid) $$,
  'another subject teacher: only their own');

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.marks_progress('78000000-0000-0000-0000-0000000000a1')), 2::bigint,
  'class teacher: every class subject of their class');

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000009', true);
select is((select count(*) from public.marks_progress('78000000-0000-0000-0000-0000000000a1')), 0::bigint,
  'school B admin: nothing from school A');
select is((select count(*) from public.marks_progress('78000000-0000-0000-0000-0000000000b1')), 1::bigint,
  'school B admin: their own class subject');

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000007', true);
select is((select count(*) from public.marks_progress('78000000-0000-0000-0000-0000000000a1')), 0::bigint,
  'parent: nothing');

-- marks_lock ----------------------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000004', true);
select results_eq(
  $$ select teachers_locked, lock_reason from public.marks_lock('c8500000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a1') $$,
  $$ values (false, null::text) $$, 'open term with no deadline: not locked');
select results_eq(
  $$ select teachers_locked, lock_reason from public.marks_lock('c8500000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a2') $$,
  $$ values (true, 'term_closed') $$, 'closed term: locked');
select results_eq(
  $$ select teachers_locked, lock_reason from public.marks_lock('c8500000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a3') $$,
  $$ values (true, 'term_locked') $$, 'locked term: locked');
select results_eq(
  $$ select teachers_locked, lock_reason, marks_deadline from public.marks_lock('c8500000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a4') $$,
  $$ values (true, 'deadline_passed', '2026-01-20'::date) $$, 'deadline passed: locked, with the deadline');

-- The lock matches the write trigger.
select throws_ok(
  $$ insert into public.assessments (school_id, term_id, class_subject_id, name, type, max_mark, weight_percent)
     values ('a8000000-0000-0000-0000-00000000000a', '78000000-0000-0000-0000-0000000000a2', 'c8500000-0000-0000-0000-000000000001', 'Late', 'test', 10, 10) $$,
  '42501', null, 'the teacher is refused a write while marks_lock says locked');

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000005', true);
select is((select count(*) from public.marks_lock('c8500000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a1')), 0::bigint,
  'a teacher of another subject gets no lock row');

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.marks_lock('c8500000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a1')), 1::bigint,
  'the class teacher gets the lock row');

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000009', true);
select is((select count(*) from public.marks_lock('c8500000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a1')), 0::bigint,
  'school B admin gets no lock row for school A');

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000007', true);
select is((select count(*) from public.marks_lock('c8500000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a1')), 0::bigint,
  'a parent gets no lock row');

-- The head unlocks the closed term for Maths.
select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$ select public.unlock_class_subject('c8500000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a2', 'Late exam scripts') $$,
  'the head unlocks Maths for the closed term');
select results_eq(
  $$ select teachers_locked, lock_reason, unlock_reason, unlocked_by_name, unlocked_at is not null
     from public.marks_lock('c8500000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a2') $$,
  $$ values (false, 'term_closed', 'Late exam scripts', 'Hank Head', true) $$,
  'unlocked: not locked for teachers, with the reason and who unlocked');

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000004', true);
select results_eq(
  $$ select teachers_locked from public.marks_lock('c8500000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a2') $$,
  $$ values (false) $$, 'the teacher sees it unlocked');

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000005', true);
select results_eq(
  $$ select teachers_locked from public.marks_lock('c8500000-0000-0000-0000-000000000002', '78000000-0000-0000-0000-0000000000a2') $$,
  $$ values (true) $$, 'the unlock is for that class subject only: English stays locked');

-- marks_unlockers -----------------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000004', true);
select results_eq(
  $$ select full_name, role::text from public.marks_unlockers('a8000000-0000-0000-0000-00000000000a') $$,
  $$ values ('Alice Admin', 'school_admin'), ('Hank Head', 'head') $$,
  'a teacher sees the active school admins and heads, not disabled ones');

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000007', true);
select is((select count(*) from public.marks_unlockers('a8000000-0000-0000-0000-00000000000a')), 0::bigint,
  'a parent sees nobody');

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000009', true);
select is((select count(*) from public.marks_unlockers('a8000000-0000-0000-0000-00000000000a')), 0::bigint,
  'school B admin sees nobody from school A');

-- Anonymous callers ------------------------------------------------------------------------

reset role;
set local role anon;
select throws_ok($$ select * from public.marks_progress('78000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'anon cannot call marks_progress');
select throws_ok($$ select * from public.marks_lock('c8500000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'anon cannot call marks_lock');
select throws_ok($$ select * from public.marks_unlockers('a8000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'anon cannot call marks_unlockers');

select * from finish();
rollback;
