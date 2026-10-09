-- pgTAP: assessments, marks and class_subject_unlocks (migration order step
-- 5 in docs/DATA_MODEL.md, first half; D30). Covers cross-school read and
-- write for each table, teacher scoping (a teacher cannot write another
-- teacher's class subject; a hod is scoped like a teacher; a class teacher
-- reads every mark in their class but writes none), parents, learners and
-- anonymous users seeing nothing, a mark for a learner who does not take
-- the subject, the score check, the deadline, term-status and assessment
-- locks for teachers, unlock and relock (with and without a reason, by a
-- teacher and by a head), the weights check, marks never being deleted,
-- and one audit row with old and new values per mark change.
--
-- Fixture (rolled back at the end). School A: Alice (admin), Hank (head),
-- Tina (class teacher of 4 Blue, teaches nothing), Sam (teaches Maths in
-- 4 Blue), Hope (hod, teaches English in 4 Blue), Gina (class teacher of
-- 3 Green and its Maths teacher), Pat (parent), Lara (learner role). School
-- B: Bob (admin), Bert (teacher). Terms in school A: open (deadline ahead),
-- past (open, deadline passed), locked, closed, and one in another year.
-- The 4 Blue learner takes Maths but not English.
begin;

select plan(101);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('e2000000-0000-0000-0000-000000000001', 'alice@marks.test'),
  ('e2000000-0000-0000-0000-000000000002', 'hank@marks.test'),
  ('e2000000-0000-0000-0000-000000000003', 'tina@marks.test'),
  ('e2000000-0000-0000-0000-000000000004', 'sam@marks.test'),
  ('e2000000-0000-0000-0000-000000000005', 'hope@marks.test'),
  ('e2000000-0000-0000-0000-000000000006', 'gina@marks.test'),
  ('e2000000-0000-0000-0000-000000000007', 'pat@marks.test'),
  ('e2000000-0000-0000-0000-000000000008', 'lara@marks.test'),
  ('e2000000-0000-0000-0000-000000000009', 'bob@marks.test'),
  ('e2000000-0000-0000-0000-00000000000a', 'bert@marks.test')
) as u (id, email);

insert into public.schools (id, slug, name, stage, timezone, status)
values
  ('a0000000-0000-0000-0000-00000000000a', 'marks-a-test', 'School A', 'secondary', 'Africa/Harare', 'active'),
  ('b0000000-0000-0000-0000-00000000000b', 'marks-b-test', 'School B', 'secondary', 'Africa/Harare', 'active');

insert into public.memberships (school_id, user_id, role, status)
values
  ('a0000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000002', 'head', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000004', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000005', 'hod', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000006', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000007', 'parent', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000008', 'learner', 'active'),
  ('b0000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-000000000009', 'school_admin', 'active'),
  ('b0000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000a', 'teacher', 'active');

-- Structure, inserted as the table owner. Deadlines are relative to today
-- so the open term stays open and the past one stays past.
insert into public.grading_scales (id, school_id, name, stage) values
  ('a1000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', 'Scale', 'o_level'),
  ('a1000000-0000-0000-0000-0000000000bb', 'b0000000-0000-0000-0000-00000000000b', 'Scale', 'o_level');
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values
  ('a2000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', 'Form 4', 'o_level', 'a1000000-0000-0000-0000-0000000000aa'),
  ('a2000000-0000-0000-0000-0000000000bb', 'b0000000-0000-0000-0000-00000000000b', 'Form 4', 'o_level', 'a1000000-0000-0000-0000-0000000000bb');
insert into public.academic_years (id, school_id, label, starts_on, ends_on) values
  ('a3000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', '2026', '2026-01-13', '2026-12-04'),
  ('a3000000-0000-0000-0000-0000000000ac', 'a0000000-0000-0000-0000-00000000000a', '2027', '2027-01-12', '2027-12-03'),
  ('a3000000-0000-0000-0000-0000000000bb', 'b0000000-0000-0000-0000-00000000000b', '2026', '2026-01-13', '2026-12-04');
insert into public.terms (id, school_id, academic_year_id, name, starts_on, ends_on, marks_deadline, status) values
  ('70000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'Open', '2026-09-08', '2026-12-04', current_date + 30, 'open'),
  ('70000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'Past', '2026-05-05', '2026-08-07', current_date - 1, 'open'),
  ('70000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'Locked', '2026-01-13', '2026-04-09', current_date + 30, 'locked'),
  ('70000000-0000-0000-0000-0000000000a4', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'Closed', '2026-04-14', '2026-04-24', null, 'closed'),
  ('70000000-0000-0000-0000-0000000000a5', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000ac', 'Next year', '2027-01-12', '2027-04-09', null, 'planned'),
  ('70000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'a3000000-0000-0000-0000-0000000000bb', 'Open', '2026-09-08', '2026-12-04', current_date + 30, 'open');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ('c4000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'a2000000-0000-0000-0000-0000000000aa', '4 Blue', 'e2000000-0000-0000-0000-000000000003'),
  ('c3000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'a2000000-0000-0000-0000-0000000000aa', '3 Green', 'e2000000-0000-0000-0000-000000000006'),
  ('cb000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'a3000000-0000-0000-0000-0000000000bb', 'a2000000-0000-0000-0000-0000000000bb', '4 Blue', 'e2000000-0000-0000-0000-00000000000a');
insert into public.subjects (id, school_id, code, name, stage_scope) values
  ('d1000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', 'MATH', 'Mathematics', 'secondary'),
  ('d2000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', 'ENG', 'English', 'secondary'),
  ('d1000000-0000-0000-0000-0000000000bb', 'b0000000-0000-0000-0000-00000000000b', 'MATH', 'Mathematics', 'secondary');
insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values
  ('c5000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-0000000000a1', 'd1000000-0000-0000-0000-0000000000aa', 'e2000000-0000-0000-0000-000000000004'),
  ('c5000000-0000-0000-0000-000000000042', 'a0000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-0000000000a1', 'd2000000-0000-0000-0000-0000000000aa', 'e2000000-0000-0000-0000-000000000005'),
  ('c5000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-0000000000a1', 'd1000000-0000-0000-0000-0000000000aa', 'e2000000-0000-0000-0000-000000000006'),
  ('c5000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'cb000000-0000-0000-0000-0000000000b1', 'd1000000-0000-0000-0000-0000000000bb', 'e2000000-0000-0000-0000-00000000000a');

-- People.
insert into public.learners (id, school_id, learner_number, first_name, last_name) values
  ('f4000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'A-4B-01', 'Four', 'Blue'),
  ('f3000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'A-3G-01', 'Three', 'Green'),
  ('fb000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'B-4B-01', 'Bee', 'Learner');
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id) values
  ('e4000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'f4000000-0000-0000-0000-0000000000a1', 'c4000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000aa'),
  ('e3000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-0000000000a1', 'c3000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000aa'),
  ('eb000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'fb000000-0000-0000-0000-0000000000b1', 'cb000000-0000-0000-0000-0000000000b1', 'a3000000-0000-0000-0000-0000000000bb');
insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id) values
  ('a0000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000041'),
  ('a0000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000031'),
  ('b0000000-0000-0000-0000-00000000000b', 'eb000000-0000-0000-0000-0000000000b1', 'c5000000-0000-0000-0000-0000000000b1');

-- Assessments. 4 Blue Maths in the open term: 40 + 60 = 100. 3 Green Maths
-- in the open term: 100 + 10 (a locked one) = 110.
insert into public.assessments (id, school_id, term_id, class_subject_id, name, type, max_mark, weight_percent, is_locked) values
  ('a5000000-0000-0000-0000-000000000411', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000041', 'Test 1', 'test', 50, 40, false),
  ('a5000000-0000-0000-0000-000000000412', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000041', 'Exam', 'exam', 100, 60, false),
  ('a5000000-0000-0000-0000-000000000413', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a2', 'c5000000-0000-0000-0000-000000000041', 'Past test', 'test', 50, 100, false),
  ('a5000000-0000-0000-0000-000000000414', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a3', 'c5000000-0000-0000-0000-000000000041', 'Locked test', 'test', 50, 100, false),
  ('a5000000-0000-0000-0000-000000000415', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a4', 'c5000000-0000-0000-0000-000000000041', 'Closed test', 'vacation', 100, 100, false),
  ('a5000000-0000-0000-0000-000000000421', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000042', 'Essay', 'assignment', 30, 100, false),
  ('a5000000-0000-0000-0000-000000000311', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000031', 'Test 1', 'test', 100, 100, false),
  ('a5000000-0000-0000-0000-000000000312', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000031', 'Practical', 'practical', 20, 10, true),
  ('a5000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-0000000000b1', 'c5000000-0000-0000-0000-0000000000b1', 'Test 1', 'test', 50, 100, false);

insert into public.marks (id, school_id, assessment_id, enrolment_id, score, status) values
  ('4a000000-0000-0000-0000-000000000411', 'a0000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-000000000411', 'e4000000-0000-0000-0000-0000000000a1', 30, 'present'),
  ('4a000000-0000-0000-0000-000000000413', 'a0000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-000000000413', 'e4000000-0000-0000-0000-0000000000a1', 10, 'present'),
  ('4a000000-0000-0000-0000-000000000414', 'a0000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-000000000414', 'e4000000-0000-0000-0000-0000000000a1', 20, 'present'),
  ('4a000000-0000-0000-0000-000000000415', 'a0000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-000000000415', 'e4000000-0000-0000-0000-0000000000a1', 60, 'present'),
  ('4a000000-0000-0000-0000-000000000311', 'a0000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-000000000311', 'e3000000-0000-0000-0000-0000000000a1', 70, 'present'),
  ('4b000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'a5000000-0000-0000-0000-0000000000b1', 'eb000000-0000-0000-0000-0000000000b1', 40, 'present');

-- An unlock in school B, to prove school A cannot see it.
insert into public.class_subject_unlocks (school_id, term_id, class_subject_id, reason) values
  ('b0000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-0000000000b1', 'c5000000-0000-0000-0000-0000000000b1', 'School B reason');

set local role authenticated;

-- Alice (school A admin): her school's rows yes, school B's never ----------------
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000001', true);

select is((select count(*) from public.assessments where school_id = 'a0000000-0000-0000-0000-00000000000a'), 8::bigint, 'admin reads own school''s assessments');
select is((select count(*) from public.assessments where school_id = 'b0000000-0000-0000-0000-00000000000b'), 0::bigint, 'admin cannot read school B''s assessments');
select throws_ok($$ insert into public.assessments (school_id, term_id, class_subject_id, name, type, max_mark, weight_percent) values ('b0000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-0000000000b1', 'c5000000-0000-0000-0000-0000000000b1', 'X', 'test', 10, 10) $$, '42501', null, 'admin cannot insert assessments into school B');
select is_empty($$ update public.assessments set name = 'Hacked' where school_id = 'b0000000-0000-0000-0000-00000000000b' returning 1 $$, 'admin cannot update school B''s assessments');
select is_empty($$ delete from public.assessments where school_id = 'b0000000-0000-0000-0000-00000000000b' returning 1 $$, 'admin cannot delete school B''s assessments');

select is((select count(*) from public.marks where school_id = 'a0000000-0000-0000-0000-00000000000a'), 5::bigint, 'admin reads own school''s marks');
select is((select count(*) from public.marks where school_id = 'b0000000-0000-0000-0000-00000000000b'), 0::bigint, 'admin cannot read school B''s marks');
select throws_ok($$ insert into public.marks (school_id, assessment_id, enrolment_id, score, status) values ('b0000000-0000-0000-0000-00000000000b', 'a5000000-0000-0000-0000-0000000000b1', 'eb000000-0000-0000-0000-0000000000b1', 1, 'present') $$, '42501', null, 'admin cannot insert marks into school B');
select is_empty($$ update public.marks set score = 0 where school_id = 'b0000000-0000-0000-0000-00000000000b' returning 1 $$, 'admin cannot update school B''s marks');

select is((select count(*) from public.class_subject_unlocks where school_id = 'b0000000-0000-0000-0000-00000000000b'), 0::bigint, 'admin cannot read school B''s unlocks');
select throws_ok($$ select public.unlock_class_subject('c5000000-0000-0000-0000-0000000000b1', '70000000-0000-0000-0000-0000000000b1', 'reason') $$, '42501', null, 'admin cannot unlock a school B class subject');
select throws_ok($$ select public.relock_class_subject('c5000000-0000-0000-0000-0000000000b1', '70000000-0000-0000-0000-0000000000b1') $$, '42501', null, 'admin cannot relock a school B class subject');
select throws_ok($$ insert into public.class_subject_unlocks (school_id, term_id, class_subject_id, reason) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a2', 'c5000000-0000-0000-0000-000000000041', 'direct') $$, '42501', null, 'nobody writes unlocks except through the functions');

-- A school A row cannot point at a school B row.
select throws_ok($$ insert into public.assessments (school_id, term_id, class_subject_id, name, type, max_mark, weight_percent) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-0000000000b1', 'X', 'test', 10, 10) $$, '23503', null, 'a school A assessment cannot point at a school B class subject');
select throws_ok($$ insert into public.marks (school_id, assessment_id, enrolment_id, score, status) values ('a0000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-000000000411', 'eb000000-0000-0000-0000-0000000000b1', 1, 'present') $$, '23503', null, 'a school A mark cannot point at a school B enrolment');
select throws_ok($$ insert into public.assessments (school_id, term_id, class_subject_id, name, type, max_mark, weight_percent) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a5', 'c5000000-0000-0000-0000-000000000041', 'X', 'test', 10, 10) $$, '23514', 'the term and the class subject must be in the same academic year', 'an assessment''s term must be in its class''s year');

-- Weights check.
select ok(public.assessment_weights_are_complete('70000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000041'), 'weights of 40 and 60 are complete');
select ok(not public.assessment_weights_are_complete('70000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000031'), 'weights of 100 and 10 are not complete');
select ok(not public.assessment_weights_are_complete('70000000-0000-0000-0000-0000000000a2', 'c5000000-0000-0000-0000-000000000042'), 'no assessments is not complete');
select results_eq(
  $$ select class_subject_id::text, total_weight from public.assessment_weight_problems('70000000-0000-0000-0000-0000000000a1') $$,
  $$ values ('c5000000-0000-0000-0000-000000000031', 110::numeric) $$,
  'the open term''s weight problems list 3 Green Maths at 110'
);

-- The score check (admin, on the 4 Blue Maths Test 1 mark; max_mark 50).
select throws_ok($$ update public.marks set score = 51 where id = '4a000000-0000-0000-0000-000000000411' $$, '23514', 'the score must be between 0 and 50', 'a score above max_mark is refused');
select throws_ok($$ update public.marks set score = -1 where id = '4a000000-0000-0000-0000-000000000411' $$, '23514', null, 'a negative score is refused');
select throws_ok($$ update public.marks set score = null where id = '4a000000-0000-0000-0000-000000000411' $$, '23514', null, 'a present learner needs a score');
select throws_ok($$ update public.marks set status = 'absent' where id = '4a000000-0000-0000-0000-000000000411' $$, '23514', null, 'an absent learner cannot have a score');
select lives_ok($$ update public.marks set status = 'absent', score = null where id = '4a000000-0000-0000-0000-000000000411' $$, 'absent with no score is accepted');
select lives_ok($$ update public.marks set status = 'excused', score = null where id = '4a000000-0000-0000-0000-000000000411' $$, 'excused with no score is accepted');
select lives_ok($$ update public.marks set status = 'present', score = 50 where id = '4a000000-0000-0000-0000-000000000411' $$, 'a score equal to max_mark is accepted');
select throws_ok($$ update public.assessments set max_mark = 40 where id = 'a5000000-0000-0000-0000-000000000411' $$, '23514', 'some marks are above the new maximum mark', 'max_mark cannot drop below a mark already entered');

-- A mark for a learner who does not take the subject (4 Blue learner, English).
select throws_ok($$ insert into public.marks (school_id, assessment_id, enrolment_id, score, status) values ('a0000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-000000000421', 'e4000000-0000-0000-0000-0000000000a1', 10, 'present') $$, '23514', 'the learner does not take this subject', 'a mark for a learner who does not take the subject is refused');

-- Admin is never locked out: past deadline, locked and closed terms.
select lives_ok($$ update public.marks set score = 11 where id = '4a000000-0000-0000-0000-000000000413' $$, 'admin changes a mark after the deadline');
select lives_ok($$ update public.marks set score = 21 where id = '4a000000-0000-0000-0000-000000000414' $$, 'admin changes a mark in a locked term');
select lives_ok($$ update public.marks set score = 61 where id = '4a000000-0000-0000-0000-000000000415' $$, 'admin changes a mark in a closed term');

-- Marks are never deleted.
select is_empty($$ delete from public.marks where id = '4a000000-0000-0000-0000-000000000411' returning 1 $$, 'admin cannot delete a mark');

-- Hank (head): reads and writes the whole school ---------------------------------
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000002', true);

select is((select count(*) from public.marks), 5::bigint, 'head reads all of the school''s marks');
select is((select count(*) from public.assessments), 8::bigint, 'head reads all of the school''s assessments');
select lives_ok($$ insert into public.assessments (school_id, term_id, class_subject_id, name, type, max_mark, weight_percent) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a3', 'c5000000-0000-0000-0000-000000000042', 'Head''s test', 'test', 10, 10) $$, 'head adds an assessment in a locked term');
select is((select count(*) from public.marks where school_id = 'b0000000-0000-0000-0000-00000000000b'), 0::bigint, 'head cannot read school B''s marks');

-- Sam (teaches 4 Blue Maths) ------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000004', true);

select is_empty($$ select * from public.assessment_weight_problems('70000000-0000-0000-0000-0000000000a1') $$, 'a teacher''s weight problems leave out class subjects they do not teach');
select is((select count(*) from public.assessments), 5::bigint, 'teacher reads only their class subject''s assessments');
select is((select count(*) from public.marks), 4::bigint, 'teacher reads only their class subject''s marks');
select is((select count(*) from public.marks where id = '4a000000-0000-0000-0000-000000000311'), 0::bigint, 'teacher cannot read another class''s marks');
select lives_ok($$ insert into public.assessments (id, school_id, term_id, class_subject_id, name, type, max_mark, weight_percent) values ('a5000000-0000-0000-0000-000000000416', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000041', 'Quiz', 'test', 10, 5) $$, 'teacher adds an assessment to their own class subject');
select throws_ok($$ insert into public.assessments (school_id, term_id, class_subject_id, name, type, max_mark, weight_percent) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000031', 'Quiz', 'test', 10, 5) $$, '42501', null, 'teacher cannot add an assessment to another teacher''s class subject');
select is_empty($$ update public.assessments set name = 'Mine now' where id = 'a5000000-0000-0000-0000-000000000311' returning 1 $$, 'teacher cannot change another teacher''s assessment');
select throws_ok($$ insert into public.marks (school_id, assessment_id, enrolment_id, score, status) values ('a0000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-000000000311', 'e3000000-0000-0000-0000-0000000000a1', 5, 'present') $$, '42501', null, 'teacher cannot enter a mark in another teacher''s class subject');
select is_empty($$ update public.marks set score = 1 where id = '4a000000-0000-0000-0000-000000000311' returning 1 $$, 'teacher cannot change a mark in another teacher''s class subject');
select throws_ok($$ insert into public.assessments (school_id, term_id, class_subject_id, name, type, max_mark, weight_percent, is_locked) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000041', 'Locked', 'test', 10, 5, true) $$, '42501', 'only a school admin or head can lock or unlock an assessment', 'teacher cannot add a locked assessment');

-- Mark entry and audit: one row per change, with the old and new score.
select lives_ok($$ insert into public.marks (id, school_id, assessment_id, enrolment_id, score, status) values ('4a000000-0000-0000-0000-000000000412', 'a0000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-000000000412', 'e4000000-0000-0000-0000-0000000000a1', 80, 'present') $$, 'teacher enters a mark in their class subject');
select lives_ok($$ update public.marks set score = 85 where id = '4a000000-0000-0000-0000-000000000412' $$, 'teacher changes that mark');

-- Locks: past deadline, locked term, closed term.
select throws_ok($$ update public.marks set score = 12 where id = '4a000000-0000-0000-0000-000000000413' $$, '42501', 'marks for this class subject are locked; ask the school admin or head to unlock them', 'teacher cannot change a mark after the deadline');
select throws_ok($$ insert into public.assessments (school_id, term_id, class_subject_id, name, type, max_mark, weight_percent) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a2', 'c5000000-0000-0000-0000-000000000041', 'Late', 'test', 10, 5) $$, '42501', null, 'teacher cannot add an assessment after the deadline');
select throws_ok($$ update public.assessments set name = 'Renamed' where id = 'a5000000-0000-0000-0000-000000000413' $$, '42501', null, 'teacher cannot change an assessment after the deadline');
select throws_ok($$ update public.marks set score = 22 where id = '4a000000-0000-0000-0000-000000000414' $$, '42501', null, 'teacher cannot change a mark in a locked term');
select throws_ok($$ update public.marks set score = 62 where id = '4a000000-0000-0000-0000-000000000415' $$, '42501', null, 'teacher cannot change a mark in a closed term');

-- Unlocking is for the school admin and head only.
select throws_ok($$ select public.unlock_class_subject('c5000000-0000-0000-0000-000000000041', '70000000-0000-0000-0000-0000000000a2', 'Please') $$, '42501', 'only a school admin or head can unlock marks', 'a teacher cannot unlock their own class subject');

-- Hope (hod, teaches 4 Blue English): scoped like a teacher -------------------------------
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000005', true);

select is((select count(*) from public.assessments), 2::bigint, 'hod reads only the assessments of class subjects they teach');
select is((select count(*) from public.marks), 0::bigint, 'hod cannot read other teachers'' marks');
select throws_ok($$ insert into public.marks (school_id, assessment_id, enrolment_id, score, status) values ('a0000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-000000000416', 'e4000000-0000-0000-0000-0000000000a1', 5, 'present') $$, '42501', null, 'hod cannot enter a mark in a subject they do not teach');
select is_empty($$ update public.marks set score = 1 where id = '4a000000-0000-0000-0000-000000000411' returning 1 $$, 'hod cannot change a mark in a subject they do not teach');

-- Tina (class teacher of 4 Blue, teaches nothing): reads her class, writes nothing ----------
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000003', true);

select is((select count(*) from public.marks), 5::bigint, 'class teacher reads every mark in their class');
select is((select count(*) from public.assessments where class_subject_id = 'c5000000-0000-0000-0000-000000000042'), 2::bigint, 'class teacher reads assessments of every subject in their class');
select is((select count(*) from public.marks where id = '4a000000-0000-0000-0000-000000000311'), 0::bigint, 'class teacher cannot read another class''s marks');
select is_empty($$ update public.marks set score = 1 where id = '4a000000-0000-0000-0000-000000000411' returning 1 $$, 'class teacher cannot change a mark in a subject they do not teach');
select throws_ok($$ insert into public.assessments (school_id, term_id, class_subject_id, name, type, max_mark, weight_percent) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000042', 'Quiz', 'test', 10, 5) $$, '42501', null, 'class teacher cannot add an assessment to a subject they do not teach');

-- Gina (3 Green Maths): an assessment locked by the admin --------------------------------
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000006', true);

select throws_ok($$ insert into public.marks (school_id, assessment_id, enrolment_id, score, status) values ('a0000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-000000000312', 'e3000000-0000-0000-0000-0000000000a1', 15, 'present') $$, '42501', 'marks for this class subject are locked; ask the school admin or head to unlock them', 'teacher cannot enter a mark on a locked assessment');
select throws_ok($$ update public.assessments set is_locked = false where id = 'a5000000-0000-0000-0000-000000000312' $$, '42501', null, 'teacher cannot unlock an assessment');
select lives_ok($$ update public.marks set score = 72 where id = '4a000000-0000-0000-0000-000000000311' $$, 'teacher changes a mark on an unlocked assessment in an open term');

-- Parents, learners and anonymous users see nothing ---------------------------------------
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000007', true);
select is((select count(*) from public.assessments) + (select count(*) from public.marks) + (select count(*) from public.class_subject_unlocks), 0::bigint, 'parent sees no assessments, marks or unlocks');
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000008', true);
select is((select count(*) from public.assessments) + (select count(*) from public.marks) + (select count(*) from public.class_subject_unlocks), 0::bigint, 'learner sees no assessments, marks or unlocks');
select throws_ok($$ insert into public.marks (school_id, assessment_id, enrolment_id, score, status) values ('a0000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-000000000412', 'e4000000-0000-0000-0000-0000000000a1', 1, 'present') $$, '42501', null, 'learner cannot enter a mark');

-- Bert (school B teacher) sees nothing of school A.
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-00000000000a', true);
select is((select count(*) from public.assessments), 1::bigint, 'school B teacher reads only their own assessment');
select is((select count(*) from public.marks where school_id = 'a0000000-0000-0000-0000-00000000000a'), 0::bigint, 'school B teacher cannot read school A''s marks');
select throws_ok($$ insert into public.assessments (school_id, term_id, class_subject_id, name, type, max_mark, weight_percent) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000041', 'X', 'test', 10, 5) $$, '42501', null, 'school B teacher cannot add an assessment in school A');
select is((select count(*) from public.class_subject_unlocks), 1::bigint, 'school B teacher reads their own class subject''s unlock');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*) from public.assessments) + (select count(*) from public.marks) + (select count(*) from public.class_subject_unlocks), 0::bigint, 'anonymous sees no assessments, marks or unlocks');
select throws_ok($$ select public.unlock_class_subject('c5000000-0000-0000-0000-000000000041', '70000000-0000-0000-0000-0000000000a2', 'x') $$, '42501', null, 'anonymous cannot unlock');
reset role;

-- Audit for Sam's mark: one insert and one update row, by Sam, with old and new score.
select is(
  (select array_agg(action::text order by id) from public.audit_log where table_name = 'marks' and row_id = '4a000000-0000-0000-0000-000000000412'),
  array['insert', 'update'],
  'a mark entry and one change write one audit row each'
);
select is(
  (select array[actor_id::text, old_data ->> 'score', new_data ->> 'score', school_id::text]
   from public.audit_log where table_name = 'marks' and row_id = '4a000000-0000-0000-0000-000000000412' and action = 'update'),
  array['e2000000-0000-0000-0000-000000000004', '80', '85', 'a0000000-0000-0000-0000-00000000000a'],
  'the mark''s audit row records the teacher, the old and new score, and the school'
);
select is((select entered_by::text from public.marks where id = '4a000000-0000-0000-0000-000000000412'), 'e2000000-0000-0000-0000-000000000004', 'a mark records who entered it');
select is((select count(*) from public.audit_log where table_name = 'marks' and row_id = '4a000000-0000-0000-0000-000000000413' and action = 'update' and actor_id = 'e2000000-0000-0000-0000-000000000001'), 1::bigint, 'an admin''s mark change is audited');
select is((select count(*) from public.audit_log where table_name = 'assessments' and row_id = 'a5000000-0000-0000-0000-000000000416' and action = 'insert'), 1::bigint, 'a new assessment is audited');

-- Integrity that even the table owner meets.
select throws_ok($$ delete from public.marks where id = '4a000000-0000-0000-0000-000000000411' $$, 'P0001', 'marks are never deleted; change the score or status instead', 'even the table owner cannot delete a mark');
select throws_ok($$ delete from public.enrolment_subjects where enrolment_id = 'e4000000-0000-0000-0000-0000000000a1' and class_subject_id = 'c5000000-0000-0000-0000-000000000041' $$, '23514', 'the learner has marks in this subject, so it cannot be removed', 'a subject choice with marks cannot be removed');
select throws_ok($$ update public.assessments set class_subject_id = 'c5000000-0000-0000-0000-000000000042' where id = 'a5000000-0000-0000-0000-000000000411' $$, '23514', null, 'an assessment with marks cannot move to another class subject');

-- Unlock and relock by the head ------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000002', true);

select throws_ok($$ select public.unlock_class_subject('c5000000-0000-0000-0000-000000000041', '70000000-0000-0000-0000-0000000000a2', '') $$, '22023', 'give a reason for unlocking marks', 'an unlock without a reason is refused');
select throws_ok($$ select public.unlock_class_subject('c5000000-0000-0000-0000-000000000041', '70000000-0000-0000-0000-0000000000a2', '   ') $$, '22023', null, 'an unlock with a blank reason is refused');
select throws_ok($$ select public.unlock_class_subject('c5000000-0000-0000-0000-000000000041', '70000000-0000-0000-0000-0000000000a2', null) $$, '22023', null, 'an unlock with no reason is refused');
select lives_ok($$ select public.unlock_class_subject('c5000000-0000-0000-0000-000000000041', '70000000-0000-0000-0000-0000000000a2', 'One learner''s test was marked late') $$, 'head unlocks 4 Blue Maths for the past-deadline term with a reason');
select throws_ok($$ select public.unlock_class_subject('c5000000-0000-0000-0000-000000000041', '70000000-0000-0000-0000-0000000000a2', 'Again') $$, '22023', 'marks for this class subject are already unlocked', 'an open unlock cannot be opened twice');
select lives_ok($$ select public.unlock_class_subject('c5000000-0000-0000-0000-000000000041', '70000000-0000-0000-0000-0000000000a4', 'Vacation school marks corrected') $$, 'head unlocks 4 Blue Maths for the closed term');

select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000004', true);
select is((select count(*) from public.class_subject_unlocks), 2::bigint, 'the teacher sees the unlocks of their class subject');
select lives_ok($$ update public.marks set score = 12 where id = '4a000000-0000-0000-0000-000000000413' $$, 'after the unlock the teacher changes the mark past the deadline');
select lives_ok($$ update public.marks set score = 62 where id = '4a000000-0000-0000-0000-000000000415' $$, 'after the unlock the teacher changes the mark in the closed term');
select throws_ok($$ update public.marks set score = 22 where id = '4a000000-0000-0000-0000-000000000414' $$, '42501', null, 'an unlock covers only its own term');
select throws_ok($$ select public.relock_class_subject('c5000000-0000-0000-0000-000000000041', '70000000-0000-0000-0000-0000000000a2') $$, '42501', 'only a school admin or head can relock marks', 'a teacher cannot relock');

select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000002', true);
select lives_ok($$ select public.relock_class_subject('c5000000-0000-0000-0000-000000000041', '70000000-0000-0000-0000-0000000000a2') $$, 'head relocks');
select throws_ok($$ select public.relock_class_subject('c5000000-0000-0000-0000-000000000041', '70000000-0000-0000-0000-0000000000a2') $$, '22023', 'marks for this class subject are not unlocked', 'relocking twice is refused');

select set_config('request.jwt.claim.sub', 'e2000000-0000-0000-0000-000000000004', true);
select throws_ok($$ update public.marks set score = 13 where id = '4a000000-0000-0000-0000-000000000413' $$, '42501', null, 'after the relock the teacher is locked out again');

reset role;

select is(
  (select array[actor_id::text, reason, new_data ->> 'term_id', new_data ->> 'class_subject_id']
   from public.audit_log where event = 'marks_unlocked' and new_data ->> 'term_id' = '70000000-0000-0000-0000-0000000000a2'),
  array['e2000000-0000-0000-0000-000000000002', 'One learner''s test was marked late', '70000000-0000-0000-0000-0000000000a2', 'c5000000-0000-0000-0000-000000000041'],
  'an unlock writes an audit event with the head, the reason, the term and the class subject'
);
select is((select count(*) from public.audit_log where event = 'marks_relocked' and school_id = 'a0000000-0000-0000-0000-00000000000a'), 1::bigint, 'a relock writes an audit event');
select is((select count(*) from public.audit_log where event = 'marks_unlocked' and school_id = 'a0000000-0000-0000-0000-00000000000a'), 2::bigint, 'refused unlocks write no audit event');

select * from finish();
rollback;
