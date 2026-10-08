-- pgTAP: parent invites and learner logins
-- (supabase/migrations/20261008091208_parent_and_learner_sign_in.sql, D7, D25, D26).
-- Covers invites RLS (admin and head read their school only; nobody writes
-- the table directly), creating, previewing and redeeming parent codes
-- (once only, expiry, superseded codes, a guardian taken by someone else),
-- the linked children list, the login-link column guards, link_learner_login()
-- and the sign-in school list.
--
-- Fixture (rolled back at the end). School A: Alice (admin), Hank (head),
-- Tina (teacher); guardian Gwen with two children (Lulu, Leo) and guardian
-- Gary with one (Lisa). Pat and Quinn have accounts and no school. Lara's
-- account was made for Lulu (app_metadata names her); Xavier's for nobody.
-- School B: Bob (admin), guardian Bea. School C is suspended.
begin;

select plan(49);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), u.app::jsonb, jsonb_build_object('full_name', u.name), now(), now(),
       '', '', '', ''
from (values
  ('f2000000-0000-0000-0000-000000000001', 'alice@invites.test', 'Alice Admin', '{}'),
  ('f2000000-0000-0000-0000-000000000002', 'hank@invites.test', 'Hank Head', '{}'),
  ('f2000000-0000-0000-0000-000000000003', 'tina@invites.test', 'Tina Teacher', '{}'),
  ('f2000000-0000-0000-0000-000000000004', 'pat@invites.test', 'Pat Parent', '{}'),
  ('f2000000-0000-0000-0000-000000000005', 'quinn@invites.test', 'Quinn Other', '{}'),
  ('f2000000-0000-0000-0000-000000000006', 'lara@invites.test', 'Lulu Learner',
   '{"learner_id": "a2100000-0000-0000-0000-000000000001"}'),
  ('f2000000-0000-0000-0000-000000000007', 'xavier@invites.test', 'Xavier Nobody', '{}'),
  ('f2000000-0000-0000-0000-000000000009', 'bob@invites.test', 'Bob Admin', '{}')
) as u (id, email, name, app);

insert into public.schools (id, slug, name, stage, status)
values
  ('a2000000-0000-0000-0000-00000000000a', 'invites-a-test', 'Invites School A', 'secondary', 'active'),
  ('b2000000-0000-0000-0000-00000000000b', 'invites-b-test', 'Invites School B', 'secondary', 'active'),
  ('c2000000-0000-0000-0000-00000000000c', 'invites-c-test', 'Invites School C', 'secondary', 'suspended');

insert into public.memberships (school_id, user_id, role, status)
values
  ('a2000000-0000-0000-0000-00000000000a', 'f2000000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a2000000-0000-0000-0000-00000000000a', 'f2000000-0000-0000-0000-000000000002', 'head', 'active'),
  ('a2000000-0000-0000-0000-00000000000a', 'f2000000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('b2000000-0000-0000-0000-00000000000b', 'f2000000-0000-0000-0000-000000000009', 'school_admin', 'active');

insert into public.learners (id, school_id, learner_number, first_name, last_name) values
  ('a2100000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-00000000000a', 'A1', 'Lulu', 'Dube'),
  ('a2100000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-00000000000a', 'A2', 'Leo', 'Dube'),
  ('a2100000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-00000000000a', 'A3', 'Lisa', 'Moyo'),
  ('b2100000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-00000000000b', 'B1', 'Ben', 'Banda');

insert into public.guardians (id, school_id, full_name, phone, email) values
  ('a2200000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-00000000000a', 'Gwen Dube', '0772000001', 'gwen@invites.test'),
  ('a2200000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-00000000000a', 'Gary Moyo', '0772000002', null),
  ('b2200000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-00000000000b', 'Bea Banda', '0772000009', null);

insert into public.guardian_links (school_id, guardian_id, learner_id, relationship, is_primary) values
  ('a2000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000001', 'mother', true),
  ('a2000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000002', 'mother', true),
  ('a2000000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-000000000002', 'a2100000-0000-0000-0000-000000000003', 'father', true),
  ('b2000000-0000-0000-0000-00000000000b', 'b2200000-0000-0000-0000-000000000001', 'b2100000-0000-0000-0000-000000000001', 'mother', true);

set local role authenticated;

-- Creating codes ------------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'f2000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$ select * from public.create_parent_invite('a2200000-0000-0000-0000-000000000001', repeat('1', 64)) $$,
  'The school admin creates a parent code for a guardian'
);
select is(
  (select expires_at > now() + interval '13 days' and expires_at <= now() + interval '14 days'
   from public.invites where code_hash = repeat('1', 64)),
  true,
  'A new code lasts 14 days'
);
select is((select count(*) from public.invites), 1::bigint, 'The school admin reads their school''s invites');
select is(
  (select count(*) from public.audit_log where event = 'parent_invite_created'),
  1::bigint,
  'Creating a code is recorded in the audit log'
);

select throws_ok(
  $$ insert into public.invites (school_id, role, guardian_id, code_hash, expires_at)
     values ('a2000000-0000-0000-0000-00000000000a', 'parent', 'a2200000-0000-0000-0000-000000000002',
             repeat('9', 64), now() + interval '1 day') $$,
  '42501', null,
  'Even the school admin cannot insert an invite directly'
);
select throws_ok(
  $$ update public.invites set expires_at = now() + interval '1 year' $$,
  '42501', null,
  'Nobody can extend an invite directly'
);
select throws_ok(
  $$ delete from public.invites $$,
  '42501', null,
  'Nobody can delete an invite'
);

select lives_ok(
  $$ select * from public.create_parent_invite('a2200000-0000-0000-0000-000000000001', repeat('2', 64)) $$,
  'The school admin makes a new code for the same guardian'
);
select is(
  (select status from public.parent_invite_preview(repeat('1', 64))),
  'expired',
  'The older code for that guardian stops working'
);

select set_config('request.jwt.claim.sub', 'f2000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.invites), 2::bigint, 'The head reads their school''s invites');
select throws_ok(
  $$ select * from public.create_parent_invite('a2200000-0000-0000-0000-000000000002', repeat('8', 64)) $$,
  '42501', null,
  'The head cannot create a parent code'
);

select set_config('request.jwt.claim.sub', 'f2000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.invites), 0::bigint, 'A teacher reads no invites');
select throws_ok(
  $$ select * from public.create_parent_invite('a2200000-0000-0000-0000-000000000002', repeat('8', 64)) $$,
  '42501', null,
  'A teacher cannot create a parent code'
);

select set_config('request.jwt.claim.sub', 'f2000000-0000-0000-0000-000000000009', true);
select is((select count(*) from public.invites), 0::bigint, 'School B''s admin reads no school A invites');
select throws_ok(
  $$ select * from public.create_parent_invite('a2200000-0000-0000-0000-000000000002', repeat('8', 64)) $$,
  '42501', null,
  'School B''s admin cannot create a code for a school A guardian'
);
select lives_ok(
  $$ select * from public.create_parent_invite('b2200000-0000-0000-0000-000000000001', repeat('b', 64)) $$,
  'School B''s admin creates a code for their own guardian'
);

select set_config('request.jwt.claim.sub', 'f2000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.invites), 2::bigint, 'School A''s admin still sees only school A invites');

-- Preview, signed out -----------------------------------------------------------------

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is((select count(*) from public.invites), 0::bigint, 'Anonymous users read no invites');
select is(
  (select row(status, school_name, guardian_name, guardian_email, children)::text
   from public.parent_invite_preview(repeat('2', 64))),
  '(valid,"Invites School A","Gwen Dube",gwen@invites.test,2)',
  'Anyone holding a valid code sees its school, guardian and number of children'
);
select is(
  (select row(status, school_name, guardian_name)::text from public.parent_invite_preview(repeat('7', 64))),
  '(unknown,,)',
  'An unknown code reveals nothing'
);
select throws_ok(
  $$ select public.redeem_parent_invite(repeat('2', 64)) $$,
  '42501', null,
  'Signed-out visitors cannot redeem a code'
);
select is(
  (select array_agg(slug order by slug) from public.sign_in_schools() where slug like 'invites-%'),
  array['invites-a-test', 'invites-b-test'],
  'The learner sign-in list shows active schools only'
);

-- Redeeming ---------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f2000000-0000-0000-0000-000000000004', true);

select is(
  public.redeem_parent_invite(repeat('2', 64)),
  'a2000000-0000-0000-0000-00000000000a'::uuid,
  'Pat redeems the code for school A'
);
select is(
  (select count(*) from public.my_children('a2000000-0000-0000-0000-00000000000a')),
  2::bigint,
  'Pat now sees both of Gwen''s children'
);
select is(
  (select count(*) from public.my_children('b2000000-0000-0000-0000-00000000000b')),
  0::bigint,
  'Pat sees no children in another school'
);
select is(
  (select status from public.parent_invite_preview(repeat('2', 64))),
  'used',
  'A redeemed code shows as used'
);
select throws_ok(
  $$ select public.redeem_parent_invite(repeat('2', 64)) $$,
  'P0001', 'invite_used',
  'A code works once, even for the same person'
);
select throws_ok(
  $$ select public.redeem_parent_invite(repeat('1', 64)) $$,
  'P0001', 'invite_expired',
  'An expired code is rejected'
);
select throws_ok(
  $$ select public.redeem_parent_invite(repeat('7', 64)) $$,
  'P0001', 'invite_unknown',
  'An unknown code is rejected'
);

reset role;
select is(
  (select user_id from public.guardians where id = 'a2200000-0000-0000-0000-000000000001'),
  'f2000000-0000-0000-0000-000000000004'::uuid,
  'Gwen''s guardian record is now Pat''s login'
);
select is(
  (select status::text from public.memberships
   where user_id = 'f2000000-0000-0000-0000-000000000004' and role = 'parent'
     and school_id = 'a2000000-0000-0000-0000-00000000000a'),
  'active',
  'Pat has an active parent membership in school A'
);
select is(
  (select count(*) from public.audit_log where event = 'parent_invite_accepted'
   and school_id = 'a2000000-0000-0000-0000-00000000000a'),
  1::bigint,
  'Redeeming is recorded against the school'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f2000000-0000-0000-0000-000000000005', true);
select is(
  (select count(*) from public.my_children('a2000000-0000-0000-0000-00000000000a')),
  0::bigint,
  'Someone who redeemed nothing sees no children'
);

select set_config('request.jwt.claim.sub', 'f2000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$ select * from public.create_parent_invite('a2200000-0000-0000-0000-000000000001', repeat('3', 64)) $$,
  'P0001', 'this guardian already has an account',
  'No new code for a guardian who already has an account'
);
select lives_ok(
  $$ select * from public.create_parent_invite('a2200000-0000-0000-0000-000000000002', repeat('4', 64)) $$,
  'The school admin creates a code for Gary'
);

-- Someone else claims Gary's record first (by a later code), so this code
-- cannot hand it to Pat.
reset role;
update public.guardians set user_id = 'f2000000-0000-0000-0000-000000000005'
where id = 'a2200000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f2000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$ select public.redeem_parent_invite(repeat('4', 64)) $$,
  'P0001', 'guardian_taken',
  'A guardian linked to someone else stays theirs'
);
select throws_ok(
  $$ insert into public.memberships (school_id, user_id, role, status)
     values ('a2000000-0000-0000-0000-00000000000a', 'f2000000-0000-0000-0000-000000000004', 'school_admin', 'active') $$,
  'P0001', 'members cannot grant themselves a membership',
  'Members still cannot grant themselves a membership directly'
);

-- Login link guards ---------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'f2000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$ update public.learners set user_id = 'f2000000-0000-0000-0000-000000000002'
     where id = 'a2100000-0000-0000-0000-000000000003' $$,
  '42501', null,
  'The school admin cannot point a learner at someone''s account'
);
select throws_ok(
  $$ update public.guardians set user_id = 'f2000000-0000-0000-0000-000000000002'
     where id = 'a2200000-0000-0000-0000-000000000002' $$,
  '42501', null,
  'The school admin cannot point a guardian at someone''s account'
);
select throws_ok(
  $$ insert into public.guardians (school_id, full_name, user_id)
     values ('a2000000-0000-0000-0000-00000000000a', 'Gil Fake', 'f2000000-0000-0000-0000-000000000002') $$,
  '42501', null,
  'A new guardian cannot come with an account'
);
select lives_ok(
  $$ update public.learners set first_name = 'Lisa-Marie' where id = 'a2100000-0000-0000-0000-000000000003' $$,
  'The school admin still edits learner details'
);

-- Learner logins ---------------------------------------------------------------

select set_config('request.jwt.claim.sub', 'f2000000-0000-0000-0000-000000000009', true);
select throws_ok(
  $$ select public.link_learner_login('a2100000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000006') $$,
  '42501', null,
  'School B''s admin cannot link a school A learner'
);
select set_config('request.jwt.claim.sub', 'f2000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ select public.link_learner_login('a2100000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000006') $$,
  '42501', null,
  'A teacher cannot link a learner'
);

select set_config('request.jwt.claim.sub', 'f2000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$ select public.link_learner_login('a2100000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000002') $$,
  'P0001', 'that account is not this learner''s',
  'The admin cannot link a learner to a staff account'
);
select lives_ok(
  $$ select public.link_learner_login('a2100000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000006') $$,
  'The school admin links Lulu to the account made for her'
);
select lives_ok(
  $$ select public.link_learner_login('a2100000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000006') $$,
  'Resetting the PIN later links the same account again'
);

reset role;
select is(
  (select user_id from public.learners where id = 'a2100000-0000-0000-0000-000000000001'),
  'f2000000-0000-0000-0000-000000000006'::uuid,
  'Lulu''s record points at her account'
);
select is(
  (select count(*) from public.memberships
   where user_id = 'f2000000-0000-0000-0000-000000000006' and role = 'learner' and status = 'active'),
  1::bigint,
  'Lulu has one active learner membership'
);
select is(
  (select count(*) from public.audit_log where event = 'learner_pin_set'
   and row_id = 'a2100000-0000-0000-0000-000000000001'),
  2::bigint,
  'Each PIN set is recorded'
);

select * from finish();
rollback;
