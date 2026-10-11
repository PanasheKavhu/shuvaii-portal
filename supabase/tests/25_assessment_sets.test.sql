-- pgTAP: the school's usual assessment set (D41). assessment_set_items is
-- read by staff of the school and written by its school admin only; a term
-- kind's weights add up to exactly 100 (or the kind has none);
-- save_assessment_set() replaces a kind's set and refuses bad sets.
--
-- Fixture (rolled back): schools A and B. School A: Alice (admin), Tom
-- (teacher), Pat (parent). School B: Bob (admin). School B has a set.
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
  ('e2500000-0000-0000-0000-000000000001', 'alice@sets.test'),
  ('e2500000-0000-0000-0000-000000000002', 'tom@sets.test'),
  ('e2500000-0000-0000-0000-000000000003', 'bob@sets.test'),
  ('e2500000-0000-0000-0000-000000000004', 'pat@sets.test')
) as u (id, email);

insert into public.schools (id, slug, name, stage, timezone, status) values
  ('a2500000-0000-0000-0000-00000000000a', 'sets-a-test', 'School A', 'secondary', 'Africa/Harare', 'active'),
  ('a2500000-0000-0000-0000-00000000000b', 'sets-b-test', 'School B', 'secondary', 'Africa/Harare', 'active');

insert into public.memberships (school_id, user_id, role, status) values
  ('a2500000-0000-0000-0000-00000000000a', 'e2500000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a2500000-0000-0000-0000-00000000000a', 'e2500000-0000-0000-0000-000000000002', 'teacher', 'active'),
  ('a2500000-0000-0000-0000-00000000000a', 'e2500000-0000-0000-0000-000000000004', 'parent', 'active'),
  ('a2500000-0000-0000-0000-00000000000b', 'e2500000-0000-0000-0000-000000000003', 'school_admin', 'active');

insert into public.assessment_set_items (id, school_id, term_kind, name, type, max_mark, weight_percent, sort_order) values
  ('a2510000-0000-0000-0000-00000000000b', 'a2500000-0000-0000-0000-00000000000b', 'term', 'Exam', 'exam', 100, 100, 1);

-- As Alice, school A's admin.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2500000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$ select public.save_assessment_set('a2500000-0000-0000-0000-00000000000a', 'term',
       '[{"name":"Coursework","type":"assignment","max_mark":40,"weight_percent":30},
         {"name":"Exam","type":"exam","max_mark":100,"weight_percent":70}]') $$,
  'the admin saves a term set adding up to 100'
);
select results_eq(
  $$ select name, type::text, max_mark, weight_percent from public.assessment_set_items
     where school_id = 'a2500000-0000-0000-0000-00000000000a' order by sort_order $$,
  $$ values ('Coursework', 'assignment', 40::numeric, 30::numeric), ('Exam', 'exam', 100::numeric, 70::numeric) $$,
  'in the order given'
);
select lives_ok(
  $$ select public.save_assessment_set('a2500000-0000-0000-0000-00000000000a', 'term',
       '[{"name":"Exam","type":"exam","max_mark":100,"weight_percent":100}]') $$,
  'saving again replaces the set'
);
select is(
  (select count(*)::int from public.assessment_set_items where school_id = 'a2500000-0000-0000-0000-00000000000a'),
  1, 'only the new set is left'
);
select throws_ok(
  $$ select public.save_assessment_set('a2500000-0000-0000-0000-00000000000a', 'term',
       '[{"name":"Test 1","type":"test","max_mark":30,"weight_percent":20},
         {"name":"Exam","type":"exam","max_mark":100,"weight_percent":70}]') $$,
  '23514', 'the usual term set''s weights must add up to 100 (they add up to 90)',
  'a set adding up to 90 is refused'
);
select throws_ok(
  $$ select public.save_assessment_set('a2500000-0000-0000-0000-00000000000a', 'vacation', '[]') $$,
  '22023', null, 'an empty set is refused'
);
select throws_ok(
  $$ select public.save_assessment_set('a2500000-0000-0000-0000-00000000000a', 'mock',
       '[{"name":"Paper 1","type":"exam","max_mark":100,"weight_percent":50},
         {"name":" paper 1 ","type":"exam","max_mark":100,"weight_percent":50}]') $$,
  '23505', null, 'a name used twice in a set is refused'
);
select throws_ok(
  $$ select public.save_assessment_set('a2500000-0000-0000-0000-00000000000a', 'mock',
       '[{"name":"Paper 1","type":"exam","max_mark":100.005,"weight_percent":100}]') $$,
  '23514', null, 'a maximum with more than 2 decimals is refused'
);
select throws_ok(
  $$ insert into public.assessment_set_items (school_id, term_kind, name, type, max_mark, weight_percent)
     values ('a2500000-0000-0000-0000-00000000000a', 'term', 'Extra', 'test', 10, 10);
     set constraints public.assessment_set_items_total_is_100 immediate $$,
  '23514', null, 'a direct write that breaks the total is refused at commit'
);

-- Cross-school: Alice and school B.
select is_empty(
  $$ select * from public.assessment_set_items where school_id = 'a2500000-0000-0000-0000-00000000000b' $$,
  'school A''s admin cannot read school B''s set'
);
select throws_ok(
  $$ select public.save_assessment_set('a2500000-0000-0000-0000-00000000000b', 'term',
       '[{"name":"Exam","type":"exam","max_mark":100,"weight_percent":100}]') $$,
  '42501', null, 'school A''s admin cannot save school B''s set'
);
select throws_ok(
  $$ insert into public.assessment_set_items (school_id, term_kind, name, type, max_mark, weight_percent)
     values ('a2500000-0000-0000-0000-00000000000b', 'vacation', 'Mark', 'vacation', 100, 100) $$,
  '42501', null, 'school A''s admin cannot insert into school B'
);
select is_empty(
  $$ update public.assessment_set_items set name = 'Hacked' where school_id = 'a2500000-0000-0000-0000-00000000000b' returning 1 $$,
  'school A''s admin cannot update school B''s set'
);
select is_empty(
  $$ delete from public.assessment_set_items where school_id = 'a2500000-0000-0000-0000-00000000000b' returning 1 $$,
  'school A''s admin cannot delete school B''s set'
);

-- Tom, a teacher: reads (the marks screens use it) but cannot write.
select set_config('request.jwt.claims', '{"sub":"e2500000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.assessment_set_items),
  1, 'a teacher reads their school''s set only'
);
select throws_ok(
  $$ select public.save_assessment_set('a2500000-0000-0000-0000-00000000000a', 'term',
       '[{"name":"Quiz","type":"test","max_mark":10,"weight_percent":100}]') $$,
  '42501', null, 'a teacher cannot change the set'
);
select is_empty(
  $$ update public.assessment_set_items set weight_percent = 100 returning 1 $$,
  'a teacher cannot update set rows'
);

-- Pat, a parent, and anonymous: nothing.
select set_config('request.jwt.claims', '{"sub":"e2500000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select is_empty($$ select * from public.assessment_set_items $$, 'a parent reads nothing');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is_empty($$ select * from public.assessment_set_items $$, 'anonymous callers read nothing');

select * from finish();
rollback;
