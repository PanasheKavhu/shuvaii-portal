-- pgTAP: the newsletter functions (US-8.1 to US-8.4; D50). Migration
-- 20261012090000_newsletter_functions.
--
-- save_announcement, publish_announcement and archive_announcement: only
-- the school's admin or head, in the right state, with words for each
-- refusal. mark_announcement_read: once, only while live, only for someone
-- in the audience. my_news and my_news_summary: only live announcements
-- addressed to the caller, pinned first, with unread flags and counts.
--
-- Fixture as in 32_announcements (rolled back at the end). School A: Ada
-- (school admin), Hank (head), Tina (teacher, class teacher of 4 Blue), Sam
-- (teacher, class teacher of 3 Green), Holly (hod, teaches in 4 Blue), Pat
-- (parent of Lungi in 4 Blue), Quinn (parent of Kuda in 3 Green), Lara
-- (Lungi's own login). School B: Bea (school admin), Bob (parent of Bo in
-- 5A). Pam is a platform admin with no membership.
begin;

select plan(50);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('ec000000-0000-0000-0000-000000000001', 'ada@newsletter.test'),
  ('ec000000-0000-0000-0000-000000000002', 'hank@newsletter.test'),
  ('ec000000-0000-0000-0000-000000000003', 'tina@newsletter.test'),
  ('ec000000-0000-0000-0000-000000000004', 'sam@newsletter.test'),
  ('ec000000-0000-0000-0000-000000000005', 'holly@newsletter.test'),
  ('ec000000-0000-0000-0000-000000000006', 'pat@newsletter.test'),
  ('ec000000-0000-0000-0000-000000000007', 'quinn@newsletter.test'),
  ('ec000000-0000-0000-0000-000000000008', 'lara@newsletter.test'),
  ('ec000000-0000-0000-0000-000000000009', 'bea@newsletter.test'),
  ('ec000000-0000-0000-0000-00000000000a', 'bob@newsletter.test'),
  ('ec000000-0000-0000-0000-00000000000b', 'pam@newsletter.test')
) as u (id, email);

update public.profiles set full_name = 'Ada Admin' where id = 'ec000000-0000-0000-0000-000000000001';
insert into public.platform_admins (user_id) values ('ec000000-0000-0000-0000-00000000000b');

insert into public.schools (id, slug, name, stage, timezone, status) values
  ('a0000000-0000-0000-0000-0000000000ac', 'newsletter-a-test', 'News High', 'secondary', 'Africa/Harare', 'active'),
  ('b0000000-0000-0000-0000-0000000000bc', 'newsletter-b-test', 'Other High', 'secondary', 'Africa/Harare', 'active');
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


create function pg_temp.as_user(p_id text)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_id, true);
$$;
-- Titles of the caller's news in school A, in feed order.
create function pg_temp.news()
returns text[] language sql as $$
  select coalesce(array_agg(title), '{}') from public.my_news('a0000000-0000-0000-0000-0000000000ac');
$$;
grant execute on function pg_temp.as_user(text) to authenticated, anon;
grant execute on function pg_temp.news() to authenticated, anon;

-- Who may write ------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('ec000000-0000-0000-0000-000000000003');
select throws_ok(
  $$ select public.save_announcement('a0000000-0000-0000-0000-0000000000ac', 'x', 'x', 'all', false) $$,
  '42501', 'only the school admin or head can write announcements', 'a teacher cannot write one');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000005');
select throws_ok(
  $$ select public.save_announcement('a0000000-0000-0000-0000-0000000000ac', 'x', 'x', 'all', false) $$,
  '42501', null, 'nor a hod');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000006');
select throws_ok(
  $$ select public.save_announcement('a0000000-0000-0000-0000-0000000000ac', 'x', 'x', 'all', false) $$,
  '42501', null, 'nor a parent');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000009');
select throws_ok(
  $$ select public.save_announcement('a0000000-0000-0000-0000-0000000000ac', 'x', 'x', 'all', false) $$,
  '42501', null, 'nor school B''s admin');
select pg_temp.as_user('ec000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.save_announcement('a0000000-0000-0000-0000-0000000000ac', 'x', 'x', 'all', false) $$,
  '42501', null, 'nor a platform admin');
reset role;
set local role anon;
select throws_ok(
  $$ select public.save_announcement('a0000000-0000-0000-0000-0000000000ac', 'x', 'x', 'all', false) $$,
  '42501', null, 'nor anyone signed out');
reset role;

-- A draft to parents --------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
create temp table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
insert into ids values ('parents', public.save_announcement(
  'a0000000-0000-0000-0000-0000000000ac', '  Parents evening  ', 'Bring your diary.', 'parents', false,
  null, 'cc000000-0000-0000-0000-0000000004b0', null));
select results_eq(
  $$ select title, status::text, author_id::text, class_id is null, published_at is null
     from public.announcements where id = (select id from ids where name = 'parents') $$,
  $$ values ('Parents evening', 'draft', 'ec000000-0000-0000-0000-000000000001', true, true) $$,
  'the admin saves a draft: title trimmed, the author is the admin, a class is dropped unless the audience is a class');
select throws_ok(
  $$ select public.save_announcement('a0000000-0000-0000-0000-0000000000ac', 'x', 'x', 'class', false) $$,
  '23514', 'choose the class this announcement is for', 'a class announcement needs its class');
select throws_ok(
  $$ select public.save_announcement('a0000000-0000-0000-0000-0000000000ac', 'x', 'x', 'class', false,
       null, 'cc000000-0000-0000-0000-0000000005a0') $$,
  '23514', 'choose the class this announcement is for', 'and a class of this school');
select throws_ok(
  $$ select public.save_announcement('a0000000-0000-0000-0000-0000000000ac', 'x', 'x', 'all', false,
       null, null, now() - interval '1 minute') $$,
  '23514', 'the expiry date must be in the future', 'a new expiry is in the future');
select throws_ok(
  $$ select public.save_announcement('a0000000-0000-0000-0000-0000000000ac', 'x', 'x', 'all', false,
       'b5000000-0000-0000-0000-00000000dead') $$,
  'P0002', 'announcement not found', 'an unknown announcement is not found');

select pg_temp.as_user('ec000000-0000-0000-0000-000000000006');
select is(pg_temp.news(), '{}'::text[], 'a parent does not see the draft');
select is(public.mark_announcement_read((select id from ids where name = 'parents')), false,
  'and cannot mark it read');

-- Publishing ----------------------------------------------------------------------------

select pg_temp.as_user('ec000000-0000-0000-0000-000000000003');
select throws_ok(
  $$ select public.publish_announcement((select id from ids where name = 'parents')) $$,
  'P0002', 'announcement not found', 'a teacher cannot publish it (they cannot even see the draft)');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000009');
select throws_ok(
  $$ select public.publish_announcement((select id from ids where name = 'parents')) $$,
  'P0002', null, 'nor can school B''s admin');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
select lives_ok($$ select public.publish_announcement((select id from ids where name = 'parents')) $$,
  'the admin publishes it');
select results_eq(
  $$ select status::text, published_at > now() - interval '1 minute'
     from public.announcements where id = (select id from ids where name = 'parents') $$,
  $$ values ('published', true) $$, 'it is published now');
select throws_ok(
  $$ select public.publish_announcement((select id from ids where name = 'parents')) $$,
  '23514', 'this announcement is already published', 'publishing twice is refused');

-- Reading -------------------------------------------------------------------------------

select pg_temp.as_user('ec000000-0000-0000-0000-000000000006');
select is(pg_temp.news(), array['Parents evening'], 'the parent sees it');
select results_eq(
  $$ select is_unread from public.my_news('a0000000-0000-0000-0000-0000000000ac') $$,
  $$ values (true) $$, 'unread at first');
select results_eq(
  $$ select unread_count, latest_title from public.my_news_summary('a0000000-0000-0000-0000-0000000000ac') $$,
  $$ values (1, 'Parents evening') $$, 'the summary counts it and names it');
select is(public.mark_announcement_read((select id from ids where name = 'parents')), true,
  'opening it records the read');
select is(public.mark_announcement_read((select id from ids where name = 'parents')), false,
  'once');
select results_eq(
  $$ select is_unread from public.my_news('a0000000-0000-0000-0000-0000000000ac') $$,
  $$ values (false) $$, 'then it is read');
select results_eq(
  $$ select unread_count, latest_id from public.my_news_summary('a0000000-0000-0000-0000-0000000000ac') $$,
  $$ values (0, null::uuid) $$, 'and the summary has nothing unread');

select pg_temp.as_user('ec000000-0000-0000-0000-000000000008');
select is(pg_temp.news(), '{}'::text[], 'a learner does not see a parents announcement');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000003');
select is(pg_temp.news(), '{}'::text[], 'nor does a teacher');
select pg_temp.as_user('ec000000-0000-0000-0000-00000000000a');
select is(pg_temp.news(), '{}'::text[], 'nor school B''s parent');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
select is(pg_temp.news(), '{}'::text[], 'the admin''s own news holds only what is addressed to them');
select is(public.mark_announcement_read((select id from ids where name = 'parents')), false,
  'and the admin opening a parents announcement is not a reader');
select results_eq(
  $$ select read_count from public.announcement_read_counts('a0000000-0000-0000-0000-0000000000ac')
     where announcement_id = (select id from ids where name = 'parents') $$,
  $$ values (1) $$, 'so its read count is the one parent');

-- Editing and archiving -----------------------------------------------------------------

select lives_ok(
  $$ select public.save_announcement('a0000000-0000-0000-0000-0000000000ac', 'Parents evening (Thursday)', 'Bring your diary.',
       'parents', true, (select id from ids where name = 'parents'), null, now() + interval '7 days') $$,
  'the admin edits the published announcement, pins it and gives it an expiry');
select results_eq(
  $$ select title, status::text, pinned from public.announcements where id = (select id from ids where name = 'parents') $$,
  $$ values ('Parents evening (Thursday)', 'published', true) $$, 'it stays published with the edits');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000006');
select throws_ok(
  $$ select public.archive_announcement((select id from ids where name = 'parents')) $$,
  'P0002', 'announcement not found', 'a parent who can read it cannot archive it (it is not theirs to change)');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000002');
select lives_ok($$ select public.archive_announcement((select id from ids where name = 'parents')) $$,
  'the head archives it');
select throws_ok(
  $$ select public.archive_announcement((select id from ids where name = 'parents')) $$,
  '23514', 'this announcement is already archived', 'archiving twice is refused');
select throws_ok(
  $$ select public.save_announcement('a0000000-0000-0000-0000-0000000000ac', 'x', 'x', 'parents', false,
       (select id from ids where name = 'parents')) $$,
  '23514', 'an archived announcement cannot be edited; publish it again first', 'an archived one cannot be edited');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000006');
select is(pg_temp.news(), '{}'::text[], 'the parent no longer sees it');

-- Expiry: published again, then past its date.
select pg_temp.as_user('ec000000-0000-0000-0000-000000000002');
select lives_ok($$ select public.publish_announcement((select id from ids where name = 'parents')) $$,
  'the head publishes it again');
reset role;
select pg_temp.as_user('');
update public.announcements
set published_at = now() - interval '3 days', expires_at = now() - interval '1 day'
where id = (select id from ids where name = 'parents');
set local role authenticated;
select pg_temp.as_user('ec000000-0000-0000-0000-000000000006');
select is(pg_temp.news(), '{}'::text[], 'once it has expired the parent no longer sees it');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000001');
select lives_ok(
  $$ select public.save_announcement('a0000000-0000-0000-0000-0000000000ac', 'Parents evening (Thu)', 'Bring your diary.',
       'parents', true, (select id from ids where name = 'parents'), null,
       (select expires_at from public.announcements where id = (select id from ids where name = 'parents'))) $$,
  'the admin can still fix its title, keeping the passed expiry');
select results_eq(
  $$ select read_count from public.announcement_read_counts('a0000000-0000-0000-0000-0000000000ac')
     where announcement_id = (select id from ids where name = 'parents') $$,
  $$ values (1) $$, 'the admin still sees its read count');
select lives_ok($$ select public.archive_announcement((select id from ids where name = 'parents')) $$, 'archived again');
select throws_ok(
  $$ select public.publish_announcement((select id from ids where name = 'parents')) $$,
  '23514', 'its expiry date has passed; choose a later one or clear it before publishing',
  'an archived one past its expiry is not published again');

-- A class announcement, and the feed's order --------------------------------------------

insert into ids values ('class', public.save_announcement(
  'a0000000-0000-0000-0000-0000000000ac', '4 Blue trip', 'Bring lunch.', 'class', false,
  null, 'cc000000-0000-0000-0000-0000000004b0'));
select public.publish_announcement((select id from ids where name = 'class'));
insert into ids values ('pinned', public.save_announcement(
  'a0000000-0000-0000-0000-0000000000ac', 'Term dates', 'See the calendar.', 'all', true));
select public.publish_announcement((select id from ids where name = 'pinned'));
reset role;
select pg_temp.as_user('');
update public.announcements set published_at = now() - interval '5 days'
where id = (select id from ids where name = 'pinned');
set local role authenticated;

select pg_temp.as_user('ec000000-0000-0000-0000-000000000006');
select is(pg_temp.news(), array['Term dates', '4 Blue trip'],
  'a 4 Blue parent sees the class post, under the older pinned one');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000008');
select is(pg_temp.news(), array['Term dates', '4 Blue trip'], 'so does the 4 Blue learner');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000003');
select is(pg_temp.news(), array['Term dates', '4 Blue trip'], 'and 4 Blue''s class teacher');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000007');
select is(pg_temp.news(), array['Term dates'], 'a 3 Green parent does not see 4 Blue''s');
select pg_temp.as_user('ec000000-0000-0000-0000-000000000004');
select is(pg_temp.news(), array['Term dates'], 'nor does 3 Green''s class teacher');
select pg_temp.as_user('ec000000-0000-0000-0000-00000000000a');
select is(pg_temp.news(), '{}'::text[], 'school B''s parent sees nothing of school A');

select * from finish();
rollback;
