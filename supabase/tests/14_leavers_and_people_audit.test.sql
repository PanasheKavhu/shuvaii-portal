-- pgTAP: Phase 2 review fixes
-- (supabase/migrations/20261008123333_leavers_and_people_audit.sql, D28).
-- Covers a leaver's login membership being disabled and restored, a parent
-- code refused for a parent the school disabled, audit rows for guardians,
-- guardian links and enrolments (an unlink keeps the old link),
-- set_primary_guardian() and is_class_teacher().
--
-- Fixture (rolled back at the end). School A: Alice (admin), Tom (class
-- teacher of 2 Blue), Lia (learner account for learner L1), Paul (parent,
-- disabled). Guardian G1 (linked to L1), guardian G2 for Paul's new code.
begin;

select plan(16);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', jsonb_build_object('full_name', u.name), now(), now(), '', '', '', ''
from (values
  ('f5000000-0000-0000-0000-000000000001', 'alice@leavers.test', 'Alice Admin'),
  ('f5000000-0000-0000-0000-000000000002', 'tom@leavers.test', 'Tom Teacher'),
  ('f5000000-0000-0000-0000-000000000003', 'lia@leavers.test', 'Lia Learner'),
  ('f5000000-0000-0000-0000-000000000004', 'paul@leavers.test', 'Paul Parent')
) as u (id, email, name);

insert into public.schools (id, slug, name, stage)
values ('a5500000-0000-0000-0000-00000000000a', 'leavers-a-test', 'Leavers School A', 'secondary');

insert into public.memberships (school_id, user_id, role, status)
values
  ('a5500000-0000-0000-0000-00000000000a', 'f5000000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a5500000-0000-0000-0000-00000000000a', 'f5000000-0000-0000-0000-000000000002', 'teacher', 'active'),
  ('a5500000-0000-0000-0000-00000000000a', 'f5000000-0000-0000-0000-000000000003', 'learner', 'active'),
  ('a5500000-0000-0000-0000-00000000000a', 'f5000000-0000-0000-0000-000000000004', 'parent', 'disabled');

insert into public.grading_scales (id, school_id, name, stage) values
  ('a5600000-0000-0000-0000-00000000000a', 'a5500000-0000-0000-0000-00000000000a', 'O level', 'o_level');
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values
  ('a5700000-0000-0000-0000-00000000000a', 'a5500000-0000-0000-0000-00000000000a', 'Form 2', 'o_level', 'a5600000-0000-0000-0000-00000000000a');
insert into public.academic_years (id, school_id, label, starts_on, ends_on, is_current) values
  ('a5800000-0000-0000-0000-00000000000a', 'a5500000-0000-0000-0000-00000000000a', '2027', '2027-01-12', '2027-12-03', true);
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ('a5900000-0000-0000-0000-000000000001', 'a5500000-0000-0000-0000-00000000000a', 'a5800000-0000-0000-0000-00000000000a', 'a5700000-0000-0000-0000-00000000000a', '2 Blue', 'f5000000-0000-0000-0000-000000000002'),
  ('a5900000-0000-0000-0000-000000000002', 'a5500000-0000-0000-0000-00000000000a', 'a5800000-0000-0000-0000-00000000000a', 'a5700000-0000-0000-0000-00000000000a', '2 Green', null);

insert into public.learners (id, school_id, learner_number, first_name, last_name, user_id) values
  ('a5a00000-0000-0000-0000-000000000001', 'a5500000-0000-0000-0000-00000000000a', 'L1', 'Lia', 'Moyo', 'f5000000-0000-0000-0000-000000000003');
insert into public.guardians (id, school_id, full_name, phone) values
  ('a5b00000-0000-0000-0000-000000000001', 'a5500000-0000-0000-0000-00000000000a', 'Gina Moyo', '0772100001'),
  ('a5b00000-0000-0000-0000-000000000002', 'a5500000-0000-0000-0000-00000000000a', 'Paul Moyo', '0772100002');
insert into public.guardian_links (id, school_id, guardian_id, learner_id, relationship, is_primary) values
  ('a5c00000-0000-0000-0000-000000000001', 'a5500000-0000-0000-0000-00000000000a', 'a5b00000-0000-0000-0000-000000000001', 'a5a00000-0000-0000-0000-000000000001', 'mother', true),
  ('a5c00000-0000-0000-0000-000000000002', 'a5500000-0000-0000-0000-00000000000a', 'a5b00000-0000-0000-0000-000000000002', 'a5a00000-0000-0000-0000-000000000001', 'father', false);

set local role authenticated;

-- is_class_teacher() ----------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'f5000000-0000-0000-0000-000000000002', true);
select ok(public.is_class_teacher('a5900000-0000-0000-0000-000000000001'), 'Tom is the class teacher of 2 Blue');
select ok(not public.is_class_teacher('a5900000-0000-0000-0000-000000000002'), 'Tom is not the class teacher of 2 Green');

-- The school admin --------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'f5000000-0000-0000-0000-000000000001', true);

select ok(public.is_class_teacher('a5900000-0000-0000-0000-000000000001') = false, 'The admin is not a class teacher');

update public.learners set status = 'left' where id = 'a5a00000-0000-0000-0000-000000000001';
select is(
  (select status::text from public.memberships where user_id = 'f5000000-0000-0000-0000-000000000003'),
  'disabled',
  'A learner marked left loses their login membership'
);

update public.learners set first_name = 'Lia R' where id = 'a5a00000-0000-0000-0000-000000000001';
select is(
  (select status::text from public.memberships where user_id = 'f5000000-0000-0000-0000-000000000003'),
  'disabled',
  'Other learner edits leave it disabled'
);

update public.learners set status = 'active' where id = 'a5a00000-0000-0000-0000-000000000001';
select is(
  (select status::text from public.memberships where user_id = 'f5000000-0000-0000-0000-000000000003'),
  'active',
  'A learner who returns gets their login back'
);

insert into public.enrolments (id, school_id, learner_id, academic_year_id, class_id) values
  ('a5d00000-0000-0000-0000-000000000001', 'a5500000-0000-0000-0000-00000000000a', 'a5a00000-0000-0000-0000-000000000001', 'a5800000-0000-0000-0000-00000000000a', 'a5900000-0000-0000-0000-000000000001');
select is(
  (select count(*) from public.audit_log where table_name = 'enrolments' and row_id = 'a5d00000-0000-0000-0000-000000000001' and action = 'insert'),
  1::bigint,
  'An enrolment writes an audit row'
);

update public.guardians set phone = '0772100009' where id = 'a5b00000-0000-0000-0000-000000000001';
select is(
  (select count(*) from public.audit_log where table_name = 'guardians' and row_id = 'a5b00000-0000-0000-0000-000000000001' and action = 'update'),
  1::bigint,
  'A guardian change writes an audit row'
);

select lives_ok(
  $$ select public.set_primary_guardian('a5c00000-0000-0000-0000-000000000002') $$,
  'The admin makes the father the primary guardian'
);
select results_eq(
  $$ select id::text from public.guardian_links where learner_id = 'a5a00000-0000-0000-0000-000000000001' and is_primary $$,
  $$ values ('a5c00000-0000-0000-0000-000000000002') $$,
  'He is now the only primary guardian'
);

delete from public.guardian_links where id = 'a5c00000-0000-0000-0000-000000000002';
select is(
  (select old_data ->> 'guardian_id' from public.audit_log where table_name = 'guardian_links' and row_id = 'a5c00000-0000-0000-0000-000000000002' and action = 'delete'),
  'a5b00000-0000-0000-0000-000000000002',
  'Unlinking a guardian keeps the old link in the audit log'
);
select is(
  (select actor_id from public.audit_log where table_name = 'guardian_links' and action = 'delete' and row_id = 'a5c00000-0000-0000-0000-000000000002'),
  'f5000000-0000-0000-0000-000000000001'::uuid,
  'and who unlinked it'
);

select lives_ok(
  $$ select * from public.create_parent_invite('a5b00000-0000-0000-0000-000000000002', repeat('5', 64)) $$,
  'The admin makes a code for guardian G2'
);

-- Paul, a parent the school disabled ---------------------------------------------------------
select set_config('request.jwt.claim.sub', 'f5000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$ select public.redeem_parent_invite(repeat('5', 64)) $$,
  'P0001', 'membership_disabled',
  'A disabled parent cannot use a code to get back in'
);
reset role;
select is(
  (select status::text from public.memberships where user_id = 'f5000000-0000-0000-0000-000000000004'),
  'disabled',
  'Their membership stays disabled'
);
select is(
  (select user_id from public.guardians where id = 'a5b00000-0000-0000-0000-000000000002'),
  null,
  'and the guardian record is not linked to them'
);

select * from finish();
rollback;
