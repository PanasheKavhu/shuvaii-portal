-- pgTAP: marks upload (US-4.3; D33). Who may add, read and update marks
-- import jobs and store marks files, the job target guard, and
-- public.commit_marks_import(): it saves a clean file in one go, refuses a
-- mark for another subject or term, saves nothing when any row fails (a
-- learner who does not take the subject, a score above the maximum), is
-- refused for a locked teacher until a head unlocks, and is audited.
--
-- Fixture (rolled back at the end), as in 18_marks_entry: School A: Alice
-- (admin), Hank (head), Tina (class teacher of 4 Blue, teaches nothing),
-- Sam (teaches Maths in 4 Blue), Olga (teaches English in 4 Blue). School
-- B: Bob (admin). 4 Blue: L1 and L2 take Maths, L1 also English, L3 left;
-- here L4 is added, taking English only. Term O is open; term D is past its
-- marks deadline, with one Maths assessment.
begin;

select plan(33);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', jsonb_build_object('full_name', u.name), now(), now(), '', '', '', ''
from (values
  ('e8000000-0000-0000-0000-000000000001', 'alice@upload.test', 'Alice Admin'),
  ('e8000000-0000-0000-0000-000000000002', 'hank@upload.test', 'Hank Head'),
  ('e8000000-0000-0000-0000-000000000003', 'tina@upload.test', 'Tina Class'),
  ('e8000000-0000-0000-0000-000000000004', 'sam@upload.test', 'Sam Maths'),
  ('e8000000-0000-0000-0000-000000000005', 'olga@upload.test', 'Olga English'),
  ('e8000000-0000-0000-0000-000000000006', 'dora@upload.test', 'Dora Disabled'),
  ('e8000000-0000-0000-0000-000000000007', 'pat@upload.test', 'Pat Parent'),
  ('e8000000-0000-0000-0000-000000000009', 'bob@upload.test', 'Bob B')
) as u (id, email, name);

-- Profiles come from the signup trigger; make sure names are set either way.
update public.profiles p
set full_name = u.raw_user_meta_data ->> 'full_name'
from auth.users u
where u.id = p.id and u.email like '%@upload.test';

insert into public.schools (id, slug, name, stage, timezone, status)
values
  ('a8000000-0000-0000-0000-00000000000a', 'upload-a-test', 'School A', 'secondary', 'Africa/Harare', 'active'),
  ('b8000000-0000-0000-0000-00000000000b', 'upload-b-test', 'School B', 'secondary', 'Africa/Harare', 'active');

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
select ('f8400000-0000-0000-0000-00000000000' || n)::uuid, 'a8000000-0000-0000-0000-00000000000a', 'UPLOAD-' || n, 'Learner', 'L' || n
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

insert into public.learners (id, school_id, learner_number, first_name, last_name)
values ('f8400000-0000-0000-0000-000000000004', 'a8000000-0000-0000-0000-00000000000a', 'UPLOAD-4', 'Learner', 'L4');
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id)
values ('e8400000-0000-0000-0000-000000000004', 'a8000000-0000-0000-0000-00000000000a', 'f8400000-0000-0000-0000-000000000004',
        'c8400000-0000-0000-0000-0000000000a1', 'a8300000-0000-0000-0000-0000000000aa');
insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id)
values ('a8000000-0000-0000-0000-00000000000a', 'e8400000-0000-0000-0000-000000000004', 'c8500000-0000-0000-0000-000000000002');
insert into public.assessments (id, school_id, term_id, class_subject_id, name, type, max_mark, weight_percent) values
  ('a8500000-0000-0000-0000-000000000041', 'a8000000-0000-0000-0000-00000000000a', '78000000-0000-0000-0000-0000000000a4', 'c8500000-0000-0000-0000-000000000001', 'Exam', 'exam', 50, 100),
  ('a8500000-0000-0000-0000-000000000021', 'a8000000-0000-0000-0000-00000000000a', '78000000-0000-0000-0000-0000000000a1', 'c8500000-0000-0000-0000-000000000002', 'Essay', 'test', 40, 100);

set local role authenticated;

-- Sam (Maths teacher) ----------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000004', true);

select lives_ok(
  $$ insert into public.import_jobs (id, school_id, kind, status, class_subject_id, term_id)
     values ('a9000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-00000000000a', 'marks', 'validated',
             'c8500000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a1'),
            ('a9000000-0000-0000-0000-000000000002', 'a8000000-0000-0000-0000-00000000000a', 'marks', 'validated',
             'c8500000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a4'),
            ('a9000000-0000-0000-0000-000000000003', 'a8000000-0000-0000-0000-00000000000a', 'marks', 'validated',
             'c8500000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a1') $$,
  'a teacher adds marks uploads for a class subject they teach');

select throws_ok(
  $$ insert into public.import_jobs (school_id, kind, class_subject_id, term_id)
     values ('a8000000-0000-0000-0000-00000000000a', 'marks', 'c8500000-0000-0000-0000-000000000002', '78000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'a teacher cannot add an upload for another teacher''s subject');

select throws_ok(
  $$ insert into public.import_jobs (school_id, kind) values ('a8000000-0000-0000-0000-00000000000a', 'learners') $$,
  '42501', null, 'a teacher cannot add a learners import');

select throws_ok(
  $$ insert into public.import_jobs (school_id, kind, class_subject_id, term_id, created_by)
     values ('a8000000-0000-0000-0000-00000000000a', 'marks', 'c8500000-0000-0000-0000-000000000001',
             '78000000-0000-0000-0000-0000000000a1', 'e8000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'a teacher cannot add an upload in someone else''s name');

select is((select count(*) from public.import_jobs), 3::bigint, 'a teacher reads their own uploads');

select throws_ok(
  $$ update public.import_jobs set class_subject_id = 'c8500000-0000-0000-0000-000000000002'
     where id = 'a9000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'an upload cannot move to another class subject');

-- Storage
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('imports', 'a8000000-0000-0000-0000-00000000000a/marks/c8500000-0000-0000-0000-000000000001/a9000000-0000-0000-0000-000000000001.csv',
             'e8000000-0000-0000-0000-000000000004') $$,
  'a teacher stores a marks file in their class subject''s folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('imports', 'a8000000-0000-0000-0000-00000000000a/marks/c8500000-0000-0000-0000-000000000002/x.csv',
             'e8000000-0000-0000-0000-000000000004') $$,
  '42501', null, 'a teacher cannot store a file in another subject''s folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('imports', 'a8000000-0000-0000-0000-00000000000a/x.csv', 'e8000000-0000-0000-0000-000000000004') $$,
  '42501', null, 'a teacher cannot store a file in the school''s people imports folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('imports', 'b8000000-0000-0000-0000-00000000000b/marks/c8500000-0000-0000-0000-000000000001/x.csv',
             'e8000000-0000-0000-0000-000000000004') $$,
  '42501', null, 'a teacher cannot store a marks file under another school');

-- Commit: a mark for another subject is refused.
select throws_ok(
  $$ select public.commit_marks_import('a9000000-0000-0000-0000-000000000001',
       '[{"assessment_id":"a8500000-0000-0000-0000-000000000021","enrolment_id":"e8400000-0000-0000-0000-000000000001","status":"present","score":30}]') $$,
  '22023', null, 'a mark for another subject''s assessment is refused');

-- A learner who does not take Maths: the whole file is refused.
select throws_ok(
  $$ select public.commit_marks_import('a9000000-0000-0000-0000-000000000003',
       '[{"assessment_id":"a8500000-0000-0000-0000-000000000012","enrolment_id":"e8400000-0000-0000-0000-000000000002","status":"present","score":55},
         {"assessment_id":"a8500000-0000-0000-0000-000000000012","enrolment_id":"e8400000-0000-0000-0000-000000000004","status":"present","score":60}]') $$,
  '23514', 'the learner does not take this subject', 'a learner who does not take the subject fails the whole upload');
select is((select count(*) from public.marks where assessment_id = 'a8500000-0000-0000-0000-000000000012'), 1::bigint,
  'nothing from the failed upload was saved');

-- A score above the maximum: the whole file is refused.
select throws_ok(
  $$ select public.commit_marks_import('a9000000-0000-0000-0000-000000000003',
       '[{"assessment_id":"a8500000-0000-0000-0000-000000000012","enrolment_id":"e8400000-0000-0000-0000-000000000002","status":"present","score":55},
         {"assessment_id":"a8500000-0000-0000-0000-000000000011","enrolment_id":"e8400000-0000-0000-0000-000000000002","status":"present","score":31}]') $$,
  '23514', null, 'a score above the maximum fails the whole upload');
select is((select status::text from public.import_jobs where id = 'a9000000-0000-0000-0000-000000000003'), 'validated',
  'a failed commit leaves the upload waiting');

-- A clean file: a new mark and a changed one, in one call.
select is(
  public.commit_marks_import('a9000000-0000-0000-0000-000000000001',
    '[{"assessment_id":"a8500000-0000-0000-0000-000000000012","enrolment_id":"e8400000-0000-0000-0000-000000000002","status":"present","score":64.5},
      {"assessment_id":"a8500000-0000-0000-0000-000000000011","enrolment_id":"e8400000-0000-0000-0000-000000000001","status":"excused","score":null}]'),
  2, 'a clean upload saves every mark');
select results_eq(
  $$ select enrolment_id::text, status::text, score from public.marks
     where assessment_id in ('a8500000-0000-0000-0000-000000000011', 'a8500000-0000-0000-0000-000000000012')
       and enrolment_id in ('e8400000-0000-0000-0000-000000000001', 'e8400000-0000-0000-0000-000000000002')
     order by assessment_id, enrolment_id $$,
  $$ values ('e8400000-0000-0000-0000-000000000001', 'excused', null::numeric),
            ('e8400000-0000-0000-0000-000000000002', 'absent', null),
            ('e8400000-0000-0000-0000-000000000001', 'present', 70),
            ('e8400000-0000-0000-0000-000000000002', 'present', 64.5) $$,
  'the saved marks match the upload');
select is((select status::text from public.import_jobs where id = 'a9000000-0000-0000-0000-000000000001'), 'committed',
  'the upload is marked committed');
select throws_ok(
  $$ select public.commit_marks_import('a9000000-0000-0000-0000-000000000001', '[]') $$,
  'P0002', null, 'a committed upload cannot be saved twice');

-- Past the deadline the teacher is locked out, until the head unlocks.
select throws_ok(
  $$ select public.commit_marks_import('a9000000-0000-0000-0000-000000000002',
       '[{"assessment_id":"a8500000-0000-0000-0000-000000000041","enrolment_id":"e8400000-0000-0000-0000-000000000001","status":"present","score":40}]') $$,
  '42501', null, 'a locked teacher''s upload is refused');

-- Olga, Tina, Bob ----------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000005', true);
select is((select count(*) from public.import_jobs), 0::bigint, 'another subject''s teacher reads no uploads');
select throws_ok(
  $$ select public.commit_marks_import('a9000000-0000-0000-0000-000000000003', '[]') $$,
  'P0002', null, 'another teacher cannot save someone''s upload');

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.import_jobs), 0::bigint, 'the class teacher reads no uploads');

select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000009', true);
select is((select count(*) from public.import_jobs where school_id = 'a8000000-0000-0000-0000-00000000000a'), 0::bigint,
  'another school''s admin reads no uploads');
select is((select count(*) from storage.objects where bucket_id = 'imports'), 0::bigint,
  'another school''s admin reads no marks files');
select throws_ok(
  $$ insert into public.import_jobs (school_id, kind, class_subject_id, term_id)
     values ('a8000000-0000-0000-0000-00000000000a', 'marks', 'c8500000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'another school''s admin cannot add an upload');

-- Hank (head) ------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.import_jobs), 3::bigint, 'the head reads the teacher''s uploads');
select is((select count(*) from storage.objects where bucket_id = 'imports'), 1::bigint, 'the head reads the marks file');
select throws_ok(
  $$ insert into public.import_jobs (school_id, kind) values ('a8000000-0000-0000-0000-00000000000a', 'marks') $$,
  '23514', null, 'a marks upload needs its class subject and term');
select lives_ok(
  $$ select public.unlock_class_subject('c8500000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a4', 'Late exam scripts') $$,
  'the head unlocks Maths for term D');

-- Sam again: the unlocked upload goes through and is audited as his.
select set_config('request.jwt.claim.sub', 'e8000000-0000-0000-0000-000000000004', true);
select is(
  public.commit_marks_import('a9000000-0000-0000-0000-000000000002',
    '[{"assessment_id":"a8500000-0000-0000-0000-000000000041","enrolment_id":"e8400000-0000-0000-0000-000000000001","status":"present","score":40}]'),
  1, 'after the unlock the teacher''s upload is saved');

reset role;
select is(
  (select count(*) from public.audit_log
   where table_name = 'marks' and actor_id = 'e8000000-0000-0000-0000-000000000004'),
  3::bigint, 'each uploaded mark is in the audit log as the teacher''s');

set local role anon;
select is((select count(*) from public.import_jobs), 0::bigint, 'anonymous callers read no uploads');

select * from finish();
rollback;

