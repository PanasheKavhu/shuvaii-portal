-- pgTAP: announcements, attachments, reads and the attachments bucket
-- (US-8.1 to US-8.4; D49). Migration 20261012080000_announcements.
--
-- School admin and head write and see everything of their school; everyone
-- else sees only published, unexpired announcements addressed to them:
-- all, staff, learners, parents, or a class (its teachers, learners and
-- their parents). Platform admins and other schools see nothing. Never
-- deleted; edits audited. At most 3 attachments of 5 MB (PDF or image),
-- read only with the announcement. Reads are each person's own, once, for
-- announcements they can see; admin and head get counts only.
--
-- Fixture (rolled back at the end). School A: Ada (school admin), Hank
-- (head), Tina (teacher, class teacher of 4 Blue), Sam (teacher, class
-- teacher of 3 Green), Holly (hod, teaches Mathematics in 4 Blue), Pat
-- (parent of Lungi in 4 Blue), Quinn (parent of Kuda in 3 Green), Lara
-- (Lungi's own login). School B: Bea (school admin), Bob (parent of Bo in
-- 5A). Pam is a platform admin with no membership.
begin;

select plan(116);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('ec000000-0000-0000-0000-000000000001', 'ada@news.test'),
  ('ec000000-0000-0000-0000-000000000002', 'hank@news.test'),
  ('ec000000-0000-0000-0000-000000000003', 'tina@news.test'),
  ('ec000000-0000-0000-0000-000000000004', 'sam@news.test'),
  ('ec000000-0000-0000-0000-000000000005', 'holly@news.test'),
  ('ec000000-0000-0000-0000-000000000006', 'pat@news.test'),
  ('ec000000-0000-0000-0000-000000000007', 'quinn@news.test'),
  ('ec000000-0000-0000-0000-000000000008', 'lara@news.test'),
  ('ec000000-0000-0000-0000-000000000009', 'bea@news.test'),
  ('ec000000-0000-0000-0000-00000000000a', 'bob@news.test'),
  ('ec000000-0000-0000-0000-00000000000b', 'pam@news.test')
) as u (id, email);

update public.profiles set full_name = 'Ada Admin' where id = 'ec000000-0000-0000-0000-000000000001';
insert into public.platform_admins (user_id) values ('ec000000-0000-0000-0000-00000000000b');

insert into public.schools (id, slug, name, stage, timezone, status) values
  ('a0000000-0000-0000-0000-0000000000ac', 'news-a-test', 'News High', 'secondary', 'Africa/Harare', 'active'),
  ('b0000000-0000-0000-0000-0000000000bc', 'news-b-test', 'Other High', 'secondary', 'Africa/Harare', 'active');
insert into public.memberships (school_id, user_id, role, status) values
  ('a0000000-0000-0000-0000-0000000000ac', 'ec000000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a0000000-0000-0000-0000-0000000000ac', 'ec000000-0000-0000-0000-000000000002', 'head', 'active'),
  ('a0000000-0000-0000-0000-0000000000ac', 'ec000000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-0000000000ac', 'ec000000-0000-0000-0000-000000000004', 'teacher', 'active'),
  ('a0000000-0000-0000-0000-0000000000ac', 'ec000000-0000-0000-0000-000000000005', 'hod', 'active'),
  ('a0000000-0000-0000-0000-0000000000ac', 'ec000000-0000-0000-0000-000000000006', 'parent', 'active'),
  ('a0000000-0000-0000-0000-0000000000ac', 'ec000000-0000-0000-0000-000000000007', 'parent', 'active'),
  ('a0000000-0000-0000-0000-0000000000ac', 'ec000000-0000-0000-0000-000000000008', 'learner', 'active'),
  ('b0000000-0000-0000-0000-0000000000bc', 'ec000000-0000-0000-0000-000000000009', 'school_admin', 'active'),
  ('b0000000-0000-0000-0000-0000000000bc', 'ec000000-0000-0000-0000-00000000000a', 'parent', 'active');

insert into public.grading_scales (id, school_id, name, stage) values
  ('a1000000-0000-0000-0000-0000000000ac', 'a0000000-0000-0000-0000-0000000000ac', 'Key', 'o_level'),
  ('b1000000-0000-0000-0000-0000000000bc', 'b0000000-0000-0000-0000-0000000000bc', 'Key', 'o_level');
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values
  ('a2000000-0000-0000-0000-0000000000a4', 'a0000000-0000-0000-0000-0000000000ac', 'Form 4', 'o_level', 'a1000000-0000-0000-0000-0000000000ac'),
  ('a2000000-0000-0000-0000-0000000000a3', 'a0000000-0000-0000-0000-0000000000ac', 'Form 3', 'o_level', 'a1000000-0000-0000-0000-0000000000ac'),
  ('b2000000-0000-0000-0000-0000000000b5', 'b0000000-0000-0000-0000-0000000000bc', 'Form 5', 'o_level', 'b1000000-0000-0000-0000-0000000000bc');
insert into public.academic_years (id, school_id, label, starts_on, ends_on) values
  ('a3000000-0000-0000-0000-0000000000ac', 'a0000000-0000-0000-0000-0000000000ac', '2026', '2026-01-13', '2026-12-04'),
  ('b3000000-0000-0000-0000-0000000000bc', 'b0000000-0000-0000-0000-0000000000bc', '2026', '2026-01-13', '2026-12-04');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ('cc000000-0000-0000-0000-0000000004b0', 'a0000000-0000-0000-0000-0000000000ac', 'a3000000-0000-0000-0000-0000000000ac', 'a2000000-0000-0000-0000-0000000000a4', '4 Blue', 'ec000000-0000-0000-0000-000000000003'),
  ('cc000000-0000-0000-0000-0000000003a0', 'a0000000-0000-0000-0000-0000000000ac', 'a3000000-0000-0000-0000-0000000000ac', 'a2000000-0000-0000-0000-0000000000a3', '3 Green', 'ec000000-0000-0000-0000-000000000004'),
  ('cc000000-0000-0000-0000-0000000005a0', 'b0000000-0000-0000-0000-0000000000bc', 'b3000000-0000-0000-0000-0000000000bc', 'b2000000-0000-0000-0000-0000000000b5', '5A', null);
insert into public.subjects (id, school_id, code, name, stage_scope, sort_order)
values ('db000000-0000-0000-0000-0000000000ac', 'a0000000-0000-0000-0000-0000000000ac', 'MATH', 'Mathematics', 'secondary', 1);
insert into public.class_subjects (school_id, class_id, subject_id, teacher_id)
values ('a0000000-0000-0000-0000-0000000000ac', 'cc000000-0000-0000-0000-0000000004b0', 'db000000-0000-0000-0000-0000000000ac', 'ec000000-0000-0000-0000-000000000005');
insert into public.learners (id, school_id, learner_number, first_name, last_name, user_id) values
  ('fc000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000ac', 'N-01', 'Lungi', 'Moyo', 'ec000000-0000-0000-0000-000000000008'),
  ('fc000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000ac', 'N-02', 'Kuda', 'Ncube', null),
  ('fc000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-0000000000bc', 'N-03', 'Bo', 'Other', null);
insert into public.enrolments (school_id, learner_id, class_id, academic_year_id) values
  ('a0000000-0000-0000-0000-0000000000ac', 'fc000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-0000000004b0', 'a3000000-0000-0000-0000-0000000000ac'),
  ('a0000000-0000-0000-0000-0000000000ac', 'fc000000-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-0000000003a0', 'a3000000-0000-0000-0000-0000000000ac'),
  ('b0000000-0000-0000-0000-0000000000bc', 'fc000000-0000-0000-0000-000000000003', 'cc000000-0000-0000-0000-0000000005a0', 'b3000000-0000-0000-0000-0000000000bc');
insert into public.guardians (id, school_id, full_name, user_id) values
  ('9ac00000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000ac', 'Pat Moyo', 'ec000000-0000-0000-0000-000000000006'),
  ('9ac00000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000ac', 'Quinn Ncube', 'ec000000-0000-0000-0000-000000000007'),
  ('9ac00000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-0000000000bc', 'Bob Other', 'ec000000-0000-0000-0000-00000000000a');
insert into public.guardian_links (school_id, guardian_id, learner_id, relationship, is_primary) values
  ('a0000000-0000-0000-0000-0000000000ac', '9ac00000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', 'mother', true),
  ('a0000000-0000-0000-0000-0000000000ac', '9ac00000-0000-0000-0000-000000000002', 'fc000000-0000-0000-0000-000000000002', 'father', true),
  ('b0000000-0000-0000-0000-0000000000bc', '9ac00000-0000-0000-0000-000000000003', 'fc000000-0000-0000-0000-000000000003', 'father', true);

-- One announcement of each kind in school A (the title says which), one in
-- school B. Written as the seed does (service role: author and dates kept).
insert into public.announcements (id, school_id, title, body, audience, class_id, pinned, status, published_at, expires_at, author_id) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000ac', 'all', 'For everyone.', 'all', null, true, 'published', now() - interval '9 days', null, 'ec000000-0000-0000-0000-000000000001'),
  ('a5000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000ac', 'staff', 'Staff meeting.', 'staff', null, false, 'published', now() - interval '8 days', null, 'ec000000-0000-0000-0000-000000000002'),
  ('a5000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-0000000000ac', 'learners', 'Sports day.', 'learners', null, false, 'published', now() - interval '7 days', null, 'ec000000-0000-0000-0000-000000000001'),
  ('a5000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-0000000000ac', 'parents', 'Parents evening.', 'parents', null, false, 'published', now() - interval '6 days', null, 'ec000000-0000-0000-0000-000000000001'),
  ('a5000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-0000000000ac', '4b', '4 Blue trip.', 'class', 'cc000000-0000-0000-0000-0000000004b0', false, 'published', now() - interval '5 days', null, 'ec000000-0000-0000-0000-000000000001'),
  ('a5000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-0000000000ac', '3g', '3 Green trip.', 'class', 'cc000000-0000-0000-0000-0000000003a0', false, 'published', now() - interval '4 days', null, 'ec000000-0000-0000-0000-000000000001'),
  ('a5000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-0000000000ac', 'draft', 'Not yet.', 'all', null, false, 'draft', null, null, 'ec000000-0000-0000-0000-000000000001'),
  ('a5000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-0000000000ac', 'archived', 'Old news.', 'all', null, true, 'archived', now() - interval '3 days', null, 'ec000000-0000-0000-0000-000000000001'),
  ('a5000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-0000000000ac', 'expired', 'Was for a week.', 'all', null, false, 'published', now() - interval '2 days', now() - interval '1 day', 'ec000000-0000-0000-0000-000000000001'),
  ('b5000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000bc', 'b-all', 'School B news.', 'all', null, false, 'published', now() - interval '1 day', null, 'ec000000-0000-0000-0000-000000000009');

create function pg_temp.as_user(p_id text)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_id, true);
$$;
-- The titles of the announcements the caller can read, sorted.
create function pg_temp.seen()
returns text[] language sql as $$
  select coalesce(array_agg(title order by title), '{}') from public.announcements;
$$;
grant execute on function pg_temp.as_user(text) to authenticated, anon;
grant execute on function pg_temp.seen() to authenticated, anon;

-- Who sees what -----------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
select is(pg_temp.seen(), array['3g', '4b', 'all', 'archived', 'draft', 'expired', 'learners', 'parents', 'staff'],
  'school admin sees every announcement of the school, drafts, archived and expired ones too');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000002');
select is(pg_temp.seen(), array['3g', '4b', 'all', 'archived', 'draft', 'expired', 'learners', 'parents', 'staff'],
  'so does the head');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000003');
select is(pg_temp.seen(), array['4b', 'all', 'staff'],
  'a class teacher sees staff and all, and their own class''s; no draft, archived or expired one');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000004');
select is(pg_temp.seen(), array['3g', 'all', 'staff'], 'the 3 Green class teacher sees 3 Green''s, not 4 Blue''s');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000005');
select is(pg_temp.seen(), array['4b', 'all', 'staff'], 'a hod who teaches a subject in 4 Blue sees 4 Blue''s');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000006');
select is(pg_temp.seen(), array['4b', 'all', 'parents'],
  'a parent of a 4 Blue learner sees parents, all and 4 Blue, not 3 Green, staff or learners');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000007');
select is(pg_temp.seen(), array['3g', 'all', 'parents'], 'a parent of a 3 Green learner sees 3 Green''s, not 4 Blue''s');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000008');
select is(pg_temp.seen(), array['4b', 'all', 'learners'],
  'a learner sees learners, all and their class, not parents or staff');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000009');
select is(pg_temp.seen(), array['b-all'], 'school B''s admin sees only school B''s');
select pg_temp.as_user('ec000000-0000-0000-0000-00000000000a');
select is(pg_temp.seen(), array['b-all'], 'school B''s parent sees only school B''s');
select pg_temp.as_user('ec000000-0000-0000-0000-00000000000b');
select is(pg_temp.seen(), '{}'::text[], 'a platform admin sees none (D5)');
reset role;
set local role anon;
select pg_temp.as_user('');
select is(pg_temp.seen(), '{}'::text[], 'nobody signed out sees any');
reset role;

-- Writing announcements ----------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
select lives_ok(
  $$ insert into public.announcements (id, school_id, title, body, audience, author_id, published_at)
     values ('a5000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-0000000000ac', 'new', 'Fresh.', 'all',
             'ec000000-0000-0000-0000-000000000002', '2000-01-01') $$,
  'the school admin writes a draft');
select results_eq(
  $$ select author_id::text, published_at is null, status::text from public.announcements where id = 'a5000000-0000-0000-0000-000000000010' $$,
  $$ values ('ec000000-0000-0000-0000-000000000001', true, 'draft') $$,
  'the author is whoever wrote it and a draft has no published date, whatever was sent');
select throws_ok(
  $$ insert into public.announcements (school_id, title, body, author_id)
     values ('b0000000-0000-0000-0000-0000000000bc', 'x', 'x', 'ec000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'the school admin cannot post in school B');
select throws_ok(
  $$ insert into public.announcements (school_id, title, body, audience, class_id, author_id)
     values ('a0000000-0000-0000-0000-0000000000ac', 'x', 'x', 'class', 'cc000000-0000-0000-0000-0000000005a0', 'ec000000-0000-0000-0000-000000000001') $$,
  '23503', null, 'or address school A''s announcement to a school B class');
select throws_ok(
  $$ insert into public.announcements (school_id, title, body, audience, author_id)
     values ('a0000000-0000-0000-0000-0000000000ac', 'x', 'x', 'class', 'ec000000-0000-0000-0000-000000000001') $$,
  '23514', null, 'a class announcement names its class');
select throws_ok(
  $$ insert into public.announcements (school_id, title, body, audience, class_id, author_id)
     values ('a0000000-0000-0000-0000-0000000000ac', 'x', 'x', 'parents', 'cc000000-0000-0000-0000-0000000004b0', 'ec000000-0000-0000-0000-000000000001') $$,
  '23514', null, 'and only a class announcement names one');
select throws_ok(
  $$ insert into public.announcements (school_id, title, body, author_id)
     values ('a0000000-0000-0000-0000-0000000000ac', '  ', 'x', 'ec000000-0000-0000-0000-000000000001') $$,
  '23514', null, 'a title is not blank');
select is_empty(
  $$ update public.announcements set title = 'B hacked' where id = 'b5000000-0000-0000-0000-000000000001' returning 1 $$,
  'the school admin cannot edit school B''s');

select pg_temp.as_user('ec000000-0000-0000-0000-000000000003');
select throws_ok(
  $$ insert into public.announcements (school_id, title, body, author_id)
     values ('a0000000-0000-0000-0000-0000000000ac', 'x', 'x', 'ec000000-0000-0000-0000-000000000003') $$,
  '42501', null, 'a teacher cannot post');
select is_empty(
  $$ update public.announcements set pinned = true where id = 'a5000000-0000-0000-0000-000000000002' returning 1 $$,
  'or pin');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000005');
select throws_ok(
  $$ insert into public.announcements (school_id, title, body, author_id)
     values ('a0000000-0000-0000-0000-0000000000ac', 'x', 'x', 'ec000000-0000-0000-0000-000000000005') $$,
  '42501', null, 'nor can a hod');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000006');
select throws_ok(
  $$ insert into public.announcements (school_id, title, body, author_id)
     values ('a0000000-0000-0000-0000-0000000000ac', 'x', 'x', 'ec000000-0000-0000-0000-000000000006') $$,
  '42501', null, 'nor a parent');
select pg_temp.as_user('ec000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ insert into public.announcements (school_id, title, body, author_id)
     values ('a0000000-0000-0000-0000-0000000000ac', 'x', 'x', 'ec000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'nor a platform admin');

-- The draft: a parent cannot see it until the head publishes it.
select pg_temp.as_user('ec000000-0000-0000-0000-000000000006');
select is((select count(*)::int from public.announcements where id = 'a5000000-0000-0000-0000-000000000010'), 0,
  'a parent cannot see a draft');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000002');
select lives_ok(
  $$ update public.announcements set status = 'published', published_at = '2000-01-01'
     where id = 'a5000000-0000-0000-0000-000000000010' $$,
  'the head publishes it');
select is(
  (select published_at > now() - interval '1 minute' from public.announcements where id = 'a5000000-0000-0000-0000-000000000010'),
  true, 'its published date is now, whatever was sent');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000006');
select is((select count(*)::int from public.announcements where id = 'a5000000-0000-0000-0000-000000000010'), 1,
  'the parent now sees it');

select pg_temp.as_user('ec000000-0000-0000-0000-000000000002');
select lives_ok(
  $$ update public.announcements set title = 'new, corrected', pinned = true, expires_at = now() + interval '7 days'
     where id = 'a5000000-0000-0000-0000-000000000010' $$,
  'the head edits and pins the published announcement');
select throws_ok(
  $$ update public.announcements set status = 'draft' where id = 'a5000000-0000-0000-0000-000000000010' $$,
  'P0001', 'a published or archived announcement cannot go back to draft; archive it instead',
  'a published one never goes back to draft');
select throws_ok(
  $$ update public.announcements set author_id = 'ec000000-0000-0000-0000-000000000002' where id = 'a5000000-0000-0000-0000-000000000010' $$,
  'P0001', 'the author of an announcement cannot change', 'its author never changes');
select throws_ok(
  $$ update public.announcements set school_id = 'b0000000-0000-0000-0000-0000000000bc' where id = 'a5000000-0000-0000-0000-000000000010' $$,
  'P0001', 'a row''s school cannot change', 'it never moves to school B');
select throws_ok(
  $$ delete from public.announcements where id = 'a5000000-0000-0000-0000-000000000010' $$,
  '42501', null, 'nobody deletes an announcement through the API');
reset role;
select pg_temp.as_user('');
select throws_ok(
  $$ delete from public.announcements where id = 'a5000000-0000-0000-0000-000000000010' $$,
  'P0001', 'announcements are never deleted; archive them instead', 'not even the table owner (rule 6)');
select results_eq(
  $$ select action::text, actor_id::text, old_data ->> 'title', new_data ->> 'title'
     from public.audit_log where table_name = 'announcements' and row_id = 'a5000000-0000-0000-0000-000000000010'
     order by id $$,
  $$ values ('insert', 'ec000000-0000-0000-0000-000000000001', null, 'new'),
            ('update', 'ec000000-0000-0000-0000-000000000002', 'new', 'new'),
            ('update', 'ec000000-0000-0000-0000-000000000002', 'new', 'new, corrected') $$,
  'writing, publishing and editing are audited with who and the title before and after');
select is(
  (select school_id::text from public.audit_log where table_name = 'announcements' and row_id = 'a5000000-0000-0000-0000-000000000010' limit 1),
  'a0000000-0000-0000-0000-0000000000ac', 'against school A');

set local role authenticated;
select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
select lives_ok(
  $$ update public.announcements set status = 'archived' where id = 'a5000000-0000-0000-0000-000000000010' $$,
  'the school admin archives it');
select is((select count(*)::int from public.announcements where id = 'a5000000-0000-0000-0000-000000000010'), 1,
  'and still sees it');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000006');
select is((select count(*)::int from public.announcements where id = 'a5000000-0000-0000-0000-000000000010'), 0,
  'the parent no longer does');

-- Attachments -------------------------------------------------------------------------

select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
select lives_ok(
  $$ insert into public.announcement_attachments (school_id, announcement_id, path, filename, content_type, size_bytes) values
     ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000001/calendar.pdf', 'calendar.pdf', 'application/pdf', 5242880),
     ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000001/map.png', 'map.png', 'image/png', 1000),
     ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000001/photo.jpg', 'photo.jpg', 'image/jpeg', 2000) $$,
  'the school admin attaches three files of up to 5 MB');
select throws_ok(
  $$ insert into public.announcement_attachments (school_id, announcement_id, path, filename, content_type, size_bytes) values
     ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000001/four.webp', 'four.webp', 'image/webp', 10) $$,
  'P0001', 'an announcement has at most 3 attachments', 'not a fourth');
select throws_ok(
  $$ insert into public.announcement_attachments (school_id, announcement_id, path, filename, content_type, size_bytes) values
     ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000004/big.pdf', 'big.pdf', 'application/pdf', 5242881) $$,
  '23514', null, 'nothing over 5 MB');
select throws_ok(
  $$ insert into public.announcement_attachments (school_id, announcement_id, path, filename, content_type, size_bytes) values
     ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000004/run.exe', 'run.exe', 'application/octet-stream', 10) $$,
  '23514', null, 'only PDF or an image');
select throws_ok(
  $$ insert into public.announcement_attachments (school_id, announcement_id, path, filename, content_type, size_bytes) values
     ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000004/note.pdf', 'note.pdf', 'image/png', 10) $$,
  '23514', null, 'whose type matches its name');
select throws_ok(
  $$ insert into public.announcement_attachments (school_id, announcement_id, path, filename, content_type, size_bytes) values
     ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-0000000000bc/a5000000-0000-0000-0000-000000000004/note.pdf', 'note.pdf', 'application/pdf', 10) $$,
  '23514', null, 'stored in the announcement''s own folder');
select throws_ok(
  $$ insert into public.announcement_attachments (school_id, announcement_id, path, filename, content_type, size_bytes) values
     ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000008/late.pdf', 'late.pdf', 'application/pdf', 10) $$,
  'P0001', 'an archived announcement cannot get new attachments', 'not on an archived announcement');
select throws_ok(
  $$ insert into public.announcement_attachments (school_id, announcement_id, path, filename, content_type, size_bytes) values
     ('b0000000-0000-0000-0000-0000000000bc', 'b5000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000bc/b5000000-0000-0000-0000-000000000001/x.pdf', 'x.pdf', 'application/pdf', 10) $$,
  '42501', null, 'the school admin cannot attach to school B''s');
select throws_ok(
  $$ update public.announcement_attachments set size_bytes = 1 where filename = 'map.png' $$,
  '42501', null, 'an attachment is never changed in place');

select pg_temp.as_user('ec000000-0000-0000-0000-000000000009');
select throws_ok(
  $$ insert into public.announcement_attachments (school_id, announcement_id, path, filename, content_type, size_bytes) values
     ('b0000000-0000-0000-0000-0000000000bc', 'a5000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-0000000000bc/a5000000-0000-0000-0000-000000000002/x.pdf', 'x.pdf', 'application/pdf', 10) $$,
  '23503', null, 'school B''s admin cannot hang a school B file on a school A announcement');
select throws_ok(
  $$ insert into public.announcement_attachments (school_id, announcement_id, path, filename, content_type, size_bytes) values
     ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000002/x.pdf', 'x.pdf', 'application/pdf', 10) $$,
  '42501', null, 'or attach to school A''s');
select is((select count(*)::int from public.announcement_attachments), 0, 'and sees none of school A''s attachments');

select pg_temp.as_user('ec000000-0000-0000-0000-000000000002');
select lives_ok(
  $$ insert into public.announcement_attachments (school_id, announcement_id, path, filename, content_type, size_bytes) values
     ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000002/agenda.pdf', 'agenda.pdf', 'application/pdf', 10),
     ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000004/letter.pdf', 'letter.pdf', 'application/pdf', 10) $$,
  'the head attaches files too');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000003');
select throws_ok(
  $$ insert into public.announcement_attachments (school_id, announcement_id, path, filename, content_type, size_bytes) values
     ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000004/t.pdf', 't.pdf', 'application/pdf', 10) $$,
  '42501', null, 'a teacher cannot attach files');
select is(
  array(select filename from public.announcement_attachments order by filename),
  array['agenda.pdf', 'calendar.pdf', 'map.png', 'photo.jpg'],
  'a teacher sees the attachments of the staff and all announcements, not the parents one');
select is_empty($$ delete from public.announcement_attachments returning 1 $$, 'and removes none');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000006');
select is(
  array(select filename from public.announcement_attachments order by filename),
  array['calendar.pdf', 'letter.pdf', 'map.png', 'photo.jpg'],
  'a parent sees the parents and all attachments, not the staff one');
select pg_temp.as_user('ec000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.announcement_attachments), 0, 'a platform admin sees none');

-- The attachments bucket ----------------------------------------------------------------

reset role;
select results_eq(
  $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'attachments' $$,
  $$ values (false, 5242880::bigint, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']) $$,
  'the attachments bucket is private, 5 MB, PDF and images only');

set local role authenticated;
select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values
     ('attachments', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000001/calendar.pdf'),
     ('attachments', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000001/map.png'),
     ('attachments', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000001/photo.jpg') $$,
  'the school admin uploads three files for an announcement');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('attachments', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000001/four.png') $$,
  '42501', null, 'not a fourth into the same announcement''s folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('attachments', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000004/run.exe') $$,
  '42501', null, 'only PDF and image names');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('attachments', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000008/late.pdf') $$,
  '42501', null, 'not for an archived announcement');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('attachments', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-0000000000ff/x.pdf') $$,
  '42501', null, 'not for an announcement that does not exist');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('attachments', 'b0000000-0000-0000-0000-0000000000bc/b5000000-0000-0000-0000-000000000001/x.pdf') $$,
  '42501', null, 'not into school B''s folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('attachments', 'b0000000-0000-0000-0000-0000000000bc/a5000000-0000-0000-0000-000000000004/x.pdf') $$,
  '42501', null, 'not under school B''s id with a school A announcement');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000002');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values
     ('attachments', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000002/agenda.pdf'),
     ('attachments', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000004/letter.pdf'),
     ('attachments', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000004/spare.pdf') $$,
  'the head uploads too');
select is((select count(*)::int from storage.objects where bucket_id = 'attachments'), 6,
  'and opens every file in the school''s folder, one with no attachment row too');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000003');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('attachments', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000002/t.pdf') $$,
  '42501', null, 'a teacher cannot upload');
select is(
  array(select split_part(name, '/', 3) from storage.objects where bucket_id = 'attachments' order by 1),
  array['agenda.pdf', 'calendar.pdf', 'map.png', 'photo.jpg'],
  'a teacher can open (and so sign a link to) the files of announcements they see only');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000006');
select is(
  array(select split_part(name, '/', 3) from storage.objects where bucket_id = 'attachments' order by 1),
  array['calendar.pdf', 'letter.pdf', 'map.png', 'photo.jpg'],
  'a parent the parents and all files, not the staff one or a file with no attachment row');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000009');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('attachments', 'a0000000-0000-0000-0000-0000000000ac/a5000000-0000-0000-0000-000000000004/x.pdf') $$,
  '42501', null, 'school B''s admin cannot upload into school A''s folder');
select is((select count(*)::int from storage.objects where bucket_id = 'attachments'), 0,
  'or open any of school A''s files');
select pg_temp.as_user('ec000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from storage.objects where bucket_id = 'attachments'), 0,
  'nor can school B''s parent');
select pg_temp.as_user('ec000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from storage.objects where bucket_id = 'attachments'), 0,
  'nor a platform admin');

-- Removing an attachment: the row first (audited), then its file.
select set_config('storage.allow_delete_query', 'true', true);
select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
select is_empty(
  $$ delete from storage.objects where bucket_id = 'attachments' and name like '%/map.png' returning 1 $$,
  'a file whose attachment row is still there cannot be removed');
select isnt_empty(
  $$ delete from public.announcement_attachments where filename = 'map.png' returning 1 $$,
  'the school admin removes the attachment');
select isnt_empty(
  $$ delete from storage.objects where bucket_id = 'attachments' and name like '%/map.png' returning 1 $$,
  'then its file');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000009');
select is_empty(
  $$ delete from storage.objects where bucket_id = 'attachments' and name like '%/spare.pdf' returning 1 $$,
  'school B''s admin cannot remove school A''s files');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000003');
select is_empty(
  $$ delete from storage.objects where bucket_id = 'attachments' and name like '%/spare.pdf' returning 1 $$,
  'nor can a teacher');
select set_config('storage.allow_delete_query', 'false', true);
reset role;
select is(
  (select count(*)::int from public.audit_log where table_name = 'announcement_attachments' and action = 'delete'),
  1, 'the removal is audited');

-- Reads ---------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('ec000000-0000-0000-0000-000000000006');
select lives_ok(
  $$ insert into public.announcement_reads (school_id, announcement_id, user_id, read_at)
     values ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000001', 'ec000000-0000-0000-0000-000000000006', '2000-01-01') $$,
  'a parent marks an announcement read');
select is((select read_at > now() - interval '1 minute' from public.announcement_reads), true,
  'at the time they read it, whatever was sent');
select throws_ok(
  $$ insert into public.announcement_reads (school_id, announcement_id, user_id)
     values ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000001', 'ec000000-0000-0000-0000-000000000006') $$,
  '23505', null, 'once');
select throws_ok(
  $$ insert into public.announcement_reads (school_id, announcement_id, user_id)
     values ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000004', 'ec000000-0000-0000-0000-000000000007') $$,
  '42501', null, 'never for someone else');
select throws_ok(
  $$ insert into public.announcement_reads (school_id, announcement_id, user_id)
     values ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000002', 'ec000000-0000-0000-0000-000000000006') $$,
  '42501', null, 'not for an announcement they cannot see (staff)');
select throws_ok(
  $$ insert into public.announcement_reads (school_id, announcement_id, user_id)
     values ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000009', 'ec000000-0000-0000-0000-000000000006') $$,
  '42501', null, 'or an expired one');
select throws_ok(
  $$ insert into public.announcement_reads (school_id, announcement_id, user_id)
     values ('b0000000-0000-0000-0000-0000000000bc', 'b5000000-0000-0000-0000-000000000001', 'ec000000-0000-0000-0000-000000000006') $$,
  '42501', null, 'or school B''s');
select throws_ok(
  $$ insert into public.announcement_reads (school_id, announcement_id, user_id)
     values ('b0000000-0000-0000-0000-0000000000bc', 'a5000000-0000-0000-0000-000000000001', 'ec000000-0000-0000-0000-000000000006') $$,
  '42501', null, 'or school A''s filed under school B');
select throws_ok(
  $$ update public.announcement_reads set read_at = now() $$, '42501', null, 'a read is never changed');
select throws_ok(
  $$ delete from public.announcement_reads $$, '42501', null, 'or removed');

select pg_temp.as_user('ec000000-0000-0000-0000-000000000008');
select lives_ok(
  $$ insert into public.announcement_reads (school_id, announcement_id, user_id) values
     ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000001', 'ec000000-0000-0000-0000-000000000008'),
     ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000005', 'ec000000-0000-0000-0000-000000000008') $$,
  'a learner marks two read');
select is((select count(*)::int from public.announcement_reads), 2, 'and sees only their own reads');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ insert into public.announcement_reads (school_id, announcement_id, user_id)
     values ('a0000000-0000-0000-0000-0000000000ac', 'a5000000-0000-0000-0000-000000000007', 'ec000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'a draft is never read, even by the admin who can open it');
select is((select count(*)::int from public.announcement_reads), 0, 'the school admin cannot read who has read what');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000009');
select is((select count(*)::int from public.announcement_reads), 0, 'nor can school B''s admin');

-- Read counts (US-8.4) --------------------------------------------------------------------

reset role;
select is(
  pg_get_function_result('public.announcement_read_counts(uuid)'::regprocedure),
  'TABLE(announcement_id uuid, read_count integer, audience_count integer)',
  'read counts return numbers per announcement, no user ids');
set local role authenticated;
select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
select results_eq(
  $$ select a.title, c.read_count, c.audience_count
     from public.announcement_read_counts('a0000000-0000-0000-0000-0000000000ac') c
     join public.announcements a on a.id = c.announcement_id
     where a.title in ('all', 'staff', 'learners', 'parents', '4b', '3g')
     order by a.title $$,
  $$ values ('3g', 0, 2), ('4b', 1, 4), ('all', 2, 8), ('learners', 0, 1), ('parents', 0, 2), ('staff', 0, 5) $$,
  'the school admin sees how many read each and how many it is for');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.announcement_read_counts('a0000000-0000-0000-0000-0000000000ac')), 10,
  'so does the head, for every announcement');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.announcement_read_counts('a0000000-0000-0000-0000-0000000000ac')), 0,
  'a teacher gets no counts');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000006');
select is((select count(*)::int from public.announcement_read_counts('a0000000-0000-0000-0000-0000000000ac')), 0,
  'nor a parent');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000009');
select is((select count(*)::int from public.announcement_read_counts('a0000000-0000-0000-0000-0000000000ac')), 0,
  'nor school B''s admin, for school A');
select pg_temp.as_user('ec000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.announcement_read_counts('a0000000-0000-0000-0000-0000000000ac')), 0,
  'nor a platform admin');

-- my_announcements() (US-8.2) ------------------------------------------------------------

reset role;
select is((select prosecdef from pg_proc where oid = 'public.my_announcements(uuid)'::regprocedure), false,
  'my_announcements() runs as the caller, so the policies decide');
set local role authenticated;
select pg_temp.as_user('ec000000-0000-0000-0000-000000000006');
select results_eq(
  $$ select title, is_unread from public.my_announcements('a0000000-0000-0000-0000-0000000000ac') $$,
  $$ values ('all', false), ('4b', true), ('parents', true) $$,
  'a parent gets the pinned one first, then newest first, with what they have not read');
select is(
  (select author_name || ' / ' || attachment_count from public.my_announcements('a0000000-0000-0000-0000-0000000000ac') where title = 'all'),
  'Ada Admin / 2', 'with the author''s name and the number of attachments');
select is(
  (select class_name from public.my_announcements('a0000000-0000-0000-0000-0000000000ac') where title = '4b'),
  '4 Blue', 'and the class a class announcement is for');
select is((select count(*)::int from public.my_announcements('b0000000-0000-0000-0000-0000000000bc')), 0,
  'nothing for school B');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000008');
select results_eq(
  $$ select title, is_unread from public.my_announcements('a0000000-0000-0000-0000-0000000000ac') $$,
  $$ values ('all', false), ('4b', false), ('learners', true) $$,
  'a learner gets learners, all and their class');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000003');
select results_eq(
  $$ select title from public.my_announcements('a0000000-0000-0000-0000-0000000000ac') $$,
  $$ values ('all'), ('4b'), ('staff') $$,
  'a teacher gets all, their class and staff');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
select results_eq(
  $$ select title, status::text, is_live, is_unread from public.my_announcements('a0000000-0000-0000-0000-0000000000ac') $$,
  $$ values ('all', 'published', true, true),
            ('draft', 'draft', false, false),
            ('new, corrected', 'archived', false, false),
            ('expired', 'published', false, false),
            ('archived', 'archived', false, false),
            ('3g', 'published', true, true),
            ('4b', 'published', true, true),
            ('parents', 'published', true, true),
            ('learners', 'published', true, true),
            ('staff', 'published', true, true) $$,
  'the school admin gets every one, only live ones pinned to the top or unread');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000009');
select is((select count(*)::int from public.my_announcements('a0000000-0000-0000-0000-0000000000ac')), 0,
  'school B''s admin gets none of school A''s');
select pg_temp.as_user('ec000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.my_announcements('a0000000-0000-0000-0000-0000000000ac')), 0,
  'nor does a platform admin');

-- Access ends with the membership or the enrolment --------------------------------------

reset role;
update public.memberships set status = 'disabled'
where user_id = 'ec000000-0000-0000-0000-000000000007';
update public.enrolments set status = 'transferred'
where learner_id = 'fc000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.as_user('ec000000-0000-0000-0000-000000000007');
select is(pg_temp.seen(), '{}'::text[], 'a parent whose membership is disabled sees nothing');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000006');
select is(pg_temp.seen(), array['all', 'parents'], 'a parent whose child moved away no longer sees the class''s');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000003');
select is(pg_temp.seen(), array['4b', 'all', 'staff'], 'the class teacher still does');
select * from finish();
rollback;
