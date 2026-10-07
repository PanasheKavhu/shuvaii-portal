-- pgTAP: academic structure tables (migration order step 3 in
-- docs/DATA_MODEL.md; D20, D21). The per-table blocks repeat the same
-- checks for each table. Covers, for every table: cross-school read and
-- write, a teacher who reads but cannot write, head and parent reads; then
-- the grading-scale coverage check, default-scale guard, teacher checks and
-- same-school foreign keys.
--
-- Fixture (rolled back at the end): schools A and B, each with one row in
-- every structure table. School A: Alice (admin), Tom (teacher), Hank
-- (head), Pat (parent), Dora (disabled teacher), Hugo (hod). School B: Bob
-- (admin), Bert (teacher).
begin;

select plan(104);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('11111111-1111-1111-1111-111111111111', 'alice@structure.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@structure.test'),
  ('33333333-3333-3333-3333-333333333333', 'tom@structure.test'),
  ('44444444-4444-4444-4444-444444444444', 'hank@structure.test'),
  ('55555555-5555-5555-5555-555555555555', 'pat@structure.test'),
  ('66666666-6666-6666-6666-666666666666', 'dora@structure.test'),
  ('77777777-7777-7777-7777-777777777777', 'bert@structure.test'),
  ('88888888-8888-8888-8888-888888888888', 'hugo@structure.test')
) as u (id, email);

insert into public.schools (id, slug, name, stage, timezone, status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'structure-a-test', 'School A', 'secondary', 'Africa/Harare', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'structure-b-test', 'School B', 'secondary', 'Africa/Harare', 'active');

insert into public.memberships (school_id, user_id, role, status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'school_admin', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'school_admin', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'teacher', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'head', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'parent', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 'teacher', 'disabled'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '77777777-7777-7777-7777-777777777777', 'teacher', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '88888888-8888-8888-8888-888888888888', 'hod', 'active');

-- One row per table per school, inserted as the table owner.
insert into public.grading_scales (id, school_id, name, stage) values ('00000001-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Scale 00000001', 'o_level');
insert into public.grading_bands (id, school_id, scale_id, grade, min_mark, max_mark) values ('00000002-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000001-0000-0000-0000-00000000000a', 'G02', 0, 100);
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values ('00000003-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Level 00000003', 'o_level', '00000001-0000-0000-0000-00000000000a');
insert into public.academic_years (id, school_id, label, starts_on, ends_on) values ('00000004-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Y04', '2026-01-13', '2026-12-04');
insert into public.terms (id, school_id, academic_year_id, name, starts_on, ends_on) values ('00000005-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000004-0000-0000-0000-00000000000a', 'Term 00000005', '2026-01-13', '2026-04-09');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values ('00000006-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000004-0000-0000-0000-00000000000a', '00000003-0000-0000-0000-00000000000a', 'Class 00000006', '33333333-3333-3333-3333-333333333333');
insert into public.subjects (id, school_id, code, name, stage_scope) values ('00000007-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'S07', 'Subject 00000007', 'secondary');
insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values ('00000008-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000006-0000-0000-0000-00000000000a', '00000007-0000-0000-0000-00000000000a', '33333333-3333-3333-3333-333333333333');
insert into public.grading_scales (id, school_id, name, stage) values ('00000001-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Scale 00000001', 'o_level');
insert into public.grading_bands (id, school_id, scale_id, grade, min_mark, max_mark) values ('00000002-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000001-0000-0000-0000-00000000000b', 'G02', 0, 100);
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values ('00000003-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Level 00000003', 'o_level', '00000001-0000-0000-0000-00000000000b');
insert into public.academic_years (id, school_id, label, starts_on, ends_on) values ('00000004-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Y04', '2026-01-13', '2026-12-04');
insert into public.terms (id, school_id, academic_year_id, name, starts_on, ends_on) values ('00000005-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000004-0000-0000-0000-00000000000b', 'Term 00000005', '2026-01-13', '2026-04-09');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values ('00000006-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000004-0000-0000-0000-00000000000b', '00000003-0000-0000-0000-00000000000b', 'Class 00000006', '77777777-7777-7777-7777-777777777777');
insert into public.subjects (id, school_id, code, name, stage_scope) values ('00000007-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'S07', 'Subject 00000007', 'secondary');
insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values ('00000008-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000006-0000-0000-0000-00000000000b', '00000007-0000-0000-0000-00000000000b', '77777777-7777-7777-7777-777777777777');

set local role authenticated;

-- Alice (school A admin): her own rows yes, school B's never.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

select is((select count(*) from public.grading_scales where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1::bigint, 'admin reads own school''s grading_scales');
select is((select count(*) from public.grading_scales where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0::bigint, 'admin cannot read school B''s grading_scales');
select throws_ok($$ insert into public.grading_scales (id, school_id, name, stage) values ('00000091-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Scale 00000091', 'o_level') $$, '42501', null, 'admin cannot insert grading_scales into school B');
select is_empty($$ update public.grading_scales set updated_at = now() where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$, 'admin cannot update school B''s grading_scales');
select is_empty($$ delete from public.grading_scales where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$, 'admin cannot delete school B''s grading_scales');
select isnt_empty($$ update public.grading_scales set updated_at = now() where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'admin updates own school''s grading_scales');

select is((select count(*) from public.grading_bands where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1::bigint, 'admin reads own school''s grading_bands');
select is((select count(*) from public.grading_bands where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0::bigint, 'admin cannot read school B''s grading_bands');
select throws_ok($$ insert into public.grading_bands (id, school_id, scale_id, grade, min_mark, max_mark) values ('00000092-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000001-0000-0000-0000-00000000000b', 'G92', 0, 100) $$, '42501', null, 'admin cannot insert grading_bands into school B');
select is_empty($$ update public.grading_bands set updated_at = now() where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$, 'admin cannot update school B''s grading_bands');
select is_empty($$ delete from public.grading_bands where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$, 'admin cannot delete school B''s grading_bands');
select isnt_empty($$ update public.grading_bands set updated_at = now() where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'admin updates own school''s grading_bands');

select is((select count(*) from public.grade_levels where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1::bigint, 'admin reads own school''s grade_levels');
select is((select count(*) from public.grade_levels where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0::bigint, 'admin cannot read school B''s grade_levels');
select throws_ok($$ insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values ('00000093-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Level 00000093', 'o_level', '00000001-0000-0000-0000-00000000000b') $$, '42501', null, 'admin cannot insert grade_levels into school B');
select is_empty($$ update public.grade_levels set updated_at = now() where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$, 'admin cannot update school B''s grade_levels');
select is_empty($$ delete from public.grade_levels where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$, 'admin cannot delete school B''s grade_levels');
select isnt_empty($$ update public.grade_levels set updated_at = now() where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'admin updates own school''s grade_levels');

select is((select count(*) from public.academic_years where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1::bigint, 'admin reads own school''s academic_years');
select is((select count(*) from public.academic_years where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0::bigint, 'admin cannot read school B''s academic_years');
select throws_ok($$ insert into public.academic_years (id, school_id, label, starts_on, ends_on) values ('00000094-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Y94', '2026-01-13', '2026-12-04') $$, '42501', null, 'admin cannot insert academic_years into school B');
select is_empty($$ update public.academic_years set updated_at = now() where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$, 'admin cannot update school B''s academic_years');
select is_empty($$ delete from public.academic_years where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$, 'admin cannot delete school B''s academic_years');
select isnt_empty($$ update public.academic_years set updated_at = now() where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'admin updates own school''s academic_years');

select is((select count(*) from public.terms where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1::bigint, 'admin reads own school''s terms');
select is((select count(*) from public.terms where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0::bigint, 'admin cannot read school B''s terms');
select throws_ok($$ insert into public.terms (id, school_id, academic_year_id, name, starts_on, ends_on) values ('00000095-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000004-0000-0000-0000-00000000000b', 'Term 00000095', '2026-01-13', '2026-04-09') $$, '42501', null, 'admin cannot insert terms into school B');
select is_empty($$ update public.terms set updated_at = now() where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$, 'admin cannot update school B''s terms');
select is_empty($$ delete from public.terms where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$, 'admin cannot delete school B''s terms');
select isnt_empty($$ update public.terms set updated_at = now() where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'admin updates own school''s terms');

select is((select count(*) from public.classes where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1::bigint, 'admin reads own school''s classes');
select is((select count(*) from public.classes where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0::bigint, 'admin cannot read school B''s classes');
select throws_ok($$ insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values ('00000096-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000004-0000-0000-0000-00000000000b', '00000003-0000-0000-0000-00000000000b', 'Class 00000096', '77777777-7777-7777-7777-777777777777') $$, '42501', null, 'admin cannot insert classes into school B');
select is_empty($$ update public.classes set updated_at = now() where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$, 'admin cannot update school B''s classes');
select is_empty($$ delete from public.classes where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$, 'admin cannot delete school B''s classes');
select isnt_empty($$ update public.classes set updated_at = now() where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'admin updates own school''s classes');

select is((select count(*) from public.subjects where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1::bigint, 'admin reads own school''s subjects');
select is((select count(*) from public.subjects where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0::bigint, 'admin cannot read school B''s subjects');
select throws_ok($$ insert into public.subjects (id, school_id, code, name, stage_scope) values ('00000097-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'S97', 'Subject 00000097', 'secondary') $$, '42501', null, 'admin cannot insert subjects into school B');
select is_empty($$ update public.subjects set updated_at = now() where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$, 'admin cannot update school B''s subjects');
select is_empty($$ delete from public.subjects where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$, 'admin cannot delete school B''s subjects');
select isnt_empty($$ update public.subjects set updated_at = now() where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'admin updates own school''s subjects');

select is((select count(*) from public.class_subjects where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1::bigint, 'admin reads own school''s class_subjects');
select is((select count(*) from public.class_subjects where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0::bigint, 'admin cannot read school B''s class_subjects');
select throws_ok($$ insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values ('00000098-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000006-0000-0000-0000-00000000000b', '00000007-0000-0000-0000-00000000000b', '77777777-7777-7777-7777-777777777777') $$, '42501', null, 'admin cannot insert class_subjects into school B');
select is_empty($$ update public.class_subjects set updated_at = now() where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$, 'admin cannot update school B''s class_subjects');
select is_empty($$ delete from public.class_subjects where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$, 'admin cannot delete school B''s class_subjects');
select isnt_empty($$ update public.class_subjects set updated_at = now() where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'admin updates own school''s class_subjects');

-- Tom (school A teacher): reads every table, writes none.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);

select is((select count(*) from public.grading_scales where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1::bigint, 'teacher reads grading_scales');
select throws_ok($$ insert into public.grading_scales (id, school_id, name, stage) values ('00000091-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Scale 00000091', 'o_level') $$, '42501', null, 'teacher cannot insert grading_scales');
select is_empty($$ update public.grading_scales set updated_at = now() where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'teacher cannot update grading_scales');
select is_empty($$ delete from public.grading_scales where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'teacher cannot delete grading_scales');

select is((select count(*) from public.grading_bands where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1::bigint, 'teacher reads grading_bands');
select throws_ok($$ insert into public.grading_bands (id, school_id, scale_id, grade, min_mark, max_mark) values ('00000092-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000001-0000-0000-0000-00000000000a', 'G92', 0, 100) $$, '42501', null, 'teacher cannot insert grading_bands');
select is_empty($$ update public.grading_bands set updated_at = now() where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'teacher cannot update grading_bands');
select is_empty($$ delete from public.grading_bands where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'teacher cannot delete grading_bands');

select is((select count(*) from public.grade_levels where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1::bigint, 'teacher reads grade_levels');
select throws_ok($$ insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values ('00000093-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Level 00000093', 'o_level', '00000001-0000-0000-0000-00000000000a') $$, '42501', null, 'teacher cannot insert grade_levels');
select is_empty($$ update public.grade_levels set updated_at = now() where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'teacher cannot update grade_levels');
select is_empty($$ delete from public.grade_levels where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'teacher cannot delete grade_levels');

select is((select count(*) from public.academic_years where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1::bigint, 'teacher reads academic_years');
select throws_ok($$ insert into public.academic_years (id, school_id, label, starts_on, ends_on) values ('00000094-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Y94', '2026-01-13', '2026-12-04') $$, '42501', null, 'teacher cannot insert academic_years');
select is_empty($$ update public.academic_years set updated_at = now() where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'teacher cannot update academic_years');
select is_empty($$ delete from public.academic_years where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'teacher cannot delete academic_years');

select is((select count(*) from public.terms where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1::bigint, 'teacher reads terms');
select throws_ok($$ insert into public.terms (id, school_id, academic_year_id, name, starts_on, ends_on) values ('00000095-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000004-0000-0000-0000-00000000000a', 'Term 00000095', '2026-01-13', '2026-04-09') $$, '42501', null, 'teacher cannot insert terms');
select is_empty($$ update public.terms set updated_at = now() where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'teacher cannot update terms');
select is_empty($$ delete from public.terms where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'teacher cannot delete terms');

select is((select count(*) from public.classes where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1::bigint, 'teacher reads classes');
select throws_ok($$ insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values ('00000096-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000004-0000-0000-0000-00000000000a', '00000003-0000-0000-0000-00000000000a', 'Class 00000096', '33333333-3333-3333-3333-333333333333') $$, '42501', null, 'teacher cannot insert classes');
select is_empty($$ update public.classes set updated_at = now() where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'teacher cannot update classes');
select is_empty($$ delete from public.classes where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'teacher cannot delete classes');

select is((select count(*) from public.subjects where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1::bigint, 'teacher reads subjects');
select throws_ok($$ insert into public.subjects (id, school_id, code, name, stage_scope) values ('00000097-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'S97', 'Subject 00000097', 'secondary') $$, '42501', null, 'teacher cannot insert subjects');
select is_empty($$ update public.subjects set updated_at = now() where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'teacher cannot update subjects');
select is_empty($$ delete from public.subjects where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'teacher cannot delete subjects');

select is((select count(*) from public.class_subjects where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1::bigint, 'teacher reads class_subjects');
select throws_ok($$ insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values ('00000098-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000006-0000-0000-0000-00000000000a', '00000007-0000-0000-0000-00000000000a', '33333333-3333-3333-3333-333333333333') $$, '42501', null, 'teacher cannot insert class_subjects');
select is_empty($$ update public.class_subjects set updated_at = now() where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'teacher cannot update class_subjects');
select is_empty($$ delete from public.class_subjects where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$, 'teacher cannot delete class_subjects');

-- Hank (school A head) reads everything; Pat (parent) and Bob (school B admin) read nothing of A.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select results_eq($$ select 'grading_scales'::text, count(*) from public.grading_scales where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'grading_bands'::text, count(*) from public.grading_bands where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'grade_levels'::text, count(*) from public.grade_levels where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'academic_years'::text, count(*) from public.academic_years where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'terms'::text, count(*) from public.terms where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'classes'::text, count(*) from public.classes where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'subjects'::text, count(*) from public.subjects where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'class_subjects'::text, count(*) from public.class_subjects where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$, $$ values ('grading_scales'::text, 1::bigint), ('grading_bands'::text, 1::bigint), ('grade_levels'::text, 1::bigint), ('academic_years'::text, 1::bigint), ('terms'::text, 1::bigint), ('classes'::text, 1::bigint), ('subjects'::text, 1::bigint), ('class_subjects'::text, 1::bigint) $$, 'head reads every structure table');
select throws_ok($$ insert into public.subjects (id, school_id, code, name, stage_scope) values ('00000097-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'S97', 'Subject 00000097', 'secondary') $$, '42501', null, 'head cannot write structure tables');
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select results_eq($$ select 'grading_scales'::text, count(*) from public.grading_scales where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'grading_bands'::text, count(*) from public.grading_bands where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'grade_levels'::text, count(*) from public.grade_levels where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'academic_years'::text, count(*) from public.academic_years where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'terms'::text, count(*) from public.terms where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'classes'::text, count(*) from public.classes where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'subjects'::text, count(*) from public.subjects where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'class_subjects'::text, count(*) from public.class_subjects where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$, $$ values ('grading_scales'::text, 0::bigint), ('grading_bands'::text, 0::bigint), ('grade_levels'::text, 0::bigint), ('academic_years'::text, 0::bigint), ('terms'::text, 0::bigint), ('classes'::text, 0::bigint), ('subjects'::text, 0::bigint), ('class_subjects'::text, 0::bigint) $$, 'parent reads no structure table');
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select results_eq($$ select 'grading_scales'::text, count(*) from public.grading_scales where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'grading_bands'::text, count(*) from public.grading_bands where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'grade_levels'::text, count(*) from public.grade_levels where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'academic_years'::text, count(*) from public.academic_years where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'terms'::text, count(*) from public.terms where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'classes'::text, count(*) from public.classes where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'subjects'::text, count(*) from public.subjects where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' union all select 'class_subjects'::text, count(*) from public.class_subjects where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$, $$ values ('grading_scales'::text, 0::bigint), ('grading_bands'::text, 0::bigint), ('grade_levels'::text, 0::bigint), ('academic_years'::text, 0::bigint), ('terms'::text, 0::bigint), ('classes'::text, 0::bigint), ('subjects'::text, 0::bigint), ('class_subjects'::text, 0::bigint) $$, 'school B admin reads nothing of school A');

-- Grading-scale coverage (D21), as Alice. Scales in school A:
--   gap:     A 50-99, U 0-39            -> gaps 40-49 and 100
--   overlap: A 60-100, U 0-65           -> overlap 60-65
--   good:    A 50-100, U 0-49           -> complete
--   empty:   no bands                   -> gap 0-100
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
insert into public.grading_scales (id, school_id, name, stage) values
  ('0000000c-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Gap scale', 'primary'),
  ('0000000d-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Overlap scale', 'primary'),
  ('0000000e-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Good scale', 'primary'),
  ('0000000f-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Empty scale', 'primary');
insert into public.grading_bands (school_id, scale_id, grade, min_mark, max_mark) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0000000c-0000-0000-0000-00000000000a', 'A', 50, 99),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0000000c-0000-0000-0000-00000000000a', 'U', 0, 39),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0000000d-0000-0000-0000-00000000000a', 'A', 60, 100),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0000000d-0000-0000-0000-00000000000a', 'U', 0, 65),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0000000e-0000-0000-0000-00000000000a', 'A', 50, 100),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0000000e-0000-0000-0000-00000000000a', 'U', 0, 49);

select results_eq(
  $$ select * from public.grading_scale_problems('0000000c-0000-0000-0000-00000000000a') $$,
  $$ values ('gap'::text, 40, 49), ('gap'::text, 100, 100) $$,
  'a scale with gaps reports each gap'
);
select results_eq(
  $$ select * from public.grading_scale_problems('0000000d-0000-0000-0000-00000000000a') $$,
  $$ values ('overlap'::text, 60, 65) $$,
  'a scale with overlapping bands reports the overlap'
);
select is_empty(
  $$ select * from public.grading_scale_problems('0000000e-0000-0000-0000-00000000000a') $$,
  'a scale covering 0 to 100 exactly has no problems'
);
select results_eq(
  $$ select * from public.grading_scale_problems('0000000f-0000-0000-0000-00000000000a') $$,
  $$ values ('gap'::text, 0, 100) $$,
  'a scale with no bands is one gap'
);
select results_eq(
  $$ select public.grading_scale_is_complete(id) from (values
       ('0000000c-0000-0000-0000-00000000000a'::uuid), ('0000000d-0000-0000-0000-00000000000a'::uuid),
       ('0000000e-0000-0000-0000-00000000000a'::uuid), ('0000000f-0000-0000-0000-00000000000a'::uuid)) as s (id) $$,
  $$ values (false), (false), (true), (false) $$,
  'grading_scale_is_complete is true only for the good scale'
);

select throws_ok(
  $$ update public.grading_scales set is_default = true where id = '0000000c-0000-0000-0000-00000000000a' $$,
  '23514', null, 'a scale with a gap cannot be made default'
);
select throws_ok(
  $$ update public.grading_scales set is_default = true where id = '0000000d-0000-0000-0000-00000000000a' $$,
  '23514', null, 'a scale with an overlap cannot be made default'
);
select throws_ok(
  $$ insert into public.grading_scales (school_id, name, stage, is_default) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'New default', 'ecd', true) $$,
  '23514', null, 'a new scale with no bands cannot be created as default'
);
select lives_ok(
  $$ update public.grading_scales set is_default = true where id = '0000000e-0000-0000-0000-00000000000a' $$,
  'a complete scale can be made default'
);

-- Band edits on the default scale: a broken result is refused at commit
-- (forced here with set constraints), a boundary moved in two steps is not.
set constraints public.grading_bands_default_scale_stays_complete immediate;
select throws_ok(
  $$ update public.grading_bands set min_mark = 55
     where scale_id = '0000000e-0000-0000-0000-00000000000a' and grade = 'A' $$,
  '23514', null, 'a band edit that leaves a default scale with a gap is refused'
);
set constraints public.grading_bands_default_scale_stays_complete deferred;
update public.grading_bands set min_mark = 55
 where scale_id = '0000000e-0000-0000-0000-00000000000a' and grade = 'A';
update public.grading_bands set max_mark = 54
 where scale_id = '0000000e-0000-0000-0000-00000000000a' and grade = 'U';
select lives_ok(
  $$ set constraints public.grading_bands_default_scale_stays_complete immediate $$,
  'moving a boundary in two steps keeps the default scale complete'
);

-- Teaching staff checks and one teacher per class subject.
select throws_ok(
  $$ insert into public.classes (school_id, academic_year_id, grade_level_id, name, class_teacher_id)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000004-0000-0000-0000-00000000000a', '00000003-0000-0000-0000-00000000000a', 'Parent-led', '55555555-5555-5555-5555-555555555555') $$,
  '23514', null, 'a parent cannot be a class teacher'
);
select throws_ok(
  $$ insert into public.classes (school_id, academic_year_id, grade_level_id, name, class_teacher_id)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000004-0000-0000-0000-00000000000a', '00000003-0000-0000-0000-00000000000a', 'Borrowed', '77777777-7777-7777-7777-777777777777') $$,
  '23514', null, 'another school''s teacher cannot be a class teacher'
);
select throws_ok(
  $$ update public.classes set class_teacher_id = '66666666-6666-6666-6666-666666666666' where id = '00000006-0000-0000-0000-00000000000a' $$,
  '23514', null, 'a disabled teacher cannot be a class teacher'
);
select lives_ok(
  $$ update public.classes set class_teacher_id = '88888888-8888-8888-8888-888888888888' where id = '00000006-0000-0000-0000-00000000000a' $$,
  'a head of department can be a class teacher'
);
select throws_ok(
  $$ update public.class_subjects set teacher_id = '55555555-5555-5555-5555-555555555555' where id = '00000008-0000-0000-0000-00000000000a' $$,
  '23514', null, 'a parent cannot teach a class subject'
);
select throws_ok(
  $$ insert into public.class_subjects (school_id, class_id, subject_id, teacher_id)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000006-0000-0000-0000-00000000000a', '00000007-0000-0000-0000-00000000000a', '88888888-8888-8888-8888-888888888888') $$,
  '23505', null, 'a class subject has only one teacher'
);

-- Same-school references: an A row can never point at a B parent.
select throws_ok(
  $$ insert into public.terms (school_id, academic_year_id, name, starts_on, ends_on)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000004-0000-0000-0000-00000000000b', 'Cross term', '2026-01-13', '2026-04-09') $$,
  '23503', null, 'a term cannot belong to another school''s year'
);
select throws_ok(
  $$ insert into public.class_subjects (school_id, class_id, subject_id, teacher_id)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000006-0000-0000-0000-00000000000a', '00000007-0000-0000-0000-00000000000b', '33333333-3333-3333-3333-333333333333') $$,
  '23503', null, 'a class subject cannot use another school''s subject'
);

-- A row never moves school, even for the table owner.
reset role;
select throws_ok(
  $$ update public.subjects set school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' where id = '00000007-0000-0000-0000-00000000000a' $$,
  'P0001', 'a row''s school cannot change', 'a row cannot move to another school'
);

select * from finish();
rollback;
