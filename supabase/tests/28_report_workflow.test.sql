-- pgTAP: the report workflow functions (US-6.1, US-6.2, US-6.3, US-5.4,
-- US-6.7; D44). Every allowed and refused transition through the API:
-- gaps; generating and refreshing drafts; submitting; the head's comment;
-- "result not available"; returning with a note; approving; publishing with
-- the frozen snapshot and codes; a vacation report through the same flow;
-- who may call each function (class teacher, head, subject teacher, hod,
-- school admin, parent, learner, another school's head and class teacher,
-- anon); direct writes refused; and the audit rows.
--
-- Fixture (rolled back at the end). School A: Alice (admin), Hank (head),
-- Tina (class teacher of 4 Blue), Sam (teaches Maths in 4 Blue), Hope (hod,
-- teaches English in 4 Blue), Pat (parent of Lungi), Lara (Lungi's own
-- login). School B: Bert (head), Bea (class teacher of its 4 Blue).
-- 4 Blue's learners in Term 3: Lungi (everything done), Lerato (no English
-- comment, class comment not marked done), Lindo (no Maths Test mark).
-- A vacation school term where every learner's Maths is complete.
begin;

select plan(88);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('e8000000-0000-0000-0000-000000000001', 'alice@workflow.test'),
  ('e8000000-0000-0000-0000-000000000002', 'hank@workflow.test'),
  ('e8000000-0000-0000-0000-000000000003', 'tina@workflow.test'),
  ('e8000000-0000-0000-0000-000000000004', 'sam@workflow.test'),
  ('e8000000-0000-0000-0000-000000000005', 'hope@workflow.test'),
  ('e8000000-0000-0000-0000-000000000007', 'pat@workflow.test'),
  ('e8000000-0000-0000-0000-000000000009', 'lara@workflow.test'),
  ('e8000000-0000-0000-0000-00000000000c', 'bert@workflow.test'),
  ('e8000000-0000-0000-0000-00000000000d', 'bea@workflow.test')
) as u (id, email);
update public.profiles p set full_name = n.name
from (values
  ('e8000000-0000-0000-0000-000000000002', 'Mr Hank Head'),
  ('e8000000-0000-0000-0000-000000000003', 'Mrs Tina Teacher'),
  ('e8000000-0000-0000-0000-000000000004', 'Mr Sam Maths'),
  ('e8000000-0000-0000-0000-000000000005', 'Ms Hope English')
) as n (id, name)
where p.id = n.id::uuid;

insert into public.schools (id, slug, name, motto, stage, timezone, status, primary_color, report_footer_text)
values
  ('a0000000-0000-0000-0000-0000000000a8', 'workflow-a-test', 'Workflow High', 'Strive', 'secondary', 'Africa/Harare', 'active', '#0b5fa5', 'P.O. Box 1, Harare'),
  ('b0000000-0000-0000-0000-0000000000b8', 'workflow-b-test', 'Other High', null, 'secondary', 'Africa/Harare', 'active', null, null);

insert into public.memberships (school_id, user_id, role, status)
values
  ('a0000000-0000-0000-0000-0000000000a8', 'e8000000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a0000000-0000-0000-0000-0000000000a8', 'e8000000-0000-0000-0000-000000000002', 'head', 'active'),
  ('a0000000-0000-0000-0000-0000000000a8', 'e8000000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-0000000000a8', 'e8000000-0000-0000-0000-000000000004', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-0000000000a8', 'e8000000-0000-0000-0000-000000000005', 'hod', 'active'),
  ('a0000000-0000-0000-0000-0000000000a8', 'e8000000-0000-0000-0000-000000000007', 'parent', 'active'),
  ('a0000000-0000-0000-0000-0000000000a8', 'e8000000-0000-0000-0000-000000000009', 'learner', 'active'),
  ('b0000000-0000-0000-0000-0000000000b8', 'e8000000-0000-0000-0000-00000000000c', 'head', 'active'),
  ('b0000000-0000-0000-0000-0000000000b8', 'e8000000-0000-0000-0000-00000000000d', 'teacher', 'active');

insert into public.grading_scales (id, school_id, name, stage) values
  ('a1000000-0000-0000-0000-0000000000a8', 'a0000000-0000-0000-0000-0000000000a8', 'Our O-Level key', 'o_level'),
  ('a1000000-0000-0000-0000-0000000000b8', 'b0000000-0000-0000-0000-0000000000b8', 'Scale', 'o_level');
insert into public.grading_bands (school_id, scale_id, grade, min_mark, max_mark, remark)
select 'a0000000-0000-0000-0000-0000000000a8', 'a1000000-0000-0000-0000-0000000000a8', g, lo, hi, r
from (values ('A', 70, 100, 'Excellent'), ('B', 60, 69, null), ('C', 50, 59, null),
             ('D', 45, 49, null), ('E', 40, 44, null), ('U', 0, 39, null)) as b (g, lo, hi, r);
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values
  ('a2000000-0000-0000-0000-0000000000a8', 'a0000000-0000-0000-0000-0000000000a8', 'Form 4', 'o_level', 'a1000000-0000-0000-0000-0000000000a8'),
  ('a2000000-0000-0000-0000-0000000000b8', 'b0000000-0000-0000-0000-0000000000b8', 'Form 4', 'o_level', 'a1000000-0000-0000-0000-0000000000b8');
insert into public.academic_years (id, school_id, label, starts_on, ends_on) values
  ('a3000000-0000-0000-0000-0000000000a8', 'a0000000-0000-0000-0000-0000000000a8', '2026', '2026-01-13', '2026-12-04'),
  ('a3000000-0000-0000-0000-0000000000b8', 'b0000000-0000-0000-0000-0000000000b8', '2026', '2026-01-13', '2026-12-04');
insert into public.terms (id, school_id, academic_year_id, name, kind, starts_on, ends_on, status) values
  ('78000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-0000000000a8', 'a3000000-0000-0000-0000-0000000000a8', 'Term 3', 'term', '2026-09-08', '2026-12-04', 'open'),
  ('78000000-0000-0000-0000-0000000000a6', 'a0000000-0000-0000-0000-0000000000a8', 'a3000000-0000-0000-0000-0000000000a8', 'April vacation school', 'vacation', '2026-04-14', '2026-04-24', 'open'),
  ('78000000-0000-0000-0000-0000000000b3', 'b0000000-0000-0000-0000-0000000000b8', 'a3000000-0000-0000-0000-0000000000b8', 'Term 3', 'term', '2026-09-08', '2026-12-04', 'open');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ('c8000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a8', 'a3000000-0000-0000-0000-0000000000a8', 'a2000000-0000-0000-0000-0000000000a8', '4 Blue', 'e8000000-0000-0000-0000-000000000003'),
  ('c8000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b8', 'a3000000-0000-0000-0000-0000000000b8', 'a2000000-0000-0000-0000-0000000000b8', '4 Blue', 'e8000000-0000-0000-0000-00000000000d');
insert into public.subjects (id, school_id, code, name, stage_scope, sort_order) values
  ('d8000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a8', 'MATH', 'Mathematics', 'secondary', 1),
  ('d8000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000a8', 'ENG', 'English', 'secondary', 2);
insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values
  ('c9000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a8', 'c8000000-0000-0000-0000-0000000000a1', 'd8000000-0000-0000-0000-0000000000a1', 'e8000000-0000-0000-0000-000000000004'),
  ('c9000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000a8', 'c8000000-0000-0000-0000-0000000000a1', 'd8000000-0000-0000-0000-0000000000a2', 'e8000000-0000-0000-0000-000000000005');

insert into public.learners (id, school_id, learner_number, first_name, last_name, user_id) values
  ('f8000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a8', 'W-01', 'Lungi', 'Moyo', 'e8000000-0000-0000-0000-000000000009'),
  ('f8000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000a8', 'W-02', 'Lerato', 'Dube', null),
  ('f8000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-0000000000a8', 'W-03', 'Lindo', 'Ncube', null);
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id) values
  ('e8100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a8', 'f8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000a8'),
  ('e8100000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000a8', 'f8000000-0000-0000-0000-000000000002', 'c8000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000a8'),
  ('e8100000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-0000000000a8', 'f8000000-0000-0000-0000-000000000003', 'c8000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000a8');
insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id)
select 'a0000000-0000-0000-0000-0000000000a8', e, cs
from unnest(array['e8100000-0000-0000-0000-000000000001', 'e8100000-0000-0000-0000-000000000002', 'e8100000-0000-0000-0000-000000000003']::uuid[]) e,
     unnest(array['c9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000002']::uuid[]) cs;
insert into public.guardians (id, school_id, full_name, user_id) values
  ('9a800000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a8', 'Pat Moyo', 'e8000000-0000-0000-0000-000000000007');
insert into public.guardian_links (school_id, guardian_id, learner_id, relationship, is_primary) values
  ('a0000000-0000-0000-0000-0000000000a8', '9a800000-0000-0000-0000-000000000001', 'f8000000-0000-0000-0000-000000000001', 'mother', true);

-- Term 3: Maths Test (50 out of 50, 50%) and Exam (out of 100, 50%); English Exam (100%).
insert into public.assessments (id, school_id, term_id, class_subject_id, name, type, max_mark, weight_percent, sort_order) values
  ('a8100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a8', '78000000-0000-0000-0000-0000000000a3', 'c9000000-0000-0000-0000-000000000001', 'Test', 'test', 50, 50, 1),
  ('a8100000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000a8', '78000000-0000-0000-0000-0000000000a3', 'c9000000-0000-0000-0000-000000000001', 'Exam', 'exam', 100, 50, 2),
  ('a8100000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-0000000000a8', '78000000-0000-0000-0000-0000000000a3', 'c9000000-0000-0000-0000-000000000002', 'Exam', 'exam', 100, 100, 1),
  ('a8100000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-0000000000a8', '78000000-0000-0000-0000-0000000000a6', 'c9000000-0000-0000-0000-000000000001', 'Vacation test', 'test', 100, 100, 1);
insert into public.marks (school_id, assessment_id, enrolment_id, score) values
  -- Lungi: Maths 40/50 and 80 -> 80 (A); English 65 (B); average 72.5.
  ('a0000000-0000-0000-0000-0000000000a8', 'a8100000-0000-0000-0000-000000000001', 'e8100000-0000-0000-0000-000000000001', 40),
  ('a0000000-0000-0000-0000-0000000000a8', 'a8100000-0000-0000-0000-000000000002', 'e8100000-0000-0000-0000-000000000001', 80),
  ('a0000000-0000-0000-0000-0000000000a8', 'a8100000-0000-0000-0000-000000000003', 'e8100000-0000-0000-0000-000000000001', 65),
  -- Lerato: Maths 25/50 and 50 -> 50 (C); English 55 (C).
  ('a0000000-0000-0000-0000-0000000000a8', 'a8100000-0000-0000-0000-000000000001', 'e8100000-0000-0000-0000-000000000002', 25),
  ('a0000000-0000-0000-0000-0000000000a8', 'a8100000-0000-0000-0000-000000000002', 'e8100000-0000-0000-0000-000000000002', 50),
  ('a0000000-0000-0000-0000-0000000000a8', 'a8100000-0000-0000-0000-000000000003', 'e8100000-0000-0000-0000-000000000002', 55),
  -- Lindo: no Maths Test mark; Maths Exam 70; English 75 (A).
  ('a0000000-0000-0000-0000-0000000000a8', 'a8100000-0000-0000-0000-000000000002', 'e8100000-0000-0000-0000-000000000003', 70),
  ('a0000000-0000-0000-0000-0000000000a8', 'a8100000-0000-0000-0000-000000000003', 'e8100000-0000-0000-0000-000000000003', 75),
  -- Vacation school: everyone's Maths.
  ('a0000000-0000-0000-0000-0000000000a8', 'a8100000-0000-0000-0000-000000000006', 'e8100000-0000-0000-0000-000000000001', 66),
  ('a0000000-0000-0000-0000-0000000000a8', 'a8100000-0000-0000-0000-000000000006', 'e8100000-0000-0000-0000-000000000002', 52),
  ('a0000000-0000-0000-0000-0000000000a8', 'a8100000-0000-0000-0000-000000000006', 'e8100000-0000-0000-0000-000000000003', 71);

-- Comments: all done except Lerato's English (none) and Lerato's class comment (a draft).
insert into public.subject_comments (school_id, term_id, enrolment_id, class_subject_id, teacher_id, comment, status, signed_at)
select 'a0000000-0000-0000-0000-0000000000a8', t, e, cs, (select teacher_id from public.class_subjects where id = cs), 'Good work.', 'submitted', now()
from (values
  ('78000000-0000-0000-0000-0000000000a3'::uuid, 'e8100000-0000-0000-0000-000000000001'::uuid, 'c9000000-0000-0000-0000-000000000001'::uuid),
  ('78000000-0000-0000-0000-0000000000a3', 'e8100000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000002'),
  ('78000000-0000-0000-0000-0000000000a3', 'e8100000-0000-0000-0000-000000000002', 'c9000000-0000-0000-0000-000000000001'),
  ('78000000-0000-0000-0000-0000000000a3', 'e8100000-0000-0000-0000-000000000003', 'c9000000-0000-0000-0000-000000000001'),
  ('78000000-0000-0000-0000-0000000000a3', 'e8100000-0000-0000-0000-000000000003', 'c9000000-0000-0000-0000-000000000002'),
  ('78000000-0000-0000-0000-0000000000a6', 'e8100000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001'),
  ('78000000-0000-0000-0000-0000000000a6', 'e8100000-0000-0000-0000-000000000002', 'c9000000-0000-0000-0000-000000000001'),
  ('78000000-0000-0000-0000-0000000000a6', 'e8100000-0000-0000-0000-000000000003', 'c9000000-0000-0000-0000-000000000001')
) as c (t, e, cs);
insert into public.class_comments (school_id, term_id, enrolment_id, comment, status) values
  ('a0000000-0000-0000-0000-0000000000a8', '78000000-0000-0000-0000-0000000000a3', 'e8100000-0000-0000-0000-000000000001', 'A fine term.', 'submitted'),
  ('a0000000-0000-0000-0000-0000000000a8', '78000000-0000-0000-0000-0000000000a3', 'e8100000-0000-0000-0000-000000000002', 'Half written', 'draft'),
  ('a0000000-0000-0000-0000-0000000000a8', '78000000-0000-0000-0000-0000000000a3', 'e8100000-0000-0000-0000-000000000003', 'Keep going.', 'submitted');

create function pg_temp.as_user(p_id text)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_id, true);
$$;

create function pg_temp.report_of(p_enrolment text, p_term text default '78000000-0000-0000-0000-0000000000a3')
returns public.reports language sql as $$
  select * from public.reports
  where enrolment_id = p_enrolment::uuid and term_id = p_term::uuid and status <> 'withdrawn';
$$;
grant execute on function pg_temp.as_user(text) to authenticated, anon;
grant execute on function pg_temp.report_of(text, text) to authenticated;

-- Short names for the ids used in calls.
create function pg_temp.c() returns uuid language sql as $$ select 'c8000000-0000-0000-0000-0000000000a1'::uuid $$;
create function pg_temp.t() returns uuid language sql as $$ select '78000000-0000-0000-0000-0000000000a3'::uuid $$;
create function pg_temp.v() returns uuid language sql as $$ select '78000000-0000-0000-0000-0000000000a6'::uuid $$;
grant execute on function pg_temp.c() to authenticated, anon;
grant execute on function pg_temp.t() to authenticated, anon;
grant execute on function pg_temp.v() to authenticated, anon;

set local role authenticated;

-- Gaps: exactly what each learner lacks -----------------------------------------------------

select pg_temp.as_user('e8000000-0000-0000-0000-000000000003');
select results_eq(
  $$ select l.first_name, g.gap, g.subject_name, g.reason, g.assessment_names
     from public.report_gaps(pg_temp.c(), pg_temp.t()) g
     join public.enrolments e on e.id = g.enrolment_id join public.learners l on l.id = e.learner_id
     order by l.first_name, g.gap $$,
  $$ values ('Lerato'::text, 'class_comment'::text, null::text, 'not_done'::text, null::text[]),
            ('Lerato', 'subject_comment', 'English', 'missing', null),
            ('Lindo', 'result', 'Mathematics', 'missing_mark', array['Test']) $$,
  'the class teacher sees each learner''s gaps: the subject, why, and which assessment');

select pg_temp.as_user('e8000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.report_gaps(pg_temp.c(), pg_temp.t())), 3, 'the head sees the gaps too');
select pg_temp.as_user('e8000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.report_gaps(pg_temp.c(), pg_temp.t())), 0, 'a subject teacher gets no gaps');
select pg_temp.as_user('e8000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.report_gaps(pg_temp.c(), pg_temp.t())), 0, 'another school''s head gets no gaps');

-- Generating drafts ---------------------------------------------------------------------------

select pg_temp.as_user('e8000000-0000-0000-0000-000000000004');
select throws_ok($$ select * from public.generate_report_drafts(pg_temp.c(), pg_temp.t()) $$, '42501', null, 'a subject teacher cannot generate drafts');
select pg_temp.as_user('e8000000-0000-0000-0000-000000000002');
select throws_ok($$ select * from public.generate_report_drafts(pg_temp.c(), pg_temp.t()) $$, '42501', null, 'the head cannot generate drafts');
select pg_temp.as_user('e8000000-0000-0000-0000-000000000001');
select throws_ok($$ select * from public.generate_report_drafts(pg_temp.c(), pg_temp.t()) $$, '42501', null, 'the school admin cannot generate drafts');
select pg_temp.as_user('e8000000-0000-0000-0000-000000000007');
select throws_ok($$ select * from public.generate_report_drafts(pg_temp.c(), pg_temp.t()) $$, '42501', null, 'a parent cannot generate drafts');
select pg_temp.as_user('e8000000-0000-0000-0000-00000000000d');
select throws_ok($$ select * from public.generate_report_drafts(pg_temp.c(), pg_temp.t()) $$, '42501', null, 'another school''s class teacher cannot generate drafts');

select pg_temp.as_user('e8000000-0000-0000-0000-000000000003');
select throws_ok($$ select * from public.generate_report_drafts(pg_temp.c(), '78000000-0000-0000-0000-0000000000b3') $$, '22023', null, 'a term of another school is refused');
select results_eq(
  $$ select l.first_name, d.outcome from public.generate_report_drafts(pg_temp.c(), pg_temp.t()) d
     join public.enrolments e on e.id = d.enrolment_id join public.learners l on l.id = e.learner_id
     order by l.first_name $$,
  $$ values ('Lerato'::text, 'missing'::text), ('Lindo', 'missing'), ('Lungi', 'created') $$,
  'generating makes a draft for the learner with nothing missing and skips the rest');
select is((select (status, version, reference_code, verification_code, created_by)::text from pg_temp.report_of('e8100000-0000-0000-0000-000000000001')),
  '(draft,1,,,e8000000-0000-0000-0000-000000000003)', 'the draft has no codes yet and is the class teacher''s');
select is(
  (select jsonb_build_object('subjects', jsonb_path_query_array(snapshot, '$.subjects[*] ? (@.subject != "") .subject'),
     'marks', jsonb_path_query_array(snapshot, '$.subjects[*].mark'),
     'grades', jsonb_path_query_array(snapshot, '$.subjects[*].grade'),
     'teachers', jsonb_path_query_array(snapshot, '$.subjects[*].teacher'),
     'comment', snapshot -> 'subjects' -> 0 -> 'comment',
     'signed', snapshot -> 'subjects' -> 0 -> 'signed_at' is not null,
     'average', snapshot -> 'average', 'position', snapshot -> 'position', 'size', snapshot -> 'class_size',
     'class_comment', snapshot -> 'class_comment', 'learner', snapshot -> 'learner' -> 'name', 'class', snapshot -> 'class')
   from pg_temp.report_of('e8100000-0000-0000-0000-000000000001')),
  '{"subjects": ["Mathematics", "English"], "marks": [80, 65], "grades": ["A", "B"], "teachers": ["Mr Sam Maths", "Ms Hope English"], "comment": "Good work.", "signed": true, "average": 72.5, "position": 2, "size": 3, "class_comment": "A fine term.", "learner": "Lungi Moyo", "class": "4 Blue"}'::jsonb,
  'the draft holds the subject lines, average, position and comments from subject_results(), class_positions() and the comments');
select is((select (average_percent, class_position, class_size)::text from pg_temp.report_of('e8100000-0000-0000-0000-000000000001')), '(72.5,2,3)', 'the draft''s average and position columns match');

select results_eq(
  $$ select l.first_name, d.outcome from public.generate_report_drafts(pg_temp.c(), pg_temp.t(), true) d
     join public.enrolments e on e.id = d.enrolment_id join public.learners l on l.id = e.learner_id
     order by l.first_name $$,
  $$ values ('Lerato'::text, 'missing'::text), ('Lindo', 'created'), ('Lungi', 'refreshed') $$,
  'asked to, the class teacher also drafts a learner whose only gap is a subject without a result; comments are always needed');
select is((select snapshot -> 'subjects' -> 0 ->> 'status' from pg_temp.report_of('e8100000-0000-0000-0000-000000000003')), 'incomplete', 'that draft shows the subject without a result');

reset role;
update public.marks set score = 30
where assessment_id = 'a8100000-0000-0000-0000-000000000003' and enrolment_id = 'e8100000-0000-0000-0000-000000000001';
set local role authenticated;
select lives_ok($$ select * from public.generate_report_drafts(pg_temp.c(), pg_temp.t()) $$, 'the class teacher generates again');
select is((select (snapshot -> 'subjects' -> 1 ->> 'mark') || ' ' || average_percent from pg_temp.report_of('e8100000-0000-0000-0000-000000000001')), '30 55.0', 'regenerating refreshes a draft from the marks as they are now');
select is((select snapshot -> 'subjects' -> 0 ->> 'status' from pg_temp.report_of('e8100000-0000-0000-0000-000000000003')), 'incomplete', 'regenerating without asking leaves an existing draft with an incomplete subject alone');

-- Submitting ------------------------------------------------------------------------------------

select pg_temp.as_user('e8000000-0000-0000-0000-000000000004');
select throws_ok($$ select public.submit_class_reports(pg_temp.c(), pg_temp.t()) $$, '42501', null, 'a subject teacher cannot submit');
select pg_temp.as_user('e8000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.submit_class_reports(pg_temp.c(), pg_temp.t()) $$, '42501', null, 'the head cannot submit for the class teacher');
select pg_temp.as_user('e8000000-0000-0000-0000-000000000003');
select is(public.submit_class_reports(pg_temp.c(), pg_temp.t()), 2, 'the class teacher submits the class''s drafts');
select is((select (status, submitted_by)::text from pg_temp.report_of('e8100000-0000-0000-0000-000000000001')), '(submitted,e8000000-0000-0000-0000-000000000003)', 'the submission is stamped with the class teacher');
select throws_ok($$ select public.submit_class_reports(pg_temp.c(), pg_temp.t()) $$, 'P0001', 'there are no draft reports to submit', 'nothing left to submit');
select results_eq(
  $$ select d.outcome from public.generate_report_drafts(pg_temp.c(), pg_temp.t(), true) d where d.enrolment_id = 'e8100000-0000-0000-0000-000000000001' $$,
  $$ values ('submitted'::text) $$, 'generating leaves a submitted report alone');
select throws_ok($$ select public.approve_class_reports(pg_temp.c(), pg_temp.t()) $$, '42501', null, 'the class teacher cannot approve');
select throws_ok($$ select public.publish_class_reports(pg_temp.c(), pg_temp.t()) $$, '42501', null, 'the class teacher cannot publish');
select throws_ok($$ select public.return_class_reports(pg_temp.c(), pg_temp.t(), 'Mine') $$, '42501', null, 'the class teacher cannot take reports back');

-- The head's comment and "result not available" ----------------------------------------------------

select throws_ok($$ select public.set_report_head_comment((pg_temp.report_of('e8100000-0000-0000-0000-000000000001')).id, 'Mine') $$, '42501', null, 'the class teacher cannot write the head''s comment');
select throws_ok($$ select public.set_report_result_not_available((pg_temp.report_of('e8100000-0000-0000-0000-000000000003')).id, 'c9000000-0000-0000-0000-000000000001', true) $$, '42501', null, 'the class teacher cannot mark a result not available');

select pg_temp.as_user('e8000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.set_report_head_comment('00000000-0000-0000-0000-000000000000', 'x') $$, '42501', null, 'an unknown report is refused like another school''s');

reset role;
create temp table ids as
select enrolment_id, id from public.reports where school_id = 'a0000000-0000-0000-0000-0000000000a8';
grant select on ids to authenticated;
set local role authenticated;
create function pg_temp.rid(p_enrolment text) returns uuid language sql as $$
  select id from ids where enrolment_id = p_enrolment::uuid;
$$;
grant execute on function pg_temp.rid(text) to authenticated;

select pg_temp.as_user('e8000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.set_report_head_comment(pg_temp.rid('e8100000-0000-0000-0000-000000000001'), 'x') $$, '42501', null, 'another school''s head cannot write the head''s comment');
select throws_ok($$ select public.approve_class_reports(pg_temp.c(), pg_temp.t()) $$, '42501', null, 'another school''s head cannot approve');
select throws_ok($$ select public.publish_class_reports(pg_temp.c(), pg_temp.t()) $$, '42501', null, 'another school''s head cannot publish');

select pg_temp.as_user('e8000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.set_report_head_comment(pg_temp.rid('e8100000-0000-0000-0000-000000000001'), repeat('x', 201)) $$, '23514', null, 'the head''s comment fits the layout (200 characters)');
select lives_ok($$ select public.set_report_head_comment(pg_temp.rid('e8100000-0000-0000-0000-000000000001'), '  Keep it up.  ') $$, 'the head writes the head''s comment on a submitted report');
select is((select head_comment from pg_temp.report_of('e8100000-0000-0000-0000-000000000001')), 'Keep it up.', 'the comment is stored, trimmed');
select throws_ok($$ select public.set_report_result_not_available(pg_temp.rid('e8100000-0000-0000-0000-000000000001'), 'c9000000-0000-0000-0000-000000000001', true) $$, '23514', null, 'only a subject without a result can be marked not available');

-- Approving with an open gap, returning ---------------------------------------------------------

select throws_ok($$ select public.approve_class_reports(pg_temp.c(), pg_temp.t()) $$, '23514',
  '1 report has a subject without a result: mark it "result not available" or return the reports',
  'a report with an incomplete subject cannot be approved');
select is((select status::text from pg_temp.report_of('e8100000-0000-0000-0000-000000000001')), 'submitted', 'and nothing in the class was approved');
select throws_ok($$ select public.return_class_reports(pg_temp.c(), pg_temp.t(), '  ') $$, '23514', null, 'returning needs a note');
select is(public.return_class_reports(pg_temp.c(), pg_temp.t(), 'Lerato has no report yet.'), 2, 'the head returns the class''s reports with a note');
select is((select (status, return_note, returned_by)::text from pg_temp.report_of('e8100000-0000-0000-0000-000000000001')),
  '(draft,"Lerato has no report yet.",e8000000-0000-0000-0000-000000000002)', 'a returned report is a draft with the note and who returned it');
select is((select head_comment from pg_temp.report_of('e8100000-0000-0000-0000-000000000001')), 'Keep it up.', 'the head''s comment stays');
select throws_ok($$ select public.return_class_reports(pg_temp.c(), pg_temp.t(), 'Again') $$, 'P0001', 'there are no submitted reports to return', 'nothing left to return');
select throws_ok($$ select public.approve_class_reports(pg_temp.c(), pg_temp.t()) $$, 'P0001', 'there are no submitted reports to approve', 'nothing to approve');
select throws_ok($$ select public.publish_class_reports(pg_temp.c(), pg_temp.t()) $$, 'P0001', 'there are no approved reports to publish', 'nothing to publish');
select throws_ok($$ select public.set_report_head_comment(pg_temp.rid('e8100000-0000-0000-0000-000000000001'), 'x') $$, '23514', null, 'the head''s comment is not written on a draft');

-- The class teacher fixes Lerato's gaps and resubmits ---------------------------------------------

reset role;
insert into public.subject_comments (school_id, term_id, enrolment_id, class_subject_id, teacher_id, comment, status, signed_at)
values ('a0000000-0000-0000-0000-0000000000a8', '78000000-0000-0000-0000-0000000000a3', 'e8100000-0000-0000-0000-000000000002', 'c9000000-0000-0000-0000-000000000002', 'e8000000-0000-0000-0000-000000000005', 'Read more.', 'submitted', now());
update public.class_comments set comment = 'Steady progress.', status = 'submitted'
where enrolment_id = 'e8100000-0000-0000-0000-000000000002';
set local role authenticated;

select pg_temp.as_user('e8000000-0000-0000-0000-000000000003');
select results_eq(
  $$ select l.first_name, d.outcome from public.generate_report_drafts(pg_temp.c(), pg_temp.t(), true) d
     join public.enrolments e on e.id = d.enrolment_id join public.learners l on l.id = e.learner_id
     order by l.first_name $$,
  $$ values ('Lerato'::text, 'created'::text), ('Lindo', 'refreshed'), ('Lungi', 'refreshed') $$,
  'after the fixes every learner has a draft');
select is((select return_note from pg_temp.report_of('e8100000-0000-0000-0000-000000000001')), 'Lerato has no report yet.', 'the head''s note stays on the refreshed draft');
select is(public.submit_class_reports(pg_temp.c(), pg_temp.t()), 3, 'the class teacher resubmits');
reset role;
insert into ids select enrolment_id, id from public.reports where enrolment_id = 'e8100000-0000-0000-0000-000000000002';
set local role authenticated;

select pg_temp.as_user('e8000000-0000-0000-0000-000000000002');
select lives_ok($$ select public.set_report_result_not_available(pg_temp.rid('e8100000-0000-0000-0000-000000000003'), 'c9000000-0000-0000-0000-000000000001', true) $$, 'the head marks Lindo''s Maths "result not available"');
select is(public.approve_class_reports(pg_temp.c(), pg_temp.t()), 3, 'the head approves the class');
select is((select (status, approved_by)::text from pg_temp.report_of('e8100000-0000-0000-0000-000000000002')), '(approved,e8000000-0000-0000-0000-000000000002)', 'approval is stamped with the head');
select throws_ok($$ select public.set_report_result_not_available(pg_temp.rid('e8100000-0000-0000-0000-000000000003'), 'c9000000-0000-0000-0000-000000000001', false) $$, '23514', null, '"result not available" is decided before approval');
select lives_ok($$ select public.set_report_head_comment(pg_temp.rid('e8100000-0000-0000-0000-000000000002'), 'Well done.') $$, 'the head comments on an approved report');

-- Publishing -----------------------------------------------------------------------------------------

select pg_temp.as_user('e8000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.publish_class_reports(pg_temp.c(), pg_temp.t()) $$, '42501', null, 'the school admin cannot publish');
select pg_temp.as_user('e8000000-0000-0000-0000-000000000005');
select throws_ok($$ select public.publish_class_reports(pg_temp.c(), pg_temp.t()) $$, '42501', null, 'a hod cannot publish');
select throws_ok($$ select public.approve_class_reports(pg_temp.c(), pg_temp.t()) $$, '42501', null, 'a hod cannot approve yet (D44)');
select pg_temp.as_user('e8000000-0000-0000-0000-000000000007');
select throws_ok($$ select public.publish_class_reports(pg_temp.c(), pg_temp.t()) $$, '42501', null, 'a parent cannot publish');
select pg_temp.as_user('e8000000-0000-0000-0000-000000000009');
select throws_ok($$ select public.publish_class_reports(pg_temp.c(), pg_temp.t()) $$, '42501', null, 'a learner cannot publish');
select is((select count(*)::int from public.reports), 0, 'the learner cannot read the report before it is published');

select pg_temp.as_user('e8000000-0000-0000-0000-000000000002');
select is(public.publish_class_reports(pg_temp.c(), pg_temp.t()), 3, 'the head publishes the class');

reset role;
create temp table published as
select id, snapshot, reference_code, verification_code from public.reports
where term_id = '78000000-0000-0000-0000-0000000000a3' and status = 'published';
grant select on published to authenticated;
set local role authenticated;

select is((select (status, published_by, pdf_path)::text from pg_temp.report_of('e8100000-0000-0000-0000-000000000001')), '(published,e8000000-0000-0000-0000-000000000002,)', 'a published report is stamped with the head and has no PDF yet');
select ok((select bool_and(reference_code ~ '^[A-HJ-NP-Z2-9]{10}$' and verification_code ~ '^[A-HJ-NP-Z2-9]{24}$'
                          and snapshot ->> 'reference_code' = reference_code and snapshot ->> 'verification_code' = verification_code)
           from public.reports where term_id = pg_temp.t()),
  'each published report has a short reference code and a long verification code, in its snapshot too');
select is(
  (select jsonb_build_object('school', snapshot -> 'school' ->> 'name', 'motto', snapshot -> 'school' ->> 'motto',
     'colour', snapshot -> 'school' ->> 'primary_color', 'footer', snapshot -> 'school' ->> 'footer_text',
     'legal', snapshot -> 'template' ->> 'footer_text', 'label', snapshot -> 'template' ->> 'comment_label',
     'sections', snapshot -> 'template' -> 'sections' -> 'class_comment',
     'key', snapshot -> 'grading_key' ->> 'scale', 'bands', jsonb_array_length(snapshot -> 'grading_key' -> 'bands'),
     'top', snapshot -> 'grading_key' -> 'bands' -> 0, 'head', snapshot ->> 'head_comment', 'head_name', snapshot ->> 'head_name',
     'class_comment', snapshot ->> 'class_comment', 'position', snapshot -> 'position', 'version', snapshot -> 'version')
   from pg_temp.report_of('e8100000-0000-0000-0000-000000000001')),
  '{"school": "Workflow High", "motto": "Strive", "colour": "#0b5fa5", "footer": "P.O. Box 1, Harare", "legal": "This report is issued without erasure or amendments.", "label": "Teacher''s comment", "sections": true, "key": "Our O-Level key", "bands": 6, "top": {"grade": "A", "min_mark": 70, "max_mark": 100, "remark": "Excellent"}, "head": "Keep it up.", "head_name": "Mr Hank Head", "class_comment": "A fine term.", "position": 2, "version": 1}'::jsonb,
  'the snapshot has the school, template, the school''s own grading key, the head''s and class comments and position');
select is((select (snapshot -> 'subjects' -> 0) - 'signed_at' - 'class_subject_id' from pg_temp.report_of('e8100000-0000-0000-0000-000000000003')),
  '{"subject": "Mathematics", "mark": null, "grade": null, "remark": null, "status": "incomplete", "reason": "missing_mark", "comment": "Good work.", "teacher": "Mr Sam Maths", "not_available": true}'::jsonb,
  'a subject marked "result not available" is published with no mark or grade');
select throws_ok($$ select public.publish_class_reports(pg_temp.c(), pg_temp.t()) $$, 'P0001', null, 'nothing is published twice');
select throws_ok($$ select public.set_report_head_comment(pg_temp.rid('e8100000-0000-0000-0000-000000000001'), 'Later') $$, '23514', null, 'a published report''s head''s comment cannot change');

-- Frozen: later marks, comments and bands do not change a published report.
reset role;
select pg_temp.as_user('');
update public.marks set score = 45 where enrolment_id = 'e8100000-0000-0000-0000-000000000001' and assessment_id <> 'a8100000-0000-0000-0000-000000000006';
update public.class_comments set comment = 'Changed later.' where enrolment_id = 'e8100000-0000-0000-0000-000000000001';
update public.grading_bands set remark = 'Changed' where grade = 'A' and scale_id = 'a1000000-0000-0000-0000-0000000000a8';
update public.schools set name = 'Renamed High' where id = 'a0000000-0000-0000-0000-0000000000a8';
set local role authenticated;
select pg_temp.as_user('e8000000-0000-0000-0000-000000000003');
select results_eq($$ select d.outcome from public.generate_report_drafts(pg_temp.c(), pg_temp.t()) d $$, $$ values ('published'::text), ('published'), ('published') $$, 'generating leaves published reports alone');
select pg_temp.as_user('e8000000-0000-0000-0000-000000000002');
select ok((select bool_and(r.snapshot = p.snapshot and r.reference_code = p.reference_code) from public.reports r join published p on p.id = r.id),
  'a published snapshot and its codes do not change when marks, comments, bands or the school change afterwards');

select pg_temp.as_user('e8000000-0000-0000-0000-000000000007');
select is((select count(*)::int from public.reports), 1, 'the parent now reads their child''s published report');
select pg_temp.as_user('e8000000-0000-0000-0000-000000000009');
select is((select count(*)::int from public.reports), 1, 'the learner reads their own published report');

-- Vacation school: the same flow with the vacation template ------------------------------------------

select pg_temp.as_user('e8000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.report_gaps(pg_temp.c(), pg_temp.v())), 0, 'a vacation report needs no class teacher''s comment');
select results_eq($$ select d.outcome from public.generate_report_drafts(pg_temp.c(), pg_temp.v()) d $$, $$ values ('created'::text), ('created'), ('created') $$, 'every learner gets a vacation draft');
select is((select jsonb_build_object('average', snapshot -> 'average', 'position', snapshot -> 'position', 'class_comment', snapshot -> 'class_comment', 'mark', snapshot -> 'subjects' -> 0 -> 'mark')
           from pg_temp.report_of('e8100000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a6')),
  '{"average": null, "position": null, "class_comment": null, "mark": 66}'::jsonb, 'a vacation draft has marks but no average, position or class comment');
select is(public.submit_class_reports(pg_temp.c(), pg_temp.v()), 3, 'the class teacher submits the vacation reports');
select pg_temp.as_user('e8000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.set_report_head_comment((pg_temp.report_of('e8100000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a6')).id, 'Hi') $$, '23514', 'this report has no head''s comment', 'a vacation report has no head''s comment');
select is(public.approve_class_reports(pg_temp.c(), pg_temp.v()), 3, 'the head approves the vacation reports');
select is(public.publish_class_reports(pg_temp.c(), pg_temp.v()), 3, 'the head publishes the vacation reports');
select is((select jsonb_build_object('kind', snapshot -> 'kind', 'template', snapshot -> 'template' -> 'name', 'position', snapshot -> 'position', 'head', snapshot -> 'head_comment')
           from pg_temp.report_of('e8100000-0000-0000-0000-000000000001', '78000000-0000-0000-0000-0000000000a6')),
  '{"kind": "vacation", "template": "Vacation school report", "position": null, "head": null}'::jsonb,
  'the published vacation report uses the vacation template, with no position or head''s comment');

-- No way around the functions ----------------------------------------------------------------------

select pg_temp.as_user('e8000000-0000-0000-0000-000000000002');
select throws_ok($$ update public.reports set status = 'withdrawn', withdrawn_reason = 'x' where id = pg_temp.rid('e8100000-0000-0000-0000-000000000001') $$, '42501', null, 'the head cannot write a report directly');
select pg_temp.as_user('e8000000-0000-0000-0000-000000000003');
select throws_ok($$ insert into public.reports (school_id, term_id, enrolment_id, template_id) select 'a0000000-0000-0000-0000-0000000000a8', '78000000-0000-0000-0000-0000000000a3', 'e8100000-0000-0000-0000-000000000001', id from public.report_templates where term_kind = 'term' $$, '42501', null, 'the class teacher cannot insert a report directly');
select pg_temp.as_user('e8000000-0000-0000-0000-000000000007');
select throws_ok($$ update public.reports set head_comment = 'x' $$, '42501', null, 'a parent cannot write a report directly');

set local role anon;
select pg_temp.as_user('');
select throws_ok($$ select public.publish_class_reports(pg_temp.c(), pg_temp.t()) $$, '42501', null, 'anon cannot call the workflow functions');

-- Audit: every state change, with who made it -----------------------------------------------------------

reset role;
select is(
  (select array_agg(coalesce(old_data ->> 'status', '-') || '>' || (new_data ->> 'status') || ' ' || split_part(p.full_name, ' ', 2) order by a.id)
   from public.audit_log a join public.profiles p on p.id = a.actor_id
   where a.table_name = 'reports' and a.row_id = (select id from ids where enrolment_id = 'e8100000-0000-0000-0000-000000000001')
     and (a.action = 'insert' or a.old_data ->> 'status' <> a.new_data ->> 'status')),
  array['->draft Tina', 'draft>submitted Tina', 'submitted>draft Hank', 'draft>submitted Tina', 'submitted>approved Hank', 'approved>published Hank'],
  'every state change of a report is audited with who made it');
select is((select count(*)::int from public.audit_log
           where table_name = 'reports' and new_data ->> 'return_note' = 'Lerato has no report yet.'
             and old_data ->> 'status' = 'submitted' and new_data ->> 'status' = 'draft'),
  2, 'the return is audited with its note');
select ok((select bool_and(learner_id is not null and class_id is not null) from public.audit_log where table_name = 'reports' and school_id = 'a0000000-0000-0000-0000-0000000000a8'),
  'every report audit row names the learner and class');

select * from finish();
rollback;
