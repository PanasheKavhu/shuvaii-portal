-- pgTAP: public.subject_results() and public.class_positions() (DATA_MODEL
-- section 6; D31) beyond the seed fixtures in 16_grade_fixtures: rounding
-- at the grade boundaries (69.5, 70, 69.49, 39.5, 0), a result that is
-- exactly 69.5 only through non-terminating divisions, weights that do not
-- add up to 100, absent, excused and missing marks, a tie, a learner who
-- left, a vacation term, who may read what, and a timing check on a class
-- of 45 learners with 10 subjects.
--
-- Fixture (rolled back at the end). School A, Form 4 on the O-level bands:
-- Alice (admin), Hank (head), Tina (class teacher of 4 Blue, teaches
-- nothing), Sam (teaches Maths and Art in 4 Blue), Hope (hod, teaches
-- English in 4 Blue), Pat (parent), Lara (learner role). School B: Bob
-- (admin) with his own class and marks. 4 Blue, term T (one assessment of
-- 100 at 100% per subject, except Art: two of 3 at 50%, and Science: 40% +
-- 50%) and vacation term V (Maths only):
--
--   learner  status    Maths   English  Art           Science  expected
--   L1       enrolled  69.5    70       2.08, 2.09    80, 80   70 70 70 -   avg 70.0 pos 1
--   L2       enrolled  39.5    0                               40 0         avg 20.0 pos 4
--   L3       enrolled  69.49   absent                          69 -         avg 69.0 pos 3
--   L4       left      90      90                     90, 90   90 90 - -    avg 90.0 no pos
--   L5       enrolled  excused (none)                          - -          no avg, no pos
--   L6       enrolled  70      70                     70, 70   70 70 - -    avg 70.0 pos 1
--
-- Science weights add up to 90, so Science is incomplete for everyone.
begin;

select plan(41);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('e4000000-0000-0000-0000-000000000001', 'alice@calc.test'),
  ('e4000000-0000-0000-0000-000000000002', 'hank@calc.test'),
  ('e4000000-0000-0000-0000-000000000003', 'tina@calc.test'),
  ('e4000000-0000-0000-0000-000000000004', 'sam@calc.test'),
  ('e4000000-0000-0000-0000-000000000005', 'hope@calc.test'),
  ('e4000000-0000-0000-0000-000000000007', 'pat@calc.test'),
  ('e4000000-0000-0000-0000-000000000008', 'lara@calc.test'),
  ('e4000000-0000-0000-0000-000000000009', 'bob@calc.test')
) as u (id, email);

insert into public.schools (id, slug, name, stage, timezone, status)
values
  ('a4000000-0000-0000-0000-00000000000a', 'calc-a-test', 'School A', 'secondary', 'Africa/Harare', 'active'),
  ('b4000000-0000-0000-0000-00000000000b', 'calc-b-test', 'School B', 'secondary', 'Africa/Harare', 'active');

insert into public.memberships (school_id, user_id, role, status)
values
  ('a4000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a4000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-000000000002', 'head', 'active'),
  ('a4000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('a4000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-000000000004', 'teacher', 'active'),
  ('a4000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-000000000005', 'hod', 'active'),
  ('a4000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-000000000007', 'parent', 'active'),
  ('a4000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-000000000008', 'learner', 'active'),
  ('b4000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-000000000009', 'school_admin', 'active');

insert into public.grading_scales (id, school_id, name, stage) values
  ('a4100000-0000-0000-0000-0000000000aa', 'a4000000-0000-0000-0000-00000000000a', 'O-Level', 'o_level'),
  ('a4100000-0000-0000-0000-0000000000bb', 'b4000000-0000-0000-0000-00000000000b', 'O-Level', 'o_level');
insert into public.grading_bands (school_id, scale_id, grade, min_mark, max_mark, sort_order)
select s.school_id, s.id, b.grade, b.min_mark, b.max_mark, b.sort_order
from (values
  ('a4000000-0000-0000-0000-00000000000a'::uuid, 'a4100000-0000-0000-0000-0000000000aa'::uuid),
  ('b4000000-0000-0000-0000-00000000000b', 'a4100000-0000-0000-0000-0000000000bb')
) as s (school_id, id)
cross join (values ('A', 70, 100, 1), ('B', 60, 69, 2), ('C', 50, 59, 3), ('D', 45, 49, 4), ('E', 40, 44, 5), ('U', 0, 39, 6))
  as b (grade, min_mark, max_mark, sort_order);
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values
  ('a4200000-0000-0000-0000-0000000000aa', 'a4000000-0000-0000-0000-00000000000a', 'Form 4', 'o_level', 'a4100000-0000-0000-0000-0000000000aa'),
  ('a4200000-0000-0000-0000-0000000000bb', 'b4000000-0000-0000-0000-00000000000b', 'Form 4', 'o_level', 'a4100000-0000-0000-0000-0000000000bb');
insert into public.academic_years (id, school_id, label, starts_on, ends_on) values
  ('a4300000-0000-0000-0000-0000000000aa', 'a4000000-0000-0000-0000-00000000000a', '2026', '2026-01-13', '2026-12-04'),
  ('a4300000-0000-0000-0000-0000000000bb', 'b4000000-0000-0000-0000-00000000000b', '2026', '2026-01-13', '2026-12-04');
insert into public.terms (id, school_id, academic_year_id, name, kind, starts_on, ends_on, status) values
  ('74000000-0000-0000-0000-0000000000a1', 'a4000000-0000-0000-0000-00000000000a', 'a4300000-0000-0000-0000-0000000000aa', 'T', 'term', '2026-01-13', '2026-04-09', 'open'),
  ('74000000-0000-0000-0000-0000000000a2', 'a4000000-0000-0000-0000-00000000000a', 'a4300000-0000-0000-0000-0000000000aa', 'V', 'vacation', '2026-04-14', '2026-04-24', 'open'),
  ('74000000-0000-0000-0000-0000000000a3', 'a4000000-0000-0000-0000-00000000000a', 'a4300000-0000-0000-0000-0000000000aa', 'Timing', 'term', '2026-05-05', '2026-08-07', 'open'),
  ('74000000-0000-0000-0000-0000000000b1', 'b4000000-0000-0000-0000-00000000000b', 'a4300000-0000-0000-0000-0000000000bb', 'T', 'term', '2026-01-13', '2026-04-09', 'open');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ('c4400000-0000-0000-0000-0000000000a1', 'a4000000-0000-0000-0000-00000000000a', 'a4300000-0000-0000-0000-0000000000aa', 'a4200000-0000-0000-0000-0000000000aa', '4 Blue', 'e4000000-0000-0000-0000-000000000003'),
  ('c4400000-0000-0000-0000-0000000000a2', 'a4000000-0000-0000-0000-00000000000a', 'a4300000-0000-0000-0000-0000000000aa', 'a4200000-0000-0000-0000-0000000000aa', '4 Big', null),
  ('c4400000-0000-0000-0000-0000000000b1', 'b4000000-0000-0000-0000-00000000000b', 'a4300000-0000-0000-0000-0000000000bb', 'a4200000-0000-0000-0000-0000000000bb', '4 Blue', null);
insert into public.subjects (id, school_id, code, name, stage_scope)
select ('d4' || lpad(n::text, 6, '0') || '-0000-0000-0000-0000000000aa')::uuid, 'a4000000-0000-0000-0000-00000000000a', 'S' || n, 'Subject ' || n, 'secondary'
from generate_series(1, 10) n;
insert into public.subjects (id, school_id, code, name, stage_scope) values
  ('d4b00000-0000-0000-0000-0000000000bb', 'b4000000-0000-0000-0000-00000000000b', 'MATH', 'Mathematics', 'secondary');
-- 4 Blue: S1 Maths (Sam), S2 English (Hope), S3 Art (Sam), S4 Science (Sam).
insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values
  ('c5400000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-00000000000a', 'c4400000-0000-0000-0000-0000000000a1', 'd4000001-0000-0000-0000-0000000000aa', 'e4000000-0000-0000-0000-000000000004'),
  ('c5400000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-00000000000a', 'c4400000-0000-0000-0000-0000000000a1', 'd4000002-0000-0000-0000-0000000000aa', 'e4000000-0000-0000-0000-000000000005'),
  ('c5400000-0000-0000-0000-000000000003', 'a4000000-0000-0000-0000-00000000000a', 'c4400000-0000-0000-0000-0000000000a1', 'd4000003-0000-0000-0000-0000000000aa', 'e4000000-0000-0000-0000-000000000004'),
  ('c5400000-0000-0000-0000-000000000004', 'a4000000-0000-0000-0000-00000000000a', 'c4400000-0000-0000-0000-0000000000a1', 'd4000004-0000-0000-0000-0000000000aa', 'e4000000-0000-0000-0000-000000000004'),
  ('c5400000-0000-0000-0000-0000000000b1', 'b4000000-0000-0000-0000-00000000000b', 'c4400000-0000-0000-0000-0000000000b1', 'd4b00000-0000-0000-0000-0000000000bb', null);

insert into public.learners (id, school_id, learner_number, first_name, last_name)
select ('f4400000-0000-0000-0000-00000000000' || n)::uuid, 'a4000000-0000-0000-0000-00000000000a', 'CALC-' || n, 'Learner', 'L' || n
from generate_series(1, 6) n;
insert into public.learners (id, school_id, learner_number, first_name, last_name) values
  ('f4b00000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-00000000000b', 'CALC-B1', 'Bee', 'Learner');
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id, status)
select ('e4400000-0000-0000-0000-00000000000' || n)::uuid, 'a4000000-0000-0000-0000-00000000000a',
       ('f4400000-0000-0000-0000-00000000000' || n)::uuid, 'c4400000-0000-0000-0000-0000000000a1',
       'a4300000-0000-0000-0000-0000000000aa', case when n = 4 then 'left' else 'enrolled' end::public.enrolment_status
from generate_series(1, 6) n;
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id) values
  ('e4b00000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-00000000000b', 'f4b00000-0000-0000-0000-000000000001', 'c4400000-0000-0000-0000-0000000000b1', 'a4300000-0000-0000-0000-0000000000bb');

-- Everyone takes Maths and English; L1 also Art; L1, L4 and L6 Science.
insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id)
select 'a4000000-0000-0000-0000-00000000000a', ('e4400000-0000-0000-0000-00000000000' || e)::uuid,
       ('c5400000-0000-0000-0000-00000000000' || s)::uuid
from (values (1, 1), (1, 2), (1, 3), (1, 4), (2, 1), (2, 2), (3, 1), (3, 2), (4, 1), (4, 2), (4, 4),
             (5, 1), (5, 2), (6, 1), (6, 2), (6, 4)) as x (e, s);
insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id) values
  ('b4000000-0000-0000-0000-00000000000b', 'e4b00000-0000-0000-0000-000000000001', 'c5400000-0000-0000-0000-0000000000b1');

insert into public.assessments (id, school_id, term_id, class_subject_id, name, type, max_mark, weight_percent) values
  ('a5400000-0000-0000-0000-000000000011', 'a4000000-0000-0000-0000-00000000000a', '74000000-0000-0000-0000-0000000000a1', 'c5400000-0000-0000-0000-000000000001', 'Maths', 'exam', 100, 100),
  ('a5400000-0000-0000-0000-000000000021', 'a4000000-0000-0000-0000-00000000000a', '74000000-0000-0000-0000-0000000000a1', 'c5400000-0000-0000-0000-000000000002', 'English', 'exam', 100, 100),
  ('a5400000-0000-0000-0000-000000000031', 'a4000000-0000-0000-0000-00000000000a', '74000000-0000-0000-0000-0000000000a1', 'c5400000-0000-0000-0000-000000000003', 'Art 1', 'practical', 3, 50),
  ('a5400000-0000-0000-0000-000000000032', 'a4000000-0000-0000-0000-00000000000a', '74000000-0000-0000-0000-0000000000a1', 'c5400000-0000-0000-0000-000000000003', 'Art 2', 'practical', 3, 50),
  ('a5400000-0000-0000-0000-000000000041', 'a4000000-0000-0000-0000-00000000000a', '74000000-0000-0000-0000-0000000000a1', 'c5400000-0000-0000-0000-000000000004', 'Science test', 'test', 100, 40),
  ('a5400000-0000-0000-0000-000000000042', 'a4000000-0000-0000-0000-00000000000a', '74000000-0000-0000-0000-0000000000a1', 'c5400000-0000-0000-0000-000000000004', 'Science exam', 'exam', 100, 50),
  ('a5400000-0000-0000-0000-000000000019', 'a4000000-0000-0000-0000-00000000000a', '74000000-0000-0000-0000-0000000000a2', 'c5400000-0000-0000-0000-000000000001', 'Vacation', 'vacation', 100, 100),
  ('a5400000-0000-0000-0000-0000000000b1', 'b4000000-0000-0000-0000-00000000000b', '74000000-0000-0000-0000-0000000000b1', 'c5400000-0000-0000-0000-0000000000b1', 'Maths', 'exam', 100, 100);

insert into public.marks (school_id, assessment_id, enrolment_id, score, status)
select 'a4000000-0000-0000-0000-00000000000a', ('a5400000-0000-0000-0000-0000000000' || a)::uuid,
       ('e4400000-0000-0000-0000-00000000000' || e)::uuid, x.score, x.status::public.mark_status
from (values
  ('11', 1, 69.5, 'present'), ('21', 1, 70, 'present'), ('31', 1, 2.08, 'present'), ('32', 1, 2.09, 'present'),
  ('41', 1, 80, 'present'), ('42', 1, 80, 'present'),
  ('11', 2, 39.5, 'present'), ('21', 2, 0, 'present'),
  ('11', 3, 69.49, 'present'), ('21', 3, null, 'absent'),
  ('11', 4, 90, 'present'), ('21', 4, 90, 'present'), ('41', 4, 90, 'present'), ('42', 4, 90, 'present'),
  ('11', 5, null, 'excused'),
  ('11', 6, 70, 'present'), ('21', 6, 70, 'present'), ('41', 6, 70, 'present'), ('42', 6, 70, 'present'),
  ('19', 1, 55, 'present')
) as x (a, e, score, status);
insert into public.marks (school_id, assessment_id, enrolment_id, score, status) values
  ('b4000000-0000-0000-0000-00000000000b', 'a5400000-0000-0000-0000-0000000000b1', 'e4b00000-0000-0000-0000-000000000001', 50, 'present');

-- Timing class "4 Big": 45 learners, 10 subjects, Test 1 (/30, 20%),
-- Test 2 (/50, 20%) and Exam (/100, 60%) each: 1,350 marks.
insert into public.class_subjects (id, school_id, class_id, subject_id)
select ('c5410000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'a4000000-0000-0000-0000-00000000000a',
       'c4400000-0000-0000-0000-0000000000a2', ('d4' || lpad(n::text, 6, '0') || '-0000-0000-0000-0000000000aa')::uuid
from generate_series(1, 10) n;
insert into public.learners (id, school_id, learner_number, first_name, last_name)
select ('f4410000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'a4000000-0000-0000-0000-00000000000a',
       'BIG-' || n, 'Learner', 'Big ' || n
from generate_series(1, 45) n;
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id)
select ('e4410000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'a4000000-0000-0000-0000-00000000000a',
       ('f4410000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'c4400000-0000-0000-0000-0000000000a2',
       'a4300000-0000-0000-0000-0000000000aa'
from generate_series(1, 45) n;
insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id)
select 'a4000000-0000-0000-0000-00000000000a', e.id, cs.id
from public.enrolments e
join public.class_subjects cs on cs.class_id = e.class_id
where e.class_id = 'c4400000-0000-0000-0000-0000000000a2';
insert into public.assessments (school_id, term_id, class_subject_id, name, type, max_mark, weight_percent, sort_order)
select 'a4000000-0000-0000-0000-00000000000a', '74000000-0000-0000-0000-0000000000a3', cs.id, x.name, x.type::public.assessment_type, x.max_mark, x.weight, x.sort_order
from public.class_subjects cs
cross join (values ('Test 1', 'test', 30, 20, 1), ('Test 2', 'test', 50, 20, 2), ('Exam', 'exam', 100, 60, 3))
  as x (name, type, max_mark, weight, sort_order)
where cs.class_id = 'c4400000-0000-0000-0000-0000000000a2';
insert into public.marks (school_id, assessment_id, enrolment_id, score, status)
select 'a4000000-0000-0000-0000-00000000000a', a.id, es.enrolment_id,
       (abs(hashtext(a.id::text || es.enrolment_id::text)) % (a.max_mark::int + 1)), 'present'
from public.assessments a
join public.enrolment_subjects es on es.class_subject_id = a.class_subject_id
where a.term_id = '74000000-0000-0000-0000-0000000000a3';

set local role authenticated;

-- Alice (school A admin) ------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'e4000000-0000-0000-0000-000000000001', true);

create temp table calc_results on commit drop as
select r.*, right(r.enrolment_id::text, 1)::int as learner, right(r.class_subject_id::text, 1)::int as subject
from public.subject_results('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1') r;
create temp table calc_positions on commit drop as
select p.*, right(p.enrolment_id::text, 1)::int as learner
from public.class_positions('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1') p;

select is((select count(*) from calc_results), 16::bigint, 'one result per learner and subject they take');

select results_eq(
  $$ select weighted_percent, rounded_mark, grade from calc_results where learner = 1 and subject = 1 $$,
  $$ values (69.50, 70, 'A') $$, '69.5 rounds up to 70, an A');
select results_eq(
  $$ select weighted_percent, rounded_mark, grade from calc_results where learner = 1 and subject = 2 $$,
  $$ values (70.00, 70, 'A') $$, '70 is an A');
select results_eq(
  $$ select weighted_percent, rounded_mark, grade from calc_results where learner = 3 and subject = 1 $$,
  $$ values (69.49, 69, 'B') $$, '69.49 rounds down to 69, a B');
select results_eq(
  $$ select weighted_percent, rounded_mark, grade from calc_results where learner = 2 and subject = 1 $$,
  $$ values (39.50, 40, 'E') $$, '39.5 rounds up to 40, an E');
select results_eq(
  $$ select weighted_percent, rounded_mark, grade, result_status from calc_results where learner = 2 and subject = 2 $$,
  $$ values (0.00, 0, 'U', 'complete') $$, '0 is a complete U');
select results_eq(
  $$ select weighted_percent, rounded_mark, grade from calc_results where learner = 1 and subject = 3 $$,
  $$ values (69.50, 70, 'A') $$, 'exactly 69.5 from 2.08 / 3 * 50 + 2.09 / 3 * 50, which do not terminate, still rounds up to 70');

select results_eq(
  $$ select result_status, incomplete_reason, weighted_percent, rounded_mark, grade
     from calc_results where subject = 4 order by learner $$,
  $$ values ('incomplete', 'weights_not_100', null::numeric, null::int, null::text),
            ('incomplete', 'weights_not_100', null, null, null),
            ('incomplete', 'weights_not_100', null, null, null) $$,
  'weights adding up to 90 make the subject incomplete with that reason, for every learner');
select results_eq(
  $$ select result_status, incomplete_reason, rounded_mark, grade from calc_results where learner = 3 and subject = 2 $$,
  $$ values ('incomplete', 'absent', null::int, null::text) $$, 'an absence makes the subject incomplete, with no grade');
select results_eq(
  $$ select incomplete_reason from calc_results where learner = 5 order by subject $$,
  $$ values ('excused'), ('missing_mark') $$, 'an excused mark and a missing mark make subjects incomplete');

select results_eq(
  $$ select learner, subjects_counted, average, "position", class_size from calc_positions order by learner $$,
  $$ values (1, 3, 70.0, 1, 5), (2, 2, 20.0, 4, 5), (3, 1, 69.0, 3, 5), (4, 2, 90.0, null, 5),
            (5, 0, null, null, 5), (6, 2, 70.0, 1, 5) $$,
  'averages leave out incomplete subjects; the tie shares 1 and the next is 3; the leaver and the learner with no average have no position');

select results_eq(
  $$ select right(enrolment_id::text, 1)::int, rounded_mark, grade, incomplete_reason
     from public.subject_results('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a2')
     where right(enrolment_id::text, 1) in ('1', '2') order by 1 $$,
  $$ values (1, 55, 'C', null::text), (2, null, null, 'missing_mark') $$,
  'the vacation term has results for its own assessment only (Maths), missing where no mark was entered');
select results_eq(
  $$ select count(*), count(average), count("position"), count(class_size)
     from public.class_positions('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a2') $$,
  $$ values (6::bigint, 1::bigint, 0::bigint, 0::bigint) $$, 'the vacation term has an average but no positions or class size');
select is(
  (select count(*) from public.subject_results('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000b1')),
  0::bigint, 'a term from another school gives nothing');

select is((select count(*) from public.subject_results('c4400000-0000-0000-0000-0000000000b1', '74000000-0000-0000-0000-0000000000b1')), 0::bigint, 'admin reads no subject results of a school B class');
select is((select count(*) from public.class_positions('c4400000-0000-0000-0000-0000000000b1', '74000000-0000-0000-0000-0000000000b1')), 0::bigint, 'admin reads no positions of a school B class');

-- Timing: a class of 45 with 10 subjects, both functions, as the admin.
do $$
declare
  started timestamptz := clock_timestamp();
  n_results bigint;
  n_positions bigint;
begin
  select count(*) into n_results
  from public.subject_results('c4400000-0000-0000-0000-0000000000a2', '74000000-0000-0000-0000-0000000000a3');
  select count(*) into n_positions
  from public.class_positions('c4400000-0000-0000-0000-0000000000a2', '74000000-0000-0000-0000-0000000000a3');
  perform set_config('calc.timing_ms', (extract(epoch from clock_timestamp() - started) * 1000)::int::text, true);
  perform set_config('calc.timing_rows', n_results || '/' || n_positions, true);
end;
$$;
select is(current_setting('calc.timing_rows'), '450/45', 'the timing class has 450 results and 45 positions');
select cmp_ok(current_setting('calc.timing_ms')::int, '<', 1000,
  'subject results and positions for 45 learners with 10 subjects take under a second together');
select is(
  (select count(distinct "position") > 1 from public.class_positions('c4400000-0000-0000-0000-0000000000a2', '74000000-0000-0000-0000-0000000000a3')),
  true, 'the timing class is ranked');

-- Hank (head): everything in the school ------------------------------------------------
select set_config('request.jwt.claim.sub', 'e4000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.subject_results('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1')), 16::bigint, 'head reads every subject result');
select is((select count(*) from public.class_positions('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1')), 6::bigint, 'head reads positions');

-- Tina (class teacher of 4 Blue, teaches nothing) --------------------------------------
select set_config('request.jwt.claim.sub', 'e4000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.subject_results('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1')), 16::bigint, 'class teacher reads every subject result of the class');
select is((select count(*) from public.class_positions('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1')), 6::bigint, 'class teacher reads positions of the class');
select is((select count(*) from public.subject_results('c4400000-0000-0000-0000-0000000000a2', '74000000-0000-0000-0000-0000000000a3')), 0::bigint, 'class teacher reads nothing of another class');
select is((select count(*) from public.class_positions('c4400000-0000-0000-0000-0000000000a2', '74000000-0000-0000-0000-0000000000a3')), 0::bigint, 'class teacher reads no positions of another class');

-- Sam (teaches Maths, Art and Science in 4 Blue; not class teacher) ---------------------
select set_config('request.jwt.claim.sub', 'e4000000-0000-0000-0000-000000000004', true);
select results_eq(
  $$ select distinct right(class_subject_id::text, 1)::int from public.subject_results('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1') order by 1 $$,
  $$ values (1), (3), (4) $$, 'subject teacher reads only the subjects they teach');
select is((select count(*) from public.subject_results('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1') where rounded_mark is not null and right(class_subject_id::text, 1) = '1'), 5::bigint, 'subject teacher sees their own subject''s complete results');
select is((select count(*) from public.class_positions('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1')), 0::bigint, 'subject teacher reads no averages or positions (their view of the class is partial)');

-- Hope (hod, teaches English): scoped like a teacher (D23, D30) -------------------------
select set_config('request.jwt.claim.sub', 'e4000000-0000-0000-0000-000000000005', true);
select results_eq(
  $$ select distinct right(class_subject_id::text, 1)::int from public.subject_results('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1') $$,
  $$ values (2) $$, 'hod reads only the subject they teach');
select is((select count(*) from public.class_positions('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1')), 0::bigint, 'hod reads no positions');

-- Pat (parent), Lara (learner), Bob (school B admin) -----------------------------------
select set_config('request.jwt.claim.sub', 'e4000000-0000-0000-0000-000000000007', true);
select is((select count(*) from public.subject_results('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1')), 0::bigint, 'parent reads no subject results yet (Phase 4)');
select is((select count(*) from public.class_positions('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1')), 0::bigint, 'parent reads no positions yet');
select set_config('request.jwt.claim.sub', 'e4000000-0000-0000-0000-000000000008', true);
select is((select count(*) from public.subject_results('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1')), 0::bigint, 'learner reads no subject results yet (Phase 4)');
select is((select count(*) from public.class_positions('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1')), 0::bigint, 'learner reads no positions yet');

select set_config('request.jwt.claim.sub', 'e4000000-0000-0000-0000-000000000009', true);
select is((select count(*) from public.subject_results('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1')), 0::bigint, 'school B admin reads no school A subject results');
select is((select count(*) from public.class_positions('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1')), 0::bigint, 'school B admin reads no school A positions');
select results_eq(
  $$ select rounded_mark, grade from public.subject_results('c4400000-0000-0000-0000-0000000000b1', '74000000-0000-0000-0000-0000000000b1') $$,
  $$ values (50, 'C') $$, 'school B admin reads their own class');

-- Nobody reaches the internals ----------------------------------------------------------
select throws_ok($$ select * from private.class_term_subject_results('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1') $$, '42501', null, 'signed-in users cannot call the unchecked subject results');
select throws_ok($$ select * from private.class_term_positions('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1') $$, '42501', null, 'signed-in users cannot call the unchecked positions');

-- Anonymous ---------------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select * from public.subject_results('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1') $$, '42501', null, 'anonymous cannot read subject results');
select throws_ok($$ select * from public.class_positions('c4400000-0000-0000-0000-0000000000a1', '74000000-0000-0000-0000-0000000000a1') $$, '42501', null, 'anonymous cannot read positions');

select * from finish();
rollback;
