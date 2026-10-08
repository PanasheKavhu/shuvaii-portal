-- pgTAP: people tables (migration order step 4 in docs/DATA_MODEL.md; D23):
-- learners, enrolments, enrolment_subjects, guardians, guardian_links,
-- import_jobs. Covers cross-school read and write for every table, head
-- access, teacher scoping (a 4 Blue teacher cannot read a 3 Green learner),
-- parents, learners and anonymous users seeing nothing, the
-- enrolment_subjects class check, learners never being deleted, and a
-- learner update writing an audit row.
--
-- Fixture (rolled back at the end). School A: Alice (admin), Hank (head),
-- Tina (class teacher of 4 Blue), Sam (teaches Maths in 4 Blue only), Gina
-- (class teacher of 3 Green and its Maths teacher), Dora (teaches English
-- in 4 Blue, then disabled), Pat (parent), Lara (learner role). School B:
-- Bob (admin), Bert (teacher). One learner in each class, each with one
-- subject choice, a guardian and a link; one import job per school.
begin;

select plan(68);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('e1000000-0000-0000-0000-000000000001', 'alice@people.test'),
  ('e1000000-0000-0000-0000-000000000002', 'hank@people.test'),
  ('e1000000-0000-0000-0000-000000000003', 'tina@people.test'),
  ('e1000000-0000-0000-0000-000000000004', 'sam@people.test'),
  ('e1000000-0000-0000-0000-000000000005', 'gina@people.test'),
  ('e1000000-0000-0000-0000-000000000006', 'dora@people.test'),
  ('e1000000-0000-0000-0000-000000000007', 'pat@people.test'),
  ('e1000000-0000-0000-0000-000000000008', 'lara@people.test'),
  ('e1000000-0000-0000-0000-000000000009', 'bob@people.test'),
  ('e1000000-0000-0000-0000-00000000000a', 'bert@people.test')
) as u (id, email);

insert into public.schools (id, slug, name, stage, timezone, status)
values
  ('ae000000-0000-0000-0000-00000000000a', 'people-a-test', 'School A', 'secondary', 'Africa/Harare', 'active'),
  ('be000000-0000-0000-0000-00000000000b', 'people-b-test', 'School B', 'secondary', 'Africa/Harare', 'active');

insert into public.memberships (school_id, user_id, role, status)
values
  ('ae000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('ae000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000002', 'head', 'active'),
  ('ae000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('ae000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000004', 'teacher', 'active'),
  ('ae000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000005', 'teacher', 'active'),
  ('ae000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000006', 'teacher', 'active'),
  ('ae000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000007', 'parent', 'active'),
  ('ae000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000008', 'learner', 'active'),
  ('be000000-0000-0000-0000-00000000000b', 'e1000000-0000-0000-0000-000000000009', 'school_admin', 'active'),
  ('be000000-0000-0000-0000-00000000000b', 'e1000000-0000-0000-0000-00000000000a', 'teacher', 'active');

-- Structure, inserted as the table owner.
insert into public.grading_scales (id, school_id, name, stage) values
  ('a1000000-0000-0000-0000-00000000000a', 'ae000000-0000-0000-0000-00000000000a', 'Scale', 'o_level'),
  ('a1000000-0000-0000-0000-00000000000b', 'be000000-0000-0000-0000-00000000000b', 'Scale', 'o_level');
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values
  ('a2000000-0000-0000-0000-00000000000a', 'ae000000-0000-0000-0000-00000000000a', 'Form 3', 'o_level', 'a1000000-0000-0000-0000-00000000000a'),
  ('a2000000-0000-0000-0000-00000000000b', 'be000000-0000-0000-0000-00000000000b', 'Form 4', 'o_level', 'a1000000-0000-0000-0000-00000000000b');
insert into public.academic_years (id, school_id, label, starts_on, ends_on) values
  ('a3000000-0000-0000-0000-00000000000a', 'ae000000-0000-0000-0000-00000000000a', '2026', '2026-01-13', '2026-12-04'),
  ('a3000000-0000-0000-0000-00000000000c', 'ae000000-0000-0000-0000-00000000000a', '2027', '2027-01-12', '2027-12-03'),
  ('a3000000-0000-0000-0000-00000000000b', 'be000000-0000-0000-0000-00000000000b', '2026', '2026-01-13', '2026-12-04');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ('c4000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-00000000000a', '4 Blue', 'e1000000-0000-0000-0000-000000000003'),
  ('c3000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-00000000000a', '3 Green', 'e1000000-0000-0000-0000-000000000005'),
  ('cb000000-0000-0000-0000-000000000001', 'be000000-0000-0000-0000-00000000000b', 'a3000000-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-00000000000b', '4 Blue', 'e1000000-0000-0000-0000-00000000000a');
insert into public.subjects (id, school_id, code, name, stage_scope) values
  ('d1000000-0000-0000-0000-00000000000a', 'ae000000-0000-0000-0000-00000000000a', 'MATH', 'Mathematics', 'secondary'),
  ('d2000000-0000-0000-0000-00000000000a', 'ae000000-0000-0000-0000-00000000000a', 'ENG', 'English', 'secondary'),
  ('d1000000-0000-0000-0000-00000000000b', 'be000000-0000-0000-0000-00000000000b', 'MATH', 'Mathematics', 'secondary');
insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values
  ('c5000000-0000-0000-0000-000000000041', 'ae000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000004'),
  ('c5000000-0000-0000-0000-000000000042', 'ae000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000006'),
  ('c5000000-0000-0000-0000-000000000031', 'ae000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000005'),
  ('c5000000-0000-0000-0000-0000000000b1', 'be000000-0000-0000-0000-00000000000b', 'cb000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-00000000000b', 'e1000000-0000-0000-0000-00000000000a');

-- Dora is disabled after being assigned: she must lose access.
update public.memberships set status = 'disabled'
where user_id = 'e1000000-0000-0000-0000-000000000006';

-- People.
insert into public.learners (id, school_id, learner_number, first_name, last_name, sex) values
  ('f4000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-00000000000a', 'A-4B-01', 'Four', 'Blue', 'F'),
  ('f3000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-00000000000a', 'A-3G-01', 'Three', 'Green', 'M'),
  ('fb000000-0000-0000-0000-000000000001', 'be000000-0000-0000-0000-00000000000b', 'B-4B-01', 'Bee', 'Learner', 'F');
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id) values
  ('e4000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-00000000000a', 'f4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-00000000000a'),
  ('e3000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-00000000000a'),
  ('eb000000-0000-0000-0000-000000000001', 'be000000-0000-0000-0000-00000000000b', 'fb000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-00000000000b');
insert into public.enrolment_subjects (id, school_id, enrolment_id, class_subject_id) values
  ('54000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000041'),
  ('53000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000031'),
  ('5b000000-0000-0000-0000-000000000001', 'be000000-0000-0000-0000-00000000000b', 'eb000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-0000000000b1');
insert into public.guardians (id, school_id, full_name, phone) values
  ('94000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-00000000000a', 'Parent of Four', '0770000001'),
  ('93000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-00000000000a', 'Parent of Three', '0770000002'),
  ('9b000000-0000-0000-0000-000000000001', 'be000000-0000-0000-0000-00000000000b', 'Parent of Bee', '0770000003');
insert into public.guardian_links (id, school_id, guardian_id, learner_id, relationship, is_primary) values
  ('84000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-00000000000a', '94000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000001', 'mother', true),
  ('83000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-00000000000a', '93000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'father', true),
  ('8b000000-0000-0000-0000-000000000001', 'be000000-0000-0000-0000-00000000000b', '9b000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'guardian', true);
insert into public.import_jobs (id, school_id, kind) values
  ('7a000000-0000-0000-0000-000000000001', 'ae000000-0000-0000-0000-00000000000a', 'learners'),
  ('7b000000-0000-0000-0000-000000000001', 'be000000-0000-0000-0000-00000000000b', 'learners');

set local role authenticated;

-- Alice (school A admin): her school's rows yes, school B's never ----------------
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);

select is((select count(*) from public.learners where school_id = 'ae000000-0000-0000-0000-00000000000a'), 2::bigint, 'admin reads own school''s learners');
select is((select count(*) from public.learners where school_id = 'be000000-0000-0000-0000-00000000000b'), 0::bigint, 'admin cannot read school B''s learners');
select throws_ok($$ insert into public.learners (school_id, learner_number, first_name, last_name) values ('be000000-0000-0000-0000-00000000000b', 'X1', 'X', 'Y') $$, '42501', null, 'admin cannot insert learners into school B');
select is_empty($$ update public.learners set first_name = 'Hacked' where school_id = 'be000000-0000-0000-0000-00000000000b' returning 1 $$, 'admin cannot update school B''s learners');

select is((select count(*) from public.enrolments where school_id = 'ae000000-0000-0000-0000-00000000000a'), 2::bigint, 'admin reads own school''s enrolments');
select is((select count(*) from public.enrolments where school_id = 'be000000-0000-0000-0000-00000000000b'), 0::bigint, 'admin cannot read school B''s enrolments');
select throws_ok($$ insert into public.enrolments (school_id, learner_id, class_id, academic_year_id) values ('be000000-0000-0000-0000-00000000000b', 'fb000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-00000000000b') $$, '42501', null, 'admin cannot insert enrolments into school B');
select is_empty($$ update public.enrolments set status = 'left' where school_id = 'be000000-0000-0000-0000-00000000000b' returning 1 $$, 'admin cannot update school B''s enrolments');

select is((select count(*) from public.enrolment_subjects where school_id = 'ae000000-0000-0000-0000-00000000000a'), 2::bigint, 'admin reads own school''s enrolment_subjects');
select is((select count(*) from public.enrolment_subjects where school_id = 'be000000-0000-0000-0000-00000000000b'), 0::bigint, 'admin cannot read school B''s enrolment_subjects');
select throws_ok($$ insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id) values ('be000000-0000-0000-0000-00000000000b', 'eb000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-0000000000b1') $$, '42501', null, 'admin cannot insert enrolment_subjects into school B');
select is_empty($$ delete from public.enrolment_subjects where school_id = 'be000000-0000-0000-0000-00000000000b' returning 1 $$, 'admin cannot delete school B''s enrolment_subjects');

select is((select count(*) from public.guardians where school_id = 'ae000000-0000-0000-0000-00000000000a'), 2::bigint, 'admin reads own school''s guardians');
select is((select count(*) from public.guardians where school_id = 'be000000-0000-0000-0000-00000000000b'), 0::bigint, 'admin cannot read school B''s guardians');
select throws_ok($$ insert into public.guardians (school_id, full_name) values ('be000000-0000-0000-0000-00000000000b', 'Intruder') $$, '42501', null, 'admin cannot insert guardians into school B');
select is_empty($$ update public.guardians set phone = '0000' where school_id = 'be000000-0000-0000-0000-00000000000b' returning 1 $$, 'admin cannot update school B''s guardians');

select is((select count(*) from public.guardian_links where school_id = 'ae000000-0000-0000-0000-00000000000a'), 2::bigint, 'admin reads own school''s guardian_links');
select is((select count(*) from public.guardian_links where school_id = 'be000000-0000-0000-0000-00000000000b'), 0::bigint, 'admin cannot read school B''s guardian_links');
select throws_ok($$ insert into public.guardian_links (school_id, guardian_id, learner_id, relationship) values ('be000000-0000-0000-0000-00000000000b', '9b000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'aunt') $$, '42501', null, 'admin cannot insert guardian_links into school B');
select is_empty($$ delete from public.guardian_links where school_id = 'be000000-0000-0000-0000-00000000000b' returning 1 $$, 'admin cannot delete school B''s guardian_links');

select is((select count(*) from public.import_jobs where school_id = 'ae000000-0000-0000-0000-00000000000a'), 1::bigint, 'admin reads own school''s import_jobs');
select is((select count(*) from public.import_jobs where school_id = 'be000000-0000-0000-0000-00000000000b'), 0::bigint, 'admin cannot read school B''s import_jobs');
select throws_ok($$ insert into public.import_jobs (school_id, kind) values ('be000000-0000-0000-0000-00000000000b', 'learners') $$, '42501', null, 'admin cannot insert import_jobs into school B');
select is_empty($$ update public.import_jobs set status = 'failed' where school_id = 'be000000-0000-0000-0000-00000000000b' returning 1 $$, 'admin cannot update school B''s import_jobs');

-- A school A row cannot point at a school B row.
select throws_ok($$ insert into public.guardian_links (school_id, guardian_id, learner_id, relationship) values ('ae000000-0000-0000-0000-00000000000a', '94000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'aunt') $$, '23503', null, 'a school A link cannot point at a school B learner');
select throws_ok($$ insert into public.enrolments (school_id, learner_id, class_id, academic_year_id) values ('ae000000-0000-0000-0000-00000000000a', 'f4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-00000000000c') $$, '23503', null, 'an enrolment''s year must be its class''s year');

-- Admin writes in her own school.
select lives_ok($$ insert into public.learners (school_id, learner_number, first_name, last_name) values ('ae000000-0000-0000-0000-00000000000a', 'A-NEW-01', 'New', 'Learner') $$, 'admin adds a learner');
select lives_ok($$ insert into public.import_jobs (school_id, kind) values ('ae000000-0000-0000-0000-00000000000a', 'learners') $$, 'admin records an import job');
select is((select created_by::text from public.import_jobs where school_id = 'ae000000-0000-0000-0000-00000000000a' and id <> '7a000000-0000-0000-0000-000000000001'), 'e1000000-0000-0000-0000-000000000001', 'an import job records who created it');

-- Learners are never deleted: no policy hides the row, and even the owner is refused.
select is_empty($$ delete from public.learners where id = 'f4000000-0000-0000-0000-000000000001' returning 1 $$, 'admin cannot delete a learner');
select is_empty($$ delete from public.enrolments where id = 'e4000000-0000-0000-0000-000000000001' returning 1 $$, 'admin cannot delete an enrolment');
select is_empty($$ delete from public.guardians where id = '94000000-0000-0000-0000-000000000001' returning 1 $$, 'admin cannot delete a guardian');

-- Audit: one learner update writes one row, by Alice, with old and new data.
select lives_ok($$ update public.learners set status = 'left' where id = 'f3000000-0000-0000-0000-000000000001' $$, 'admin changes a learner''s status');

reset role;

select is((select count(*) from public.audit_log where table_name = 'learners' and row_id = 'f3000000-0000-0000-0000-000000000001' and action = 'update'), 1::bigint, 'a learner update writes one audit row');
select is(
  (select array[actor_id::text, old_data ->> 'status', new_data ->> 'status', school_id::text]
   from public.audit_log where table_name = 'learners' and row_id = 'f3000000-0000-0000-0000-000000000001' and action = 'update'),
  array['e1000000-0000-0000-0000-000000000001', 'active', 'left', 'ae000000-0000-0000-0000-00000000000a'],
  'the audit row records the actor, old and new status, and the school'
);
select throws_ok($$ delete from public.learners where id = 'f4000000-0000-0000-0000-000000000001' $$, 'P0001', 'learners are never deleted; set status to left or graduated instead', 'even the table owner cannot delete a learner');

-- Class check: a learner takes only subjects of their own class.
select throws_ok($$ insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id) values ('ae000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000031') $$, '23514', 'the class subject must belong to the learner''s class', 'a 4 Blue learner cannot take a 3 Green class subject');
select lives_ok($$ insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id) values ('ae000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000042') $$, 'a 4 Blue learner takes a 4 Blue class subject');
select throws_ok($$ update public.enrolment_subjects set class_subject_id = 'c5000000-0000-0000-0000-000000000031' where id = '54000000-0000-0000-0000-000000000001' $$, '23514', null, 'a subject choice cannot be moved to another class''s subject');
select throws_ok($$ update public.enrolments set class_id = 'c3000000-0000-0000-0000-000000000001' where id = 'e4000000-0000-0000-0000-000000000001' $$, '23514', null, 'an enrolment cannot change class while it takes the old class''s subjects');
delete from public.enrolment_subjects where enrolment_id = 'e4000000-0000-0000-0000-000000000001' and class_subject_id = 'c5000000-0000-0000-0000-000000000042';

set local role authenticated;

-- Hank (head): reads everything in school A, and writes.
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000002', true);

select is((select count(*) from public.learners), 3::bigint, 'head reads all of the school''s learners');
select is((select count(*) from public.enrolments), 2::bigint, 'head reads the school''s enrolments');
select is((select count(*) from public.guardians), 2::bigint, 'head reads the school''s guardians');
select is((select count(*) from public.import_jobs), 2::bigint, 'head reads the school''s import jobs');
select isnt_empty($$ update public.enrolments set status = 'repeating' where id = 'e3000000-0000-0000-0000-000000000001' returning 1 $$, 'head updates an enrolment');
select lives_ok($$ insert into public.guardians (school_id, full_name) values ('ae000000-0000-0000-0000-00000000000a', 'New Guardian') $$, 'head adds a guardian');
select is((select count(*) from public.learners where school_id = 'be000000-0000-0000-0000-00000000000b'), 0::bigint, 'head cannot read school B''s learners');

-- Tina (class teacher of 4 Blue): only 4 Blue.
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000003', true);

select is((select count(*) from public.learners where id = 'f4000000-0000-0000-0000-000000000001'), 1::bigint, 'class teacher reads a 4 Blue learner');
select is((select count(*) from public.learners where id = 'f3000000-0000-0000-0000-000000000001'), 0::bigint, 'teacher in 4 Blue cannot read a 3 Green learner');
select is((select count(*) from public.learners), 1::bigint, 'class teacher reads only their class''s learners');
select is((select count(*) from public.enrolments), 1::bigint, 'class teacher reads only their class''s enrolments');
select is((select count(*) from public.enrolment_subjects), 1::bigint, 'class teacher reads only their class''s subject choices');
select is((select array_agg(id::text) from public.guardians), array['94000000-0000-0000-0000-000000000001'], 'class teacher reads only their learners'' guardians');
select is((select count(*) from public.guardian_links), 1::bigint, 'class teacher reads only their learners'' guardian links');
select is((select count(*) from public.import_jobs), 0::bigint, 'teacher cannot read import jobs');
select throws_ok($$ insert into public.learners (school_id, learner_number, first_name, last_name) values ('ae000000-0000-0000-0000-00000000000a', 'T1', 'T', 'T') $$, '42501', null, 'teacher cannot add a learner');
select is_empty($$ update public.learners set first_name = 'Changed' where id = 'f4000000-0000-0000-0000-000000000001' returning 1 $$, 'teacher cannot update their own learner');
select throws_ok($$ insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id) values ('ae000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000042') $$, '42501', null, 'teacher cannot add a subject choice');
select is_empty($$ delete from public.guardian_links returning 1 $$, 'teacher cannot delete guardian links');

-- Sam (teaches Maths in 4 Blue, not a class teacher).
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000004', true);

select is((select array_agg(id::text) from public.learners), array['f4000000-0000-0000-0000-000000000001'], 'subject teacher reads only learners in classes they teach');
select is((select count(*) from public.enrolment_subjects), 1::bigint, 'subject teacher reads the subject choices of classes they teach');

-- Gina (class teacher of 3 Green): sees 3 Green, not 4 Blue.
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000005', true);

select is((select array_agg(id::text) from public.learners), array['f3000000-0000-0000-0000-000000000001'], 'teacher in 3 Green reads only the 3 Green learner');

-- Dora (disabled, still assigned to English in 4 Blue): nothing.
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000006', true);

select is((select count(*) from public.learners), 0::bigint, 'a disabled teacher reads no learners');

-- Bert (school B teacher): school B only.
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-00000000000a', true);

select is((select count(*) from public.learners where school_id = 'ae000000-0000-0000-0000-00000000000a'), 0::bigint, 'a school B teacher cannot read school A learners');
select is((select count(*) from public.learners), 1::bigint, 'a school B teacher reads their own class''s learner');

-- Pat (parent) and Lara (learner role): no access yet (Phase 4).
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000007', true);

select is((select count(*) from public.learners) + (select count(*) from public.guardians) + (select count(*) from public.guardian_links) + (select count(*) from public.enrolments), 0::bigint, 'a parent reads no learners, guardians, links or enrolments yet');

select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000008', true);

select is((select count(*) from public.learners) + (select count(*) from public.enrolments) + (select count(*) from public.enrolment_subjects), 0::bigint, 'a learner reads no learners, enrolments or subject choices yet');

-- Anonymous: nothing.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(
  (select count(*) from public.learners) + (select count(*) from public.enrolments)
  + (select count(*) from public.enrolment_subjects) + (select count(*) from public.guardians)
  + (select count(*) from public.guardian_links) + (select count(*) from public.import_jobs),
  0::bigint,
  'anonymous users see nothing in any people table'
);

reset role;

select * from finish();
rollback;
