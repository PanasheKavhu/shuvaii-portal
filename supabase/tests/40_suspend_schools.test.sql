-- pgTAP: suspending a school (D63). Migration 20261017074820_suspend_schools.
--
-- Only a platform admin suspends or reactivates a school, each change is a
-- console event, a suspended school is missing from the public lists, its
-- members read and write nothing there while another school is unaffected,
-- its parent codes read as unknown and cannot be redeemed, and
-- reactivating brings everything back.
--
-- Fixture (rolled back). School A: Ada (school admin), Tess (teacher), a
-- learner and a guardian with a waiting parent code. School B: Bea (school
-- admin). Pam is a platform admin; Nel has no account in any school yet.
begin;

select plan(25);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('e4000000-0000-0000-0000-000000000001', 'pam@suspend.test'),
  ('e4000000-0000-0000-0000-000000000002', 'ada@suspend.test'),
  ('e4000000-0000-0000-0000-000000000003', 'tess@suspend.test'),
  ('e4000000-0000-0000-0000-000000000004', 'bea@suspend.test'),
  ('e4000000-0000-0000-0000-000000000005', 'nel@suspend.test')
) as u (id, email);

insert into public.platform_admins (user_id) values ('e4000000-0000-0000-0000-000000000001');
insert into public.schools (id, slug, name, stage, status) values
  ('a4000000-0000-0000-0000-00000000000a', 'suspend-a-test', 'Suspend High', 'secondary', 'active'),
  ('a4000000-0000-0000-0000-00000000000b', 'suspend-b-test', 'Stays High', 'secondary', 'active');
insert into public.memberships (school_id, user_id, role, status) values
  ('a4000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-000000000002', 'school_admin', 'active'),
  ('a4000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('a4000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-000000000004', 'school_admin', 'active');
insert into public.learners (id, school_id, learner_number, first_name, last_name) values
  ('f4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-00000000000a', 'S-01', 'Lungi', 'Moyo'),
  ('f4000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-00000000000b', 'S-02', 'Bo', 'Other');
insert into public.guardians (id, school_id, full_name, email) values
  ('c4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-00000000000a', 'Nel Moyo', 'nel@suspend.test');
insert into public.guardian_links (school_id, guardian_id, learner_id, relationship, is_primary) values
  ('a4000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-000000000001',
   'f4000000-0000-0000-0000-000000000001', 'mother', true);
insert into public.invites (id, school_id, role, guardian_id, code_hash, expires_at) values
  ('d4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-00000000000a', 'parent',
   'c4000000-0000-0000-0000-000000000001', repeat('4', 64), now() + interval '7 days');

create function pg_temp.as_user(p_id text, p_aal text default 'aal2')
returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
grant execute on function pg_temp.as_user(text, text) to authenticated, anon;

set local role authenticated;

-- Who may switch it ---------------------------------------------------------------

select pg_temp.as_user('e4000000-0000-0000-0000-000000000002');
select throws_ok(
  $$ select public.set_school_status('a4000000-0000-0000-0000-00000000000a', 'suspended') $$,
  '42501', null, 'a school admin cannot suspend their school');

select pg_temp.as_user('e4000000-0000-0000-0000-000000000001', 'aal1');
select throws_ok(
  $$ select public.set_school_status('a4000000-0000-0000-0000-00000000000a', 'suspended') $$,
  '42501', null, 'a platform admin before the second step cannot suspend a school');

select pg_temp.as_user('e4000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ select public.set_school_status('a4000000-0000-0000-0000-00000000000a', 'closed') $$,
  '23514', null, 'only active and suspended are statuses');
select throws_ok(
  $$ select public.set_school_status('a4000000-0000-0000-0000-0000000000ff', 'suspended') $$,
  'P0002', null, 'an unknown school is refused');

-- Before: school A is listed and usable ----------------------------------------------

select ok(
  exists (select 1 from public.sign_in_schools() where slug = 'suspend-a-test'),
  'an active school is on the sign-in list');
select pg_temp.as_user('e4000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.learners where school_id = 'a4000000-0000-0000-0000-00000000000a'),
  1, 'its admin reads its learners while it is active');

-- Suspend ----------------------------------------------------------------------------

select pg_temp.as_user('e4000000-0000-0000-0000-000000000001');
select lives_ok(
  $$ select public.set_school_status('a4000000-0000-0000-0000-00000000000a', 'suspended') $$,
  'a platform admin suspends a school');
select lives_ok(
  $$ select public.set_school_status('a4000000-0000-0000-0000-00000000000a', 'suspended') $$,
  'suspending it again changes nothing');
reset role;
select is(
  (select array_agg(event order by created_at, id) from public.audit_log
    where school_id = 'a4000000-0000-0000-0000-00000000000a' and event like 'school_%'
      and event <> 'school_created'),
  array['school_suspended'], 'one school_suspended event is recorded');
set local role authenticated;

select ok(
  not exists (select 1 from public.sign_in_schools() where slug = 'suspend-a-test'),
  'a suspended school is missing from the sign-in list');
select is_empty(
  $$ select * from public.privacy_notice_school('suspend-a-test') $$,
  'a suspended school has no privacy notice page');
select ok(
  exists (select 1 from public.sign_in_schools() where slug = 'suspend-b-test'),
  'another school stays on the list');

-- Its members get nothing ------------------------------------------------------------

select pg_temp.as_user('e4000000-0000-0000-0000-000000000002');
select is_empty(
  $$ select 1 from public.schools where id = 'a4000000-0000-0000-0000-00000000000a' $$,
  'its admin can no longer read the school');
select is_empty(
  $$ select 1 from public.learners where school_id = 'a4000000-0000-0000-0000-00000000000a' $$,
  'its admin can no longer read its learners');
select is_empty(
  $$ update public.learners set first_name = 'Changed'
     where id = 'f4000000-0000-0000-0000-000000000001' returning 1 $$,
  'its admin can no longer change a learner');
select ok(not public.has_role('a4000000-0000-0000-0000-00000000000a', 'school_admin'),
  'has_role() is false in a suspended school');
select pg_temp.as_user('e4000000-0000-0000-0000-000000000003');
select ok(not public.is_staff('a4000000-0000-0000-0000-00000000000a'),
  'is_staff() is false in a suspended school');
select is_empty(
  $$ select public.current_school_ids() $$,
  'its teacher has no current schools');

select pg_temp.as_user('e4000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.learners), 1,
  'another school''s admin still reads their own learners');

-- Its parent codes read as unknown ---------------------------------------------------

select pg_temp.as_user('e4000000-0000-0000-0000-000000000005');
select is((select status from public.parent_invite_preview(repeat('4', 64))), 'unknown',
  'a waiting code of a suspended school reads as unknown');
select throws_ok(
  $$ select public.redeem_parent_invite(repeat('4', 64), '2026-10-13') $$,
  'P0001', 'invite_unknown', 'and cannot be redeemed');

-- Reactivate -------------------------------------------------------------------------

select pg_temp.as_user('e4000000-0000-0000-0000-000000000001');
select lives_ok(
  $$ select public.set_school_status('a4000000-0000-0000-0000-00000000000a', 'active') $$,
  'a platform admin reactivates the school');
reset role;
select is(
  (select array_agg(event order by created_at, id) from public.audit_log
    where school_id = 'a4000000-0000-0000-0000-00000000000a' and event like 'school_%'
      and event <> 'school_created'),
  array['school_suspended', 'school_reactivated'], 'school_reactivated is recorded');
set local role authenticated;

select pg_temp.as_user('e4000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.learners where school_id = 'a4000000-0000-0000-0000-00000000000a'),
  1, 'its admin reads its learners again');
select pg_temp.as_user('e4000000-0000-0000-0000-000000000005');
select is((select status from public.parent_invite_preview(repeat('4', 64))), 'valid',
  'its parent code works again');

select * from finish();
rollback;
