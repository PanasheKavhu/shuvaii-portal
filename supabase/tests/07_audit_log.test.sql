-- pgTAP: audit_log (supabase/migrations/20261007134109_audit_log.sql, D18).
-- Readable by that school's admin and head only, append-only for everyone,
-- written by the membership trigger, the schools console-event trigger and
-- log_invite_event().
--
-- Fixture: schools K and L. Kim is K's admin, Kai K's head, Kit a K teacher;
-- Lou is L's admin; Pat is a platform admin. Rolled back at the end.
begin;

select plan(22);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('b3333333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'kim@school-k.test', '', now(), '{}', '{}',
   now(), now(), '', '', '', ''),
  ('b3333333-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'kai@school-k.test', '', now(), '{}', '{}',
   now(), now(), '', '', '', ''),
  ('b3333333-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'kit@school-k.test', '', now(), '{}', '{}',
   now(), now(), '', '', '', ''),
  ('b3333333-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'lou@school-l.test', '', now(), '{}', '{}',
   now(), now(), '', '', '', ''),
  ('b3333333-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pat@platform.test', '', now(), '{}', '{}',
   now(), now(), '', '', '', '');

insert into public.platform_admins (user_id) values ('b3333333-0000-0000-0000-000000000005');

insert into public.schools (id, slug, name, stage)
values
  ('e3000000-0000-0000-0000-00000000000a', 'school-k-test', 'School K', 'secondary'),
  ('e3000000-0000-0000-0000-00000000000b', 'school-l-test', 'School L', 'primary');

insert into public.memberships (id, school_id, user_id, role, status)
values
  ('d3333333-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-00000000000a',
   'b3333333-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('d3333333-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-00000000000a',
   'b3333333-0000-0000-0000-000000000002', 'head', 'active'),
  ('d3333333-0000-0000-0000-000000000003', 'e3000000-0000-0000-0000-00000000000a',
   'b3333333-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('d3333333-0000-0000-0000-000000000004', 'e3000000-0000-0000-0000-00000000000b',
   'b3333333-0000-0000-0000-000000000004', 'school_admin', 'active');

-- Fixture writes were audited --------------------------------------------------

select is(
  (select count(*) from public.audit_log
   where table_name = 'memberships' and action = 'insert'
     and school_id = 'e3000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'Inserting a membership writes one audit row against its school'
);

select is(
  (select event from public.audit_log
   where table_name = 'schools' and row_id = 'e3000000-0000-0000-0000-00000000000a'),
  'school_created',
  'Creating a school records a school_created event against it'
);

-- Reading: school admin and head of that school only ------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b3333333-0000-0000-0000-000000000001', true);

select isnt_empty(
  $$ select 1 from public.audit_log where school_id = 'e3000000-0000-0000-0000-00000000000a' $$,
  'School K''s admin can read K''s audit rows'
);

select is_empty(
  $$ select 1 from public.audit_log where school_id = 'e3000000-0000-0000-0000-00000000000b' $$,
  'School K''s admin cannot read school L''s audit rows'
);

select set_config('request.jwt.claim.sub', 'b3333333-0000-0000-0000-000000000002', true);

select isnt_empty(
  $$ select 1 from public.audit_log where school_id = 'e3000000-0000-0000-0000-00000000000a' $$,
  'School K''s head can read K''s audit rows'
);

select set_config('request.jwt.claim.sub', 'b3333333-0000-0000-0000-000000000003', true);

select is_empty($$ select 1 from public.audit_log $$, 'A teacher reads no audit rows');

select set_config('request.jwt.claim.sub', 'b3333333-0000-0000-0000-000000000005', true);

select is_empty($$ select 1 from public.audit_log $$, 'A platform admin reads no audit rows');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is_empty($$ select 1 from public.audit_log $$, 'Anonymous users read no audit rows');

-- Append-only ------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b3333333-0000-0000-0000-000000000001', true);

select throws_ok(
  $$ update public.audit_log set reason = 'tampered' $$,
  '42501', null, 'A school admin cannot update audit rows'
);

select throws_ok(
  $$ delete from public.audit_log $$,
  '42501', null, 'A school admin cannot delete audit rows'
);

select throws_ok(
  $$ insert into public.audit_log (school_id, table_name, row_id, action)
     values ('e3000000-0000-0000-0000-00000000000a', 'memberships',
             'd3333333-0000-0000-0000-000000000003', 'update') $$,
  '42501', null, 'A school admin cannot insert audit rows directly'
);

reset role;
set local role service_role;

select throws_ok(
  $$ delete from public.audit_log $$,
  '42501', null, 'The service role cannot delete audit rows'
);

reset role;

select throws_ok(
  $$ update public.audit_log set reason = 'tampered' $$,
  'P0001', 'audit_log is append-only', 'Even the table owner cannot update audit rows'
);

select throws_ok(
  $$ delete from public.audit_log $$,
  'P0001', 'audit_log is append-only', 'Even the table owner cannot delete audit rows'
);

select throws_ok(
  $$ truncate public.audit_log $$,
  'P0001', 'audit_log is append-only', 'Even the table owner cannot truncate audit_log'
);

-- A membership role change writes exactly one row ---------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b3333333-0000-0000-0000-000000000001', true);

update public.memberships set role = 'hod' where id = 'd3333333-0000-0000-0000-000000000003';

reset role;

select is(
  (select count(*) from public.audit_log
   where row_id = 'd3333333-0000-0000-0000-000000000003' and action = 'update'),
  1::bigint,
  'A membership role change writes one audit row'
);

select is(
  (select array[actor_id::text, old_data ->> 'role', new_data ->> 'role']
   from public.audit_log
   where row_id = 'd3333333-0000-0000-0000-000000000003' and action = 'update'),
  array['b3333333-0000-0000-0000-000000000001', 'teacher', 'hod'],
  'The row records the actor and the old and new role'
);

-- Console events ------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b3333333-0000-0000-0000-000000000005', true);

update public.schools set primary_color = '#7a1fa2' where id = 'e3000000-0000-0000-0000-00000000000a';
update public.schools set motto = 'Onwards' where id = 'e3000000-0000-0000-0000-00000000000a';

reset role;

select is(
  (select array_agg(new_data ->> 'primary_color') from public.audit_log
   where row_id = 'e3000000-0000-0000-0000-00000000000a' and event = 'branding_changed'),
  array['#7a1fa2'],
  'A colour change records one branding_changed event; a motto change records none'
);

set local role authenticated;

select lives_ok(
  $$ select public.log_invite_event('d3333333-0000-0000-0000-000000000004', 'invite_resent') $$,
  'A platform admin can log an invite event'
);

reset role;

select is(
  (select school_id::text from public.audit_log
   where event = 'invite_resent' and row_id = 'd3333333-0000-0000-0000-000000000004'),
  'e3000000-0000-0000-0000-00000000000b',
  'The invite event is recorded against the membership''s school'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b3333333-0000-0000-0000-000000000001', true);

select throws_ok(
  $$ select public.log_invite_event('d3333333-0000-0000-0000-000000000001', 'invite_resent') $$,
  'P0001', 'only a platform admin can log invite events',
  'A school admin cannot log invite events'
);

select set_config('request.jwt.claim.sub', 'b3333333-0000-0000-0000-000000000005', true);

select throws_ok(
  $$ select public.log_invite_event('d3333333-0000-0000-0000-000000000003', 'admin_invited') $$,
  'P0001', null, 'Invite events only apply to school_admin memberships'
);

reset role;

select * from finish();
rollback;
