-- pgTAP: the console's grading status per school (D42). Platform admins
-- see each grade level's scale and whether it is complete; nobody else
-- gets rows, including the school's own admin; anonymous callers cannot
-- call it.
--
-- Fixture (rolled back): school A with Form 1 on a complete scale and
-- Form 2 on a blank one. Pam is a platform admin, Alice school A's admin.
begin;

select plan(4);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('e2600000-0000-0000-0000-000000000001', 'pam@grading-status.test'),
  ('e2600000-0000-0000-0000-000000000002', 'alice@grading-status.test')
) as u (id, email);

insert into public.platform_admins (user_id) values ('e2600000-0000-0000-0000-000000000001');
insert into public.schools (id, slug, name, stage, timezone, status) values
  ('a2600000-0000-0000-0000-00000000000a', 'grading-status-a-test', 'School A', 'secondary', 'Africa/Harare', 'active');
insert into public.memberships (school_id, user_id, role, status) values
  ('a2600000-0000-0000-0000-00000000000a', 'e2600000-0000-0000-0000-000000000002', 'school_admin', 'active');
insert into public.grading_scales (id, school_id, name, stage) values
  ('a2610000-0000-0000-0000-000000000001', 'a2600000-0000-0000-0000-00000000000a', 'Our key', 'o_level'),
  ('a2610000-0000-0000-0000-000000000002', 'a2600000-0000-0000-0000-00000000000a', 'Draft', 'o_level');
insert into public.grading_bands (school_id, scale_id, grade, min_mark, max_mark) values
  ('a2600000-0000-0000-0000-00000000000a', 'a2610000-0000-0000-0000-000000000001', 'P', 50, 100),
  ('a2600000-0000-0000-0000-00000000000a', 'a2610000-0000-0000-0000-000000000001', 'F', 0, 49);
insert into public.grade_levels (school_id, name, stage, sort_order, grading_scale_id) values
  ('a2600000-0000-0000-0000-00000000000a', 'Form 1', 'o_level', 1, 'a2610000-0000-0000-0000-000000000001'),
  ('a2600000-0000-0000-0000-00000000000a', 'Form 2', 'o_level', 2, 'a2610000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2600000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$ select grade_level_name, scale_name, complete from public.school_grading_status('a2600000-0000-0000-0000-00000000000a') $$,
  $$ values ('Form 1', 'Our key', true), ('Form 2', 'Draft', false) $$,
  'a platform admin sees each level''s scale and whether it is complete'
);
select is_empty(
  $$ select * from public.grading_bands where school_id = 'a2600000-0000-0000-0000-00000000000a' $$,
  'the platform admin still cannot read the bands themselves (D5)'
);

select set_config('request.jwt.claims', '{"sub":"e2600000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is_empty(
  $$ select * from public.school_grading_status('a2600000-0000-0000-0000-00000000000a') $$,
  'a school admin gets nothing from the console function'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select * from public.school_grading_status('a2600000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'anonymous callers cannot call it'
);

select * from finish();
rollback;
