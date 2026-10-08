-- pgTAP: setup wizard support (D22). A class subject may wait for its
-- teacher; finishing a year is refused while a class has no class teacher or
-- a class subject has no teacher; once finished those gaps cannot return.
-- Also: save_grading_bands() and set_current_academic_year() follow RLS,
-- and one teacher can take several subjects across classes and grades.
--
-- Fixture (rolled back): schools A and B. School A: Alice (admin), Tom
-- (teacher), Hugo (hod). School B: Bob (admin).
begin;

select plan(24);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('11111111-1111-1111-1111-111111111111', 'alice@wizard.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@wizard.test'),
  ('33333333-3333-3333-3333-333333333333', 'tom@wizard.test'),
  ('88888888-8888-8888-8888-888888888888', 'hugo@wizard.test')
) as u (id, email);

insert into public.schools (id, slug, name, stage, timezone, status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'wizard-a-test', 'School A', 'secondary', 'Africa/Harare', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'wizard-b-test', 'School B', 'secondary', 'Africa/Harare', 'active');

insert into public.memberships (school_id, user_id, role, status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'school_admin', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'school_admin', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'teacher', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '88888888-8888-8888-8888-888888888888', 'hod', 'active');

-- School A: a complete scale, two levels, a year, two classes (one per
-- level), two subjects.
insert into public.grading_scales (id, school_id, name, stage) values
  ('a0000001-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'O-Level', 'o_level');
insert into public.grading_bands (school_id, scale_id, grade, min_mark, max_mark) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000001-0000-0000-0000-000000000000', 'P', 50, 100),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000001-0000-0000-0000-000000000000', 'F', 0, 49);
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values
  ('a0000003-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Form 3', 'o_level', 'a0000001-0000-0000-0000-000000000000'),
  ('a0000003-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Form 4', 'o_level', 'a0000001-0000-0000-0000-000000000000');
insert into public.academic_years (id, school_id, label, starts_on, ends_on, is_current) values
  ('a0000004-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2027', '2027-01-13', '2027-12-04', false),
  ('a0000004-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026', '2026-01-13', '2026-12-04', true);
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name) values
  ('a0000006-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000004-0000-0000-0000-000000000000', 'a0000003-0000-0000-0000-000000000001', '3 Blue'),
  ('a0000006-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000004-0000-0000-0000-000000000000', 'a0000003-0000-0000-0000-000000000002', '4 Blue');
insert into public.subjects (id, school_id, code, name, stage_scope) values
  ('a0000007-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'MATH', 'Mathematics', 'secondary'),
  ('a0000007-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SCI', 'Science', 'secondary');

-- School B: a scale and a year.
insert into public.grading_scales (id, school_id, name, stage) values
  ('b0000001-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'O-Level', 'o_level');
insert into public.academic_years (id, school_id, label, starts_on, ends_on) values
  ('b0000004-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2027', '2027-01-13', '2027-12-04');

-- As Alice, school A's admin.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- A class subject can wait for its teacher while setup is in progress.
select lives_ok(
  $$ insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values
     ('a0000008-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000006-0000-0000-0000-000000000001', 'a0000007-0000-0000-0000-000000000001', null) $$,
  'a class subject may have no teacher yet'
);

select results_eq(
  $$ select gap, class_id from public.academic_year_setup_gaps('a0000004-0000-0000-0000-000000000000') order by gap, class_id $$,
  $$ values ('no_class_teacher', 'a0000006-0000-0000-0000-000000000001'::uuid),
            ('no_class_teacher', 'a0000006-0000-0000-0000-000000000002'::uuid),
            ('no_subject_teacher', 'a0000006-0000-0000-0000-000000000001'::uuid) $$,
  'setup gaps list classes without a class teacher and class subjects without a teacher'
);

select throws_ok(
  $$ update public.academic_years set setup_completed_at = now() where id = 'a0000004-0000-0000-0000-000000000000' $$,
  '23514', null, 'finishing is refused while gaps remain'
);

-- One teacher takes several subjects across classes and grades, and is
-- class teacher of both classes; a head of department teaches too.
update public.classes set class_teacher_id = '33333333-3333-3333-3333-333333333333'
 where academic_year_id = 'a0000004-0000-0000-0000-000000000000';
select lives_ok(
  $$ insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values
     ('a0000008-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000006-0000-0000-0000-000000000002', 'a0000007-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333'),
     ('a0000008-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000006-0000-0000-0000-000000000002', 'a0000007-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333') $$,
  'one teacher can take several subjects in classes of different grades'
);

select throws_ok(
  $$ update public.academic_years set setup_completed_at = now() where id = 'a0000004-0000-0000-0000-000000000000' $$,
  '23514', null, 'finishing is still refused while one class subject has no teacher'
);

update public.class_subjects set teacher_id = '88888888-8888-8888-8888-888888888888'
 where id = 'a0000008-0000-0000-0000-000000000001';
select is_empty(
  $$ select * from public.academic_year_setup_gaps('a0000004-0000-0000-0000-000000000000') $$,
  'no gaps once every class and class subject has a teacher'
);
select lives_ok(
  $$ update public.academic_years set setup_completed_at = now() where id = 'a0000004-0000-0000-0000-000000000000' $$,
  'finishing works with no gaps'
);
select isnt(
  (select setup_completed_at from public.academic_years where id = 'a0000004-0000-0000-0000-000000000000'),
  null, 'the finish time is stored'
);
select is(
  (select count(*)::int from public.class_subjects where teacher_id = '33333333-3333-3333-3333-333333333333'),
  2, 'the teacher holds two class subjects'
);

-- After finishing, gaps cannot come back.
select throws_ok(
  $$ update public.classes set class_teacher_id = null where id = 'a0000006-0000-0000-0000-000000000001' $$,
  '23514', null, 'a finished year''s class keeps its class teacher'
);
select throws_ok(
  $$ update public.class_subjects set teacher_id = null where id = 'a0000008-0000-0000-0000-000000000002' $$,
  '23514', null, 'a finished year''s class subject keeps its teacher'
);
select throws_ok(
  $$ insert into public.classes (school_id, academic_year_id, grade_level_id, name) values
     ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000004-0000-0000-0000-000000000000', 'a0000003-0000-0000-0000-000000000001', '3 Green') $$,
  '23514', null, 'a new class in a finished year needs a class teacher'
);
select lives_ok(
  $$ update public.class_subjects set teacher_id = '88888888-8888-8888-8888-888888888888' where id = 'a0000008-0000-0000-0000-000000000002' $$,
  'a finished year''s class subject can change teacher'
);

-- Band editor save: replaces the bands in one call, checked on a default scale.
select lives_ok(
  $$ select public.save_grading_bands('a0000001-0000-0000-0000-000000000000',
       '[{"grade":"A","min_mark":70,"max_mark":100},{"grade":"B","min_mark":40,"max_mark":69,"remark":"Good"},{"grade":"U","min_mark":0,"max_mark":39}]') $$,
  'the admin replaces the bands'
);
select results_eq(
  $$ select grade, min_mark, max_mark, remark, sort_order from public.grading_bands where scale_id = 'a0000001-0000-0000-0000-000000000000' order by sort_order $$,
  $$ values ('A', 70, 100, null::text, 1), ('B', 40, 69, 'Good', 2), ('U', 0, 39, null, 3) $$,
  'bands are stored in the given order'
);
update public.grading_scales set is_default = true where id = 'a0000001-0000-0000-0000-000000000000';
select throws_ok(
  $$ select public.save_grading_bands('a0000001-0000-0000-0000-000000000000',
       '[{"grade":"A","min_mark":70,"max_mark":100},{"grade":"U","min_mark":0,"max_mark":59}]') $$,
  '23514', null, 'bands leaving a default scale with a gap are refused'
);
select throws_ok(
  $$ select public.save_grading_bands('b0000001-0000-0000-0000-000000000000', '[{"grade":"A","min_mark":0,"max_mark":100}]') $$,
  'P0002', null, 'school B''s scale is invisible to school A''s admin'
);

-- Current year.
select lives_ok(
  $$ select public.set_current_academic_year('a0000004-0000-0000-0000-000000000000') $$,
  'the admin makes 2027 current'
);
select results_eq(
  $$ select label from public.academic_years where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and is_current $$,
  $$ values ('2027'::text) $$,
  'exactly one current year'
);
select throws_ok(
  $$ select public.set_current_academic_year('b0000004-0000-0000-0000-000000000000') $$,
  'P0002', null, 'school A''s admin cannot change school B''s current year'
);

-- School B's admin cannot finish or read school A's year.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is_empty(
  $$ select * from public.academic_years where id = 'a0000004-0000-0000-0000-000000000001' $$,
  'school B''s admin cannot read school A''s years'
);
select is_empty(
  $$ update public.academic_years set setup_completed_at = now() where id = 'a0000004-0000-0000-0000-000000000001' returning id $$,
  'school B''s admin cannot finish school A''s year'
);

-- A teacher cannot finish setup or save bands.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select is_empty(
  $$ update public.academic_years set setup_completed_at = now() where id = 'a0000004-0000-0000-0000-000000000001' returning id $$,
  'a teacher cannot finish setup'
);
select throws_ok(
  $$ select public.save_grading_bands('a0000001-0000-0000-0000-000000000000', '[{"grade":"A","min_mark":0,"max_mark":100}]') $$,
  '42501', null, 'a teacher cannot save bands'
);

select * from finish();
rollback;
