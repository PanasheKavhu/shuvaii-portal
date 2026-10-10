-- pgTAP: the Phase 3 gate review fixes (D37, migration phase3_gate_fixes):
-- one band per result when a scale's bands overlap, at most 2 decimal
-- places for scores, maximums and weights, one assessment name per class
-- subject and term, authorship fields that a signed-in user cannot forge,
-- leavers' marks and comments read-only through the API, and the one term
-- lock reason behind marks_lock() and class_comment_lock().
--
-- Fixture (rolled back at the end). School A: Alice (admin), Hank (head),
-- Sam (teacher, class teacher of 3 Red, teaches Maths and English there).
-- Form 3 points at a scale that is not the default and whose B (60-69) and
-- C (50-60) overlap at 60. Term T is open with no deadline. L1 is enrolled
-- (Maths 60, English 80); L2 has left (Maths 50, entered before leaving).
begin;

select plan(31);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('e9000000-0000-0000-0000-000000000001', 'alice@gate3.test'),
  ('e9000000-0000-0000-0000-000000000002', 'hank@gate3.test'),
  ('e9000000-0000-0000-0000-000000000003', 'sam@gate3.test')
) as u (id, email);

insert into public.schools (id, slug, name, stage, timezone, status)
values ('a9000000-0000-0000-0000-00000000000a', 'gate3-a-test', 'School A', 'secondary', 'Africa/Harare', 'active');

insert into public.memberships (school_id, user_id, role, status) values
  ('a9000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a9000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-000000000002', 'head', 'active'),
  ('a9000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-000000000003', 'teacher', 'active');

insert into public.grading_scales (id, school_id, name, stage) values
  ('a9100000-0000-0000-0000-0000000000aa', 'a9000000-0000-0000-0000-00000000000a', 'Overlapping', 'o_level');
insert into public.grading_bands (school_id, scale_id, grade, min_mark, max_mark, sort_order)
select 'a9000000-0000-0000-0000-00000000000a', 'a9100000-0000-0000-0000-0000000000aa', b.grade, b.min_mark, b.max_mark, b.sort_order
from (values ('A', 70, 100, 1), ('B', 60, 69, 2), ('C', 50, 60, 3), ('U', 0, 49, 4))
  as b (grade, min_mark, max_mark, sort_order);
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values
  ('a9200000-0000-0000-0000-0000000000aa', 'a9000000-0000-0000-0000-00000000000a', 'Form 3', 'o_level', 'a9100000-0000-0000-0000-0000000000aa');
insert into public.academic_years (id, school_id, label, starts_on, ends_on) values
  ('a9300000-0000-0000-0000-0000000000aa', 'a9000000-0000-0000-0000-00000000000a', '2026', '2026-01-13', '2026-12-04');
insert into public.terms (id, school_id, academic_year_id, name, kind, starts_on, ends_on, status) values
  ('79000000-0000-0000-0000-0000000000a1', 'a9000000-0000-0000-0000-00000000000a', 'a9300000-0000-0000-0000-0000000000aa', 'T', 'term', '2026-01-13', '2026-04-09', 'open');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ('c9400000-0000-0000-0000-0000000000a1', 'a9000000-0000-0000-0000-00000000000a', 'a9300000-0000-0000-0000-0000000000aa', 'a9200000-0000-0000-0000-0000000000aa', '3 Red', 'e9000000-0000-0000-0000-000000000003');
insert into public.subjects (id, school_id, code, name, stage_scope) values
  ('d9000001-0000-0000-0000-0000000000aa', 'a9000000-0000-0000-0000-00000000000a', 'MATH', 'Mathematics', 'secondary'),
  ('d9000002-0000-0000-0000-0000000000aa', 'a9000000-0000-0000-0000-00000000000a', 'ENG', 'English', 'secondary');
insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values
  ('c9500000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-00000000000a', 'c9400000-0000-0000-0000-0000000000a1', 'd9000001-0000-0000-0000-0000000000aa', 'e9000000-0000-0000-0000-000000000003'),
  ('c9500000-0000-0000-0000-000000000002', 'a9000000-0000-0000-0000-00000000000a', 'c9400000-0000-0000-0000-0000000000a1', 'd9000002-0000-0000-0000-0000000000aa', 'e9000000-0000-0000-0000-000000000003');

insert into public.learners (id, school_id, learner_number, first_name, last_name) values
  ('f9400000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-00000000000a', 'GATE3-1', 'Learner', 'One'),
  ('f9400000-0000-0000-0000-000000000002', 'a9000000-0000-0000-0000-00000000000a', 'GATE3-2', 'Learner', 'Two');
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id) values
  ('e9400000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-00000000000a', 'f9400000-0000-0000-0000-000000000001', 'c9400000-0000-0000-0000-0000000000a1', 'a9300000-0000-0000-0000-0000000000aa'),
  ('e9400000-0000-0000-0000-000000000002', 'a9000000-0000-0000-0000-00000000000a', 'f9400000-0000-0000-0000-000000000002', 'c9400000-0000-0000-0000-0000000000a1', 'a9300000-0000-0000-0000-0000000000aa');
insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id)
select 'a9000000-0000-0000-0000-00000000000a', e.id, cs.id
from (values ('e9400000-0000-0000-0000-000000000001'::uuid), ('e9400000-0000-0000-0000-000000000002')) e (id)
cross join (values ('c9500000-0000-0000-0000-000000000001'::uuid), ('c9500000-0000-0000-0000-000000000002')) cs (id);

insert into public.assessments (id, school_id, term_id, class_subject_id, name, type, max_mark, weight_percent) values
  ('a9600000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-00000000000a', '79000000-0000-0000-0000-0000000000a1', 'c9500000-0000-0000-0000-000000000001', 'Exam', 'exam', 100, 100),
  ('a9600000-0000-0000-0000-000000000002', 'a9000000-0000-0000-0000-00000000000a', '79000000-0000-0000-0000-0000000000a1', 'c9500000-0000-0000-0000-000000000002', 'Exam', 'exam', 100, 100);
insert into public.marks (id, school_id, assessment_id, enrolment_id, score) values
  ('a9700000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-00000000000a', 'a9600000-0000-0000-0000-000000000001', 'e9400000-0000-0000-0000-000000000001', 60),
  ('a9700000-0000-0000-0000-000000000002', 'a9000000-0000-0000-0000-00000000000a', 'a9600000-0000-0000-0000-000000000002', 'e9400000-0000-0000-0000-000000000001', 80),
  ('a9700000-0000-0000-0000-000000000003', 'a9000000-0000-0000-0000-00000000000a', 'a9600000-0000-0000-0000-000000000001', 'e9400000-0000-0000-0000-000000000002', 50);
update public.enrolments set status = 'left' where id = 'e9400000-0000-0000-0000-000000000002';

-- One band per result -----------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e9000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*)::int from public.subject_results('c9400000-0000-0000-0000-0000000000a1', '79000000-0000-0000-0000-0000000000a1')
   where enrolment_id = 'e9400000-0000-0000-0000-000000000001'),
  2,
  'a mark covered by two overlapping bands still gives one result row per subject'
);
select is(
  (select grade from public.subject_results('c9400000-0000-0000-0000-0000000000a1', '79000000-0000-0000-0000-0000000000a1')
   where enrolment_id = 'e9400000-0000-0000-0000-000000000001' and class_subject_id = 'c9500000-0000-0000-0000-000000000001'),
  'B',
  'the overlap is settled by the highest band that covers the mark'
);
select results_eq(
  $$ select subjects_counted, average from public.class_positions('c9400000-0000-0000-0000-0000000000a1', '79000000-0000-0000-0000-0000000000a1')
     where enrolment_id = 'e9400000-0000-0000-0000-000000000001' $$,
  $$ values (2, 70.0::numeric) $$,
  'the average counts each subject once (60 and 80 make 70.0)'
);

-- Decimal places and names ---------------------------------------------------------------

select throws_ok(
  $$ update public.marks set score = 12.345 where id = 'a9700000-0000-0000-0000-000000000001' $$,
  '23514', null,
  'a score with 3 decimal places is refused'
);
select lives_ok(
  $$ update public.marks set score = 59.75 where id = 'a9700000-0000-0000-0000-000000000001' $$,
  'a score with 2 decimal places is kept'
);
select throws_ok(
  $$ update public.assessments set weight_percent = 33.333 where id = 'a9600000-0000-0000-0000-000000000001' $$,
  '23514', null,
  'a weight with 3 decimal places is refused'
);
select throws_ok(
  $$ update public.assessments set max_mark = 100.125 where id = 'a9600000-0000-0000-0000-000000000001' $$,
  '23514', null,
  'a maximum mark with 3 decimal places is refused'
);
select throws_ok(
  $$ insert into public.assessments (school_id, term_id, class_subject_id, name, type, max_mark, weight_percent)
     values ('a9000000-0000-0000-0000-00000000000a', '79000000-0000-0000-0000-0000000000a1', 'c9500000-0000-0000-0000-000000000001', ' exam ', 'test', 30, 10) $$,
  '23505', null,
  'the same assessment name twice in a class subject and term is refused, whatever the case and spaces'
);
select lives_ok(
  $$ insert into public.assessments (school_id, term_id, class_subject_id, name, type, max_mark, weight_percent)
     values ('a9000000-0000-0000-0000-00000000000a', '79000000-0000-0000-0000-0000000000a1', 'c9500000-0000-0000-0000-000000000001', 'Test 1', 'test', 30, 10) $$,
  'a different name in the same class subject and term is fine'
);

-- Authorship cannot be forged ---------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'e9000000-0000-0000-0000-000000000003', true);

update public.marks set score = 61 where id = 'a9700000-0000-0000-0000-000000000001';
select is(
  (select entered_by from public.marks where id = 'a9700000-0000-0000-0000-000000000001'),
  'e9000000-0000-0000-0000-000000000003'::uuid,
  'a teacher who changes a score is recorded as entering it'
);
update public.marks set entered_by = 'e9000000-0000-0000-0000-000000000002' where id = 'a9700000-0000-0000-0000-000000000001';
select is(
  (select entered_by from public.marks where id = 'a9700000-0000-0000-0000-000000000001'),
  'e9000000-0000-0000-0000-000000000003'::uuid,
  'a teacher cannot change who entered a mark without changing the mark'
);

insert into public.subject_comments (id, school_id, term_id, enrolment_id, class_subject_id, comment, status, teacher_id, signed_at)
values ('a9800000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-00000000000a', '79000000-0000-0000-0000-0000000000a1',
        'e9400000-0000-0000-0000-000000000001', 'c9500000-0000-0000-0000-000000000001', 'Good work.', 'submitted',
        'e9000000-0000-0000-0000-000000000002', '2020-01-01');
select is(
  (select teacher_id from public.subject_comments where id = 'a9800000-0000-0000-0000-000000000001'),
  'e9000000-0000-0000-0000-000000000003'::uuid,
  'a new subject comment is signed by the class subject''s teacher, not whoever the request names'
);
select ok(
  (select signed_at > '2026-01-01' from public.subject_comments where id = 'a9800000-0000-0000-0000-000000000001'),
  'a new subject comment is signed now, not at the time the request gives'
);
update public.subject_comments
set signed_at = '2020-01-01', teacher_id = 'e9000000-0000-0000-0000-000000000002'
where id = 'a9800000-0000-0000-0000-000000000001';
select is(
  (select teacher_id from public.subject_comments where id = 'a9800000-0000-0000-0000-000000000001'),
  'e9000000-0000-0000-0000-000000000003'::uuid,
  'a teacher cannot put a subject comment in someone else''s name'
);
select ok(
  (select signed_at > '2026-01-01' from public.subject_comments where id = 'a9800000-0000-0000-0000-000000000001'),
  'a teacher cannot backdate a subject comment''s signature'
);

insert into public.class_comments (id, school_id, term_id, enrolment_id, comment, author_id)
values ('a9900000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-00000000000a', '79000000-0000-0000-0000-0000000000a1',
        'e9400000-0000-0000-0000-000000000001', 'A steady term.', 'e9000000-0000-0000-0000-000000000002');
select is(
  (select author_id from public.class_comments where id = 'a9900000-0000-0000-0000-000000000001'),
  'e9000000-0000-0000-0000-000000000003'::uuid,
  'a class comment''s author is whoever wrote it'
);
update public.class_comments set author_id = 'e9000000-0000-0000-0000-000000000002'
where id = 'a9900000-0000-0000-0000-000000000001';
select is(
  (select author_id from public.class_comments where id = 'a9900000-0000-0000-0000-000000000001'),
  'e9000000-0000-0000-0000-000000000003'::uuid,
  'a teacher cannot change a class comment''s author without changing the comment'
);
update public.class_comments set comment = 'A steady, careful term.' where id = 'a9900000-0000-0000-0000-000000000001';
select is(
  (select author_id from public.class_comments where id = 'a9900000-0000-0000-0000-000000000001'),
  'e9000000-0000-0000-0000-000000000003'::uuid,
  'changing the comment keeps its writer as the author'
);

-- Leavers are read-only -----------------------------------------------------------------------

select throws_ok(
  $$ update public.marks set score = 55 where id = 'a9700000-0000-0000-0000-000000000003' $$,
  '23514', 'this learner has left the class, so their marks and comments are read-only',
  'a teacher cannot change a leaver''s mark'
);
select throws_ok(
  $$ insert into public.marks (school_id, assessment_id, enrolment_id, score)
     values ('a9000000-0000-0000-0000-00000000000a', 'a9600000-0000-0000-0000-000000000002', 'e9400000-0000-0000-0000-000000000002', 40) $$,
  '23514', null,
  'a teacher cannot add a mark for a leaver'
);
select throws_ok(
  $$ insert into public.subject_comments (school_id, term_id, enrolment_id, class_subject_id, comment)
     values ('a9000000-0000-0000-0000-00000000000a', '79000000-0000-0000-0000-0000000000a1', 'e9400000-0000-0000-0000-000000000002', 'c9500000-0000-0000-0000-000000000001', 'x') $$,
  '23514', null,
  'a teacher cannot add a subject comment for a leaver'
);
select throws_ok(
  $$ insert into public.class_comments (school_id, term_id, enrolment_id, comment)
     values ('a9000000-0000-0000-0000-00000000000a', '79000000-0000-0000-0000-0000000000a1', 'e9400000-0000-0000-0000-000000000002', 'x') $$,
  '23514', null,
  'a class teacher cannot add a class comment for a leaver'
);
select is(
  (select score from public.marks where id = 'a9700000-0000-0000-0000-000000000003'),
  50::numeric,
  'the leaver''s existing mark is kept'
);

select set_config('request.jwt.claim.sub', 'e9000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$ update public.marks set score = 55 where id = 'a9700000-0000-0000-0000-000000000003' $$,
  '23514', null,
  'a school admin cannot change a leaver''s mark either'
);
select lives_ok(
  $$ update public.marks set score = 62 where id = 'a9700000-0000-0000-0000-000000000001' $$,
  'a school admin can still change an enrolled learner''s mark'
);

-- One term lock reason ---------------------------------------------------------------------------

reset role;
update public.terms set marks_deadline = '2020-01-01' where id = '79000000-0000-0000-0000-0000000000a1';
set local role authenticated;
select is(
  (select lock_reason from public.marks_lock('c9500000-0000-0000-0000-000000000001', '79000000-0000-0000-0000-0000000000a1')),
  'deadline_passed',
  'marks_lock() says the deadline has passed'
);
select is(
  (select lock_reason from public.class_comment_lock('c9400000-0000-0000-0000-0000000000a1', '79000000-0000-0000-0000-0000000000a1')),
  'deadline_passed',
  'class_comment_lock() gives the same reason'
);
reset role;
update public.terms set status = 'locked' where id = '79000000-0000-0000-0000-0000000000a1';
set local role authenticated;
select is(
  (select lock_reason from public.marks_lock('c9500000-0000-0000-0000-000000000001', '79000000-0000-0000-0000-0000000000a1')),
  'term_locked',
  'a locked term is named before a passed deadline'
);
select set_config('request.jwt.claim.sub', 'e9000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ update public.marks set score = 63 where id = 'a9700000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'the teacher is locked out by the term status'
);
select set_config('request.jwt.claim.sub', 'e9000000-0000-0000-0000-000000000001', true);
reset role;
update public.terms set status = 'open', marks_deadline = null where id = '79000000-0000-0000-0000-0000000000a1';
set local role authenticated;
select is(
  (select lock_reason from public.marks_lock('c9500000-0000-0000-0000-000000000001', '79000000-0000-0000-0000-0000000000a1')),
  null,
  'an open term with no deadline has no lock reason'
);
select is(
  (select teachers_locked from public.class_comment_lock('c9400000-0000-0000-0000-0000000000a1', '79000000-0000-0000-0000-0000000000a1')),
  false,
  'and its class comments are not locked'
);

select * from finish();
rollback;
