-- pgTAP: promotion and year rollover (US-3.5; D52). Migration
-- 20261012130000_year_rollover.
--
-- roll_over_year() is the school admin's alone and stays inside their school;
-- a preview changes nothing; a plan with one bad line changes nothing; an
-- applied rollover creates the new classes (subjects and active teachers
-- copied), new enrolments with the subject choices the new class offers (the
-- rest listed), sets the old enrolments and leavers' learner records, writes
-- one audit event, and never deletes or edits a mark, comment or report.
-- Old reports stay readable by the family, past-term positions stay, and the
-- portal's years show the new year only once it is current.
--
-- Fixture (rolled back at the end). School A: Ada (school admin), Hank
-- (head), Tina (teacher), Tom (teacher, disabled after the year was set up),
-- Pat (parent of Lungi). School B: Bob (its school admin). 2026 is current,
-- 2027 is being set up and already has 4 Green (Mathematics only). 2026's
-- 3 Blue (Mathematics and Art by Tina, English by Tom) has Lungi, Rudo, Sipho
-- and Lindiwe; 4 Blue has Farai. Every 3 Blue learner takes all three
-- subjects and has a published Term 1 report.
begin;

select plan(42);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('ec000000-0000-0000-0000-000000000001', 'ada@rollover.test'),
  ('ec000000-0000-0000-0000-000000000002', 'hank@rollover.test'),
  ('ec000000-0000-0000-0000-000000000003', 'tina@rollover.test'),
  ('ec000000-0000-0000-0000-000000000004', 'pat@rollover.test'),
  ('ec000000-0000-0000-0000-000000000005', 'bob@rollover.test'),
  ('ec000000-0000-0000-0000-000000000006', 'tom@rollover.test')
) as u (id, email);

insert into public.schools (id, slug, name, stage, timezone, status) values
  ('a0000000-0000-0000-0000-0000000000c1', 'rollover-a-test', 'Rollover High', 'secondary', 'Africa/Harare', 'active'),
  ('b0000000-0000-0000-0000-0000000000c2', 'rollover-b-test', 'Other High', 'secondary', 'Africa/Harare', 'active');
insert into public.memberships (school_id, user_id, role, status) values
  ('a0000000-0000-0000-0000-0000000000c1', 'ec000000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a0000000-0000-0000-0000-0000000000c1', 'ec000000-0000-0000-0000-000000000002', 'head', 'active'),
  ('a0000000-0000-0000-0000-0000000000c1', 'ec000000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-0000000000c1', 'ec000000-0000-0000-0000-000000000006', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-0000000000c1', 'ec000000-0000-0000-0000-000000000004', 'parent', 'active'),
  ('b0000000-0000-0000-0000-0000000000c2', 'ec000000-0000-0000-0000-000000000005', 'school_admin', 'active');

insert into public.grading_scales (id, school_id, name, stage)
values ('a1000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000c1', 'Key', 'o_level');
insert into public.grading_bands (school_id, scale_id, grade, min_mark, max_mark)
select 'a0000000-0000-0000-0000-0000000000c1', 'a1000000-0000-0000-0000-0000000000c1', g, lo, hi
from (values ('A', 70, 100), ('B', 60, 69), ('C', 50, 59), ('D', 45, 49), ('E', 40, 44), ('U', 0, 39)) as b (g, lo, hi);
insert into public.grade_levels (id, school_id, name, stage, sort_order, grading_scale_id) values
  ('a2000000-0000-0000-0000-0000000000c3', 'a0000000-0000-0000-0000-0000000000c1', 'Form 3', 'o_level', 3, 'a1000000-0000-0000-0000-0000000000c1'),
  ('a2000000-0000-0000-0000-0000000000c4', 'a0000000-0000-0000-0000-0000000000c1', 'Form 4', 'o_level', 4, 'a1000000-0000-0000-0000-0000000000c1');
insert into public.academic_years (id, school_id, label, starts_on, ends_on, is_current) values
  ('a3000000-0000-0000-0000-0000000c2026', 'a0000000-0000-0000-0000-0000000000c1', '2026', '2026-01-13', '2026-12-04', true),
  ('a3000000-0000-0000-0000-0000000c2027', 'a0000000-0000-0000-0000-0000000000c1', '2027', '2027-01-12', '2027-12-03', false);
insert into public.academic_years (id, school_id, label, starts_on, ends_on, is_current) values
  ('b3000000-0000-0000-0000-0000000c2027', 'b0000000-0000-0000-0000-0000000000c2', '2027', '2027-01-12', '2027-12-03', false);
insert into public.grading_scales (id, school_id, name, stage)
values ('b1000000-0000-0000-0000-0000000000c2', 'b0000000-0000-0000-0000-0000000000c2', 'Key', 'o_level');
insert into public.grade_levels (id, school_id, name, stage, sort_order, grading_scale_id) values
  ('b2000000-0000-0000-0000-0000000000c4', 'b0000000-0000-0000-0000-0000000000c2', 'Form 4', 'o_level', 4, 'b1000000-0000-0000-0000-0000000000c2');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name) values
  ('cb000000-0000-0000-0000-0000000c4b27', 'b0000000-0000-0000-0000-0000000000c2', 'b3000000-0000-0000-0000-0000000c2027', 'b2000000-0000-0000-0000-0000000000c4', '4 Blue');
insert into public.terms (id, school_id, academic_year_id, name, kind, starts_on, ends_on, status) values
  ('7c000000-0000-0000-0000-000000002601', 'a0000000-0000-0000-0000-0000000000c1', 'a3000000-0000-0000-0000-0000000c2026', 'Term 1', 'term', '2026-01-13', '2026-04-09', 'open');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ('cc000000-0000-0000-0000-0000000c3b26', 'a0000000-0000-0000-0000-0000000000c1', 'a3000000-0000-0000-0000-0000000c2026', 'a2000000-0000-0000-0000-0000000000c3', '3 Blue', 'ec000000-0000-0000-0000-000000000003'),
  ('cc000000-0000-0000-0000-0000000c4b26', 'a0000000-0000-0000-0000-0000000000c1', 'a3000000-0000-0000-0000-0000000c2026', 'a2000000-0000-0000-0000-0000000000c4', '4 Blue', 'ec000000-0000-0000-0000-000000000003'),
  ('cc000000-0000-0000-0000-0000000c4a27', 'a0000000-0000-0000-0000-0000000000c1', 'a3000000-0000-0000-0000-0000000c2027', 'a2000000-0000-0000-0000-0000000000c4', '4 Green', 'ec000000-0000-0000-0000-000000000003');
insert into public.subjects (id, school_id, code, name, stage_scope, sort_order) values
  ('dc000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000c1', 'MATH', 'Mathematics', 'secondary', 1),
  ('dc000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000c1', 'ENG', 'English', 'secondary', 2),
  ('dc000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-0000000000c1', 'ART', 'Art', 'secondary', 3);
insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values
  ('cd000000-0000-0000-0000-0000003b26a1', 'a0000000-0000-0000-0000-0000000000c1', 'cc000000-0000-0000-0000-0000000c3b26', 'dc000000-0000-0000-0000-0000000000a1', 'ec000000-0000-0000-0000-000000000003'),
  ('cd000000-0000-0000-0000-0000003b26a2', 'a0000000-0000-0000-0000-0000000000c1', 'cc000000-0000-0000-0000-0000000c3b26', 'dc000000-0000-0000-0000-0000000000a2', 'ec000000-0000-0000-0000-000000000006'),
  ('cd000000-0000-0000-0000-0000003b26a3', 'a0000000-0000-0000-0000-0000000000c1', 'cc000000-0000-0000-0000-0000000c3b26', 'dc000000-0000-0000-0000-0000000000a3', 'ec000000-0000-0000-0000-000000000003'),
  ('cd000000-0000-0000-0000-0000004b26a1', 'a0000000-0000-0000-0000-0000000000c1', 'cc000000-0000-0000-0000-0000000c4b26', 'dc000000-0000-0000-0000-0000000000a1', 'ec000000-0000-0000-0000-000000000003'),
  ('cd000000-0000-0000-0000-0000004a27a1', 'a0000000-0000-0000-0000-0000000000c1', 'cc000000-0000-0000-0000-0000000c4a27', 'dc000000-0000-0000-0000-0000000000a1', 'ec000000-0000-0000-0000-000000000003');
insert into public.learners (id, school_id, learner_number, first_name, last_name) values
  ('fc000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000c1', 'R-01', 'Lungi', 'Moyo'),
  ('fc000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000c1', 'R-02', 'Rudo', 'Banda'),
  ('fc000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-0000000000c1', 'R-03', 'Sipho', 'Dube'),
  ('fc000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-0000000000c1', 'R-04', 'Lindiwe', 'Sibanda'),
  ('fc000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-0000000000c1', 'R-05', 'Farai', 'Chuma');
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id)
select ('ec100000-0000-0000-0000-00000000000' || n)::uuid, 'a0000000-0000-0000-0000-0000000000c1',
       ('fc000000-0000-0000-0000-00000000000' || n)::uuid,
       case when n = 5 then 'cc000000-0000-0000-0000-0000000c4b26'::uuid else 'cc000000-0000-0000-0000-0000000c3b26'::uuid end,
       'a3000000-0000-0000-0000-0000000c2026'
from generate_series(1, 5) as n;
insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id)
select 'a0000000-0000-0000-0000-0000000000c1', e.id, cs.id
from public.enrolments e
join public.class_subjects cs on cs.class_id = e.class_id
where e.school_id = 'a0000000-0000-0000-0000-0000000000c1';

-- Tom is disabled after the 2026 classes were set up.
update public.memberships set status = 'disabled'
where user_id = 'ec000000-0000-0000-0000-000000000006';

insert into public.guardians (id, school_id, full_name, user_id) values
  ('9ac00000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000c1', 'Pat Moyo', 'ec000000-0000-0000-0000-000000000004');
insert into public.guardian_links (school_id, guardian_id, learner_id, relationship, is_primary) values
  ('a0000000-0000-0000-0000-0000000000c1', '9ac00000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', 'mother', true);

-- Term 1 of 3 Blue: one Exam per subject, marks and finished comments, reports published.
insert into public.assessments (school_id, term_id, class_subject_id, name, type, max_mark, weight_percent, sort_order)
select 'a0000000-0000-0000-0000-0000000000c1', '7c000000-0000-0000-0000-000000002601', cs.id, 'Exam', 'exam', 100, 100, 1
from public.class_subjects cs where cs.class_id = 'cc000000-0000-0000-0000-0000000c3b26';
insert into public.marks (school_id, assessment_id, enrolment_id, score)
select 'a0000000-0000-0000-0000-0000000000c1', a.id, es.enrolment_id, 50 + right(es.enrolment_id::text, 1)::int * 5
from public.assessments a
join public.enrolment_subjects es on es.class_subject_id = a.class_subject_id
where a.term_id = '7c000000-0000-0000-0000-000000002601';
insert into public.subject_comments (school_id, term_id, enrolment_id, class_subject_id, teacher_id, comment, status, signed_at)
select 'a0000000-0000-0000-0000-0000000000c1', '7c000000-0000-0000-0000-000000002601', es.enrolment_id, es.class_subject_id,
       cs.teacher_id, 'Good work.', 'submitted', now()
from public.enrolment_subjects es
join public.class_subjects cs on cs.id = es.class_subject_id
where cs.class_id = 'cc000000-0000-0000-0000-0000000c3b26';
insert into public.class_comments (school_id, term_id, enrolment_id, comment, status)
select 'a0000000-0000-0000-0000-0000000000c1', '7c000000-0000-0000-0000-000000002601', e.id, 'A fine term.', 'submitted'
from public.enrolments e where e.class_id = 'cc000000-0000-0000-0000-0000000c3b26';

create function pg_temp.as_user(p_id text)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_id, true);
$$;
grant execute on function pg_temp.as_user(text) to authenticated, anon;

set local role authenticated;
select pg_temp.as_user('ec000000-0000-0000-0000-000000000003');
select public.generate_report_drafts('cc000000-0000-0000-0000-0000000c3b26', '7c000000-0000-0000-0000-000000002601');
select public.submit_class_reports('cc000000-0000-0000-0000-0000000c3b26', '7c000000-0000-0000-0000-000000002601');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000002');
select public.approve_class_reports('cc000000-0000-0000-0000-0000000c3b26', '7c000000-0000-0000-0000-000000002601');
select public.publish_class_reports('cc000000-0000-0000-0000-0000000c3b26', '7c000000-0000-0000-0000-000000002601');
reset role;
select pg_temp.as_user('');

-- What must never change: every mark, comment and report of school A.
create temporary table before_rollover on commit drop as
select
  (select md5(string_agg(m.id::text || m.enrolment_id || coalesce(m.score::text, '') || m.status, ',' order by m.id))
     from public.marks m where m.school_id = 'a0000000-0000-0000-0000-0000000000c1') as marks,
  (select md5(string_agg(c.id::text || c.comment || c.status, ',' order by c.id))
     from public.subject_comments c where c.school_id = 'a0000000-0000-0000-0000-0000000000c1') as subject_comments,
  (select md5(string_agg(c.id::text || c.comment || c.status, ',' order by c.id))
     from public.class_comments c where c.school_id = 'a0000000-0000-0000-0000-0000000000c1') as class_comments,
  (select md5(string_agg(r.id::text || r.status || r.snapshot::text || r.version, ',' order by r.id))
     from public.reports r where r.school_id = 'a0000000-0000-0000-0000-0000000000c1') as reports;

select is(
  (select count(*)::int from public.reports where school_id = 'a0000000-0000-0000-0000-0000000000c1' and status = 'published'),
  4, 'fixture: four published Term 1 reports in 3 Blue');

-- The plan: Lungi moves up to a new 4 Blue (a copy of 3 Blue), Rudo repeats
-- in a new 3 Blue, Sipho moves up to the existing 4 Green, Lindiwe leaves and
-- Farai graduates.
create temporary table plan (body jsonb, bad jsonb) on commit drop;
insert into plan values (
  '{"from_year_id": "a3000000-0000-0000-0000-0000000c2026",
    "to_year_id": "a3000000-0000-0000-0000-0000000c2027",
    "new_classes": [
      {"key": "n1", "name": "4 Blue", "grade_level_id": "a2000000-0000-0000-0000-0000000000c4",
       "copy_from_class_id": "cc000000-0000-0000-0000-0000000c3b26"},
      {"key": "n2", "name": "3 Blue", "grade_level_id": "a2000000-0000-0000-0000-0000000000c3",
       "copy_from_class_id": "cc000000-0000-0000-0000-0000000c3b26"}],
    "learners": [
      {"enrolment_id": "ec100000-0000-0000-0000-000000000001", "outcome": "promoted", "to_class": "n1"},
      {"enrolment_id": "ec100000-0000-0000-0000-000000000002", "outcome": "repeating", "to_class": "n2"},
      {"enrolment_id": "ec100000-0000-0000-0000-000000000003", "outcome": "promoted", "to_class": "cc000000-0000-0000-0000-0000000c4a27"},
      {"enrolment_id": "ec100000-0000-0000-0000-000000000004", "outcome": "left"},
      {"enrolment_id": "ec100000-0000-0000-0000-000000000005", "outcome": "graduated"}]}',
  null);
-- The same plan with Farai moving up to a class that is not in 2027.
update plan set bad = jsonb_set(body, '{learners,4}',
  '{"enrolment_id": "ec100000-0000-0000-0000-000000000005", "outcome": "promoted", "to_class": "cc000000-0000-0000-0000-0000000c4b26"}');
grant select on plan to authenticated, anon;

create function pg_temp.year_rows()
returns int language sql as $$
  select ((select count(*) from public.classes where academic_year_id = 'a3000000-0000-0000-0000-0000000c2027')
        + (select count(*) from public.enrolments where academic_year_id = 'a3000000-0000-0000-0000-0000000c2027')
        + (select count(*) from public.enrolments where academic_year_id = 'a3000000-0000-0000-0000-0000000c2026' and status <> 'enrolled')
        + (select count(*) from public.learners where school_id = 'a0000000-0000-0000-0000-0000000000c1' and status <> 'active')
        + (select count(*) from public.audit_log where event = 'year_rolled_over'))::int;
$$;
select is(pg_temp.year_rows(), 1, 'fixture: 2027 has only 4 Green, nobody has moved on');

-- Who may roll over -------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('ec000000-0000-0000-0000-000000000005');
select throws_ok($$ select public.roll_over_year((select body from plan), true) $$, 'P0002', null,
  'another school''s admin cannot even find the year');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.roll_over_year((select body from plan), true) $$, '42501', null,
  'the head cannot roll over');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000003');
select throws_ok($$ select public.roll_over_year((select body from plan), true) $$, '42501', null,
  'nor can a teacher');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000004');
select throws_ok($$ select public.roll_over_year((select body from plan), true) $$, 'P0002', null,
  'nor a parent');
reset role;
set local role anon;
select throws_ok($$ select public.roll_over_year((select body from plan), true) $$, '42501', null,
  'anonymous callers have no execute right');
reset role;

set local role authenticated;
select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ select public.roll_over_year(jsonb_set((select body from plan), '{to_year_id}', '"b3000000-0000-0000-0000-0000000c2027"'), true) $$,
  'P0002', null, 'the admin cannot roll into another school''s year');
select throws_ok(
  $$ select public.roll_over_year(jsonb_set((select body from plan), '{to_year_id}', '"a3000000-0000-0000-0000-0000000c2026"'), true) $$,
  '22023', 'the next year must start after 2026', 'or into the same year');
select throws_ok(
  $$ select public.roll_over_year(jsonb_set((select body from plan), '{from_year_id}', '"a3000000-0000-0000-0000-0000000c2027"'), true) $$,
  '22023', 'only the current year can be rolled over', 'only the current year rolls over');
select throws_ok(
  $$ select public.roll_over_year((select body from plan)
       || '{"new_classes": [], "learners": [{"enrolment_id": "ec100000-0000-0000-0000-000000000001", "outcome": "promoted",
                          "to_class": "cb000000-0000-0000-0000-0000000c4b27"}]}', true) $$,
  '22023', 'choose a 2027 class for Lungi Moyo (R-01)',
  'a learner cannot be moved into another school''s class');
select throws_ok(
  $$ select public.roll_over_year((select body from plan)
       || '{"new_classes": [{"key": "n1", "name": "4 Red", "grade_level_id": "a2000000-0000-0000-0000-0000000000c4",
                             "copy_from_class_id": "cb000000-0000-0000-0000-0000000c4b27"}],
            "learners": [{"enrolment_id": "ec100000-0000-0000-0000-000000000001", "outcome": "promoted", "to_class": "n1"}]}', true) $$,
  '22023', null, 'nor can a new class copy another school''s class');

-- Preview and all or nothing --------------------------------------------------------------------

create temporary table preview on commit drop as
select public.roll_over_year((select body from plan), false) as r;
reset role;
select pg_temp.as_user('');
select is(
  (select (r ->> 'promoted', r ->> 'repeating', r ->> 'left', r ->> 'graduated', r ->> 'applied')::text from preview),
  '(2,1,1,1,false)', 'the preview counts 2 moving up, 1 repeating, 1 leaving and 1 graduating');
select is(
  (select array(select x ->> 'name' from jsonb_array_elements(r -> 'classes_created') x) from preview),
  array['4 Blue', '3 Blue'], 'and names the classes it would create');
select is(
  (select array(select (x ->> 'learner_name') || ': ' || (x ->> 'subject') || ' not in ' || (x ->> 'to_class')
                from jsonb_array_elements(r -> 'not_carried') x) from preview),
  array['Sipho Dube: English not in 4 Green', 'Sipho Dube: Art not in 4 Green'],
  'and lists the subject choices 4 Green does not offer');
select is(pg_temp.year_rows(), 1, 'but the preview changes nothing, audit log included');

set local role authenticated;
select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.roll_over_year((select bad from plan), true) $$, '22023',
  'choose a 2027 class for Farai Chuma (R-05)', 'one bad line refuses the whole plan');
reset role;
select is(pg_temp.year_rows(), 1, 'and nothing of the rest was done');

-- Applying ----------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
create temporary table applied on commit drop as
select public.roll_over_year((select body from plan), true) as r;
reset role;
select pg_temp.as_user('');

select is(
  (select (r - 'enrolments' - 'classes_created' - 'not_carried') from applied),
  (select (r - 'enrolments' - 'classes_created' - 'not_carried') || '{"applied": true}' from preview),
  'applying does what the preview said');
select is(
  array(select e.status::text from public.enrolments e
        where e.academic_year_id = 'a3000000-0000-0000-0000-0000000c2026' order by e.id),
  array['promoted', 'repeating', 'promoted', 'left', 'graduated'],
  'the 2026 enrolments are promoted, repeating, left or graduated');
select is(
  array(select l.first_name || ' ' || l.status from public.learners l
        where l.school_id = 'a0000000-0000-0000-0000-0000000000c1' order by l.learner_number),
  array['Lungi active', 'Rudo active', 'Sipho active', 'Lindiwe left', 'Farai graduated'],
  'the leaver and the graduate are no longer active learners');
select is(
  array(select l.first_name || ' in ' || c.name || ' ' || e.status
        from public.enrolments e
        join public.learners l on l.id = e.learner_id
        join public.classes c on c.id = e.class_id
        where e.academic_year_id = 'a3000000-0000-0000-0000-0000000c2027' order by l.learner_number),
  array['Lungi in 4 Blue enrolled', 'Rudo in 3 Blue enrolled', 'Sipho in 4 Green enrolled'],
  'those who move up or repeat are enrolled in their 2027 class');
select is(
  (select array_agg(c.name || ' ' || gl.name || ' ' || coalesce(c.class_teacher_id::text, 'none') order by c.name)
   from public.classes c join public.grade_levels gl on gl.id = c.grade_level_id
   where c.academic_year_id = 'a3000000-0000-0000-0000-0000000c2027'),
  array['3 Blue Form 3 ec000000-0000-0000-0000-000000000003', '4 Blue Form 4 ec000000-0000-0000-0000-000000000003',
        '4 Green Form 4 ec000000-0000-0000-0000-000000000003'],
  'the new classes are at their levels with the old class teacher');
select is(
  (select array_agg(s.code || ' ' || coalesce(cs.teacher_id::text, 'no teacher') order by s.sort_order)
   from public.class_subjects cs
   join public.classes c on c.id = cs.class_id
   join public.subjects s on s.id = cs.subject_id
   where c.academic_year_id = 'a3000000-0000-0000-0000-0000000c2027' and c.name = '4 Blue'),
  array['MATH ec000000-0000-0000-0000-000000000003', 'ENG no teacher', 'ART ec000000-0000-0000-0000-000000000003'],
  'a new class copies the old class''s subjects, with a teacher only while they are still active');
select is(
  array(select l.first_name || ' ' || s.code
        from public.enrolment_subjects es
        join public.enrolments e on e.id = es.enrolment_id
        join public.learners l on l.id = e.learner_id
        join public.class_subjects cs on cs.id = es.class_subject_id
        join public.subjects s on s.id = cs.subject_id
        where e.academic_year_id = 'a3000000-0000-0000-0000-0000000c2027'
        order by l.learner_number, s.sort_order),
  array['Lungi MATH', 'Lungi ENG', 'Lungi ART', 'Rudo MATH', 'Rudo ENG', 'Rudo ART', 'Sipho MATH'],
  'subject choices are carried only where the new class offers the subject');
select is(
  (select jsonb_array_length(r -> 'not_carried') from applied), 2,
  'and the two that could not be carried are listed');
select is(
  (select (new_data ->> 'promoted', new_data ->> 'graduated', new_data ->> 'from_year', new_data ->> 'to_year',
           actor_id, row_id)::text
   from public.audit_log where event = 'year_rolled_over'),
  '(2,1,2026,2027,ec000000-0000-0000-0000-000000000001,a3000000-0000-0000-0000-0000000c2026)',
  'one audit event records who rolled which year over and how many of each');
select ok(
  (select count(*) from public.audit_log
   where table_name = 'enrolments' and school_id = 'a0000000-0000-0000-0000-0000000000c1'
     and actor_id = 'ec000000-0000-0000-0000-000000000001') >= 8,
  'and each enrolment change is audited as the admin''s');

-- Nothing old is deleted or edited -----------------------------------------------------------------

select is(
  (select (
     (select md5(string_agg(m.id::text || m.enrolment_id || coalesce(m.score::text, '') || m.status, ',' order by m.id))
        from public.marks m where m.school_id = 'a0000000-0000-0000-0000-0000000000c1'),
     (select md5(string_agg(c.id::text || c.comment || c.status, ',' order by c.id))
        from public.subject_comments c where c.school_id = 'a0000000-0000-0000-0000-0000000000c1'),
     (select md5(string_agg(c.id::text || c.comment || c.status, ',' order by c.id))
        from public.class_comments c where c.school_id = 'a0000000-0000-0000-0000-0000000000c1'),
     (select md5(string_agg(r.id::text || r.status || r.snapshot::text || r.version, ',' order by r.id))
        from public.reports r where r.school_id = 'a0000000-0000-0000-0000-0000000000c1'))::text),
  (select (marks, subject_comments, class_comments, reports)::text from before_rollover),
  'every mark, comment and report is exactly as it was');
select is(
  (select count(*)::int from public.enrolment_subjects es join public.enrolments e on e.id = es.enrolment_id
   where e.academic_year_id = 'a3000000-0000-0000-0000-0000000c2026'),
  13, 'and the 2026 subject choices are all still there');

set local role authenticated;
select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
select is(
  (select array_agg(p.position order by p.enrolment_id)
   from public.class_positions('cc000000-0000-0000-0000-0000000c3b26', '7c000000-0000-0000-0000-000000002601') p
   where p.enrolment_id <> 'ec100000-0000-0000-0000-000000000004'),
  array[3, 2, 1],
  'Term 1 positions still rank those who moved up or repeat (D31)');
select is(
  (select (p.average is not null, p.position)::text
   from public.class_positions('cc000000-0000-0000-0000-0000000c3b26', '7c000000-0000-0000-0000-000000002601') p
   where p.enrolment_id = 'ec100000-0000-0000-0000-000000000004'),
  '(t,)', 'while the leaver keeps her average with no position, as any leaver (D31, D52)');

select pg_temp.as_user('ec000000-0000-0000-0000-000000000004');
select is(
  array(select learner_name || ' ' || year_label || ' ' || term_name || ' ' || class_name
        from public.portal_reports('a0000000-0000-0000-0000-0000000000c1')),
  array['Lungi Moyo 2026 Term 1 3 Blue'],
  'the parent of a promoted learner still lists last year''s published report');
select is(
  (select count(*)::int from public.reports where status = 'published'), 1,
  'and can still read it');
select is(
  array(select year_label || ' ' || class_name from public.family_enrolment_years('a0000000-0000-0000-0000-0000000000c1')),
  array['2026 3 Blue'], 'the portal shows 2027 only once it is current');
select ok(
  'cc000000-0000-0000-0000-0000000c3b26' not in (select private.my_announcement_class_ids()),
  'the old class''s announcements no longer reach the family');

select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
select lives_ok(
  $$ select public.set_current_academic_year('a3000000-0000-0000-0000-0000000c2027') $$,
  'the admin confirms 2027 as the current year');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000004');
select is(
  array(select year_label || ' ' || class_name from public.family_enrolment_years('a0000000-0000-0000-0000-0000000000c1')),
  array['2027 4 Blue', '2026 3 Blue'], 'then the portal shows 2027 first, next to 2026');
select is(
  (select count(*)::int from public.portal_reports('a0000000-0000-0000-0000-0000000000c1')), 1,
  'with last year''s report still there');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000005');
select is(
  (select count(*)::int from public.family_enrolment_years('a0000000-0000-0000-0000-0000000000c1')), 0,
  'another school''s user sees no family years here');

-- Running it twice ---------------------------------------------------------------------------------

select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
select public.set_current_academic_year('a3000000-0000-0000-0000-0000000c2026');
select throws_ok(
  $$ select public.roll_over_year((select body from plan)
       || '{"new_classes": [], "learners": [{"enrolment_id": "ec100000-0000-0000-0000-000000000001", "outcome": "promoted",
                          "to_class": "cc000000-0000-0000-0000-0000000c4a27"}]}', true) $$,
  '22023', 'Lungi Moyo (R-01) has already been moved on from 2026',
  'a learner cannot be rolled over twice');

select throws_ok(
  $$ select public.roll_over_year((select body from plan)
       || '{"new_classes": [], "learners": [{"enrolment_id": "ec100000-0000-0000-0000-0000000000b1", "outcome": "left"}]}', true) $$,
  '22023', 'a learner in the plan is not enrolled in 2026',
  'an enrolment that is not one of the year''s is refused');
reset role;

select * from finish();
rollback;
