-- pgTAP: a member cannot change their own role (CLAUDE.md rule 1 /
-- docs/DATA_MODEL.md section 7), even when they are also their school's
-- admin and the write policy would otherwise allow the update. See
-- prevent_self_role_change() in
-- supabase/migrations/20261007070936_memberships.sql.
begin;

select plan(3);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
  '33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'carol@school-c.test', '', now(), '{}', '{}',
  now(), now(), '', '', '', ''
);

insert into public.schools (id, slug, name, stage, timezone, status)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'school-c-test', 'School C', 'secondary', 'Africa/Harare', 'active');

insert into public.memberships (id, school_id, user_id, role, status)
values (
  'd3333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '33333333-3333-3333-3333-333333333333', 'school_admin', 'active'
);

-- Act as Carol, who is school C's school_admin — the write policy alone
-- would let her update this row.
set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);

select throws_like(
  $$ update public.memberships set role = 'head' where id = 'd3333333-3333-3333-3333-333333333333' $$,
  '%members cannot change their own role%',
  'Carol cannot change her own role, even as school_admin'
);

select lives_ok(
  $$ update public.memberships set status = 'active' where id = 'd3333333-3333-3333-3333-333333333333' $$,
  'Carol can still update her own membership when the role does not change'
);

reset role;

select is(
  (select role from public.memberships where id = 'd3333333-3333-3333-3333-333333333333'),
  'school_admin'::public.app_role,
  'Her role is unchanged after the blocked attempt'
);

select * from finish();

rollback;
