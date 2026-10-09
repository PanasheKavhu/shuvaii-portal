-- pgTAP: subject_comments, class_comments and comment_bank (E5; D34).
-- Covers cross-school read and write for each table, who writes (the class
-- subject's teacher or a school admin for subject comments; the class
-- teacher or a school admin for class comments; the head reads all and
-- writes none), a class teacher reading their class's subject comments,
-- the deadline lock (shared with marks, including an unlock), status,
-- signature and length rules, vacation terms, the bank's private and
-- shared entries, parents, learners and anonymous users seeing nothing,
-- comments never being deleted, and audit rows per change.
--
-- Fixture (rolled back at the end). School A: Alice (admin), Hank (head),
-- Tina (class teacher of 4 Blue, teaches nothing), Sam (teaches Maths in
-- 4 Blue), Hope (hod, teaches English in 4 Blue), Gina (class teacher of
-- 3 Green and its Maths teacher), Pat (parent), Lara (learner role). School
-- B: Bob (admin), Bert (class teacher and Maths teacher of its 4 Blue).
-- School A terms: open (deadline ahead), past (deadline passed), locked,
-- and an open vacation school. The 4 Blue learner takes Maths, not English.
begin;

select plan(93);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('e3000000-0000-0000-0000-000000000001', 'alice@comments.test'),
  ('e3000000-0000-0000-0000-000000000002', 'hank@comments.test'),
  ('e3000000-0000-0000-0000-000000000003', 'tina@comments.test'),
  ('e3000000-0000-0000-0000-000000000004', 'sam@comments.test'),
  ('e3000000-0000-0000-0000-000000000005', 'hope@comments.test'),
  ('e3000000-0000-0000-0000-000000000006', 'gina@comments.test'),
  ('e3000000-0000-0000-0000-000000000007', 'pat@comments.test'),
  ('e3000000-0000-0000-0000-000000000008', 'lara@comments.test'),
  ('e3000000-0000-0000-0000-000000000009', 'bob@comments.test'),
  ('e3000000-0000-0000-0000-00000000000a', 'bert@comments.test')
) as u (id, email);

insert into public.schools (id, slug, name, stage, timezone, status)
values
  ('a0000000-0000-0000-0000-00000000000a', 'comments-a-test', 'School A', 'secondary', 'Africa/Harare', 'active'),
  ('b0000000-0000-0000-0000-00000000000b', 'comments-b-test', 'School B', 'secondary', 'Africa/Harare', 'active');

insert into public.memberships (school_id, user_id, role, status)
values
  ('a0000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-000000000002', 'head', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-000000000004', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-000000000005', 'hod', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-000000000006', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-000000000007', 'parent', 'active'),
  ('a0000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-000000000008', 'learner', 'active'),
  ('b0000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-000000000009', 'school_admin', 'active'),
  ('b0000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-00000000000a', 'teacher', 'active');

insert into public.grading_scales (id, school_id, name, stage) values
  ('a1000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', 'Scale', 'o_level'),
  ('a1000000-0000-0000-0000-0000000000bb', 'b0000000-0000-0000-0000-00000000000b', 'Scale', 'o_level');
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values
  ('a2000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', 'Form 4', 'o_level', 'a1000000-0000-0000-0000-0000000000aa'),
  ('a2000000-0000-0000-0000-0000000000bb', 'b0000000-0000-0000-0000-00000000000b', 'Form 4', 'o_level', 'a1000000-0000-0000-0000-0000000000bb');
insert into public.academic_years (id, school_id, label, starts_on, ends_on) values
  ('a3000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', '2026', '2026-01-13', '2026-12-04'),
  ('a3000000-0000-0000-0000-0000000000bb', 'b0000000-0000-0000-0000-00000000000b', '2026', '2026-01-13', '2026-12-04');
insert into public.terms (id, school_id, academic_year_id, name, kind, starts_on, ends_on, marks_deadline, status) values
  ('70000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'Open', 'term', '2026-09-08', '2026-12-04', current_date + 30, 'open'),
  ('70000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'Past', 'term', '2026-05-05', '2026-08-07', current_date - 1, 'open'),
  ('70000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'Locked', 'term', '2026-01-13', '2026-04-09', current_date + 30, 'locked'),
  ('70000000-0000-0000-0000-0000000000a6', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'Vacation', 'vacation', '2026-04-14', '2026-04-24', current_date + 30, 'open'),
  ('70000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'a3000000-0000-0000-0000-0000000000bb', 'Open', 'term', '2026-09-08', '2026-12-04', current_date + 30, 'open');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ('c4000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'a2000000-0000-0000-0000-0000000000aa', '4 Blue', 'e3000000-0000-0000-0000-000000000003'),
  ('c3000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000aa', 'a2000000-0000-0000-0000-0000000000aa', '3 Green', 'e3000000-0000-0000-0000-000000000006'),
  ('cb000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'a3000000-0000-0000-0000-0000000000bb', 'a2000000-0000-0000-0000-0000000000bb', '4 Blue', 'e3000000-0000-0000-0000-00000000000a');
insert into public.subjects (id, school_id, code, name, stage_scope) values
  ('d1000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', 'MATH', 'Mathematics', 'secondary'),
  ('d2000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-00000000000a', 'ENG', 'English', 'secondary'),
  ('d1000000-0000-0000-0000-0000000000bb', 'b0000000-0000-0000-0000-00000000000b', 'MATH', 'Mathematics', 'secondary');
insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values
  ('c5000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-0000000000a1', 'd1000000-0000-0000-0000-0000000000aa', 'e3000000-0000-0000-0000-000000000004'),
  ('c5000000-0000-0000-0000-000000000042', 'a0000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-0000000000a1', 'd2000000-0000-0000-0000-0000000000aa', 'e3000000-0000-0000-0000-000000000005'),
  ('c5000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-0000000000a1', 'd1000000-0000-0000-0000-0000000000aa', 'e3000000-0000-0000-0000-000000000006'),
  ('c5000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'cb000000-0000-0000-0000-0000000000b1', 'd1000000-0000-0000-0000-0000000000bb', 'e3000000-0000-0000-0000-00000000000a');

insert into public.learners (id, school_id, learner_number, first_name, last_name) values
  ('f4000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'A-4B-01', 'Four', 'Blue'),
  ('f3000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'A-3G-01', 'Three', 'Green'),
  ('fb000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'B-4B-01', 'Bee', 'Learner');
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id) values
  ('e4000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'f4000000-0000-0000-0000-0000000000a1', 'c4000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000aa'),
  ('e3000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-0000000000a1', 'c3000000-0000-0000-0000-0000000000a1', 'a3000000-0000-0000-0000-0000000000aa'),
  ('eb000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', 'fb000000-0000-0000-0000-0000000000b1', 'cb000000-0000-0000-0000-0000000000b1', 'a3000000-0000-0000-0000-0000000000bb');
insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id) values
  ('a0000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000041'),
  ('a0000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000031'),
  ('b0000000-0000-0000-0000-00000000000b', 'eb000000-0000-0000-0000-0000000000b1', 'c5000000-0000-0000-0000-0000000000b1');

-- Comments, inserted as the table owner (trusted, like the seed).
insert into public.subject_comments (id, school_id, term_id, enrolment_id, class_subject_id, teacher_id, comment, status) values
  ('5c000000-0000-0000-0000-000000000411', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'e4000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000041', 'e3000000-0000-0000-0000-000000000004', 'Good', 'draft'),
  ('5c000000-0000-0000-0000-000000000412', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a2', 'e4000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000041', 'e3000000-0000-0000-0000-000000000004', 'Past', 'draft'),
  ('5c000000-0000-0000-0000-000000000311', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'e3000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000031', 'e3000000-0000-0000-0000-000000000006', 'Three', 'draft'),
  ('5c000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-0000000000b1', 'eb000000-0000-0000-0000-0000000000b1', 'c5000000-0000-0000-0000-0000000000b1', 'e3000000-0000-0000-0000-00000000000a', 'School B', 'draft');
insert into public.class_comments (id, school_id, term_id, enrolment_id, author_id, comment, status) values
  ('6c000000-0000-0000-0000-0000000004a1', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'e4000000-0000-0000-0000-0000000000a1', 'e3000000-0000-0000-0000-000000000003', 'Four', 'draft'),
  ('6c000000-0000-0000-0000-0000000003a1', 'a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'e3000000-0000-0000-0000-0000000000a1', 'e3000000-0000-0000-0000-000000000006', 'Three', 'draft'),
  ('6c000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-0000000000b1', 'eb000000-0000-0000-0000-0000000000b1', 'e3000000-0000-0000-0000-00000000000a', 'School B', 'draft');
insert into public.comment_bank (id, school_id, owner_id, subject_id, grade, text, is_shared) values
  ('7b000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-0000000000aa', 'A', 'Sam private', false),
  ('7b000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-000000000004', null, null, 'Sam shared', true),
  ('7b000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-000000000006', null, 'B', 'Gina private', false),
  ('7b000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-00000000000a', null, null, 'Bert shared', true);

set local role authenticated;

-- Hank (head): reads everything in school A, writes nothing ------------------------
select set_config('request.jwt.claim.sub', 'e3000000-0000-0000-0000-000000000002', true);

select is((select count(*) from public.subject_comments), 3::bigint, 'head reads all of the school''s subject comments');
select is((select count(*) from public.class_comments), 2::bigint, 'head reads all of the school''s class comments');
select is_empty($$ update public.subject_comments set comment = 'Head' where id = '5c000000-0000-0000-0000-000000000411' returning 1 $$, 'head cannot change a subject comment');
select throws_ok($$ insert into public.subject_comments (school_id, term_id, enrolment_id, class_subject_id, comment) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a3', 'e4000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000041', 'Head') $$, '42501', null, 'head cannot add a subject comment');
select is_empty($$ update public.class_comments set comment = 'Head' where id = '6c000000-0000-0000-0000-0000000004a1' returning 1 $$, 'head cannot change a class comment');
select is((select count(*) from public.subject_comments where school_id = 'b0000000-0000-0000-0000-00000000000b'), 0::bigint, 'head cannot read school B''s subject comments');
select ok(exists (select 1 from public.class_comment_lock('c4000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-0000000000a1')), 'head reads a class''s comment lock');

-- Alice (school A admin): her school's rows yes, school B's never ------------------
select set_config('request.jwt.claim.sub', 'e3000000-0000-0000-0000-000000000001', true);

select is((select count(*) from public.subject_comments where school_id = 'a0000000-0000-0000-0000-00000000000a'), 3::bigint, 'admin reads own school''s subject comments');
select is((select count(*) from public.subject_comments where school_id = 'b0000000-0000-0000-0000-00000000000b'), 0::bigint, 'admin cannot read school B''s subject comments');
select throws_ok($$ insert into public.subject_comments (school_id, term_id, enrolment_id, class_subject_id, comment) values ('b0000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-0000000000b1', 'eb000000-0000-0000-0000-0000000000b1', 'c5000000-0000-0000-0000-0000000000b1', 'X') $$, '42501', null, 'admin cannot add a subject comment in school B');
select is_empty($$ update public.subject_comments set comment = 'Hacked' where school_id = 'b0000000-0000-0000-0000-00000000000b' returning 1 $$, 'admin cannot change school B''s subject comments');
select is((select count(*) from public.class_comments where school_id = 'a0000000-0000-0000-0000-00000000000a'), 2::bigint, 'admin reads own school''s class comments');
select is((select count(*) from public.class_comments where school_id = 'b0000000-0000-0000-0000-00000000000b'), 0::bigint, 'admin cannot read school B''s class comments');
select throws_ok($$ insert into public.class_comments (school_id, term_id, enrolment_id, comment) values ('b0000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-0000000000b1', 'eb000000-0000-0000-0000-0000000000b1', 'X') $$, '42501', null, 'admin cannot add a class comment in school B');
select is_empty($$ update public.class_comments set comment = 'Hacked' where school_id = 'b0000000-0000-0000-0000-00000000000b' returning 1 $$, 'admin cannot change school B''s class comments');
select is((select count(*) from public.comment_bank), 1::bigint, 'admin sees only the bank entries shared in school A');
select is_empty($$ update public.comment_bank set text = 'Hacked' where id = '7b000000-0000-0000-0000-000000000002' returning 1 $$, 'admin cannot change a teacher''s shared bank entry');
select throws_ok($$ insert into public.comment_bank (school_id, owner_id, text) values ('a0000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-000000000004', 'For Sam') $$, '42501', null, 'admin cannot add a bank entry for someone else');
select is_empty($$ select 1 from public.class_comment_lock('cb000000-0000-0000-0000-0000000000b1', '70000000-0000-0000-0000-0000000000b1') $$, 'admin gets no comment lock for a school B class');

-- A school A row cannot point at a school B row.
select throws_ok($$ insert into public.subject_comments (school_id, term_id, enrolment_id, class_subject_id, comment) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'eb000000-0000-0000-0000-0000000000b1', 'c5000000-0000-0000-0000-000000000041', 'X') $$, '23503', null, 'a school A subject comment cannot point at a school B enrolment');
select throws_ok($$ insert into public.subject_comments (school_id, term_id, enrolment_id, class_subject_id, comment) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'e4000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-0000000000b1', 'X') $$, '23503', null, 'a school A subject comment cannot point at a school B class subject');
select throws_ok($$ insert into public.class_comments (school_id, term_id, enrolment_id, comment) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000b1', 'e4000000-0000-0000-0000-0000000000a1', 'X') $$, '23503', null, 'a school A class comment cannot point at a school B term');

-- Rules (as admin, who is never locked out).
select throws_ok($$ insert into public.subject_comments (school_id, term_id, enrolment_id, class_subject_id, comment) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'e4000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000042', 'X') $$, '23514', 'the learner does not take this subject', 'a subject comment for a learner who does not take the subject is refused');
select throws_ok($$ update public.subject_comments set comment = repeat('x', 101) where id = '5c000000-0000-0000-0000-000000000411' $$, '23514', null, 'a subject comment longer than 100 characters is refused');
select lives_ok($$ update public.subject_comments set comment = repeat('x', 100) where id = '5c000000-0000-0000-0000-000000000411' $$, 'a subject comment of 100 characters is accepted');
select throws_ok($$ update public.class_comments set comment = repeat('x', 301) where id = '6c000000-0000-0000-0000-0000000004a1' $$, '23514', null, 'a class comment longer than 300 characters is refused');
select throws_ok($$ update public.subject_comments set comment = '  ', status = 'submitted' where id = '5c000000-0000-0000-0000-000000000411' $$, '23514', null, 'a blank subject comment cannot be marked done');
select throws_ok($$ update public.class_comments set comment = '', status = 'submitted' where id = '6c000000-0000-0000-0000-0000000004a1' $$, '23514', null, 'a blank class comment cannot be marked done');
select lives_ok($$ update public.subject_comments set comment = 'Good work', status = 'submitted' where id = '5c000000-0000-0000-0000-000000000411' $$, 'admin marks a subject comment done');
select is(
  (select array[status::text, teacher_id::text, (signed_at is not null)::text] from public.subject_comments where id = '5c000000-0000-0000-0000-000000000411'),
  array['submitted', 'e3000000-0000-0000-0000-000000000004', 'true'],
  'marking done sets submitted and signed_at, and keeps the subject teacher''s name'
);
select throws_ok($$ insert into public.class_comments (school_id, term_id, enrolment_id, comment) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a6', 'e3000000-0000-0000-0000-0000000000a1', 'X') $$, '23514', 'class comments are for term reports, not vacation reports', 'a class comment in a vacation term is refused');
select lives_ok($$ insert into public.subject_comments (school_id, term_id, enrolment_id, class_subject_id, comment) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a6', 'e4000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000041', 'Vacation') $$, 'a subject comment in a vacation term is accepted');
select throws_ok($$ update public.subject_comments set enrolment_id = 'e3000000-0000-0000-0000-0000000000a1' where id = '5c000000-0000-0000-0000-000000000411' $$, '23514', null, 'a subject comment cannot move to another learner');

-- Admin is never locked out.
select lives_ok($$ update public.subject_comments set comment = 'Admin past' where id = '5c000000-0000-0000-0000-000000000412' $$, 'admin changes a subject comment after the deadline');
select lives_ok($$ insert into public.subject_comments (school_id, term_id, enrolment_id, class_subject_id, comment) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a3', 'e4000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000041', 'Admin locked') $$, 'admin adds a subject comment in a locked term');
select lives_ok($$ insert into public.class_comments (school_id, term_id, enrolment_id, comment) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a3', 'e4000000-0000-0000-0000-0000000000a1', 'Admin locked') $$, 'admin adds a class comment in a locked term');

-- Never deleted, and a subject choice with a comment stays.
select is_empty($$ delete from public.subject_comments where id = '5c000000-0000-0000-0000-000000000411' returning 1 $$, 'admin cannot delete a subject comment');
select is_empty($$ delete from public.class_comments where id = '6c000000-0000-0000-0000-0000000004a1' returning 1 $$, 'admin cannot delete a class comment');
select throws_ok($$ delete from public.enrolment_subjects where enrolment_id = 'e3000000-0000-0000-0000-0000000000a1' and class_subject_id = 'c5000000-0000-0000-0000-000000000031' $$, '23514', 'the learner has a comment in this subject, so it cannot be removed', 'a subject choice with a comment cannot be removed');

-- Sam (teaches 4 Blue Maths) ------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'e3000000-0000-0000-0000-000000000004', true);

select is((select count(*) from public.subject_comments), 4::bigint, 'teacher reads the comments of their own class subject in every term');
select is((select count(*) from public.subject_comments where class_subject_id = 'c5000000-0000-0000-0000-000000000031'), 0::bigint, 'teacher cannot read another class''s subject comments');
select is((select count(*) from public.class_comments), 0::bigint, 'a subject teacher who is not class teacher reads no class comments');
select lives_ok($$ update public.subject_comments set comment = 'Keep it up', status = 'draft' where id = '5c000000-0000-0000-0000-000000000411' $$, 'teacher changes their comment in the open term');
select is(
  (select array[status::text, (signed_at is null)::text] from public.subject_comments where id = '5c000000-0000-0000-0000-000000000411'),
  array['draft', 'true'],
  'back to draft clears the signature'
);
select lives_ok($$ update public.subject_comments set status = 'submitted' where id = '5c000000-0000-0000-0000-000000000411' $$, 'teacher marks their comment done');
select ok((select signed_at is not null from public.subject_comments where id = '5c000000-0000-0000-0000-000000000411'), 'marking done signs the comment');
select throws_ok($$ update public.subject_comments set comment = 'Late' where id = '5c000000-0000-0000-0000-000000000412' $$, '42501', 'comments for this class subject are locked; ask the school admin', 'teacher cannot change a comment after the deadline');
select throws_ok($$ update public.subject_comments set comment = 'Locked' where term_id = '70000000-0000-0000-0000-0000000000a3' $$, '42501', null, 'teacher cannot change a comment in a locked term');
select is_empty($$ update public.subject_comments set comment = 'Not mine' where id = '5c000000-0000-0000-0000-000000000311' returning 1 $$, 'teacher cannot change another class''s subject comment');
select throws_ok($$ insert into public.subject_comments (school_id, term_id, enrolment_id, class_subject_id, comment) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a2', 'e3000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000031', 'Not mine') $$, '42501', null, 'teacher cannot add a comment to another class''s subject');
select throws_ok($$ insert into public.class_comments (school_id, term_id, enrolment_id, comment) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a2', 'e4000000-0000-0000-0000-0000000000a1', 'X') $$, '42501', null, 'a subject teacher cannot write a class comment');
select is_empty($$ select 1 from public.class_comment_lock('c4000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-0000000000a1') $$, 'a subject teacher gets no class comment lock');

-- The bank: own entries plus shared ones.
select is((select count(*) from public.comment_bank), 2::bigint, 'teacher sees their own bank entries and none of another teacher''s private ones');
select lives_ok($$ insert into public.comment_bank (school_id, subject_id, grade, text) values ('a0000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-0000000000aa', 'C', 'Steady effort') $$, 'teacher saves a bank entry');
select is((select owner_id::text from public.comment_bank where text = 'Steady effort'), 'e3000000-0000-0000-0000-000000000004', 'the new entry belongs to the teacher');
select lives_ok($$ update public.comment_bank set is_shared = true where id = '7b000000-0000-0000-0000-000000000001' $$, 'teacher shares their entry');
select is_empty($$ update public.comment_bank set text = 'Hacked' where id = '7b000000-0000-0000-0000-000000000003' returning 1 $$, 'teacher cannot change another teacher''s entry');
select throws_ok($$ insert into public.comment_bank (school_id, owner_id, text) values ('a0000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-000000000006', 'For Gina') $$, '42501', null, 'teacher cannot add an entry for another teacher');
select throws_ok($$ insert into public.comment_bank (school_id, text) values ('b0000000-0000-0000-0000-00000000000b', 'In B') $$, '42501', null, 'teacher cannot add a bank entry in school B');
select throws_ok($$ insert into public.comment_bank (school_id, subject_id, text) values ('a0000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-0000000000bb', 'B subject') $$, '23503', null, 'a bank entry cannot point at a school B subject');
select is_empty($$ delete from public.comment_bank where id = '7b000000-0000-0000-0000-000000000003' returning 1 $$, 'teacher cannot delete another teacher''s entry');
select lives_ok($$ delete from public.comment_bank where text = 'Steady effort' $$, 'teacher deletes their own entry');

-- Unlocking the class subject reopens its comments, as for marks.
select set_config('request.jwt.claim.sub', 'e3000000-0000-0000-0000-000000000002', true);
select lives_ok($$ select public.unlock_class_subject('c5000000-0000-0000-0000-000000000041', '70000000-0000-0000-0000-0000000000a2', 'Comment missed') $$, 'head unlocks 4 Blue Maths for the past term');
select set_config('request.jwt.claim.sub', 'e3000000-0000-0000-0000-000000000004', true);
select lives_ok($$ update public.subject_comments set comment = 'Late but fine' where id = '5c000000-0000-0000-0000-000000000412' $$, 'after the unlock the teacher changes the comment');
select set_config('request.jwt.claim.sub', 'e3000000-0000-0000-0000-000000000002', true);
select lives_ok($$ select public.relock_class_subject('c5000000-0000-0000-0000-000000000041', '70000000-0000-0000-0000-0000000000a2') $$, 'head relocks');
select set_config('request.jwt.claim.sub', 'e3000000-0000-0000-0000-000000000004', true);
select throws_ok($$ update public.subject_comments set comment = 'Too late' where id = '5c000000-0000-0000-0000-000000000412' $$, '42501', null, 'after the relock the teacher is locked out again');

-- Hope (hod, teaches English in 4 Blue): scoped like a teacher ---------------------------
select set_config('request.jwt.claim.sub', 'e3000000-0000-0000-0000-000000000005', true);
select is((select count(*) from public.subject_comments), 0::bigint, 'hod reads no comments of subjects they do not teach');
select is_empty($$ update public.subject_comments set comment = 'Hod' where id = '5c000000-0000-0000-0000-000000000411' returning 1 $$, 'hod cannot change another teacher''s subject comment');

-- Tina (class teacher of 4 Blue, teaches nothing) -----------------------------------------
select set_config('request.jwt.claim.sub', 'e3000000-0000-0000-0000-000000000003', true);

select is((select count(*) from public.subject_comments), 4::bigint, 'class teacher reads every subject comment of their class');
select is((select count(*) from public.subject_comments where class_subject_id = 'c5000000-0000-0000-0000-000000000031'), 0::bigint, 'class teacher cannot read another class''s subject comments');
select is_empty($$ update public.subject_comments set comment = 'Class teacher' where id = '5c000000-0000-0000-0000-000000000411' returning 1 $$, 'class teacher cannot change a subject comment they did not teach');
select is((select count(*) from public.class_comments), 2::bigint, 'class teacher reads their class''s comments in every term');
select lives_ok($$ update public.class_comments set comment = 'A good term', status = 'submitted' where id = '6c000000-0000-0000-0000-0000000004a1' $$, 'class teacher writes and marks done the class comment');
select is((select author_id::text from public.class_comments where id = '6c000000-0000-0000-0000-0000000004a1'), 'e3000000-0000-0000-0000-000000000003', 'the class comment records its author');
select is_empty($$ update public.class_comments set comment = 'Not mine' where id = '6c000000-0000-0000-0000-0000000003a1' returning 1 $$, 'class teacher cannot change another class''s comment');
select throws_ok($$ insert into public.class_comments (school_id, term_id, enrolment_id, comment) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a2', 'e3000000-0000-0000-0000-0000000000a1', 'Not mine') $$, '42501', null, 'class teacher cannot add a comment for another class''s learner');
select throws_ok($$ insert into public.class_comments (school_id, term_id, enrolment_id, comment) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a2', 'e4000000-0000-0000-0000-0000000000a1', 'Late') $$, '42501', 'class comments for this term are locked; ask the school admin', 'class teacher cannot add a class comment after the deadline');
select results_eq(
  $$ select teachers_locked, lock_reason from public.class_comment_lock('c4000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-0000000000a2') $$,
  $$ values (true, 'deadline_passed') $$,
  'class comment lock says the deadline passed'
);
select results_eq(
  $$ select teachers_locked, lock_reason from public.class_comment_lock('c4000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-0000000000a1') $$,
  $$ values (false, null::text) $$,
  'class comment lock is open in the open term'
);
select is_empty($$ select 1 from public.class_comment_lock('c3000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-0000000000a1') $$, 'class teacher gets no lock for another class');

-- Parents, learners, school B and anonymous users see nothing of school A ----------------
select set_config('request.jwt.claim.sub', 'e3000000-0000-0000-0000-000000000007', true);
select is((select count(*) from public.subject_comments) + (select count(*) from public.class_comments) + (select count(*) from public.comment_bank), 0::bigint, 'parent sees no comments or bank entries');
select set_config('request.jwt.claim.sub', 'e3000000-0000-0000-0000-000000000008', true);
select is((select count(*) from public.subject_comments) + (select count(*) from public.class_comments) + (select count(*) from public.comment_bank), 0::bigint, 'learner sees no comments or bank entries');
select throws_ok($$ insert into public.comment_bank (school_id, text) values ('a0000000-0000-0000-0000-00000000000a', 'X') $$, '42501', null, 'learner cannot add a bank entry');

select set_config('request.jwt.claim.sub', 'e3000000-0000-0000-0000-00000000000a', true);
select is((select count(*) from public.subject_comments), 1::bigint, 'school B teacher reads only their own subject comment');
select is((select count(*) from public.class_comments), 1::bigint, 'school B class teacher reads only their own class comment');
select is((select count(*) from public.comment_bank), 1::bigint, 'school B teacher sees only school B''s shared entry');
select throws_ok($$ insert into public.subject_comments (school_id, term_id, enrolment_id, class_subject_id, comment) values ('a0000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-0000000000a1', 'e4000000-0000-0000-0000-0000000000a1', 'c5000000-0000-0000-0000-000000000041', 'X') $$, '42501', null, 'school B teacher cannot add a comment in school A');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is((select count(*) from public.subject_comments) + (select count(*) from public.class_comments) + (select count(*) from public.comment_bank), 0::bigint, 'anonymous sees no comments or bank entries');
select throws_ok($$ select * from public.class_comment_lock('c4000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-0000000000a1') $$, '42501', null, 'anonymous cannot call class_comment_lock');

reset role;

-- Audit: one row per change, with old and new values ---------------------------------------
select is(
  (select count(*) from public.audit_log where table_name = 'subject_comments' and row_id = '5c000000-0000-0000-0000-000000000411' and action = 'update'),
  4::bigint,
  'each change to a subject comment writes one audit row (refused changes write none)'
);
select is(
  (select array[old_data ->> 'comment', new_data ->> 'comment', actor_id::text]
   from public.audit_log
   where table_name = 'subject_comments' and row_id = '5c000000-0000-0000-0000-000000000411'
     and new_data ->> 'comment' = 'Keep it up' and old_data ->> 'comment' = 'Good work'),
  array['Good work', 'Keep it up', 'e3000000-0000-0000-0000-000000000004'],
  'the audit row has the old and new comment and who changed it'
);
select is(
  (select count(*) from public.audit_log where table_name = 'class_comments' and row_id = '6c000000-0000-0000-0000-0000000004a1' and action = 'update'),
  1::bigint,
  'a class comment change writes one audit row'
);
select is(
  (select count(*) from public.audit_log where table_name = 'class_comments' and action = 'insert' and new_data ->> 'comment' = 'Admin locked'),
  1::bigint,
  'a new class comment writes an audit row'
);

select * from finish();
rollback;
