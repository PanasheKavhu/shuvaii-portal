-- pgTAP: accept_my_invites()
-- (supabase/migrations/20261007125712_accept_invited_memberships.sql, D14).
-- It activates only the caller's own invited memberships, never re-enables
-- a disabled one, and an invitee cannot see the school until they accept.
--
-- Fixture: school H. Ivy has an invited school_admin membership and a
-- disabled teacher membership; Jo has an invited membership too. Rolled
-- back at the end.
begin;

select plan(8);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('b2222222-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ivy@school-h.test', '', now(), '{}', '{}',
   now(), now(), '', '', '', ''),
  ('b2222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'jo@school-h.test', '', now(), '{}', '{}',
   now(), now(), '', '', '', '');

insert into public.schools (id, slug, name, stage)
values ('e0000000-0000-0000-0000-00000000000e', 'school-h-test', 'School H', 'secondary');

insert into public.memberships (id, school_id, user_id, role, status)
values
  ('d2222222-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000e',
   'b2222222-0000-0000-0000-000000000001', 'school_admin', 'invited'),
  ('d2222222-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000e',
   'b2222222-0000-0000-0000-000000000001', 'teacher', 'disabled'),
  ('d2222222-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-00000000000e',
   'b2222222-0000-0000-0000-000000000002', 'head', 'invited');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2222222-0000-0000-0000-000000000001', true);

select is_empty(
  $$ select 1 from public.schools where id = 'e0000000-0000-0000-0000-00000000000e' $$,
  'An invitee cannot read the school before accepting'
);

select is_empty(
  $$ update public.memberships set status = 'active'
     where id = 'd2222222-0000-0000-0000-000000000001' returning 1 $$,
  'An invitee cannot activate their membership by a direct update'
);

select is(public.accept_my_invites(), 1, 'accept_my_invites() activates one membership');

reset role;

select is(
  (select status::text from public.memberships where id = 'd2222222-0000-0000-0000-000000000001'),
  'active', 'The invited school_admin membership is now active'
);

select is(
  (select status::text from public.memberships where id = 'd2222222-0000-0000-0000-000000000002'),
  'disabled', 'A disabled membership stays disabled'
);

select is(
  (select status::text from public.memberships where id = 'd2222222-0000-0000-0000-000000000003'),
  'invited', 'Another person''s invite is untouched'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2222222-0000-0000-0000-000000000001', true);

select isnt_empty(
  $$ select 1 from public.schools where id = 'e0000000-0000-0000-0000-00000000000e' $$,
  'After accepting, the school is visible'
);

reset role;
set local role anon;

select throws_ok(
  $$ select public.accept_my_invites() $$,
  '42501', null,
  'Anonymous users cannot call accept_my_invites()'
);

select * from finish();
rollback;
