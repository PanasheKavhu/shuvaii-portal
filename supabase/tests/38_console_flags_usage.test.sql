-- pgTAP: the console's feature switches, usage numbers and onboarding
-- checklist (US-10.3, US-10.4; D55, D56). Migrations
-- 20261013090000_feature_flags and 20261013100000_console_usage_and_onboarding.
--
-- Switches: only a platform admin at aal2 switches a feature, each change is
-- a `feature_changed` audit event, and a school with the newsletter off has
-- its announcements, files, reads and functions refused by the database for
-- everyone in it, while another school is unaffected; switching it on again
-- brings everything back. Usage and onboarding: platform admin only, the
-- right numbers, and nothing personal in what they return.
--
-- Fixture (rolled back). School A: Ada (school admin, app set up), Tess
-- (teacher, class teacher of 4 Blue), Pat (parent of Lungi), Lungi active
-- and Kuda left. School B: Bea (school admin), Bob (parent). Pam is a
-- platform admin. Rows the workflows would make (a published report, a
-- mark, files) are written with triggers off, so no assessments or report
-- workflow are needed.
begin;

select plan(59);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, last_sign_in_at
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', '', u.last_sign_in::timestamptz
from (values
  ('e3800000-0000-0000-0000-000000000001', 'pam@console.test', null),
  ('e3800000-0000-0000-0000-000000000002', 'ada@console.test', '2026-10-01 08:00+02'),
  ('e3800000-0000-0000-0000-000000000003', 'tess@console.test', null),
  ('e3800000-0000-0000-0000-000000000004', 'pat@console.test', '2026-10-05 18:00+02'),
  ('e3800000-0000-0000-0000-000000000005', 'bea@console.test', null),
  ('e3800000-0000-0000-0000-000000000006', 'bob@console.test', null)
) as u (id, email, last_sign_in);

insert into public.platform_admins (user_id) values ('e3800000-0000-0000-0000-000000000001');
insert into public.schools (id, slug, name, stage, timezone, status) values
  ('a3800000-0000-0000-0000-00000000000a', 'console-a-test', 'Console High', 'secondary', 'Africa/Harare', 'active'),
  ('a3800000-0000-0000-0000-00000000000b', 'console-b-test', 'Other High', 'secondary', 'Africa/Harare', 'active');
insert into public.memberships (school_id, user_id, role, status) values
  ('a3800000-0000-0000-0000-00000000000a', 'e3800000-0000-0000-0000-000000000002', 'school_admin', 'active'),
  ('a3800000-0000-0000-0000-00000000000a', 'e3800000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ('a3800000-0000-0000-0000-00000000000a', 'e3800000-0000-0000-0000-000000000004', 'parent', 'active'),
  ('a3800000-0000-0000-0000-00000000000b', 'e3800000-0000-0000-0000-000000000005', 'school_admin', 'active'),
  ('a3800000-0000-0000-0000-00000000000b', 'e3800000-0000-0000-0000-000000000006', 'parent', 'active');
insert into public.learners (id, school_id, learner_number, first_name, last_name, status) values
  ('f3800000-0000-0000-0000-000000000001', 'a3800000-0000-0000-0000-00000000000a', 'C-01', 'Lungi', 'Moyo', 'active'),
  ('f3800000-0000-0000-0000-000000000002', 'a3800000-0000-0000-0000-00000000000a', 'C-02', 'Kuda', 'Ncube', 'left'),
  ('f3800000-0000-0000-0000-000000000003', 'a3800000-0000-0000-0000-00000000000b', 'C-03', 'Bo', 'Other', 'active');

insert into public.announcements (id, school_id, title, body, audience, status, published_at, author_id) values
  ('a3810000-0000-0000-0000-00000000000a', 'a3800000-0000-0000-0000-00000000000a', 'A news', 'For everyone.', 'all', 'published', now() - interval '1 day', 'e3800000-0000-0000-0000-000000000002'),
  ('a3810000-0000-0000-0000-00000000000b', 'a3800000-0000-0000-0000-00000000000b', 'B news', 'For everyone.', 'all', 'published', now() - interval '1 day', 'e3800000-0000-0000-0000-000000000005');

-- Rows normally made by workflows, with triggers (and foreign keys) off.
set local session_replication_role = replica;
insert into public.announcement_attachments (school_id, announcement_id, path, filename, content_type, size_bytes) values
  ('a3800000-0000-0000-0000-00000000000a', 'a3810000-0000-0000-0000-00000000000a',
   'a3800000-0000-0000-0000-00000000000a/a3810000-0000-0000-0000-00000000000a/notice.pdf', 'notice.pdf', 'application/pdf', 200);
insert into storage.objects (bucket_id, name, metadata) values
  ('reports', 'a3800000-0000-0000-0000-00000000000a/r1/v1.pdf', '{"size": 1000}'),
  ('reports', 'a3800000-0000-0000-0000-00000000000a/r2/v1.pdf', '{"size": 500}'),
  ('attachments', 'a3800000-0000-0000-0000-00000000000a/a3810000-0000-0000-0000-00000000000a/notice.pdf', '{"size": 200}'),
  ('imports', 'a3800000-0000-0000-0000-00000000000a/job-1.csv', '{"size": 30}'),
  ('school-branding', 'a3800000-0000-0000-0000-00000000000a/logo-1.png', '{"size": 5}'),
  ('report-assets', 'a3800000-0000-0000-0000-00000000000a/stamp-1.png', '{"size": 7}'),
  ('reports', 'a3800000-0000-0000-0000-00000000000b/r3/v1.pdf', '{"size": 999}');
insert into public.marks (school_id, assessment_id, enrolment_id, score, updated_at) values
  ('a3800000-0000-0000-0000-00000000000a', gen_random_uuid(), gen_random_uuid(), 60, '2026-10-07 10:00+02');
insert into public.reports (school_id, term_id, enrolment_id, template_id, status, reference_code, verification_code, snapshot) values
  ('a3800000-0000-0000-0000-00000000000a', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'published', 'CONSOLE-R1', 'CONSOLE-V1', '{}'),
  ('a3800000-0000-0000-0000-00000000000a', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'published', 'CONSOLE-R2', 'CONSOLE-V2', '{}'),
  ('a3800000-0000-0000-0000-00000000000a', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'draft', 'CONSOLE-R3', 'CONSOLE-V3', '{}');
set local session_replication_role = origin;

create function pg_temp.as_user(p_id text, p_aal text default 'aal2')
returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
grant execute on function pg_temp.as_user(text, text) to authenticated, anon;

-- Shape and defaults --------------------------------------------------------------------

select ok(private.school_feature_on('a3800000-0000-0000-0000-00000000000a', 'newsletter'),
  'the newsletter is on by default');
select ok(not private.school_feature_on('a3800000-0000-0000-0000-00000000000a', 'attendance'),
  'attendance is off by default');
select throws_ok(
  $$ update public.schools set feature_flags = '{"newsletter":"no"}' where id = 'a3800000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'a flag must be true or false');
select throws_ok(
  $$ update public.schools set feature_flags = '{"games":true}' where id = 'a3800000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'an unknown feature cannot be stored');

-- Who may switch ------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('e3800000-0000-0000-0000-000000000002');
select throws_ok(
  $$ select public.set_school_feature('a3800000-0000-0000-0000-00000000000a', 'newsletter', false) $$,
  '42501', 'only a platform admin can switch a school''s features', 'the school''s own admin cannot switch a feature');
select throws_ok(
  $$ update public.schools set feature_flags = '{"newsletter":false}' where id = 'a3800000-0000-0000-0000-00000000000a' $$,
  null, 'only a platform admin can change a school''s identity, branding, flags or status',
  'nor change the flags directly');
select pg_temp.as_user('e3800000-0000-0000-0000-000000000003');
select throws_ok(
  $$ select public.set_school_feature('a3800000-0000-0000-0000-00000000000a', 'newsletter', false) $$,
  '42501', null, 'nor a teacher');
select pg_temp.as_user('e3800000-0000-0000-0000-000000000001', 'aal1');
select throws_ok(
  $$ select public.set_school_feature('a3800000-0000-0000-0000-00000000000a', 'newsletter', false) $$,
  '42501', null, 'nor a platform admin before the second sign-in step (D54)');
reset role;
set local role anon;
select throws_ok(
  $$ select public.set_school_feature('a3800000-0000-0000-0000-00000000000a', 'newsletter', false) $$,
  '42501', null, 'nor anyone signed out');
reset role;

-- Before: the newsletter works in both schools ------------------------------------------

set local role authenticated;
select pg_temp.as_user('e3800000-0000-0000-0000-000000000004');
select results_eq($$ select title from public.my_news('a3800000-0000-0000-0000-00000000000a') $$,
  $$ values ('A news') $$, 'with the newsletter on, school A''s parent sees its news');
select pg_temp.as_user('e3800000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.my_announcements('a3800000-0000-0000-0000-00000000000a')), 1,
  'and school A''s admin sees its announcements');

-- Platform admin switches school A's newsletter off -------------------------------------

select pg_temp.as_user('e3800000-0000-0000-0000-000000000001');
select throws_ok(
  $$ select public.set_school_feature('a3800000-0000-0000-0000-00000000000a', 'games', true) $$,
  '23514', 'unknown feature', 'an unknown feature is refused');
select lives_ok(
  $$ select public.set_school_feature('a3800000-0000-0000-0000-00000000000a', 'newsletter', false) $$,
  'a platform admin at aal2 switches school A''s newsletter off');
select lives_ok(
  $$ select public.set_school_feature('a3800000-0000-0000-0000-00000000000a', 'newsletter', false) $$,
  'switching it off again changes nothing');
reset role;

select results_eq(
  $$ select event, old_data, new_data, actor_id from public.audit_log
     where school_id = 'a3800000-0000-0000-0000-00000000000a' and event = 'feature_changed' $$,
  $$ values ('feature_changed', '{"newsletter": true}'::jsonb, '{"newsletter": false}'::jsonb,
             'e3800000-0000-0000-0000-000000000001'::uuid) $$,
  'one feature_changed console event, against the school, with the old and new value');
select is((select feature_flags from public.schools where id = 'a3800000-0000-0000-0000-00000000000a'),
  '{"newsletter": false}'::jsonb, 'the switch is stored in feature_flags');

-- Off: refused for everyone in school A --------------------------------------------------

set local role authenticated;
select pg_temp.as_user('e3800000-0000-0000-0000-000000000004');
select is_empty($$ select * from public.my_news('a3800000-0000-0000-0000-00000000000a') $$,
  'school A''s parent: my_news() returns nothing');
select is_empty($$ select * from public.my_announcements('a3800000-0000-0000-0000-00000000000a') $$,
  'my_announcements() returns nothing');
select results_eq($$ select unread_count, latest_id from public.my_news_summary('a3800000-0000-0000-0000-00000000000a') $$,
  $$ values (0, null::uuid) $$, 'my_news_summary() counts nothing unread');
select is(public.mark_announcement_read('a3810000-0000-0000-0000-00000000000a'), false,
  'a read cannot be recorded');
select is_empty($$ select * from public.announcements where school_id = 'a3800000-0000-0000-0000-00000000000a' $$,
  'the announcements table shows nothing');
select is_empty($$ select * from public.announcement_attachments where school_id = 'a3800000-0000-0000-0000-00000000000a' $$,
  'nor the attachments table');
select is_empty($$ select * from storage.objects where bucket_id = 'attachments' $$,
  'nor the attachments bucket');

select pg_temp.as_user('e3800000-0000-0000-0000-000000000002');
select is_empty($$ select * from public.my_announcements('a3800000-0000-0000-0000-00000000000a') $$,
  'school A''s admin: my_announcements() returns nothing, drafts and all');
select is_empty($$ select * from public.announcement_read_counts('a3800000-0000-0000-0000-00000000000a') $$,
  'announcement_read_counts() returns nothing');
select throws_ok(
  $$ select public.save_announcement('a3800000-0000-0000-0000-00000000000a', 'New', 'Body', 'all', false) $$,
  '42501', null, 'a new announcement is refused');
select throws_ok(
  $$ select public.publish_announcement('a3810000-0000-0000-0000-00000000000a') $$,
  'P0002', null, 'publishing finds nothing to publish');
select is_empty(
  $$ update public.announcements set title = 'Changed' where id = 'a3810000-0000-0000-0000-00000000000a' returning 1 $$,
  'a direct edit changes nothing');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('attachments', 'a3800000-0000-0000-0000-00000000000a/a3810000-0000-0000-0000-00000000000a/new.pdf', 'e3800000-0000-0000-0000-000000000002') $$,
  '42501', null, 'a file cannot be uploaded to the attachments bucket');
select is_empty($$ select * from storage.objects where bucket_id = 'attachments' $$,
  'and the admin cannot read the bucket either');
select isnt_empty($$ select * from storage.objects where bucket_id = 'imports' $$,
  'other buckets are untouched');

-- School B is unaffected.
select pg_temp.as_user('e3800000-0000-0000-0000-000000000006');
select results_eq($$ select title from public.my_news('a3800000-0000-0000-0000-00000000000b') $$,
  $$ values ('B news') $$, 'school B''s parent still sees B''s news');
select is(public.mark_announcement_read('a3810000-0000-0000-0000-00000000000b'), true,
  'and B''s reads are recorded');
select pg_temp.as_user('e3800000-0000-0000-0000-000000000005');
select lives_ok(
  $$ select public.save_announcement('a3800000-0000-0000-0000-00000000000b', 'More B news', 'Body', 'all', false) $$,
  'school B''s admin still writes announcements');

-- Back on: everything returns ------------------------------------------------------------

select pg_temp.as_user('e3800000-0000-0000-0000-000000000001');
select lives_ok(
  $$ select public.set_school_feature('a3800000-0000-0000-0000-00000000000a', 'newsletter', true) $$,
  'the platform admin switches it back on');
select pg_temp.as_user('e3800000-0000-0000-0000-000000000004');
select results_eq($$ select title, is_unread from public.my_news('a3800000-0000-0000-0000-00000000000a') $$,
  $$ values ('A news', true) $$, 'school A''s parent sees the same news again, nothing lost');
select pg_temp.as_user('e3800000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.announcement_attachments where school_id = 'a3800000-0000-0000-0000-00000000000a'), 1,
  'and its file is back');
reset role;
select is((select count(*)::int from public.audit_log
           where school_id = 'a3800000-0000-0000-0000-00000000000a' and event = 'feature_changed'), 2,
  'switching back on is a second console event');

-- Attendance is stored only (Q25 open).
set local role authenticated;
select pg_temp.as_user('e3800000-0000-0000-0000-000000000001');
select lives_ok(
  $$ select public.set_school_feature('a3800000-0000-0000-0000-00000000000b', 'attendance', true) $$,
  'the attendance switch can be turned on');
reset role;
select ok(private.school_feature_on('a3800000-0000-0000-0000-00000000000b', 'attendance')
  and private.school_feature_on('a3800000-0000-0000-0000-00000000000b', 'newsletter'),
  'and it leaves the newsletter as it was');

-- Usage ----------------------------------------------------------------------------------

set local role authenticated;
select pg_temp.as_user('e3800000-0000-0000-0000-000000000001');
select results_eq(
  $$ select active_learners, active_staff, active_parents, reports_bytes, attachments_bytes,
            imports_bytes, branding_bytes, published_reports
     from public.school_usage('a3800000-0000-0000-0000-00000000000a') $$,
  $$ values (1, 2, 1, 1500::bigint, 200::bigint, 30::bigint, 12::bigint, 2) $$,
  'school A: active learners, staff, parents, bytes per bucket and published reports');
select results_eq(
  $$ select last_sign_in_at, last_marks_at, last_activity_at
     from public.school_usage('a3800000-0000-0000-0000-00000000000a') $$,
  $$ values ('2026-10-05 18:00+02'::timestamptz, '2026-10-07 10:00+02'::timestamptz, '2026-10-07 10:00+02'::timestamptz) $$,
  'school A: last sign in, last marks entry and the later of the two');
select results_eq(
  $$ select active_learners, reports_bytes, published_reports, last_activity_at
     from public.school_usage('a3800000-0000-0000-0000-00000000000b') $$,
  $$ values (1, 999::bigint, 0, null::timestamptz) $$,
  'school B counts only its own');
select results_eq(
  $$ select school_id from public.school_usage() where school_id in
       ('a3800000-0000-0000-0000-00000000000a', 'a3800000-0000-0000-0000-00000000000b') $$,
  $$ values ('a3800000-0000-0000-0000-00000000000b'::uuid), ('a3800000-0000-0000-0000-00000000000a'::uuid) $$,
  'every school, quietest first');

select pg_temp.as_user('e3800000-0000-0000-0000-000000000002');
select is_empty($$ select * from public.school_usage('a3800000-0000-0000-0000-00000000000a') $$,
  'the school''s own admin gets no usage rows');
select pg_temp.as_user('e3800000-0000-0000-0000-000000000001', 'aal1');
select is_empty($$ select * from public.school_usage() $$,
  'nor a platform admin before the second step');
reset role;
set local role anon;
select throws_ok($$ select * from public.school_usage() $$, '42501', null,
  'anonymous callers cannot call school_usage()');
select throws_ok($$ select * from public.school_onboarding('a3800000-0000-0000-0000-00000000000a') $$, '42501', null,
  'nor school_onboarding()');
reset role;

-- No personal data: only ids, counts, bytes and times come back.
select is(
  (select array_agg(distinct t::regtype::text order by t::regtype::text)
   from pg_proc p, unnest(p.proallargtypes) as t
   where p.oid = 'public.school_usage(uuid)'::regprocedure),
  array['bigint', 'integer', 'timestamp with time zone', 'uuid'],
  'school_usage() returns only uuids, counts, bytes and times');
select is(
  (select array_agg(distinct t::regtype::text order by t::regtype::text)
   from pg_proc p, unnest(p.proallargtypes) as t
   where p.oid = 'public.school_onboarding(uuid)'::regprocedure),
  array['boolean', 'integer', 'text', 'uuid'],
  'school_onboarding() returns item keys, yes or no and counts');
set local role authenticated;
select pg_temp.as_user('e3800000-0000-0000-0000-000000000001');
select is_empty(
  $$ select 1 from public.school_usage() u where row_to_json(u)::text ~* 'lungi|moyo|@|console high' $$,
  'no names, emails or school names in the usage rows');

-- Onboarding -----------------------------------------------------------------------------

select results_eq(
  $$ select item, done from public.school_onboarding('a3800000-0000-0000-0000-00000000000a') $$,
  $$ values ('grading_scales', false), ('term_dates', false), ('class_teachers', false),
            ('branding', false), ('report_images', false), ('report_template', false),
            ('first_admin', false), ('privacy_contact', false) $$,
  'a new school: eight items, none done (Ada has not set up her app)');
reset role;

-- Set the school up step by step, as the setup screens would.
insert into public.grading_scales (id, school_id, name, stage) values
  ('a3820000-0000-0000-0000-000000000001', 'a3800000-0000-0000-0000-00000000000a', 'Key', 'o_level');
insert into public.grading_bands (school_id, scale_id, grade, min_mark, max_mark) values
  ('a3800000-0000-0000-0000-00000000000a', 'a3820000-0000-0000-0000-000000000001', 'P', 50, 100);
insert into public.grade_levels (id, school_id, name, stage, sort_order, grading_scale_id) values
  ('a3830000-0000-0000-0000-000000000001', 'a3800000-0000-0000-0000-00000000000a', 'Form 4', 'o_level', 1, 'a3820000-0000-0000-0000-000000000001');
insert into public.academic_years (id, school_id, label, starts_on, ends_on, is_current) values
  ('a3840000-0000-0000-0000-000000000001', 'a3800000-0000-0000-0000-00000000000a', '2026', '2026-01-13', '2026-12-04', true);
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ('a3850000-0000-0000-0000-000000000001', 'a3800000-0000-0000-0000-00000000000a', 'a3840000-0000-0000-0000-000000000001', 'a3830000-0000-0000-0000-000000000001', '4 Blue', 'e3800000-0000-0000-0000-000000000003'),
  ('a3850000-0000-0000-0000-000000000002', 'a3800000-0000-0000-0000-00000000000a', 'a3840000-0000-0000-0000-000000000001', 'a3830000-0000-0000-0000-000000000001', '4 Green', null);

set local role authenticated;
select pg_temp.as_user('e3800000-0000-0000-0000-000000000001');
select results_eq(
  $$ select item, done, missing from public.school_onboarding('a3800000-0000-0000-0000-00000000000a')
     where item in ('grading_scales', 'term_dates', 'class_teachers') $$,
  $$ values ('grading_scales', false, 1), ('term_dates', false, null::int), ('class_teachers', false, 1) $$,
  'an incomplete scale, no term and a class without a teacher are counted');
reset role;

insert into public.grading_bands (school_id, scale_id, grade, min_mark, max_mark) values
  ('a3800000-0000-0000-0000-00000000000a', 'a3820000-0000-0000-0000-000000000001', 'F', 0, 49);
insert into public.terms (school_id, academic_year_id, name, kind, starts_on, ends_on) values
  ('a3800000-0000-0000-0000-00000000000a', 'a3840000-0000-0000-0000-000000000001', 'Term 1', 'term', '2026-01-13', '2026-04-09');
update public.classes set class_teacher_id = 'e3800000-0000-0000-0000-000000000003'
where id = 'a3850000-0000-0000-0000-000000000002';
update public.schools
set logo_path = 'a3800000-0000-0000-0000-00000000000a/logo-1.png', primary_color = '#0B5FA5', accent_color = '#F2A900',
    stamp_path = 'a3800000-0000-0000-0000-00000000000a/stamp-1.png',
    head_signature_path = 'a3800000-0000-0000-0000-00000000000a/head-signature-1.png'
where id = 'a3800000-0000-0000-0000-00000000000a';
update public.report_templates set comment_label = 'Tutor''s comment', created_at = now() - interval '1 day'
where school_id = 'a3800000-0000-0000-0000-00000000000a' and term_kind = 'term';
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('a3860000-0000-0000-0000-000000000001', 'e3800000-0000-0000-0000-000000000002',
        'Authenticator app', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP');

-- The school admin fills in the privacy contact (D3 lets them).
set local role authenticated;
select pg_temp.as_user('e3800000-0000-0000-0000-000000000002');
select lives_ok(
  $$ update public.schools set privacy_contact_name = 'Mrs Data', privacy_contact_email = 'privacy@console.test'
     where id = 'a3800000-0000-0000-0000-00000000000a' $$,
  'the school admin may fill in the privacy contact');
select throws_ok(
  $$ update public.schools set privacy_contact_email = 'not an email' where id = 'a3800000-0000-0000-0000-00000000000a' $$,
  '23514', null, 'the privacy contact email must look like one');

select pg_temp.as_user('e3800000-0000-0000-0000-000000000001');
select results_eq(
  $$ select item, done from public.school_onboarding('a3800000-0000-0000-0000-00000000000a') $$,
  $$ values ('grading_scales', true), ('term_dates', true), ('class_teachers', true),
            ('branding', true), ('report_images', true), ('report_template', true),
            ('first_admin', true), ('privacy_contact', true) $$,
  'once set up, every item is done');
select is_empty(
  $$ select 1 from public.school_onboarding('a3800000-0000-0000-0000-00000000000a') o
     where row_to_json(o)::text ~* 'mrs data|@|ada|4 blue' $$,
  'the checklist carries no names or emails');
select pg_temp.as_user('e3800000-0000-0000-0000-000000000002');
select is_empty($$ select * from public.school_onboarding('a3800000-0000-0000-0000-00000000000a') $$,
  'the school''s own admin gets no checklist');
reset role;

-- An admin whose app is not set up does not count.
delete from auth.mfa_factors where user_id = 'e3800000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.as_user('e3800000-0000-0000-0000-000000000001');
select results_eq(
  $$ select done from public.school_onboarding('a3800000-0000-0000-0000-00000000000a') where item = 'first_admin' $$,
  $$ values (false) $$, 'without two-factor set up, the first admin item is not done');
reset role;

select * from finish();
rollback;
