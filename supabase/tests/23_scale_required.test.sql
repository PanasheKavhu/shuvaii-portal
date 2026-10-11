-- pgTAP: grading is a per-school choice (D38). Finishing a year's setup and
-- opening a term are refused while a grade level with classes in that year
-- has no complete grading scale (blank, gap or overlap); a level with no
-- classes does not block; academic_year_scale_gaps() follows RLS.
--
-- Fixture (rolled back): schools A and B. School A: Alice (admin), Tom
-- (teacher). School B: Bob (admin). School A has a blank scale used by
-- Form 1 (one class) and Form 2 (no classes).
begin;

select plan(17);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('e2300000-0000-0000-0000-000000000001', 'alice@scale-required.test'),
  ('e2300000-0000-0000-0000-000000000002', 'tom@scale-required.test'),
  ('e2300000-0000-0000-0000-000000000003', 'bob@scale-required.test')
) as u (id, email);

insert into public.schools (id, slug, name, stage, timezone, status) values
  ('a2300000-0000-0000-0000-00000000000a', 'scale-required-a-test', 'School A', 'secondary', 'Africa/Harare', 'active'),
  ('a2300000-0000-0000-0000-00000000000b', 'scale-required-b-test', 'School B', 'secondary', 'Africa/Harare', 'active');

insert into public.memberships (school_id, user_id, role, status) values
  ('a2300000-0000-0000-0000-00000000000a', 'e2300000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a2300000-0000-0000-0000-00000000000a', 'e2300000-0000-0000-0000-000000000002', 'teacher', 'active'),
  ('a2300000-0000-0000-0000-00000000000b', 'e2300000-0000-0000-0000-000000000003', 'school_admin', 'active');

insert into public.grading_scales (id, school_id, name, stage) values
  ('a2310000-0000-0000-0000-000000000001', 'a2300000-0000-0000-0000-00000000000a', 'Our key', 'o_level'),
  ('a2310000-0000-0000-0000-000000000002', 'a2300000-0000-0000-0000-00000000000a', 'Draft key', 'o_level');
insert into public.grade_levels (id, school_id, name, stage, sort_order, grading_scale_id) values
  ('a2320000-0000-0000-0000-000000000001', 'a2300000-0000-0000-0000-00000000000a', 'Form 1', 'o_level', 1, 'a2310000-0000-0000-0000-000000000001'),
  ('a2320000-0000-0000-0000-000000000002', 'a2300000-0000-0000-0000-00000000000a', 'Form 2', 'o_level', 2, 'a2310000-0000-0000-0000-000000000002');
insert into public.academic_years (id, school_id, label, starts_on, ends_on) values
  ('a2330000-0000-0000-0000-000000000001', 'a2300000-0000-0000-0000-00000000000a', '2027', '2027-01-13', '2027-12-04');
insert into public.terms (id, school_id, academic_year_id, name, kind, starts_on, ends_on, status) values
  ('a2340000-0000-0000-0000-000000000001', 'a2300000-0000-0000-0000-00000000000a', 'a2330000-0000-0000-0000-000000000001', 'Term 1', 'term', '2027-01-13', '2027-04-09', 'planned'),
  ('a2340000-0000-0000-0000-000000000002', 'a2300000-0000-0000-0000-00000000000a', 'a2330000-0000-0000-0000-000000000001', 'Term 2', 'term', '2027-05-04', '2027-08-06', 'open');
-- Term 2 opened before any class existed; Form 1 then gets a class.
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ('a2350000-0000-0000-0000-000000000001', 'a2300000-0000-0000-0000-00000000000a', 'a2330000-0000-0000-0000-000000000001', 'a2320000-0000-0000-0000-000000000001', '1 Blue', 'e2300000-0000-0000-0000-000000000002');
insert into public.subjects (id, school_id, code, name, stage_scope) values
  ('a2360000-0000-0000-0000-000000000001', 'a2300000-0000-0000-0000-00000000000a', 'MATH', 'Mathematics', 'secondary');
insert into public.class_subjects (school_id, class_id, subject_id, teacher_id) values
  ('a2300000-0000-0000-0000-00000000000a', 'a2350000-0000-0000-0000-000000000001', 'a2360000-0000-0000-0000-000000000001', 'e2300000-0000-0000-0000-000000000002');

-- As Alice, school A's admin.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2300000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$ select grade_level_name, scale_name from public.academic_year_scale_gaps('a2330000-0000-0000-0000-000000000001') $$,
  $$ values ('Form 1', 'Our key') $$,
  'a level with classes and a blank scale is a gap; Form 2 has no classes, so it is not'
);
select is_empty(
  $$ select * from public.academic_year_setup_gaps('a2330000-0000-0000-0000-000000000001') $$,
  'no teacher gaps, so only the scale blocks'
);
select throws_ok(
  $$ update public.academic_years set setup_completed_at = now() where id = 'a2330000-0000-0000-0000-000000000001' $$,
  '23514',
  'setup cannot be finished while a grade level with classes has no complete grading scale (Form 1 uses "Our key")',
  'finishing is refused while a level with classes has a blank scale'
);
select throws_ok(
  $$ update public.terms set status = 'open' where id = 'a2340000-0000-0000-0000-000000000001' $$,
  '23514',
  'a term cannot open while a grade level with classes has no complete grading scale (Form 1 uses "Our key")',
  'opening a term is refused'
);
select throws_ok(
  $$ insert into public.terms (school_id, academic_year_id, name, kind, starts_on, ends_on, status) values
     ('a2300000-0000-0000-0000-00000000000a', 'a2330000-0000-0000-0000-000000000001', 'Term 3', 'term', '2027-09-07', '2027-12-03', 'open') $$,
  '23514', null, 'adding a term that is already open is refused'
);
select lives_ok(
  $$ update public.terms set status = 'locked' where id = 'a2340000-0000-0000-0000-000000000001' $$,
  'other status changes are not blocked'
);
select lives_ok(
  $$ update public.terms set marks_deadline = '2027-07-30' where id = 'a2340000-0000-0000-0000-000000000002' $$,
  'an open term''s other fields can still be saved'
);

-- A scale with an overlap is still not complete.
select lives_ok(
  $$ select public.save_grading_bands('a2310000-0000-0000-0000-000000000001',
       '[{"grade":"P","min_mark":50,"max_mark":100},{"grade":"F","min_mark":0,"max_mark":50}]') $$,
  'overlapping bands can be saved on a scale that is not default'
);
select results_eq(
  $$ select grade_level_name from public.academic_year_scale_gaps('a2330000-0000-0000-0000-000000000001') $$,
  $$ values ('Form 1') $$,
  'an overlap is a gap too'
);
select throws_ok(
  $$ update public.academic_years set setup_completed_at = now() where id = 'a2330000-0000-0000-0000-000000000001' $$,
  '23514', null, 'finishing is refused with an overlapping scale'
);

-- School B's admin sees no gaps in school A's year (RLS).
select set_config('request.jwt.claims', '{"sub":"e2300000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is_empty(
  $$ select * from public.academic_year_scale_gaps('a2330000-0000-0000-0000-000000000001') $$,
  'another school''s admin reads nothing'
);
select is_empty(
  $$ update public.terms set status = 'open' where id = 'a2340000-0000-0000-0000-000000000001' returning 1 $$,
  'another school''s admin cannot open school A''s term'
);
select is(
  (select count(*)::int from public.terms where school_id = 'a2300000-0000-0000-0000-00000000000a'),
  0, 'school B''s admin cannot see school A''s terms'
);

-- Back to Alice: a complete key lifts the block.
select set_config('request.jwt.claims', '{"sub":"e2300000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ select public.save_grading_bands('a2310000-0000-0000-0000-000000000001',
       '[{"grade":"P","min_mark":50,"max_mark":100},{"grade":"F","min_mark":0,"max_mark":49}]') $$,
  'the admin enters a complete key'
);
select is_empty(
  $$ select * from public.academic_year_scale_gaps('a2330000-0000-0000-0000-000000000001') $$,
  'no scale gaps'
);
select lives_ok(
  $$ update public.terms set status = 'open' where id = 'a2340000-0000-0000-0000-000000000001' $$,
  'the term opens'
);
select lives_ok(
  $$ update public.academic_years set setup_completed_at = now() where id = 'a2330000-0000-0000-0000-000000000001' $$,
  'setup finishes'
);

select * from finish();
rollback;
