-- pgTAP: automatic learner numbers (D64). Migration
-- 20261017140423_auto_learner_numbers.
--
-- The prefix from a school's name; a blank number refused while the
-- school's switch is off and made while it is on (by insert and by
-- import_learners), in order, skipping numbers already taken in any case;
-- numbers the school gives kept as they are; each school counting on its
-- own; and the switch audited like the other features.
--
-- Fixture (rolled back). School A "Test High School" with its admin Ada;
-- school B "St Mary's" with its admin Bea. Pam is a platform admin.
begin;

select plan(19);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('e4100000-0000-0000-0000-000000000001', 'pam@numbers.test'),
  ('e4100000-0000-0000-0000-000000000002', 'ada@numbers.test'),
  ('e4100000-0000-0000-0000-000000000003', 'bea@numbers.test')
) as u (id, email);

insert into public.platform_admins (user_id) values ('e4100000-0000-0000-0000-000000000001');
insert into public.schools (id, slug, name, stage, timezone) values
  ('a4100000-0000-0000-0000-00000000000a', 'numbers-a-test', 'Test High School', 'secondary', 'Africa/Harare'),
  ('a4100000-0000-0000-0000-00000000000b', 'numbers-b-test', 'St Mary''s', 'secondary', 'Africa/Harare');
insert into public.memberships (school_id, user_id, role, status) values
  ('a4100000-0000-0000-0000-00000000000a', 'e4100000-0000-0000-0000-000000000002', 'school_admin', 'active'),
  ('a4100000-0000-0000-0000-00000000000b', 'e4100000-0000-0000-0000-000000000003', 'school_admin', 'active');

create function pg_temp.as_user(p_id text)
returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

-- The prefix ----------------------------------------------------------------------------

select is(private.learner_number_prefix('Test High School'), 'TH', 'Test High School is TH');
select is(private.learner_number_prefix('Msasa Demo High School'), 'MDH', 'small words and School left out');
select is(private.learner_number_prefix('St Mary''s'), 'SM', 'apostrophes do not split a word');
select is(private.learner_number_prefix('The College of Saint Ignatius and Peter Kudzai'), 'CSIP',
  'at most four letters');
select is(private.learner_number_prefix('Chisipite'), 'CHI', 'a one-word name gives three letters');

set local role authenticated;

-- Off (the default) -----------------------------------------------------------------------

select pg_temp.as_user('e4100000-0000-0000-0000-000000000002');
select throws_ok(
  $$ insert into public.learners (school_id, learner_number, first_name, last_name)
     values ('a4100000-0000-0000-0000-00000000000a', ' ', 'Rudo', 'Moyo') $$,
  '23502', 'learner number is required', 'a blank number is refused while the switch is off');
select throws_ok(
  $$ select public.import_learners('a4100000-0000-0000-0000-00000000000a', '[]',
       '[{"learner_number": null, "first_name": "Rudo", "last_name": "Moyo"}]') $$,
  '23502', 'learner number is required', 'and through an import');

-- On ------------------------------------------------------------------------------------

select pg_temp.as_user('e4100000-0000-0000-0000-000000000001');
select lives_ok(
  $$ select public.set_school_feature('a4100000-0000-0000-0000-00000000000a', 'auto_learner_numbers', true) $$,
  'a platform admin turns automatic learner numbers on');
reset role;
select is(
  (select new_data from public.audit_log
    where school_id = 'a4100000-0000-0000-0000-00000000000a' and event = 'feature_changed'),
  '{"auto_learner_numbers": true}'::jsonb, 'the switch is a feature_changed event');
-- Taken already, in another case: the counter starts after it and steps over it.
insert into public.learners (school_id, learner_number, first_name, last_name) values
  ('a4100000-0000-0000-0000-00000000000a',
   'th' || to_char(now() at time zone 'Africa/Harare', 'YY') || '0002', 'Old', 'One');
set local role authenticated;

select pg_temp.as_user('e4100000-0000-0000-0000-000000000002');
select lives_ok(
  $$ insert into public.learners (school_id, learner_number, first_name, last_name)
     values ('a4100000-0000-0000-0000-00000000000a', '', 'Rudo', 'Moyo') $$,
  'a blank number is made while the switch is on');
select is(
  (select learner_number from public.learners where first_name = 'Rudo'
     and school_id = 'a4100000-0000-0000-0000-00000000000a'),
  'TH' || to_char(now() at time zone 'Africa/Harare', 'YY') || '0003',
  'it is the next after the highest of this pattern, e.g. TH260003');
select lives_ok(
  $$ select public.import_learners('a4100000-0000-0000-0000-00000000000a', '[]',
       '[{"learner_number": null, "first_name": "Tino", "last_name": "Moyo"},
         {"learner_number": "OWN-7", "first_name": "Kuda", "last_name": "Moyo"},
         {"first_name": "Chipo", "last_name": "Banda"}]') $$,
  'an import with blank, given and missing numbers');
select is(
  (select array_agg(learner_number order by learner_number) from public.learners
    where school_id = 'a4100000-0000-0000-0000-00000000000a' and first_name in ('Tino', 'Kuda', 'Chipo')),
  array[
    'OWN-7',
    'TH' || to_char(now() at time zone 'Africa/Harare', 'YY') || '0004',
    'TH' || to_char(now() at time zone 'Africa/Harare', 'YY') || '0005'
  ],
  'blank ones get the next numbers in file order, given ones are kept');
select is(
  (select learner_number from public.learners where first_name = 'Tino'),
  'TH' || to_char(now() at time zone 'Africa/Harare', 'YY') || '0004',
  'in the order of the file');
select throws_ok(
  $$ update public.learners set learner_number = ''
     where school_id = 'a4100000-0000-0000-0000-00000000000a' and first_name = 'Tino' $$,
  '23514', null, 'an existing number cannot be blanked');

-- Another school counts on its own and keeps its own rule. ------------------------------

select pg_temp.as_user('e4100000-0000-0000-0000-000000000003');
select throws_ok(
  $$ insert into public.learners (school_id, learner_number, first_name, last_name)
     values ('a4100000-0000-0000-0000-00000000000b', null, 'Bo', 'Other') $$,
  '23502', 'learner number is required', 'a school with the switch off still needs numbers');
select pg_temp.as_user('e4100000-0000-0000-0000-000000000001');
select lives_ok(
  $$ select public.set_school_feature('a4100000-0000-0000-0000-00000000000b', 'auto_learner_numbers', true) $$,
  'switched on for school B too');
select pg_temp.as_user('e4100000-0000-0000-0000-000000000003');
select lives_ok(
  $$ insert into public.learners (school_id, learner_number, first_name, last_name)
     values ('a4100000-0000-0000-0000-00000000000b', null, 'Bo', 'Other') $$,
  'school B adds a learner without a number');
select is(
  (select learner_number from public.learners where first_name = 'Bo'),
  'SM' || to_char(now() at time zone 'Africa/Harare', 'YY') || '0001',
  'school B starts at its own 0001');

select * from finish();
rollback;
