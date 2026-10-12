-- pgTAP: the Excel export functions (US-9.4; D52).
--
-- export_learners(), export_class_marks() and export_class_comments()
-- answer only the school's admin (SPEC section 2), return the whole file's
-- contents and write one data_exported audit row (who, what, how many
-- rows, when) in the same call. Everyone else gets an error and no row.
--
-- Fixture (rolled back). School A: Alice (admin), Hank (head), Sam
-- (teacher of 4 Blue's Maths), Pat (parent), and Pia (platform admin, no
-- membership). 2026: 4 Blue has Tendai Ncube (A001) and Ruva Left (A002,
-- a leaver); 3 Green has Chipo Green (A003). 4 Blue's Maths has Test 1
-- (out of 30) and English an Exam (out of 100) in Term 3. 2025 has Term 1.
-- School B: Bob (admin) with Bea Bee (B001) in 4 Blue.
begin;

select plan(29);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', jsonb_build_object('full_name', u.name), now(), now(),
       '', '', '', ''
from (values
  ('ea000000-0000-0000-0000-000000000001', 'alice@exports.test', 'Alice Admin'),
  ('ea000000-0000-0000-0000-000000000002', 'hank@exports.test', 'Hank Head'),
  ('ea000000-0000-0000-0000-000000000003', 'sam@exports.test', 'Sam Moyo'),
  ('ea000000-0000-0000-0000-000000000004', 'pat@exports.test', 'Pat Ncube'),
  ('ea000000-0000-0000-0000-000000000005', 'pia@exports.test', 'Pia Platform'),
  ('ea000000-0000-0000-0000-000000000006', 'bob@exports.test', 'Bob Admin')
) as u (id, email, name);

insert into public.platform_admins (user_id) values ('ea000000-0000-0000-0000-000000000005');

insert into public.schools (id, slug, name, stage, timezone, status)
values
  ('a0000000-0000-0000-0000-0000000000aa', 'exports-a-test', 'School A', 'secondary', 'Africa/Harare', 'active'),
  ('b0000000-0000-0000-0000-0000000000ba', 'exports-b-test', 'School B', 'secondary', 'Africa/Harare', 'active');

insert into public.memberships (school_id, user_id, role, status)
values
  ('a0000000-0000-0000-0000-0000000000aa', 'ea000000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a0000000-0000-0000-0000-0000000000aa', 'ea000000-0000-0000-0000-000000000002', 'head', 'active'),
  ('a0000000-0000-0000-0000-0000000000aa', 'ea000000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-0000000000aa', 'ea000000-0000-0000-0000-000000000004', 'parent', 'active'),
  ('b0000000-0000-0000-0000-0000000000ba', 'ea000000-0000-0000-0000-000000000006', 'school_admin', 'active');

insert into public.grading_scales (id, school_id, name, stage) values
  ('a1000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-0000000000aa', 'Scale', 'o_level'),
  ('b1000000-0000-0000-0000-0000000000ba', 'b0000000-0000-0000-0000-0000000000ba', 'Scale', 'o_level');
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values
  ('a2000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-0000000000aa', 'Form 4', 'o_level', 'a1000000-0000-0000-0000-0000000000aa'),
  ('b2000000-0000-0000-0000-0000000000ba', 'b0000000-0000-0000-0000-0000000000ba', 'Form 4', 'o_level', 'b1000000-0000-0000-0000-0000000000ba');
insert into public.academic_years (id, school_id, label, starts_on, ends_on, is_current) values
  ('a3000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-0000000000aa', '2026', '2026-01-13', '2026-12-04', true),
  ('a3000000-0000-0000-0000-0000000000ab', 'a0000000-0000-0000-0000-0000000000aa', '2025', '2025-01-14', '2025-12-05', false),
  ('b3000000-0000-0000-0000-0000000000ba', 'b0000000-0000-0000-0000-0000000000ba', '2026', '2026-01-13', '2026-12-04', true);
insert into public.terms (id, school_id, academic_year_id, name, kind, starts_on, ends_on, status) values
  ('7a000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000aa', 'a3000000-0000-0000-0000-0000000000aa', 'Term 3', 'term', '2026-09-08', '2026-12-04', 'open'),
  ('7a000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000aa', 'a3000000-0000-0000-0000-0000000000ab', 'Term 1', 'term', '2025-01-14', '2025-04-10', 'closed'),
  ('7a000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000ba', 'b3000000-0000-0000-0000-0000000000ba', 'Term 3', 'term', '2026-09-08', '2026-12-04', 'open');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name) values
  ('ca000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000aa', 'a3000000-0000-0000-0000-0000000000aa', 'a2000000-0000-0000-0000-0000000000aa', '4 Blue'),
  ('ca000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000aa', 'a3000000-0000-0000-0000-0000000000aa', 'a2000000-0000-0000-0000-0000000000aa', '3 Green'),
  ('ca000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000ba', 'b3000000-0000-0000-0000-0000000000ba', 'b2000000-0000-0000-0000-0000000000ba', '4 Blue');
insert into public.subjects (id, school_id, code, name, stage_scope) values
  ('da000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000aa', 'MATH', 'Mathematics', 'secondary'),
  ('da000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000aa', 'ENG', 'English', 'secondary');
insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values
  ('c5a00000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-0000000000aa', 'ca000000-0000-0000-0000-0000000000a1', 'da000000-0000-0000-0000-0000000000a1', 'ea000000-0000-0000-0000-000000000003'),
  ('c5a00000-0000-0000-0000-000000000042', 'a0000000-0000-0000-0000-0000000000aa', 'ca000000-0000-0000-0000-0000000000a1', 'da000000-0000-0000-0000-0000000000a2', 'ea000000-0000-0000-0000-000000000003');
insert into public.learners (id, school_id, learner_number, first_name, last_name, sex) values
  ('fa000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000aa', 'A001', 'Tendai', 'Ncube', 'M'),
  ('fa000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000aa', 'A002', 'Ruva', 'Left', 'F'),
  ('fa000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-0000000000aa', 'A003', 'Chipo', 'Green', 'F'),
  ('fa000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000ba', 'B001', 'Bea', 'Bee', 'F');
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id) values
  ('ea100000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000aa', 'fa000000-0000-0000-0000-0000000000a1', 'ca000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000aa'),
  ('ea100000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000aa', 'fa000000-0000-0000-0000-0000000000a2', 'ca000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000aa'),
  ('ea100000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-0000000000aa', 'fa000000-0000-0000-0000-0000000000a3', 'ca000000-0000-0000-0000-0000000000a2', 'a3000000-0000-0000-0000-0000000000aa'),
  ('ea100000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000ba', 'fa000000-0000-0000-0000-0000000000b1', 'ca000000-0000-0000-0000-0000000000b1', 'b3000000-0000-0000-0000-0000000000ba');
insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id) values
  ('a0000000-0000-0000-0000-0000000000aa', 'ea100000-0000-0000-0000-0000000000a1', 'c5a00000-0000-0000-0000-000000000041'),
  ('a0000000-0000-0000-0000-0000000000aa', 'ea100000-0000-0000-0000-0000000000a1', 'c5a00000-0000-0000-0000-000000000042'),
  ('a0000000-0000-0000-0000-0000000000aa', 'ea100000-0000-0000-0000-0000000000a2', 'c5a00000-0000-0000-0000-000000000041');
insert into public.guardians (id, school_id, full_name, phone, email) values
  ('6a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000aa', 'Pat Ncube', '0771000001', 'pat@exports.test'),
  ('6a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000aa', 'Grace Ncube', '0771000002', null);
insert into public.guardian_links (school_id, guardian_id, learner_id, relationship, is_primary) values
  ('a0000000-0000-0000-0000-0000000000aa', '6a000000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-0000000000a1', 'aunt', false),
  ('a0000000-0000-0000-0000-0000000000aa', '6a000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-0000000000a1', 'father', true);

insert into public.assessments (id, school_id, term_id, class_subject_id, name, type, max_mark, weight_percent) values
  ('a5a00000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000aa', '7a000000-0000-0000-0000-0000000000a1', 'c5a00000-0000-0000-0000-000000000041', 'Test 1', 'test', 30, 40),
  ('a5a00000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000aa', '7a000000-0000-0000-0000-0000000000a1', 'c5a00000-0000-0000-0000-000000000042', 'Exam', 'exam', 100, 100);
insert into public.marks (school_id, assessment_id, enrolment_id, score, status) values
  ('a0000000-0000-0000-0000-0000000000aa', 'a5a00000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-0000000000a1', 21.5, 'present'),
  ('a0000000-0000-0000-0000-0000000000aa', 'a5a00000-0000-0000-0000-000000000002', 'ea100000-0000-0000-0000-0000000000a1', null, 'absent'),
  ('a0000000-0000-0000-0000-0000000000aa', 'a5a00000-0000-0000-0000-000000000001', 'ea100000-0000-0000-0000-0000000000a2', null, 'excused');
insert into public.subject_comments (school_id, term_id, enrolment_id, class_subject_id, comment) values
  ('a0000000-0000-0000-0000-0000000000aa', '7a000000-0000-0000-0000-0000000000a1', 'ea100000-0000-0000-0000-0000000000a1', 'c5a00000-0000-0000-0000-000000000041', 'Works hard');
insert into public.class_comments (school_id, term_id, enrolment_id, comment) values
  ('a0000000-0000-0000-0000-0000000000aa', '7a000000-0000-0000-0000-0000000000a1', 'ea100000-0000-0000-0000-0000000000a1', 'A good term.');

-- The leaver leaves after their marks were entered.
update public.learners set status = 'left' where id = 'fa000000-0000-0000-0000-0000000000a2';
update public.enrolments set status = 'left' where id = 'ea100000-0000-0000-0000-0000000000a2';

create function pg_temp.as_user(p_id text)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_id, true);
$$;
-- Export rows written so far (read as the table owner, past RLS).
create function pg_temp.exports()
returns bigint language sql security definer as $$
  select count(*) from public.audit_log where event = 'data_exported'
    and school_id in ('a0000000-0000-0000-0000-0000000000aa', 'b0000000-0000-0000-0000-0000000000ba');
$$;
grant execute on function pg_temp.as_user(text) to authenticated, anon;
grant execute on function pg_temp.exports() to authenticated, anon;

set local role authenticated;

-- Learners and guardians ---------------------------------------------------------------

select pg_temp.as_user('ea000000-0000-0000-0000-000000000001');
select is(
  (select string_agg(r ->> 'learner_number', ',' order by ord)
   from jsonb_array_elements(public.export_learners('a0000000-0000-0000-0000-0000000000aa') -> 'rows')
     with ordinality as x (r, ord)),
  'A003,A002,A001',
  'the admin exports every learner of the school, leavers included, by surname');

select is(
  (select r from jsonb_array_elements(public.export_learners('a0000000-0000-0000-0000-0000000000aa') -> 'rows') r
   where r ->> 'learner_number' = 'A001')
    - 'date_of_birth' - 'admission_date',
  jsonb_build_object(
    'learner_number', 'A001', 'last_name', 'Ncube', 'first_name', 'Tendai', 'sex', 'M',
    'status', 'active', 'class_name', '4 Blue', 'year_label', '2026',
    'guardians', jsonb_build_array(
      jsonb_build_object('full_name', 'Pat Ncube', 'relationship', 'father', 'phone', '0771000001',
                         'email', 'pat@exports.test', 'is_primary', true),
      jsonb_build_object('full_name', 'Grace Ncube', 'relationship', 'aunt', 'phone', '0771000002',
                         'email', null, 'is_primary', false))),
  'with their class and year and their guardians, primary first');

select is(pg_temp.exports(), 2::bigint, 'each export writes one audit row');

reset role;
select results_eq(
  $$ select actor_id, table_name, row_id, action::text, new_data, class_id
     from public.audit_log where event = 'data_exported' order by id desc limit 1 $$,
  $$ values ('ea000000-0000-0000-0000-000000000001'::uuid, 'schools', 'a0000000-0000-0000-0000-0000000000aa'::uuid,
             'event', '{"kind": "learners", "rows": 3}'::jsonb, null::uuid) $$,
  'the row says who exported what and how many rows, against the school');
set local role authenticated;

select pg_temp.as_user('ea000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.export_learners('a0000000-0000-0000-0000-0000000000aa') $$,
  '42501', 'Only the school admin can export school data', 'the head cannot export (SPEC section 2)');
select pg_temp.as_user('ea000000-0000-0000-0000-000000000003');
select throws_ok($$ select public.export_learners('a0000000-0000-0000-0000-0000000000aa') $$,
  '42501', null, 'nor a teacher');
select pg_temp.as_user('ea000000-0000-0000-0000-000000000004');
select throws_ok($$ select public.export_learners('a0000000-0000-0000-0000-0000000000aa') $$,
  '42501', null, 'nor a parent');
select pg_temp.as_user('ea000000-0000-0000-0000-000000000005');
select throws_ok($$ select public.export_learners('a0000000-0000-0000-0000-0000000000aa') $$,
  '42501', null, 'nor a platform admin with no membership');
select pg_temp.as_user('ea000000-0000-0000-0000-000000000006');
select throws_ok($$ select public.export_learners('a0000000-0000-0000-0000-0000000000aa') $$,
  '42501', null, 'nor school B''s admin, for school A');
select is(
  jsonb_array_length(public.export_learners('b0000000-0000-0000-0000-0000000000ba') -> 'rows'), 1,
  'school B''s admin exports only their own school');
select pg_temp.as_user('');
select throws_ok($$ select public.export_learners('a0000000-0000-0000-0000-0000000000aa') $$,
  '42501', null, 'nor anyone signed out');
select is(pg_temp.exports(), 3::bigint, 'refused exports write no audit row');

-- A class's marks for a term ---------------------------------------------------------------

select pg_temp.as_user('ea000000-0000-0000-0000-000000000001');
create temp table marks_doc on commit drop as
select public.export_class_marks('ca000000-0000-0000-0000-0000000000a1', '7a000000-0000-0000-0000-0000000000a1') as d;
select is(
  (select d - 'columns' - 'rows' from marks_doc),
  '{"class_name": "4 Blue", "term_name": "Term 3", "year_label": "2026"}'::jsonb,
  'the marks export names its class, term and year');
select is(
  (select string_agg(c ->> 'subject' || ':' || (c ->> 'assessment') || '/' || (c ->> 'max_mark'), ',' order by o)
   from marks_doc, jsonb_array_elements(d -> 'columns') with ordinality as x (c, o)),
  'English:Exam/100,Mathematics:Test 1/30',
  'one column per assessment, subjects by name');
select is(
  (select string_agg(r ->> 'learner_number' || '=' || (r ->> 'status') || ':' || (r -> 'marks')::text, ' | ' order by o)
   from marks_doc, jsonb_array_elements(d -> 'rows') with ordinality as x (r, o)),
  'A002=left:{"a5a00000-0000-0000-0000-000000000001": "E"} | '
    || 'A001=enrolled:{"a5a00000-0000-0000-0000-000000000001": 21.5, "a5a00000-0000-0000-0000-000000000002": "A"}',
  'one row per learner of the class, leavers too, with scores and A or E');

reset role;
select results_eq(
  $$ select new_data, class_id from public.audit_log where event = 'data_exported' order by id desc limit 1 $$,
  $$ values ('{"kind": "marks", "rows": 2, "term_id": "7a000000-0000-0000-0000-0000000000a1",
               "term_name": "Term 3", "class_name": "4 Blue"}'::jsonb,
             'ca000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'the audit row names the class and term and counts the learner rows');
set local role authenticated;

select is(
  (select count(*) from public.audit_entries('a0000000-0000-0000-0000-0000000000aa', null,
     'ca000000-0000-0000-0000-0000000000a1', null, null, null, null, null, 50)
   where event = 'data_exported' and term_name = 'Term 3' and class_name = '4 Blue'),
  1::bigint,
  'and the audit screen finds it under the class, with the term');

select throws_ok(
  $$ select public.export_class_marks('ca000000-0000-0000-0000-0000000000a1', '7a000000-0000-0000-0000-0000000000a2') $$,
  '22023', 'That term is not in the class''s year', 'a term of another year is refused');
select throws_ok(
  $$ select public.export_class_marks('ca000000-0000-0000-0000-0000000000a1', '7a000000-0000-0000-0000-0000000000b1') $$,
  '22023', null, 'and so is another school''s term');
select throws_ok(
  $$ select public.export_class_marks('ca000000-0000-0000-0000-0000000000ff', '7a000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'an unknown class reads as not allowed');
select is(
  (select jsonb_array_length(public.export_class_marks('ca000000-0000-0000-0000-0000000000a2',
     '7a000000-0000-0000-0000-0000000000a1') -> 'columns')),
  0, 'a class with no assessments exports learners and no mark columns');

select pg_temp.as_user('ea000000-0000-0000-0000-000000000002');
select throws_ok(
  $$ select public.export_class_marks('ca000000-0000-0000-0000-0000000000a1', '7a000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'the head cannot export marks');
select pg_temp.as_user('ea000000-0000-0000-0000-000000000003');
select throws_ok(
  $$ select public.export_class_marks('ca000000-0000-0000-0000-0000000000a1', '7a000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'nor the class''s own teacher');
select pg_temp.as_user('ea000000-0000-0000-0000-000000000006');
select throws_ok(
  $$ select public.export_class_marks('ca000000-0000-0000-0000-0000000000a1', '7a000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'nor school B''s admin');

-- A class's comments for a term -------------------------------------------------------------

select pg_temp.as_user('ea000000-0000-0000-0000-000000000001');
create temp table comments_doc on commit drop as
select public.export_class_comments('ca000000-0000-0000-0000-0000000000a1', '7a000000-0000-0000-0000-0000000000a1') as d;
select is(
  (select string_agg(c ->> 'subject', ',' order by o)
   from comments_doc, jsonb_array_elements(d -> 'columns') with ordinality as x (c, o)),
  'English,Mathematics', 'one column per class subject, by name');
select is(
  (select string_agg(r ->> 'learner_number' || ':' || (r -> 'subjects')::text || ':' || coalesce(r ->> 'class_comment', '-'), ' | ' order by o)
   from comments_doc, jsonb_array_elements(d -> 'rows') with ordinality as x (r, o)),
  'A002:{}:- | A001:{"c5a00000-0000-0000-0000-000000000041": "Works hard"}:A good term.',
  'with each learner''s subject and class teacher''s comments, drafts as written');
select pg_temp.as_user('ea000000-0000-0000-0000-000000000002');
select throws_ok(
  $$ select public.export_class_comments('ca000000-0000-0000-0000-0000000000a1', '7a000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'the head cannot export comments');
select is(pg_temp.exports(), 6::bigint, 'one audit row per export made, none for refusals');

-- Anonymous callers cannot run the functions at all.
set local role anon;
select throws_ok($$ select public.export_learners('a0000000-0000-0000-0000-0000000000aa') $$,
  '42501', null, 'anonymous callers cannot run an export');

select * from finish();
rollback;
