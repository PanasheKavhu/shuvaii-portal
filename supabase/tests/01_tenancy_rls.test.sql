-- pgTAP: cross-school isolation and anonymous access for the tenancy
-- tables (schools, profiles, platform_admins, memberships). See
-- docs/DATA_MODEL.md section 7 and CLAUDE.md rule 1.
--
-- Fixture: two schools (A, B). School A has an admin (Alice) and two plain
-- teachers (Dana, Eve); school B has an admin (Bob). Both the fixture and
-- every assertion run inside this file's transaction and are rolled back at
-- the end, so nothing here touches real seed data.
begin;

select plan(13);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alice@school-a.test', '', now(), '{}', '{}',
   now(), now(), '', '', '', ''),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bob@school-b.test', '', now(), '{}', '{}',
   now(), now(), '', '', '', ''),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dana@school-a.test', '', now(), '{}', '{}',
   now(), now(), '', '', '', ''),
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'eve@school-a.test', '', now(), '{}', '{}',
   now(), now(), '', '', '', '');
-- public.profiles rows for all four are created by on_auth_user_created.

insert into public.schools (id, slug, name, stage, timezone, status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'school-a-test', 'School A', 'secondary', 'Africa/Harare', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'school-b-test', 'School B', 'secondary', 'Africa/Harare', 'active');

insert into public.memberships (id, school_id, user_id, role, status)
values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'school_admin', 'active'),
  ('c2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '22222222-2222-2222-2222-222222222222', 'school_admin', 'active'),
  ('c4444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '44444444-4444-4444-4444-444444444444', 'teacher', 'active'),
  ('c5555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '55555555-5555-5555-5555-555555555555', 'teacher', 'active');

-- Act as Alice, school A's admin.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

select is(
  (select count(*) from public.schools where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1::bigint,
  'Alice can read her own school'
);

select is(
  (select count(*) from public.schools where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  0::bigint,
  'Alice cannot read school B'
);

select is(
  (select count(*) from public.memberships where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  0::bigint,
  'Alice cannot read school B''s memberships'
);

select is_empty(
  $$ update public.schools set name = 'Hijacked' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$,
  'Alice cannot write to school B'
);

select is_empty(
  $$ update public.memberships set status = 'disabled' where school_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1 $$,
  'Alice cannot write to school B''s memberships'
);

select is(
  (select count(*) from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  0::bigint,
  'Alice cannot read Bob''s profile: they share no school'
);

-- Act as Bob, school B's admin, to prove the same holds in reverse.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select is(
  (select count(*) from public.schools where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0::bigint,
  'Bob cannot read school A'
);

-- Act as Dana, an ordinary teacher (no admin/head role) in school A: she
-- should still see a colleague's profile, but not their membership row —
-- membership visibility is admin/head-only. This is the case
-- school_ids_for() exists to make work (see rls_helper_functions.sql).
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);

select is(
  (select count(*) from public.profiles where id = '55555555-5555-5555-5555-555555555555'),
  1::bigint,
  'Dana, a plain teacher, can read a colleague''s profile'
);

select is(
  (select count(*) from public.memberships where user_id = '55555555-5555-5555-5555-555555555555'),
  0::bigint,
  'Dana cannot read a colleague''s membership row (admin/head only)'
);

-- Anonymous: no JWT at all.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is((select count(*) from public.schools), 0::bigint, 'Anonymous reads no schools');
select is((select count(*) from public.profiles), 0::bigint, 'Anonymous reads no profiles');
select is((select count(*) from public.memberships), 0::bigint, 'Anonymous reads no memberships');
select is((select count(*) from public.platform_admins), 0::bigint, 'Anonymous reads no platform_admins');

select * from finish();

rollback;
