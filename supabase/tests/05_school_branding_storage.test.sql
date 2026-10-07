-- pgTAP: the school-branding Storage bucket and its policies
-- (supabase/migrations/20261007125708_school_branding_bucket.sql, D15).
-- Only a platform admin may upload, only into an existing school's folder;
-- school admins, teachers of another school and anonymous users may not.
--
-- Fixture: schools F and G; F has an admin (Flo); G has a teacher (Gil); a
-- platform admin (Pia). Rolled back at the end.
begin;

select plan(9);

select ok(
  (select public from storage.buckets where id = 'school-branding'),
  'school-branding bucket exists and is public'
);

select ok(
  (select not ('image/svg+xml' = any (allowed_mime_types)) and file_size_limit = 1048576
   from storage.buckets where id = 'school-branding'),
  'bucket rejects SVG and files over 1 MB'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('a1111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'flo@school-f.test', '', now(), '{}', '{}',
   now(), now(), '', '', '', ''),
  ('a1111111-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gil@school-g.test', '', now(), '{}', '{}',
   now(), now(), '', '', '', ''),
  ('a1111111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pia@platform.test', '', now(), '{}', '{}',
   now(), now(), '', '', '', '');

insert into public.platform_admins (user_id) values ('a1111111-0000-0000-0000-000000000003');

insert into public.schools (id, slug, name, stage)
values
  ('f0000000-0000-0000-0000-00000000000f', 'school-f-test', 'School F', 'primary'),
  ('f0000000-0000-0000-0000-00000000000a', 'school-g-test', 'School G', 'primary');

insert into public.memberships (school_id, user_id, role, status)
values
  ('f0000000-0000-0000-0000-00000000000f', 'a1111111-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('f0000000-0000-0000-0000-00000000000a', 'a1111111-0000-0000-0000-000000000002', 'teacher', 'active');

set local role authenticated;

-- Pia, platform admin ------------------------------------------------------
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000003', true);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('school-branding', 'f0000000-0000-0000-0000-00000000000f/logo-1.png', 'a1111111-0000-0000-0000-000000000003') $$,
  'Platform admin can upload a logo into a school''s folder'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('school-branding', 'not-a-school/logo-1.png', 'a1111111-0000-0000-0000-000000000003') $$,
  '42501', null,
  'Platform admin cannot upload outside a school folder'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('school-branding', 'logo-1.png', 'a1111111-0000-0000-0000-000000000003') $$,
  '42501', null,
  'Platform admin cannot upload to the bucket root'
);

-- Flo, school F's admin: branding is platform-admin only (D3) ---------------
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000001', true);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('school-branding', 'f0000000-0000-0000-0000-00000000000f/logo-2.png', 'a1111111-0000-0000-0000-000000000001') $$,
  '42501', null,
  'School admin cannot upload their own school''s logo'
);

select is_empty(
  $$ update storage.objects set name = 'f0000000-0000-0000-0000-00000000000f/logo-hacked.png'
     where bucket_id = 'school-branding' returning 1 $$,
  'School admin cannot rename or replace a logo'
);

-- Gil, teacher at school G, aiming at school F's folder --------------------
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000002', true);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('school-branding', 'f0000000-0000-0000-0000-00000000000f/logo-3.png', 'a1111111-0000-0000-0000-000000000002') $$,
  '42501', null,
  'A teacher from another school cannot upload into school F''s folder'
);

-- Anonymous ---------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('school-branding', 'f0000000-0000-0000-0000-00000000000f/logo-4.png') $$,
  '42501', null,
  'Anonymous users cannot upload'
);

select * from finish();
rollback;
