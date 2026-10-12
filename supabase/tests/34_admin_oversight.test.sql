-- pgTAP: the oversight functions behind /admin (US-9.1, US-9.2; D51).
--
-- oversight_counts(), oversight_reports() and oversight_guardians() answer
-- only a school admin or head of the school; browse_search() answers them
-- for the whole school and a hod for the learners and classes they teach
-- and themselves (D23, D36). Teachers, parents, another school's admin,
-- a disabled hod and anonymous callers get nothing.
--
-- Fixture (rolled back). School A: Alice (admin), Hank (head), Sam
-- (teacher; class teacher of 4 Blue and its Maths teacher), Hope (hod;
-- English in 4 Blue), Pat and Una (parents). 4 Blue has Tendai Ncube
-- (A001) and Ruva Left (A002, a leaver); 3 Green has Chipo Green (A003).
-- Guardians: Pat Ncube (Tendai; a login, signed in), Grace Ncube (Tendai
-- and Chipo; no login), Una Used (Chipo; a login never used) and Old
-- Guardian (Ruva only, so not counted). Reports this term: Tendai's first
-- version published then withdrawn and the second published; Chipo's a
-- draft. School B: Bob (admin), class 4 Blue with Bea Bee (B001).
begin;

select plan(46);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', jsonb_build_object('full_name', u.name), now(), now(),
       u.signed_in, '', '', '', ''
from (values
  ('e9000000-0000-0000-0000-000000000001', 'alice@oversight.test', 'Alice Admin', now()),
  ('e9000000-0000-0000-0000-000000000002', 'hank@oversight.test', 'Hank Head', now()),
  ('e9000000-0000-0000-0000-000000000003', 'sam@oversight.test', 'Sam Moyo', now()),
  ('e9000000-0000-0000-0000-000000000004', 'hope@oversight.test', 'Hope Dube', now()),
  ('e9000000-0000-0000-0000-000000000005', 'pat@oversight.test', 'Pat Ncube', now()),
  ('e9000000-0000-0000-0000-000000000006', 'una@oversight.test', 'Una Used', null),
  ('e9000000-0000-0000-0000-000000000007', 'bob@oversight.test', 'Bob Admin', now())
) as u (id, email, name, signed_in);

insert into public.schools (id, slug, name, stage, timezone, status)
values
  ('a0000000-0000-0000-0000-0000000000a9', 'oversight-a-test', 'School A', 'secondary', 'Africa/Harare', 'active'),
  ('b0000000-0000-0000-0000-0000000000b9', 'oversight-b-test', 'School B', 'secondary', 'Africa/Harare', 'active');

insert into public.memberships (school_id, user_id, role, status)
values
  ('a0000000-0000-0000-0000-0000000000a9', 'e9000000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a0000000-0000-0000-0000-0000000000a9', 'e9000000-0000-0000-0000-000000000002', 'head', 'active'),
  ('a0000000-0000-0000-0000-0000000000a9', 'e9000000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-0000000000a9', 'e9000000-0000-0000-0000-000000000004', 'hod', 'active'),
  ('a0000000-0000-0000-0000-0000000000a9', 'e9000000-0000-0000-0000-000000000005', 'parent', 'active'),
  ('a0000000-0000-0000-0000-0000000000a9', 'e9000000-0000-0000-0000-000000000006', 'parent', 'active'),
  ('b0000000-0000-0000-0000-0000000000b9', 'e9000000-0000-0000-0000-000000000007', 'school_admin', 'active');

insert into public.grading_scales (id, school_id, name, stage) values
  ('a1000000-0000-0000-0000-0000000000a9', 'a0000000-0000-0000-0000-0000000000a9', 'Scale', 'o_level'),
  ('b1000000-0000-0000-0000-0000000000b9', 'b0000000-0000-0000-0000-0000000000b9', 'Scale', 'o_level');
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values
  ('a2000000-0000-0000-0000-0000000000a9', 'a0000000-0000-0000-0000-0000000000a9', 'Form 4', 'o_level', 'a1000000-0000-0000-0000-0000000000a9'),
  ('b2000000-0000-0000-0000-0000000000b9', 'b0000000-0000-0000-0000-0000000000b9', 'Form 4', 'o_level', 'b1000000-0000-0000-0000-0000000000b9');
insert into public.academic_years (id, school_id, label, starts_on, ends_on) values
  ('a3000000-0000-0000-0000-0000000000a9', 'a0000000-0000-0000-0000-0000000000a9', '2026', '2026-01-13', '2026-12-04'),
  ('b3000000-0000-0000-0000-0000000000b9', 'b0000000-0000-0000-0000-0000000000b9', '2026', '2026-01-13', '2026-12-04');
insert into public.terms (id, school_id, academic_year_id, name, kind, starts_on, ends_on, status) values
  ('79000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a9', 'a3000000-0000-0000-0000-0000000000a9', 'Term 3', 'term', '2026-09-08', '2026-12-04', 'open'),
  ('79000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b9', 'b3000000-0000-0000-0000-0000000000b9', 'Term 3', 'term', '2026-09-08', '2026-12-04', 'open');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ('c9000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a9', 'a3000000-0000-0000-0000-0000000000a9', 'a2000000-0000-0000-0000-0000000000a9', '4 Blue', 'e9000000-0000-0000-0000-000000000003'),
  ('c9000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000a9', 'a3000000-0000-0000-0000-0000000000a9', 'a2000000-0000-0000-0000-0000000000a9', '3 Green', null),
  ('c9000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b9', 'b3000000-0000-0000-0000-0000000000b9', 'b2000000-0000-0000-0000-0000000000b9', '4 Blue', null);
insert into public.subjects (id, school_id, code, name, stage_scope) values
  ('d9000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a9', 'MATH', 'Mathematics', 'secondary'),
  ('d9000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000a9', 'ENG', 'English', 'secondary');
insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values
  ('c5900000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-0000000000a9', 'c9000000-0000-0000-0000-0000000000a1', 'd9000000-0000-0000-0000-0000000000a1', 'e9000000-0000-0000-0000-000000000003'),
  ('c5900000-0000-0000-0000-000000000042', 'a0000000-0000-0000-0000-0000000000a9', 'c9000000-0000-0000-0000-0000000000a1', 'd9000000-0000-0000-0000-0000000000a2', 'e9000000-0000-0000-0000-000000000004'),
  ('c5900000-0000-0000-0000-000000000043', 'a0000000-0000-0000-0000-0000000000a9', 'c9000000-0000-0000-0000-0000000000a2', 'd9000000-0000-0000-0000-0000000000a1', null);
insert into public.learners (id, school_id, learner_number, first_name, last_name) values
  ('f9000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a9', 'A001', 'Tendai', 'Ncube'),
  ('f9000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000a9', 'A002', 'Ruva', 'Left'),
  ('f9000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-0000000000a9', 'A003', 'Chipo', 'Green'),
  ('f9000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b9', 'B001', 'Bea', 'Bee');
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id) values
  ('e9100000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a9', 'f9000000-0000-0000-0000-0000000000a1', 'c9000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000a9'),
  ('e9100000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000a9', 'f9000000-0000-0000-0000-0000000000a2', 'c9000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000a9'),
  ('e9100000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-0000000000a9', 'f9000000-0000-0000-0000-0000000000a3', 'c9000000-0000-0000-0000-0000000000a2', 'a3000000-0000-0000-0000-0000000000a9'),
  ('e9100000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b9', 'f9000000-0000-0000-0000-0000000000b1', 'c9000000-0000-0000-0000-0000000000b1', 'b3000000-0000-0000-0000-0000000000b9');
update public.learners set status = 'left' where id = 'f9000000-0000-0000-0000-0000000000a2';
update public.enrolments set status = 'left' where id = 'e9100000-0000-0000-0000-0000000000a2';

insert into public.guardians (id, school_id, full_name, phone, user_id) values
  ('69000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a9', 'Pat Ncube', '0771000001', 'e9000000-0000-0000-0000-000000000005'),
  ('69000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000a9', 'Grace Ncube', '0771000002', null),
  ('69000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-0000000000a9', 'Una Used', null, 'e9000000-0000-0000-0000-000000000006'),
  ('69000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-0000000000a9', 'Old Guardian', null, null);
insert into public.guardian_links (school_id, guardian_id, learner_id, relationship, is_primary) values
  ('a0000000-0000-0000-0000-0000000000a9', '69000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-0000000000a1', 'father', true),
  ('a0000000-0000-0000-0000-0000000000a9', '69000000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-0000000000a1', 'aunt', false),
  ('a0000000-0000-0000-0000-0000000000a9', '69000000-0000-0000-0000-000000000002', 'f9000000-0000-0000-0000-0000000000a3', 'aunt', false),
  ('a0000000-0000-0000-0000-0000000000a9', '69000000-0000-0000-0000-000000000003', 'f9000000-0000-0000-0000-0000000000a3', 'mother', true),
  ('a0000000-0000-0000-0000-0000000000a9', '69000000-0000-0000-0000-000000000004', 'f9000000-0000-0000-0000-0000000000a2', 'father', true);

-- Reports, moved through the workflow as the table owner (no user, like the server).
create function pg_temp.template(p_school uuid)
returns uuid language sql as $$
  select id from public.report_templates where school_id = p_school and term_kind = 'term';
$$;
create function pg_temp.publish(p_id uuid)
returns void language sql as $$
  update public.reports set status = 'submitted' where id = p_id;
  update public.reports set status = 'approved' where id = p_id;
  update public.reports
  set status = 'published', snapshot = '{"subjects": []}',
      pdf_path = school_id || '/' || id || '/v' || version || '.pdf'
  where id = p_id;
$$;
insert into public.reports (id, school_id, term_id, enrolment_id, template_id) values
  ('a9500000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a9', '79000000-0000-0000-0000-0000000000a1', 'e9100000-0000-0000-0000-0000000000a1', pg_temp.template('a0000000-0000-0000-0000-0000000000a9'));
select pg_temp.publish('a9500000-0000-0000-0000-000000000001');
update public.reports set status = 'withdrawn', withdrawn_reason = 'Wrong mark'
where id = 'a9500000-0000-0000-0000-000000000001';
insert into public.reports (id, school_id, term_id, enrolment_id, template_id, version) values
  ('a9500000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000a9', '79000000-0000-0000-0000-0000000000a1', 'e9100000-0000-0000-0000-0000000000a1', pg_temp.template('a0000000-0000-0000-0000-0000000000a9'), 2),
  ('a9500000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-0000000000a9', '79000000-0000-0000-0000-0000000000a1', 'e9100000-0000-0000-0000-0000000000a3', pg_temp.template('a0000000-0000-0000-0000-0000000000a9'), 1);
select pg_temp.publish('a9500000-0000-0000-0000-000000000002');

create function pg_temp.as_user(p_id text)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_id, true);
$$;
-- What each function shows the caller, as compact text.
create function pg_temp.counts(p_school text)
returns text language sql as $$
  select coalesce(string_agg(format('%s/%s/%s/%s/%s', active_learners, staff, guardians,
                                    parents_linked, guardians_never_signed_in), ';'), 'none')
  from public.oversight_counts(p_school::uuid);
$$;
create function pg_temp.reports(p_term text)
returns text language sql as $$
  select coalesce(string_agg(format('%s:%s/%s/%s/%s/%s/%s', class_name, drafts, returned, submitted,
                                    approved, published, withdrawn), ';' order by class_name), 'none')
  from public.oversight_reports(p_term::uuid);
$$;
create function pg_temp.guardians(p_filter text, p_limit int default 100, p_offset int default 0)
returns text language sql as $$
  select coalesce(string_agg(full_name || '(' || total || ')', ';' order by full_name), 'none')
  from public.oversight_guardians('a0000000-0000-0000-0000-0000000000a9', p_filter, p_limit, p_offset);
$$;
create function pg_temp.search(p_query text, p_school text default 'a0000000-0000-0000-0000-0000000000a9')
returns text language sql as $$
  select coalesce(string_agg(kind || ':' || label, ';'), 'none')
  from public.browse_search(p_school::uuid, p_query);
$$;
grant execute on function pg_temp.as_user(text) to authenticated, anon;
grant execute on function pg_temp.counts(text) to authenticated, anon;
grant execute on function pg_temp.reports(text) to authenticated, anon;
grant execute on function pg_temp.guardians(text, int, int) to authenticated, anon;
grant execute on function pg_temp.search(text, text) to authenticated, anon;

set local role authenticated;

-- Counts ---------------------------------------------------------------------------

select pg_temp.as_user('e9000000-0000-0000-0000-000000000001');
select is(pg_temp.counts('a0000000-0000-0000-0000-0000000000a9'), '2/4/3/2/2',
  'the admin sees 2 active learners, 4 staff, 3 guardians, 2 with a login and 2 never signed in');
select pg_temp.as_user('e9000000-0000-0000-0000-000000000002');
select is(pg_temp.counts('a0000000-0000-0000-0000-0000000000a9'), '2/4/3/2/2', 'the head sees the same');
select pg_temp.as_user('e9000000-0000-0000-0000-000000000004');
select is(pg_temp.counts('a0000000-0000-0000-0000-0000000000a9'), 'none', 'a hod gets no school-wide counts');
select pg_temp.as_user('e9000000-0000-0000-0000-000000000003');
select is(pg_temp.counts('a0000000-0000-0000-0000-0000000000a9'), 'none', 'nor a teacher');
select pg_temp.as_user('e9000000-0000-0000-0000-000000000005');
select is(pg_temp.counts('a0000000-0000-0000-0000-0000000000a9'), 'none', 'nor a parent');
select pg_temp.as_user('e9000000-0000-0000-0000-000000000007');
select is(pg_temp.counts('a0000000-0000-0000-0000-0000000000a9'), 'none', 'school B''s admin gets nothing for school A');
select is(pg_temp.counts('b0000000-0000-0000-0000-0000000000b9'), '1/1/0/0/0', 'and only their own school''s counts');
select pg_temp.as_user('');
select is(pg_temp.counts('a0000000-0000-0000-0000-0000000000a9'), 'none', 'no user, no counts');

-- Reports by status ---------------------------------------------------------------------

select pg_temp.as_user('e9000000-0000-0000-0000-000000000001');
select is(pg_temp.reports('79000000-0000-0000-0000-0000000000a1'), '3 Green:1/0/0/0/0/0;4 Blue:0/0/0/0/1/1',
  'every class of the term with its reports by status, withdrawn versions included');
select pg_temp.as_user('e9000000-0000-0000-0000-000000000002');
select is(pg_temp.reports('79000000-0000-0000-0000-0000000000a1'), '3 Green:1/0/0/0/0/0;4 Blue:0/0/0/0/1/1', 'the head sees the same');
select pg_temp.as_user('e9000000-0000-0000-0000-000000000004');
select is(pg_temp.reports('79000000-0000-0000-0000-0000000000a1'), 'none', 'a hod sees no report statuses');
select pg_temp.as_user('e9000000-0000-0000-0000-000000000003');
select is(pg_temp.reports('79000000-0000-0000-0000-0000000000a1'), 'none', 'nor a class teacher');
select pg_temp.as_user('e9000000-0000-0000-0000-000000000007');
select is(pg_temp.reports('79000000-0000-0000-0000-0000000000a1'), 'none', 'nor school B''s admin');
select is(pg_temp.reports('79000000-0000-0000-0000-0000000000b1'), '4 Blue:0/0/0/0/0/0', 'who sees their own classes');

-- Guardians -------------------------------------------------------------------------

select pg_temp.as_user('e9000000-0000-0000-0000-000000000001');
select is(pg_temp.guardians('never'), 'Grace Ncube(2);Una Used(2)',
  'never signed in: no login yet, or a login never used; guardians of leavers only are left out');
select is(pg_temp.guardians('linked'), 'Pat Ncube(2);Una Used(2)', 'with a parent login');
select is(pg_temp.guardians('never', 1, 1), 'Una Used(2)', 'a page at a time, with the total before paging');
select is(
  (select jsonb_agg(l ->> 'number' order by l ->> 'number')
   from public.oversight_guardians('a0000000-0000-0000-0000-0000000000a9', 'never') g,
        jsonb_array_elements(g.learners) l
   where g.full_name = 'Grace Ncube'),
  '["A001", "A003"]'::jsonb, 'each with the active learners they are linked to');
select is(pg_temp.guardians('everyone'), 'none', 'an unknown filter matches nobody');
select pg_temp.as_user('e9000000-0000-0000-0000-000000000002');
select is(pg_temp.guardians('never'), 'Grace Ncube(2);Una Used(2)', 'the head sees the same');
select pg_temp.as_user('e9000000-0000-0000-0000-000000000004');
select is(pg_temp.guardians('never'), 'none', 'a hod gets no guardian lists');
select pg_temp.as_user('e9000000-0000-0000-0000-000000000007');
select is(pg_temp.guardians('never'), 'none', 'nor school B''s admin');

-- Browse search: admin and head ----------------------------------------------------------

select pg_temp.as_user('e9000000-0000-0000-0000-000000000001');
select is(pg_temp.search('A001'), 'learner:Tendai Ncube', 'a learner by number');
select is(
  (select detail from public.browse_search('a0000000-0000-0000-0000-0000000000a9', 'a001')),
  'A001 · 4 Blue', 'with their number and class, ignoring case');
select is(pg_temp.search('tendai ncu'), 'learner:Tendai Ncube', 'a learner by parts of their name');
select is(pg_temp.search('a00'), 'learner:Chipo Green;learner:Ruva Left;learner:Tendai Ncube',
  'every match, leavers too, by surname');
select is(pg_temp.search('a003 ncube'), 'none', 'every word must match');
select is(
  (select kind || ':' || label || ':' || array_to_string(roles, ',')
   from public.browse_search('a0000000-0000-0000-0000-0000000000a9', 'sam')),
  'staff:Sam Moyo:teacher', 'staff by name, with their roles');
select is(pg_temp.search('hope@oversight'), 'staff:Hope Dube', 'or by email');
select is(pg_temp.search('4blue'), 'class:4 Blue', 'a class by name, ignoring spaces, only this school''s');
select is(pg_temp.search('Bea'), 'none', 'never another school''s learner');
select is(pg_temp.search('%'), 'none', 'a % is matched as typed, not as a wildcard');
select is(pg_temp.search('_'), 'none', 'and so is _');
select is(pg_temp.search('   '), 'none', 'a blank search finds nothing');
select pg_temp.as_user('e9000000-0000-0000-0000-000000000002');
select is(pg_temp.search('a00'), 'learner:Chipo Green;learner:Ruva Left;learner:Tendai Ncube', 'the head finds the same');

-- Browse search: hod, teacher, parent, other school, anonymous ---------------------------------

select pg_temp.as_user('e9000000-0000-0000-0000-000000000004');
select is(pg_temp.search('a00'), 'learner:Ruva Left;learner:Tendai Ncube', 'a hod finds only learners in classes they teach (D23)');
select is(pg_temp.search('green'), 'none', 'and not a class they do not teach');
select is(pg_temp.search('blue'), 'class:4 Blue', 'but one they do');
select is(pg_temp.search('e'), 'learner:Ruva Left;learner:Tendai Ncube;staff:Hope Dube;class:4 Blue',
  'among staff, only themselves');
select pg_temp.as_user('e9000000-0000-0000-0000-000000000003');
select is(pg_temp.search('a00'), 'none', 'a teacher finds nothing');
select pg_temp.as_user('e9000000-0000-0000-0000-000000000005');
select is(pg_temp.search('a00'), 'none', 'nor a parent');
select pg_temp.as_user('e9000000-0000-0000-0000-000000000007');
select is(pg_temp.search('a00'), 'none', 'school B''s admin finds nothing in school A');
select is(pg_temp.search('B001', 'b0000000-0000-0000-0000-0000000000b9'), 'learner:Bea Bee', 'but finds their own learners');
reset role;
update public.memberships set status = 'disabled'
where user_id = 'e9000000-0000-0000-0000-000000000004';
set local role authenticated;
select pg_temp.as_user('e9000000-0000-0000-0000-000000000004');
select is(pg_temp.search('a00'), 'none', 'a disabled hod finds nothing');
reset role;

set local role anon;
select throws_ok($$ select * from public.browse_search('a0000000-0000-0000-0000-0000000000a9', 'a00') $$,
  '42501', null, 'signed-out callers cannot search');
select throws_ok($$ select * from public.oversight_counts('a0000000-0000-0000-0000-0000000000a9') $$,
  '42501', null, 'nor read counts');
reset role;

select * from finish();
rollback;
