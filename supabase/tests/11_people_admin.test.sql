-- pgTAP: people admin functions and the imports bucket
-- (supabase/migrations/20261008082546_people_admin.sql, D24).
-- Covers all-or-nothing learner imports with sibling guardians and
-- primary default subjects, import job commits, staff imports, the staff
-- list and staff detail edits, staff invite events, class moves, subject
-- choices, and the imports bucket, each across schools and against a
-- teacher.
--
-- Fixture (rolled back at the end). School A: Alice (admin), Hank (head),
-- Tina (teacher), Pat (parent), Ivy (invited teacher, not accepted).
-- Primary classes 1 Blue and 1 Green (two subjects each) and secondary
-- class 4 Blue (two subjects); one existing guardian, Gwen. School B: Bob
-- (admin) and class 4 Red. One validated learners job and one validated
-- staff job in school A.
begin;

select plan(54);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', jsonb_build_object('full_name', u.name), now(), now(), '', '', '', ''
from (values
  ('f1000000-0000-0000-0000-000000000001', 'alice@padmin.test', 'Alice Admin'),
  ('f1000000-0000-0000-0000-000000000002', 'hank@padmin.test', 'Hank Head'),
  ('f1000000-0000-0000-0000-000000000003', 'tina@padmin.test', 'Tina Teacher'),
  ('f1000000-0000-0000-0000-000000000004', 'pat@padmin.test', 'Pat Parent'),
  ('f1000000-0000-0000-0000-000000000005', 'ivy@padmin.test', 'Ivy Invited'),
  ('f1000000-0000-0000-0000-000000000006', 'nina@padmin.test', 'Nina New'),
  ('f1000000-0000-0000-0000-000000000007', 'ned@padmin.test', 'Ned New'),
  ('f1000000-0000-0000-0000-000000000009', 'bob@padmin.test', 'Bob Admin')
) as u (id, email, name);

insert into public.schools (id, slug, name, stage)
values
  ('a5000000-0000-0000-0000-00000000000a', 'padmin-a-test', 'School A', 'combined'),
  ('b5000000-0000-0000-0000-00000000000b', 'padmin-b-test', 'School B', 'secondary');

insert into public.memberships (id, school_id, user_id, role, status)
values
  ('a6000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a6000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-000000000002', 'head', 'active'),
  ('a6000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('a6000000-0000-0000-0000-000000000004', 'a5000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-000000000004', 'parent', 'active'),
  ('a6000000-0000-0000-0000-000000000005', 'a5000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-000000000005', 'teacher', 'invited'),
  ('b6000000-0000-0000-0000-000000000009', 'b5000000-0000-0000-0000-00000000000b', 'f1000000-0000-0000-0000-000000000009', 'school_admin', 'active');

insert into public.grading_scales (id, school_id, name, stage) values
  ('a7000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-00000000000a', 'Primary', 'primary'),
  ('a7000000-0000-0000-0000-00000000000c', 'a5000000-0000-0000-0000-00000000000a', 'O level', 'o_level'),
  ('b7000000-0000-0000-0000-00000000000b', 'b5000000-0000-0000-0000-00000000000b', 'O level', 'o_level');
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values
  ('a8000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 'Grade 1', 'primary', 'a7000000-0000-0000-0000-00000000000a'),
  ('a8000000-0000-0000-0000-000000000004', 'a5000000-0000-0000-0000-00000000000a', 'Form 4', 'o_level', 'a7000000-0000-0000-0000-00000000000c'),
  ('b8000000-0000-0000-0000-000000000004', 'b5000000-0000-0000-0000-00000000000b', 'Form 4', 'o_level', 'b7000000-0000-0000-0000-00000000000b');
insert into public.academic_years (id, school_id, label, starts_on, ends_on, is_current) values
  ('a9000000-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-00000000000a', '2027', '2027-01-12', '2027-12-03', true),
  ('b9000000-0000-0000-0000-00000000000b', 'b5000000-0000-0000-0000-00000000000b', '2027', '2027-01-12', '2027-12-03', true);
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ('ac000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 'a8000000-0000-0000-0000-000000000001', '1 Blue', 'f1000000-0000-0000-0000-000000000003'),
  ('ac000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 'a8000000-0000-0000-0000-000000000001', '1 Green', null),
  ('ac000000-0000-0000-0000-000000000004', 'a5000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 'a8000000-0000-0000-0000-000000000004', '4 Blue', null),
  ('bc000000-0000-0000-0000-000000000004', 'b5000000-0000-0000-0000-00000000000b', 'b9000000-0000-0000-0000-00000000000b', 'b8000000-0000-0000-0000-000000000004', '4 Red', null);
insert into public.subjects (id, school_id, code, name, stage_scope) values
  ('ad000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 'MATH', 'Mathematics', 'combined'),
  ('ad000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-00000000000a', 'ENG', 'English', 'combined'),
  ('bd000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-00000000000b', 'MATH', 'Mathematics', 'secondary');
insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values
  ('ae000000-0000-0000-0000-000000000011', 'a5000000-0000-0000-0000-00000000000a', 'ac000000-0000-0000-0000-000000000001', 'ad000000-0000-0000-0000-000000000001', null),
  ('ae000000-0000-0000-0000-000000000012', 'a5000000-0000-0000-0000-00000000000a', 'ac000000-0000-0000-0000-000000000001', 'ad000000-0000-0000-0000-000000000002', null),
  ('ae000000-0000-0000-0000-000000000021', 'a5000000-0000-0000-0000-00000000000a', 'ac000000-0000-0000-0000-000000000002', 'ad000000-0000-0000-0000-000000000001', null),
  ('ae000000-0000-0000-0000-000000000022', 'a5000000-0000-0000-0000-00000000000a', 'ac000000-0000-0000-0000-000000000002', 'ad000000-0000-0000-0000-000000000002', null),
  ('ae000000-0000-0000-0000-000000000041', 'a5000000-0000-0000-0000-00000000000a', 'ac000000-0000-0000-0000-000000000004', 'ad000000-0000-0000-0000-000000000001', null),
  ('ae000000-0000-0000-0000-000000000042', 'a5000000-0000-0000-0000-00000000000a', 'ac000000-0000-0000-0000-000000000004', 'ad000000-0000-0000-0000-000000000002', null),
  ('be000000-0000-0000-0000-000000000041', 'b5000000-0000-0000-0000-00000000000b', 'bc000000-0000-0000-0000-000000000004', 'bd000000-0000-0000-0000-000000000001', null);
insert into public.guardians (id, school_id, full_name, phone) values
  ('af000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 'Gwen Guardian', '0772000001');
insert into public.import_jobs (id, school_id, kind, status) values
  ('aa000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 'learners', 'validated'),
  ('aa000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-00000000000a', 'staff', 'validated'),
  ('aa000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-00000000000a', 'learners', 'validated');

set local role authenticated;

-- Alice, school A's admin: a clean import -------------------------------------------
select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$ select public.commit_learner_import(
       'aa000000-0000-0000-0000-000000000001',
       '[{"ref": "g1", "id": null, "full_name": "Mary Dube", "phone": "0772000222", "email": null},
         {"ref": "g2", "id": "af000000-0000-0000-0000-000000000001", "full_name": "Gwen Guardian", "phone": "0772000001", "email": null}]',
       '[{"learner_number": "P1", "first_name": "Tino", "last_name": "Dube", "date_of_birth": "2020-03-01", "sex": "M",
          "admission_date": null, "class_id": "ac000000-0000-0000-0000-000000000001", "guardian_ref": "g1", "relationship": "mother"},
         {"learner_number": "S1", "first_name": "Tari", "last_name": "Dube", "date_of_birth": null, "sex": "F",
          "admission_date": "2027-01-12", "class_id": "ac000000-0000-0000-0000-000000000004", "guardian_ref": "g1", "relationship": "mother"},
         {"learner_number": "P2", "first_name": "Kuda", "last_name": "Moyo", "date_of_birth": null, "sex": null,
          "admission_date": null, "class_id": "ac000000-0000-0000-0000-000000000001", "guardian_ref": "g2", "relationship": "aunt"}]'
     ) $$,
  'The school admin commits a learners import'
);

select is(
  (select count(*) from public.learners where school_id = 'a5000000-0000-0000-0000-00000000000a'),
  3::bigint,
  'All three learners are added'
);

select is(
  (select count(*) from public.enrolments e join public.learners l on l.id = e.learner_id
   where l.learner_number in ('P1', 'S1', 'P2') and e.academic_year_id = 'a9000000-0000-0000-0000-00000000000a'),
  3::bigint,
  'Each learner is enrolled in this year''s class'
);

select is(
  (select count(*) from public.enrolment_subjects es join public.enrolments e on e.id = es.enrolment_id
   join public.learners l on l.id = e.learner_id where l.learner_number = 'P1'),
  2::bigint,
  'A primary learner takes every subject of the class by default'
);

select is(
  (select count(*) from public.enrolment_subjects es join public.enrolments e on e.id = es.enrolment_id
   join public.learners l on l.id = e.learner_id where l.learner_number = 'S1'),
  0::bigint,
  'A secondary learner starts with no subjects'
);

select is(
  (select count(distinct gl.learner_id) from public.guardian_links gl
   join public.guardians g on g.id = gl.guardian_id where g.full_name = 'Mary Dube'),
  2::bigint,
  'One new guardian is linked to both siblings'
);

select is(
  (select count(*) from public.guardians where school_id = 'a5000000-0000-0000-0000-00000000000a'),
  2::bigint,
  'The existing guardian is reused, not copied'
);

select is(
  (select status::text from public.import_jobs where id = 'aa000000-0000-0000-0000-000000000001'),
  'committed',
  'The job is marked committed'
);

select throws_ok(
  $$ select public.commit_learner_import('aa000000-0000-0000-0000-000000000001', '[]', '[]') $$,
  'P0002', 'this import is no longer waiting to be committed',
  'A committed job cannot be committed again'
);

select is(
  (select count(*) from public.audit_log where table_name = 'learners' and action = 'insert'
   and school_id = 'a5000000-0000-0000-0000-00000000000a'),
  3::bigint,
  'Each imported learner is audited'
);

-- Remember P1 for the cross-school checks below, which cannot read it.
select set_config('test.p1', (select id::text from public.learners where learner_number = 'P1'), true);

-- All or nothing ------------------------------------------------------------------

select throws_ok(
  $$ select public.commit_learner_import(
       'aa000000-0000-0000-0000-000000000003',
       '[{"ref": "g1", "id": null, "full_name": "New Parent", "phone": "0772000333", "email": null}]',
       '[{"learner_number": "N1", "first_name": "A", "last_name": "B", "class_id": "ac000000-0000-0000-0000-000000000001", "guardian_ref": "g1"},
         {"learner_number": "P1", "first_name": "C", "last_name": "D", "class_id": "ac000000-0000-0000-0000-000000000001", "guardian_ref": null}]'
     ) $$,
  '23505', null,
  'A duplicate learner number fails the whole import'
);

select is(
  (select count(*) from public.learners where learner_number = 'N1'),
  0::bigint,
  'Rows before the failing one are not kept'
);

select is(
  (select count(*) from public.guardians where full_name = 'New Parent'),
  0::bigint,
  'Guardians from a failed import are not kept'
);

select is(
  (select status::text from public.import_jobs where id = 'aa000000-0000-0000-0000-000000000003'),
  'validated',
  'A failed commit leaves the job waiting'
);

select throws_ok(
  $$ select public.import_learners('a5000000-0000-0000-0000-00000000000a', '[]',
       '[{"learner_number": "X9", "first_name": "A", "last_name": "B", "class_id": "bc000000-0000-0000-0000-000000000004"}]') $$,
  '23503', null,
  'A class from another school is refused'
);

select throws_ok(
  $$ select public.import_learners('a5000000-0000-0000-0000-00000000000a',
       '[{"ref": "g1", "id": "ffffffff-0000-0000-0000-000000000000"}]', '[]') $$,
  '23503', null,
  'A guardian id that is not in the school is refused'
);

select is(
  (select count(*) from public.learners where learner_number = 'X9'),
  0::bigint,
  'Nothing is left from the refused calls'
);

-- Class moves and subject choices -------------------------------------------------------

select lives_ok(
  $$ select public.set_learner_class(
       (select id from public.learners where learner_number = 'P1'),
       'ac000000-0000-0000-0000-000000000002') $$,
  'The admin moves a primary learner to 1 Green'
);

select is(
  (select array_agg(es.class_subject_id::text order by es.class_subject_id)
   from public.enrolment_subjects es join public.enrolments e on e.id = es.enrolment_id
   join public.learners l on l.id = e.learner_id where l.learner_number = 'P1'),
  array['ae000000-0000-0000-0000-000000000021', 'ae000000-0000-0000-0000-000000000022'],
  'The old class''s subjects are dropped and the new class''s defaults added'
);

select lives_ok(
  $$ select public.set_learner_subjects(
       (select e.id from public.enrolments e join public.learners l on l.id = e.learner_id where l.learner_number = 'S1'),
       array['ae000000-0000-0000-0000-000000000042']::uuid[]) $$,
  'The admin chooses a secondary learner''s subjects'
);

select is(
  (select array_agg(es.class_subject_id::text) from public.enrolment_subjects es
   join public.enrolments e on e.id = es.enrolment_id join public.learners l on l.id = e.learner_id
   where l.learner_number = 'S1'),
  array['ae000000-0000-0000-0000-000000000042'],
  'Only the chosen subject is kept'
);

select throws_ok(
  $$ select public.set_learner_subjects(
       (select e.id from public.enrolments e join public.learners l on l.id = e.learner_id where l.learner_number = 'S1'),
       array['ae000000-0000-0000-0000-000000000011']::uuid[]) $$,
  '23514', null,
  'A subject offered to another class cannot be chosen'
);

select throws_ok(
  $$ select public.set_learner_class(
       (select id from public.learners where learner_number = 'P2'),
       'bc000000-0000-0000-0000-000000000004') $$,
  '23503', 'class not found',
  'A learner cannot be put in another school''s class (the admin cannot see it)'
);

-- Staff import ----------------------------------------------------------------------

select lives_ok(
  $$ select public.commit_staff_import('aa000000-0000-0000-0000-000000000002',
       '[{"user_id": "f1000000-0000-0000-0000-000000000006", "role": "teacher", "status": "invited"},
         {"user_id": "f1000000-0000-0000-0000-000000000007", "role": "hod", "status": "invited"}]') $$,
  'The school admin commits a staff import'
);

select is(
  (select count(*) from public.memberships where school_id = 'a5000000-0000-0000-0000-00000000000a' and status = 'invited'),
  3::bigint,
  'The imported staff are invited members'
);

select is(
  (select count(*) from public.school_staff('a5000000-0000-0000-0000-00000000000a') where full_name in ('Nina New', 'Ned New', 'Ivy Invited')),
  3::bigint,
  'The admin sees invited staff by name in the staff list'
);

select is(
  (select count(*) from public.school_staff('a5000000-0000-0000-0000-00000000000a') where role = 'parent'),
  0::bigint,
  'The staff list leaves out parents'
);

select lives_ok(
  $$ select public.update_staff_profile('a5000000-0000-0000-0000-00000000000a',
       'f1000000-0000-0000-0000-000000000005', 'Ivy Ncube', '0772000444') $$,
  'The admin edits an invited teacher''s name and phone'
);

select is(
  (select full_name || ' ' || phone from public.school_staff('a5000000-0000-0000-0000-00000000000a') where user_id = 'f1000000-0000-0000-0000-000000000005'),
  'Ivy Ncube 0772000444',
  'The new details show in the staff list'
);

select throws_ok(
  $$ select public.update_staff_profile('a5000000-0000-0000-0000-00000000000a',
       'f1000000-0000-0000-0000-000000000004', 'Pat P', null) $$,
  '42501', null,
  'The admin cannot edit a parent''s profile through the staff page'
);

select throws_ok(
  $$ select public.update_staff_profile('a5000000-0000-0000-0000-00000000000a',
       'f1000000-0000-0000-0000-000000000005', 'Ivy', 'not a phone') $$,
  '23514', null,
  'A bad phone number is refused'
);

select lives_ok(
  $$ select public.log_staff_invite_event('a6000000-0000-0000-0000-000000000005', 'invite_resent') $$,
  'The admin records re-sending a staff invite'
);

select throws_ok(
  $$ select public.log_staff_invite_event('a6000000-0000-0000-0000-000000000004', 'staff_invited') $$,
  '42501', null,
  'Staff invite events are only for staff memberships'
);

select throws_ok(
  $$ select public.log_staff_invite_event('a6000000-0000-0000-0000-000000000001', 'staff_invited') $$,
  '42501', null,
  'The admin cannot log an invite for their own membership'
);

select throws_ok(
  $$ select public.log_staff_invite_event('a6000000-0000-0000-0000-000000000005', 'admin_invited') $$,
  'P0001', 'unknown invite event admin_invited',
  'Only the staff invite events can be logged'
);

-- Imports bucket ----------------------------------------------------------------------

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('imports', 'a5000000-0000-0000-0000-00000000000a/job-1.csv', 'f1000000-0000-0000-0000-000000000001') $$,
  'The admin uploads an import file into their school''s folder'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('imports', 'b5000000-0000-0000-0000-00000000000b/job-1.csv', 'f1000000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'The admin cannot upload into another school''s folder'
);

-- Hank, school A's head -----------------------------------------------------------
select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000002', true);

select is(
  (select count(*) from storage.objects where bucket_id = 'imports'),
  1::bigint,
  'The head reads the school''s import files'
);

select throws_ok(
  $$ select public.update_staff_profile('a5000000-0000-0000-0000-00000000000a',
       'f1000000-0000-0000-0000-000000000003', 'Tina T', null) $$,
  '42501', null,
  'The head cannot edit staff details'
);

-- Tina, a teacher in school A ---------------------------------------------------------
select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000003', true);

select throws_ok(
  $$ select public.import_learners('a5000000-0000-0000-0000-00000000000a', '[]',
       '[{"learner_number": "T1", "first_name": "A", "last_name": "B", "class_id": null}]') $$,
  '42501', null,
  'A teacher cannot add learners'
);

select throws_ok(
  $$ select public.commit_learner_import('aa000000-0000-0000-0000-000000000003', '[]', '[]') $$,
  'P0002', null,
  'A teacher cannot see or commit an import job'
);

select throws_ok(
  $$ select public.set_learner_subjects(
       (select e.id from public.enrolments e join public.learners l on l.id = e.learner_id where l.learner_number = 'P1'),
       '{}'::uuid[]) $$,
  '42501', null,
  'A teacher cannot change subject choices, even for their own class'
);

select is_empty(
  $$ select * from public.school_staff('a5000000-0000-0000-0000-00000000000a') $$,
  'A teacher gets an empty staff list'
);

select throws_ok(
  $$ select public.log_staff_invite_event('a6000000-0000-0000-0000-000000000005', 'invite_resent') $$,
  '42501', null,
  'A teacher cannot log invite events'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('imports', 'a5000000-0000-0000-0000-00000000000a/job-2.csv', 'f1000000-0000-0000-0000-000000000003') $$,
  '42501', null,
  'A teacher cannot upload import files'
);

select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'imports' $$,
  'A teacher cannot read import files'
);

-- Bob, school B's admin, aiming at school A ----------------------------------------
select set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000009', true);

select throws_ok(
  $$ select public.import_learners('a5000000-0000-0000-0000-00000000000a', '[]',
       '[{"learner_number": "B1", "first_name": "A", "last_name": "B", "class_id": null}]') $$,
  '42501', null,
  'Another school''s admin cannot add learners to school A'
);

select throws_ok(
  $$ select public.commit_learner_import('aa000000-0000-0000-0000-000000000003', '[]', '[]') $$,
  'P0002', null,
  'Another school''s admin cannot commit school A''s import'
);

select throws_ok(
  $$ select public.set_learner_class(current_setting('test.p1')::uuid,
       'bc000000-0000-0000-0000-000000000004') $$,
  '23503', null,
  'Another school''s admin cannot pull a school A learner into their class'
);

select is_empty(
  $$ select * from public.school_staff('a5000000-0000-0000-0000-00000000000a') $$,
  'Another school''s admin gets an empty staff list for school A'
);

select throws_ok(
  $$ select public.update_staff_profile('a5000000-0000-0000-0000-00000000000a',
       'f1000000-0000-0000-0000-000000000003', 'Hacked', null) $$,
  '42501', null,
  'Another school''s admin cannot edit school A staff'
);

select throws_ok(
  $$ select public.log_staff_invite_event('a6000000-0000-0000-0000-000000000005', 'invite_resent') $$,
  '42501', null,
  'Another school''s admin cannot log school A invite events'
);

select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'imports' $$,
  'Another school''s admin cannot read school A import files'
);

-- Audit trail -------------------------------------------------------------------------
reset role;

select is(
  (select array_agg(event order by id) from public.audit_log
   where school_id = 'a5000000-0000-0000-0000-00000000000a' and action = 'event'
     and event <> 'school_created'),
  array['staff_details_changed', 'invite_resent'],
  'Staff detail edits and invite events are recorded against the school'
);

select * from finish();
rollback;
