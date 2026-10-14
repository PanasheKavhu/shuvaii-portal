-- pgTAP: the privacy notice acceptance, the retention clean-ups and the
-- health check (D57 to D59). Migration 20261013120000_privacy_and_retention.
--
-- Privacy: a parent claims a code only with a notice version, which is
-- stored on the invite with the time (and nothing else); the public school
-- lookup shows an active school's contact only. Retention: the clean-ups
-- delete only sign-in attempts older than 30 days, list only imports files
-- older than 30 days, clear only jobs whose file is gone, and never touch
-- audit_log, reports or marks (old rows of each are planted and survive).
-- Only the service role may call them. health_check() answers anyone.
--
-- Fixture (rolled back). School A (active) with a privacy contact, school B
-- suspended. Gwen is a guardian with a code; Pat claims it.
begin;

select plan(38);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('e3900000-0000-0000-0000-000000000001', 'pat@retention.test'),
  ('e3900000-0000-0000-0000-000000000002', 'ada@retention.test')
) as u (id, email);

insert into public.schools (id, slug, name, stage, timezone, status, privacy_contact_name, privacy_contact_email) values
  ('a3900000-0000-0000-0000-00000000000a', 'retention-a-test', 'Retention High', 'secondary', 'Africa/Harare', 'active', 'The Bursar', 'privacy@retention.test'),
  ('a3900000-0000-0000-0000-00000000000b', 'retention-b-test', 'Closed High', 'secondary', 'Africa/Harare', 'suspended', 'Someone', 'b@retention.test');
insert into public.memberships (school_id, user_id, role, status) values
  ('a3900000-0000-0000-0000-00000000000a', 'e3900000-0000-0000-0000-000000000002', 'school_admin', 'active');
insert into public.learners (id, school_id, learner_number, first_name, last_name) values
  ('f3900000-0000-0000-0000-000000000001', 'a3900000-0000-0000-0000-00000000000a', 'R-01', 'Lulu', 'Dube');
insert into public.guardians (id, school_id, full_name, email) values
  ('c3900000-0000-0000-0000-000000000001', 'a3900000-0000-0000-0000-00000000000a', 'Gwen Dube', 'gwen@retention.test');
insert into public.guardian_links (school_id, guardian_id, learner_id, relationship) values
  ('a3900000-0000-0000-0000-00000000000a', 'c3900000-0000-0000-0000-000000000001', 'f3900000-0000-0000-0000-000000000001', 'Mother');
insert into public.invites (id, school_id, role, guardian_id, code_hash, expires_at) values
  ('d3900000-0000-0000-0000-000000000001', 'a3900000-0000-0000-0000-00000000000a', 'parent',
   'c3900000-0000-0000-0000-000000000001', repeat('a', 64), now() + interval '7 days');

-- Privacy notice --------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(
  (select row(name, slug, privacy_contact_name, privacy_contact_email)::text
   from public.privacy_notice_school('retention-a-test')),
  '("Retention High",retention-a-test,"The Bursar",privacy@retention.test)',
  'Anyone can read an active school''s name and privacy contact'
);
select is(
  (select count(*) from public.privacy_notice_school('retention-b-test')),
  0::bigint,
  'A suspended school is not shown'
);
select is(
  (select count(*) from public.privacy_notice_school('no-such-school')),
  0::bigint,
  'An unknown slug shows nothing'
);
select is(
  (select school_slug from public.parent_invite_preview(repeat('a', 64))),
  'retention-a-test',
  'The code preview names the school''s slug, for the notice link'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e3900000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$ select public.redeem_parent_invite(repeat('a', 64), null) $$,
  'P0001', 'privacy_not_accepted',
  'A code cannot be claimed without accepting the privacy notice'
);
select throws_ok(
  $$ select public.redeem_parent_invite(repeat('a', 64), 'Not a version!') $$,
  'P0001', 'privacy_not_accepted',
  'A malformed notice version is refused'
);
select is(
  public.redeem_parent_invite(repeat('a', 64), '2026-10-13-draft'),
  'a3900000-0000-0000-0000-00000000000a'::uuid,
  'With the notice accepted the code is claimed'
);

reset role;
select is(
  (select privacy_notice_version from public.invites where id = 'd3900000-0000-0000-0000-000000000001'),
  '2026-10-13-draft',
  'The invite records the notice version'
);
select ok(
  (select privacy_accepted_at between now() - interval '1 minute' and now()
   from public.invites where id = 'd3900000-0000-0000-0000-000000000001'),
  'The invite records when the notice was accepted'
);
select is(
  (select new_data ->> 'privacy_notice_version' from public.audit_log
   where row_id = 'd3900000-0000-0000-0000-000000000001' and event = 'parent_invite_accepted'),
  '2026-10-13-draft',
  'The audit row names the version too'
);
select throws_ok(
  $$ update public.invites set privacy_notice_version = '2026-10-13-draft', privacy_accepted_at = null
     where id = 'd3900000-0000-0000-0000-000000000001' $$,
  '23514', null,
  'Version and time are stored together'
);
select is(
  (select count(*) from pg_proc where proname = 'redeem_parent_invite' and pronamespace = 'public'::regnamespace),
  1::bigint,
  'Only the two-argument redeem_parent_invite() exists'
);

-- Retention fixture -----------------------------------------------------------------

set local session_replication_role = replica;
insert into public.sign_in_attempts (email_hash, succeeded, created_at) values
  (repeat('1', 64), false, now() - interval '31 days'),
  (repeat('1', 64), true, now() - interval '45 days'),
  (repeat('2', 64), false, now() - interval '29 days'),
  (repeat('2', 64), false, now());
insert into storage.objects (bucket_id, name, created_at) values
  ('imports', 'a3900000-0000-0000-0000-00000000000a/people/old.xlsx', now() - interval '31 days'),
  ('imports', 'a3900000-0000-0000-0000-00000000000a/marks/new.xlsx', now() - interval '29 days'),
  ('reports', 'a3900000-0000-0000-0000-00000000000a/old-report.pdf', now() - interval '400 days'),
  ('attachments', 'a3900000-0000-0000-0000-00000000000a/old-news.pdf', now() - interval '400 days');
insert into public.import_jobs (id, school_id, kind, status, file_path, created_at) values
  ('b3900000-0000-0000-0000-000000000001', 'a3900000-0000-0000-0000-00000000000a', 'learners', 'committed',
   'a3900000-0000-0000-0000-00000000000a/people/old.xlsx', now() - interval '31 days'),
  ('b3900000-0000-0000-0000-000000000002', 'a3900000-0000-0000-0000-00000000000a', 'learners', 'validated',
   'a3900000-0000-0000-0000-00000000000a/marks/new.xlsx', now() - interval '29 days'),
  ('b3900000-0000-0000-0000-000000000003', 'a3900000-0000-0000-0000-00000000000a', 'learners', 'committed',
   'a3900000-0000-0000-0000-00000000000a/people/gone.xlsx', now() - interval '60 days');
-- Old rows the clean-ups must never touch.
insert into public.audit_log (school_id, table_name, row_id, action, event, created_at) values
  ('a3900000-0000-0000-0000-00000000000a', 'learners', 'f3900000-0000-0000-0000-000000000001', 'event', 'old_event', now() - interval '3 years');
insert into public.marks (id, school_id, assessment_id, enrolment_id, score, created_at) values
  ('b3910000-0000-0000-0000-000000000001', 'a3900000-0000-0000-0000-00000000000a',
   gen_random_uuid(), gen_random_uuid(), 50, now() - interval '3 years');
insert into public.reports (id, school_id, term_id, enrolment_id, template_id, status, created_at) values
  ('b3920000-0000-0000-0000-000000000001', 'a3900000-0000-0000-0000-00000000000a',
   gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'draft', now() - interval '3 years');
set local session_replication_role = origin;

create temporary table counts_before as
select (select count(*) from public.audit_log) as audit,
       (select count(*) from public.marks) as marks,
       (select count(*) from public.reports) as reports,
       (select count(*) from public.import_jobs) as jobs;
grant select on counts_before to service_role;

-- Who may call them -----------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e3900000-0000-0000-0000-000000000002', true);
select throws_ok($$ select public.prune_sign_in_attempts() $$, '42501', null,
  'A signed-in school admin cannot prune sign-in attempts');
select throws_ok($$ select * from public.expired_import_files() $$, '42501', null,
  'A signed-in school admin cannot list expired import files');
select throws_ok($$ select public.forget_import_files(array['x']) $$, '42501', null,
  'A signed-in school admin cannot clear import paths');
reset role;
set local role anon;
select throws_ok($$ select public.prune_sign_in_attempts() $$, '42501', null,
  'Anonymous callers cannot prune sign-in attempts');
select throws_ok($$ select * from public.expired_import_files() $$, '42501', null,
  'Anonymous callers cannot list expired import files');
select is(public.health_check(), true, 'Anyone can call the health check');
select is(
  (select prorettype::regtype::text from pg_proc where proname = 'health_check'),
  'boolean',
  'The health check returns only yes or no'
);

-- Sign-in attempts ------------------------------------------------------------------

reset role;
set local role service_role;
select is(public.prune_sign_in_attempts(), 2, 'Two attempts older than 30 days are deleted');
select is(
  (select count(*) from public.sign_in_attempts where email_hash = repeat('2', 64)),
  2::bigint,
  'Attempts from the last 30 days are kept'
);
select is(
  (select count(*) from public.sign_in_attempts where created_at < now() - interval '30 days'),
  0::bigint,
  'No attempt older than 30 days is left'
);
select is(public.prune_sign_in_attempts(), 0, 'Running it again deletes nothing');

-- Import files ----------------------------------------------------------------------

select is(
  (select array_agg(name) from public.expired_import_files()),
  array['a3900000-0000-0000-0000-00000000000a/people/old.xlsx'],
  'Only imports files older than 30 days are listed (not newer ones, not other buckets)'
);
select is(
  (select count(*) from public.expired_import_files(0)),
  1::bigint,
  'A limit below 1 still lists at least one file'
);
select is(
  public.forget_import_files(array['a3900000-0000-0000-0000-00000000000a/people/old.xlsx']),
  0,
  'A job keeps its path while its file still exists'
);

-- The route deletes the file through the Storage API; here, as postgres,
-- with the storage delete guard bypassed the same way.
reset role;
set local session_replication_role = replica;
delete from storage.objects where name = 'a3900000-0000-0000-0000-00000000000a/people/old.xlsx';
set local session_replication_role = origin;
set local role service_role;

select is(
  public.forget_import_files(array[
    'a3900000-0000-0000-0000-00000000000a/people/old.xlsx',
    'a3900000-0000-0000-0000-00000000000a/people/gone.xlsx'
  ]),
  2,
  'Jobs whose files are gone have their path cleared'
);
select is(
  (select row(file_path, file_deleted_at is not null, status)::text from public.import_jobs
   where id = 'b3900000-0000-0000-0000-000000000001'),
  '(,t,committed)',
  'The job row stays, with no path and the time the file went'
);
select is(
  (select file_path from public.import_jobs where id = 'b3900000-0000-0000-0000-000000000002'),
  'a3900000-0000-0000-0000-00000000000a/marks/new.xlsx',
  'A newer job keeps its file'
);
select is(
  (select count(*) from public.expired_import_files()),
  0::bigint,
  'Nothing is left to delete'
);

-- What must never change ------------------------------------------------------------

select is((select count(*) from public.audit_log), (select audit from counts_before),
  'audit_log has the same rows');
select ok(exists (select 1 from public.audit_log where event = 'old_event'),
  'A three-year-old audit row is still there');
select is((select count(*) from public.marks), (select marks from counts_before),
  'marks has the same rows');
select ok(exists (select 1 from public.marks where id = 'b3910000-0000-0000-0000-000000000001'),
  'A three-year-old mark is still there');
select is((select count(*) from public.reports), (select reports from counts_before),
  'reports has the same rows');
select ok(exists (select 1 from public.reports where id = 'b3920000-0000-0000-0000-000000000001'),
  'A three-year-old report is still there');
select is((select count(*) from public.import_jobs), (select jobs from counts_before),
  'No import job row is deleted');
select ok(
  (select count(*) from storage.objects where bucket_id in ('reports', 'attachments')
     and name like 'a3900000-0000-0000-0000-00000000000a/old-%') = 2,
  'Old report and announcement files are not listed or touched'
);

reset role;
select * from finish();
rollback;
