-- pgTAP: column and value guards on the tenancy tables (see
-- supabase/migrations/20261007070945_tenancy_write_guards.sql), plus the
-- platform-admin directions not covered by 01_tenancy_rls.
--
-- Fixture: school D with an admin (Fay) and a head (Gus); a platform admin
-- (Pat) with no school membership. Rolled back at the end.
begin;

select plan(15);

select hasnt_function(
  'public', 'school_ids_for',
  'school_ids_for() is not in public, so it is not an RPC endpoint'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fay@school-d.test', '', now(), '{}', '{}',
   now(), now(), '', '', '', ''),
  ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gus@school-d.test', '', now(), '{}', '{}',
   now(), now(), '', '', '', ''),
  ('88888888-8888-8888-8888-888888888888', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pat@platform.test', '', now(), '{}', '{}',
   now(), now(), '', '', '', '');

insert into public.platform_admins (user_id) values ('88888888-8888-8888-8888-888888888888');

insert into public.schools (id, slug, name, stage, status, primary_color)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'school-d-test', 'School D', 'primary', 'suspended', '#0B5FA5');

insert into public.memberships (id, school_id, user_id, role, status)
values
  ('e6666666-6666-6666-6666-666666666666', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '66666666-6666-6666-6666-666666666666', 'school_admin', 'active'),
  ('e7777777-7777-7777-7777-777777777777', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   '77777777-7777-7777-7777-777777777777', 'head', 'active');

set local role authenticated;

-- Gus, the head (not admin): no school writes at all ------------------------
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);

select is_empty(
  $$ update public.schools set motto = 'Head was here' where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' returning 1 $$,
  'A head cannot edit school details (school admin only)'
);

-- Fay, school D's admin -----------------------------------------------------
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);

select lives_ok(
  $$ update public.schools set motto = 'Onward', report_footer_text = 'Signed copy only'
     where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  'School admin can edit contact and report details'
);

select throws_like(
  $$ update public.schools set status = 'active' where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  '%only a platform admin%',
  'School admin cannot reactivate a suspended school'
);

select throws_like(
  $$ update public.schools set primary_color = '#000000' where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  '%only a platform admin%',
  'School admin cannot change branding colours'
);

select throws_like(
  $$ update public.schools set feature_flags = '{"newsletter":false}' where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  '%only a platform admin%',
  'School admin cannot change feature flags'
);

select throws_like(
  $$ update public.memberships set user_id = '66666666-6666-6666-6666-666666666666'
     where id = 'e7777777-7777-7777-7777-777777777777' $$,
  '%cannot change%',
  'School admin cannot repoint the head''s membership at herself'
);

select throws_like(
  $$ insert into public.memberships (school_id, user_id, role)
     values ('dddddddd-dddd-dddd-dddd-dddddddddddd', '66666666-6666-6666-6666-666666666666', 'head') $$,
  '%cannot grant themselves%',
  'School admin cannot grant herself another role'
);

select lives_ok(
  $$ update public.memberships set status = 'disabled' where id = 'e7777777-7777-7777-7777-777777777777' $$,
  'School admin can disable another member'
);

select lives_ok(
  $$ update public.profiles set full_name = 'Fay Moyo', phone = '0770000000'
     where id = '66666666-6666-6666-6666-666666666666' $$,
  'A person can edit their own name and phone'
);

select throws_ok(
  $$ update public.profiles set email = 'other@example.test' where id = '66666666-6666-6666-6666-666666666666' $$,
  '42501',
  null,
  'A person cannot edit their own profile email (mirrors auth.users)'
);

-- Pat, platform admin with no membership ------------------------------------
select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', true);

select lives_ok(
  $$ update public.schools set status = 'active', primary_color = '#1B7F5C'
     where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' $$,
  'Platform admin can change status and branding'
);

select lives_ok(
  $$ insert into public.schools (slug, name, stage) values ('school-e-test', 'School E', 'combined') $$,
  'Platform admin can create a school'
);

select lives_ok(
  $$ insert into public.memberships (school_id, user_id, role)
     values ('dddddddd-dddd-dddd-dddd-dddddddddddd', '77777777-7777-7777-7777-777777777777', 'teacher') $$,
  'Platform admin can add a membership (bootstrapping a school)'
);

select is(
  (select count(*) from public.profiles where id = '66666666-6666-6666-6666-666666666666'),
  0::bigint,
  'Platform admin gets no blanket read of profiles'
);

select * from finish();

rollback;
