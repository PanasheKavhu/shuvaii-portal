-- pgTAP: staff roles need the person's own say
-- (supabase/migrations/20261008120722_staff_consent.sql, D27).
-- Covers my_pending_invites(), decline_my_invites(), the school admin's
-- staff profile edit refused for someone who also belongs to another
-- school, and the staff list hiding that person's phone until they accept.
--
-- Fixture (rolled back at the end). School A: Alice (admin), Nora (new
-- teacher, only in A, invited). School B: Hana (head of B), invited to A by
-- A's admin without her say.
begin;

select plan(12);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', jsonb_build_object('full_name', u.name), now(), now(), '', '', '', ''
from (values
  ('f3000000-0000-0000-0000-000000000001', 'alice@consent.test', 'Alice Admin'),
  ('f3000000-0000-0000-0000-000000000002', 'nora@consent.test', 'Nora New'),
  ('f3000000-0000-0000-0000-000000000003', 'hana@consent.test', 'Hana Head')
) as u (id, email, name);

update public.profiles set phone = '0772000333' where id = 'f3000000-0000-0000-0000-000000000003';
update public.profiles set phone = '0772000222' where id = 'f3000000-0000-0000-0000-000000000002';

insert into public.schools (id, slug, name, stage)
values
  ('a3000000-0000-0000-0000-00000000000a', 'consent-a-test', 'Consent School A', 'combined'),
  ('b3000000-0000-0000-0000-00000000000b', 'consent-b-test', 'Consent School B', 'secondary');

insert into public.memberships (id, school_id, user_id, role, status)
values
  ('a4000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a4000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-000000000002', 'teacher', 'invited'),
  ('a4000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-000000000003', 'teacher', 'invited'),
  ('b4000000-0000-0000-0000-000000000003', 'b3000000-0000-0000-0000-00000000000b', 'f3000000-0000-0000-0000-000000000003', 'head', 'active');

set local role authenticated;

-- School A's admin ---------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'f3000000-0000-0000-0000-000000000001', true);

select is(
  (select phone from public.school_staff('a3000000-0000-0000-0000-00000000000a') where user_id = 'f3000000-0000-0000-0000-000000000002'),
  '0772000222',
  'The admin sees the phone of an invited teacher who belongs to this school only'
);

select is(
  (select phone from public.school_staff('a3000000-0000-0000-0000-00000000000a') where user_id = 'f3000000-0000-0000-0000-000000000003'),
  null,
  'The admin does not see the phone of another school''s head who has not accepted'
);

select lives_ok(
  $$ select public.update_staff_profile('a3000000-0000-0000-0000-00000000000a',
       'f3000000-0000-0000-0000-000000000002', 'Nora Ncube', null) $$,
  'The admin edits a teacher who belongs to this school only'
);

select throws_ok(
  $$ select public.update_staff_profile('a3000000-0000-0000-0000-00000000000a',
       'f3000000-0000-0000-0000-000000000003', 'Renamed', null) $$,
  '42501', 'staff_shared',
  'The admin cannot rename someone who also belongs to another school'
);

select is_empty(
  $$ select * from public.my_pending_invites() $$,
  'The admin has no invites waiting'
);

-- Hana, invited to school A -----------------------------------------------------------
select set_config('request.jwt.claim.sub', 'f3000000-0000-0000-0000-000000000003', true);

select results_eq(
  $$ select school_name, role::text from public.my_pending_invites() $$,
  $$ values ('Consent School A', 'teacher') $$,
  'An invitee sees the school and role waiting for them'
);

select is(public.decline_my_invites(), 1, 'She declines');

select is(
  (select status::text from public.memberships where id = 'a4000000-0000-0000-0000-000000000003'),
  'disabled',
  'The declined role is disabled'
);

select is(
  (select status::text from public.memberships where id = 'b4000000-0000-0000-0000-000000000003'),
  'active',
  'Her role in her own school is untouched'
);

select is_empty(
  $$ select * from public.my_pending_invites() $$,
  'Nothing is waiting after declining'
);

-- Nora accepts -------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'f3000000-0000-0000-0000-000000000002', true);

select is(public.accept_my_invites(), 1, 'Nora accepts her invite');

-- Anonymous ------------------------------------------------------------------------------
set local role anon;
select throws_ok(
  $$ select * from public.my_pending_invites() $$,
  '42501', null,
  'Anonymous callers cannot list invites'
);

select * from finish();
rollback;
