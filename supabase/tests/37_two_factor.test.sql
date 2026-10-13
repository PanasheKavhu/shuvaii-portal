-- pgTAP: two-factor sign in (D54). Sessions that have not passed the second
-- step (aal1) hold none of the super admin, school admin and head powers;
-- recovery codes are service-role only, hashed, single use, and using one
-- removes the factor; only a super admin at aal2 resets someone else's
-- factor, which ends their sessions and is recorded. See
-- supabase/migrations/20261013070000_two_factor.sql.
--
-- Fixture: school A with an admin (Alice), a head (Hana) and a teacher
-- (Tom); school B with an admin (Bob); two super admins (Pat, Quinn).
-- Sessions are set through request.jwt.claims with an `aal` claim, the way
-- PostgREST passes Auth's tokens.
begin;

select plan(55);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('11111111-1111-1111-1111-111111111111', 'alice@school-a.test'),
  ('22222222-2222-2222-2222-222222222222', 'bob@school-b.test'),
  ('33333333-3333-3333-3333-333333333333', 'hana@school-a.test'),
  ('44444444-4444-4444-4444-444444444444', 'tom@school-a.test'),
  ('55555555-5555-5555-5555-555555555555', 'pat@platform.test'),
  ('66666666-6666-6666-6666-666666666666', 'quinn@platform.test')
) as u (id, email);

update public.profiles set full_name = 'Hana Head' where id = '33333333-3333-3333-3333-333333333333';

insert into public.schools (id, slug, name, stage, timezone, status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'school-a-2fa', 'School A', 'secondary', 'Africa/Harare', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'school-b-2fa', 'School B', 'secondary', 'Africa/Harare', 'active');

insert into public.memberships (school_id, user_id, role, status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'school_admin', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'school_admin', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'head', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'teacher', 'active');

insert into public.platform_admins (user_id)
values ('55555555-5555-5555-5555-555555555555'), ('66666666-6666-6666-6666-666666666666');

-- A confirmed authenticator app for Alice and Hana, ten recovery codes and
-- an aal2 session for Hana.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values
  ('f1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'Authenticator app', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP'),
  ('f3333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333',
   'Authenticator app', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP');
insert into public.mfa_recovery_codes (user_id, code_hash)
select '33333333-3333-3333-3333-333333333333', encode(extensions.digest('hana-' || n, 'sha256'), 'hex')
from generate_series(1, 10) as n;
insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values ('5e553333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', now(), now(), 'aal2');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.mfa_recovery_codes'::regclass),
  'RLS is enabled on mfa_recovery_codes'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.two_factor_resets'::regclass),
  'RLS is enabled on two_factor_resets'
);

-- Assurance level and roles ----------------------------------------------------

set local role authenticated;

-- Alice, aal1 (password only).
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}', true);
select is(public.has_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'school_admin'), false,
  'a school admin at aal1 is not a school admin to the database');
select is(
  (select count(*) from public.memberships where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1::bigint,
  'a school admin at aal1 reads only their own membership'
);
select is_empty(
  $$ update public.schools set motto = 'aal1 write' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$,
  'a school admin at aal1 cannot change their school'
);
select throws_ok(
  $$ insert into public.memberships (school_id, user_id, role, status)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'teacher', 'invited') $$,
  '42501', null,
  'a school admin at aal1 cannot add staff'
);
select is(private.is_admin_or_head_folder('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/file.csv'), false,
  'a school admin at aal1 cannot reach the imports bucket');
select is(private.is_report_asset_path('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/stamp-1.png'), false,
  'a school admin at aal1 cannot upload a stamp');

-- Alice, aal2.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}', true);
select is(public.has_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'school_admin'), true,
  'a school admin at aal2 is a school admin');
select is(
  (select count(*) from public.memberships where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  3::bigint,
  'a school admin at aal2 reads the school''s memberships'
);
select isnt_empty(
  $$ update public.schools set motto = 'aal2 write' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning 1 $$,
  'a school admin at aal2 can change their school'
);
select is(private.is_admin_or_head_folder('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/file.csv'), true,
  'a school admin at aal2 reaches the imports bucket');
select is(private.is_report_asset_path('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/stamp-1.png'), true,
  'a school admin at aal2 can upload a stamp');
select is(public.has_role('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'school_admin'), false,
  'aal2 gives no role in another school');

-- Alice through the older single claim, with no aal (as the other pgTAP files do).
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select is(public.has_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'school_admin'), true,
  'a request with no aal claim is not held back');
select set_config('request.jwt.claim.sub', '', true);

-- Hana (head), aal1 then aal2.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1"}', true);
select is(private.is_admin_or_head('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), false,
  'a head at aal1 is not admin or head');
select is(
  (select count(*) from public.audit_log where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0::bigint,
  'a head at aal1 cannot read the audit log'
);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal2"}', true);
select is(private.is_admin_or_head('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), true,
  'a head at aal2 is admin or head');

-- Tom (teacher), aal1: never asked.
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal1"}', true);
select is(public.has_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'teacher'), true,
  'a teacher at aal1 keeps the teacher role');
select is(private.is_active_teacher('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444'), true,
  'a teacher at aal1 is still an active teacher');

-- Pat (super admin), aal1 then aal2.
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal1"}', true);
select is(public.is_platform_admin(), false, 'a super admin at aal1 is not a platform admin');
select throws_ok(
  $$ insert into public.schools (slug, name, stage) values ('aal1-school', 'Aal1 School', 'primary') $$,
  '42501', null,
  'a super admin at aal1 cannot create a school'
);
select is(
  (select count(*) from public.platform_admins where user_id = '55555555-5555-5555-5555-555555555555'),
  1::bigint,
  'a super admin at aal1 still reads their own platform admin row (to be sent to the second step)'
);
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal2"}', true);
select is(public.is_platform_admin(), true, 'a super admin at aal2 is a platform admin');

-- Recovery codes: no API access ---------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ select count(*) from public.mfa_recovery_codes $$, '42501', null,
  'a signed-in person cannot read recovery codes, even at aal2');
select throws_ok(
  $$ insert into public.mfa_recovery_codes (user_id, code_hash)
     values ('11111111-1111-1111-1111-111111111111', repeat('a', 64)) $$,
  '42501', null,
  'a signed-in person cannot write recovery codes');
select throws_ok(
  $$ select public.use_recovery_code('11111111-1111-1111-1111-111111111111', repeat('a', 64)) $$,
  '42501', null,
  'a signed-in person cannot call use_recovery_code()');
select throws_ok(
  $$ select public.replace_recovery_codes('11111111-1111-1111-1111-111111111111', array[repeat('a', 64)]) $$,
  '42501', null,
  'a signed-in person cannot call replace_recovery_codes()');
reset role;

set local role anon;
select throws_ok($$ select count(*) from public.mfa_recovery_codes $$, '42501', null,
  'anon cannot read recovery codes');
reset role;

-- Recovery codes: the server's functions --------------------------------------------

select is(
  encode(extensions.digest('11111111-1111-1111-1111-111111111111:ABCDEFGH23', 'sha256'), 'hex'),
  '004f29251a299c0d9945581dbdcf2c66bf54baecdec7bac005a9e25ac2fac0c4',
  'the hash matches the one hashRecoveryCode() makes (tests/unit/auth/recovery-codes.test.ts)'
);

set local role service_role;

select throws_ok(
  $$ select public.replace_recovery_codes('44444444-4444-4444-4444-444444444444',
       array(select encode(extensions.digest('tom-' || n, 'sha256'), 'hex') from generate_series(1, 10) n)) $$,
  '22023', null,
  'codes are refused for someone with no confirmed app'
);
select throws_ok(
  $$ select public.replace_recovery_codes('11111111-1111-1111-1111-111111111111',
       array(select encode(extensions.digest('alice-' || n, 'sha256'), 'hex') from generate_series(1, 9) n)) $$,
  '22023', null,
  'fewer than ten codes are refused'
);
select throws_ok(
  $$ select public.replace_recovery_codes('11111111-1111-1111-1111-111111111111',
       array(select repeat('a', 64) from generate_series(1, 10))) $$,
  '22023', null,
  'repeated codes are refused'
);

select lives_ok(
  $$ select public.replace_recovery_codes('11111111-1111-1111-1111-111111111111',
       array['004f29251a299c0d9945581dbdcf2c66bf54baecdec7bac005a9e25ac2fac0c4']
       || array(select encode(extensions.digest('alice-' || n, 'sha256'), 'hex') from generate_series(1, 9) n)) $$,
  'ten codes are stored for someone with a confirmed app'
);
select is(
  (select count(*) from public.mfa_recovery_codes where user_id = '11111111-1111-1111-1111-111111111111' and used_at is null),
  10::bigint,
  'Alice has ten unused codes'
);

select is(
  public.use_recovery_code('11111111-1111-1111-1111-111111111111', repeat('b', 64)),
  false,
  'a wrong code is refused'
);
select is(
  (select count(*) from auth.mfa_factors where user_id = '11111111-1111-1111-1111-111111111111'),
  1::bigint,
  'a wrong code leaves the app in place'
);
select is(
  public.use_recovery_code('11111111-1111-1111-1111-111111111111',
    '004f29251a299c0d9945581dbdcf2c66bf54baecdec7bac005a9e25ac2fac0c4'),
  true,
  'a right code is accepted'
);
select is(
  (select count(*) from auth.mfa_factors where user_id = '11111111-1111-1111-1111-111111111111'),
  0::bigint,
  'using a code removes the app, so the person enrols again'
);
select is(
  (select count(*) from public.mfa_recovery_codes where user_id = '11111111-1111-1111-1111-111111111111' and used_at is null),
  0::bigint,
  'using a code ends the other codes too'
);
select is(
  public.use_recovery_code('11111111-1111-1111-1111-111111111111',
    '004f29251a299c0d9945581dbdcf2c66bf54baecdec7bac005a9e25ac2fac0c4'),
  false,
  'a code works only once'
);
reset role;

-- Resets from the console -------------------------------------------------------------

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ select public.reset_two_factor('33333333-3333-3333-3333-333333333333') $$,
  '42501', null, 'a school admin cannot reset anyone''s two-factor, not even their own head''s');
select throws_ok($$ select public.reset_two_factor('22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'a school admin cannot reset another school admin''s two-factor');

select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$ select public.reset_two_factor('33333333-3333-3333-3333-333333333333') $$,
  '42501', null, 'a super admin at aal1 cannot reset');

select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ select public.reset_two_factor('55555555-5555-5555-5555-555555555555') $$,
  '42501', null, 'a super admin cannot reset their own (they use their recovery codes)');
select results_eq(
  $$ select user_id, enrolled from public.two_factor_status(array[
       '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444']::uuid[]) order by user_id $$,
  $$ values ('33333333-3333-3333-3333-333333333333'::uuid, true), ('44444444-4444-4444-4444-444444444444'::uuid, false) $$,
  'the console sees who has a confirmed app'
);
select lives_ok($$ select public.reset_two_factor('33333333-3333-3333-3333-333333333333') $$,
  'a super admin at aal2 resets the head''s two-factor');
reset role;

select is(
  (select count(*) from auth.mfa_factors where user_id = '33333333-3333-3333-3333-333333333333')
  + (select count(*) from public.mfa_recovery_codes where user_id = '33333333-3333-3333-3333-333333333333')
  + (select count(*) from auth.sessions where user_id = '33333333-3333-3333-3333-333333333333'),
  0::bigint,
  'the reset removed the head''s app, recovery codes and sessions'
);
select is(
  (select count(*) from public.two_factor_resets
   where user_id = '33333333-3333-3333-3333-333333333333' and reset_by = '55555555-5555-5555-5555-555555555555'),
  1::bigint,
  'the reset is recorded with who did it'
);
select is(
  (select count(*) from public.audit_log
   where school_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and event = 'two_factor_reset'
     and table_name = 'profiles' and row_id = '33333333-3333-3333-3333-333333333333'
     and actor_id = '55555555-5555-5555-5555-555555555555'),
  1::bigint,
  'the reset is in the head''s school''s audit log'
);
select throws_ok(
  $$ update public.two_factor_resets set reset_by = null $$,
  'P0001', 'two_factor_resets is append-only',
  'nobody rewrites a reset record'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}', true);
select is((select count(*) from public.two_factor_resets), 0::bigint,
  'a school admin cannot read reset records');
select is(
  (select count(*) from public.two_factor_status(array['33333333-3333-3333-3333-333333333333']::uuid[])),
  0::bigint,
  'a school admin gets nothing from two_factor_status()'
);
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2"}', true);
select is((select count(*) from public.two_factor_resets), 1::bigint,
  'another super admin reads the reset record');
reset role;

set local role anon;
select throws_ok($$ select public.reset_two_factor('33333333-3333-3333-3333-333333333333') $$,
  '42501', null, 'anon cannot call reset_two_factor()');
reset role;

select * from finish();
rollback;
