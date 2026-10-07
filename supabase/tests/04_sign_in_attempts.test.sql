-- pgTAP: sign_in_attempts is service-role only. Anonymous and signed-in
-- users can neither read nor write it, so nobody can see who is locked out
-- or forge attempts to lock someone else out (or clear their own lockout).
-- See supabase/migrations/20261007112438_sign_in_attempts.sql.
begin;

select plan(7);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.sign_in_attempts'::regclass),
  'RLS is enabled on sign_in_attempts'
);

-- A row written the way the sign-in action writes it (service role).
set local role service_role;
insert into public.sign_in_attempts (email_hash, succeeded)
values (encode(extensions.digest('someone@school-a.test', 'sha256'), 'hex'), false);
select is(
  (select count(*) from public.sign_in_attempts
   where email_hash = encode(extensions.digest('someone@school-a.test', 'sha256'), 'hex')),
  1::bigint,
  'service_role can insert and read attempts'
);
reset role;

select throws_ok(
  $$ insert into public.sign_in_attempts (email_hash, succeeded) values ('not-a-hash', false) $$,
  '23514',
  null,
  'email_hash must be a sha256 hex digest'
);

set local role anon;
select throws_ok(
  $$ select count(*) from public.sign_in_attempts $$,
  '42501',
  null,
  'anon cannot read sign_in_attempts'
);
select throws_ok(
  $$ insert into public.sign_in_attempts (email_hash, succeeded) values (repeat('a', 64), true) $$,
  '42501',
  null,
  'anon cannot insert sign_in_attempts'
);
reset role;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
  '44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'dan@school-d.test', '', now(), '{}', '{}',
  now(), now(), '', '', '', ''
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select throws_ok(
  $$ select count(*) from public.sign_in_attempts $$,
  '42501',
  null,
  'a signed-in user cannot read sign_in_attempts'
);
select throws_ok(
  $$ delete from public.sign_in_attempts $$,
  '42501',
  null,
  'a signed-in user cannot clear sign_in_attempts'
);
reset role;

select * from finish();
rollback;
