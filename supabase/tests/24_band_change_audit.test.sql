-- pgTAP: band changes after marks exist (D40). The band editor's count of
-- class subjects with marks per term (school admin only), and one
-- grading_bands_changed audit event per change with the old and new bands,
-- whether the change comes through save_grading_bands() or a direct write.
--
-- Fixture (rolled back): schools A and B. School A: Alice (admin), Tom
-- (teacher); a scale P/F used by Form 1, class 1 Blue with Mathematics
-- (marked in Term 1) and English (assessment, no marks). School B: Bob (admin).
begin;

select plan(17);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), '{}', '{}', now(), now(), '', '', '', ''
from (values
  ('e2400000-0000-0000-0000-000000000001', 'alice@band-audit.test'),
  ('e2400000-0000-0000-0000-000000000002', 'tom@band-audit.test'),
  ('e2400000-0000-0000-0000-000000000003', 'bob@band-audit.test')
) as u (id, email);

insert into public.schools (id, slug, name, stage, timezone, status) values
  ('a2400000-0000-0000-0000-00000000000a', 'band-audit-a-test', 'School A', 'secondary', 'Africa/Harare', 'active'),
  ('a2400000-0000-0000-0000-00000000000b', 'band-audit-b-test', 'School B', 'secondary', 'Africa/Harare', 'active');

insert into public.memberships (school_id, user_id, role, status) values
  ('a2400000-0000-0000-0000-00000000000a', 'e2400000-0000-0000-0000-000000000001', 'school_admin', 'active'),
  ('a2400000-0000-0000-0000-00000000000a', 'e2400000-0000-0000-0000-000000000002', 'teacher', 'active'),
  ('a2400000-0000-0000-0000-00000000000b', 'e2400000-0000-0000-0000-000000000003', 'school_admin', 'active');

insert into public.grading_scales (id, school_id, name, stage) values
  ('a2410000-0000-0000-0000-000000000001', 'a2400000-0000-0000-0000-00000000000a', 'Our key', 'o_level');
insert into public.grading_bands (id, school_id, scale_id, grade, min_mark, max_mark) values
  ('a2411000-0000-0000-0000-000000000001', 'a2400000-0000-0000-0000-00000000000a', 'a2410000-0000-0000-0000-000000000001', 'P', 50, 100),
  ('a2411000-0000-0000-0000-000000000002', 'a2400000-0000-0000-0000-00000000000a', 'a2410000-0000-0000-0000-000000000001', 'F', 0, 49);
insert into public.grade_levels (id, school_id, name, stage, grading_scale_id) values
  ('a2420000-0000-0000-0000-000000000001', 'a2400000-0000-0000-0000-00000000000a', 'Form 1', 'o_level', 'a2410000-0000-0000-0000-000000000001');
insert into public.academic_years (id, school_id, label, starts_on, ends_on) values
  ('a2430000-0000-0000-0000-000000000001', 'a2400000-0000-0000-0000-00000000000a', '2026', '2026-01-13', '2026-12-04');
insert into public.terms (id, school_id, academic_year_id, name, kind, starts_on, ends_on, status) values
  ('a2440000-0000-0000-0000-000000000001', 'a2400000-0000-0000-0000-00000000000a', 'a2430000-0000-0000-0000-000000000001', 'Term 1', 'term', '2026-01-13', '2026-04-09', 'open'),
  ('a2440000-0000-0000-0000-000000000002', 'a2400000-0000-0000-0000-00000000000a', 'a2430000-0000-0000-0000-000000000001', 'Term 2', 'term', '2026-05-05', '2026-08-07', 'planned');
insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ('a2450000-0000-0000-0000-000000000001', 'a2400000-0000-0000-0000-00000000000a', 'a2430000-0000-0000-0000-000000000001', 'a2420000-0000-0000-0000-000000000001', '1 Blue', 'e2400000-0000-0000-0000-000000000002');
insert into public.subjects (id, school_id, code, name, stage_scope) values
  ('a2460000-0000-0000-0000-000000000001', 'a2400000-0000-0000-0000-00000000000a', 'MATH', 'Mathematics', 'secondary'),
  ('a2460000-0000-0000-0000-000000000002', 'a2400000-0000-0000-0000-00000000000a', 'ENG', 'English', 'secondary');
insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values
  ('a2470000-0000-0000-0000-000000000001', 'a2400000-0000-0000-0000-00000000000a', 'a2450000-0000-0000-0000-000000000001', 'a2460000-0000-0000-0000-000000000001', 'e2400000-0000-0000-0000-000000000002'),
  ('a2470000-0000-0000-0000-000000000002', 'a2400000-0000-0000-0000-00000000000a', 'a2450000-0000-0000-0000-000000000001', 'a2460000-0000-0000-0000-000000000002', 'e2400000-0000-0000-0000-000000000002');
insert into public.learners (id, school_id, learner_number, first_name, last_name) values
  ('a2480000-0000-0000-0000-000000000001', 'a2400000-0000-0000-0000-00000000000a', 'BA-1', 'Learner', 'One');
insert into public.enrolments (id, school_id, learner_id, class_id, academic_year_id) values
  ('a2490000-0000-0000-0000-000000000001', 'a2400000-0000-0000-0000-00000000000a', 'a2480000-0000-0000-0000-000000000001', 'a2450000-0000-0000-0000-000000000001', 'a2430000-0000-0000-0000-000000000001');
insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id) values
  ('a2400000-0000-0000-0000-00000000000a', 'a2490000-0000-0000-0000-000000000001', 'a2470000-0000-0000-0000-000000000001'),
  ('a2400000-0000-0000-0000-00000000000a', 'a2490000-0000-0000-0000-000000000001', 'a2470000-0000-0000-0000-000000000002');
insert into public.assessments (id, school_id, term_id, class_subject_id, name, type, max_mark, weight_percent) values
  ('a24a0000-0000-0000-0000-000000000001', 'a2400000-0000-0000-0000-00000000000a', 'a2440000-0000-0000-0000-000000000001', 'a2470000-0000-0000-0000-000000000001', 'Exam', 'exam', 100, 100),
  ('a24a0000-0000-0000-0000-000000000002', 'a2400000-0000-0000-0000-00000000000a', 'a2440000-0000-0000-0000-000000000001', 'a2470000-0000-0000-0000-000000000002', 'Exam', 'exam', 100, 100);
insert into public.marks (school_id, assessment_id, enrolment_id, score, status) values
  ('a2400000-0000-0000-0000-00000000000a', 'a24a0000-0000-0000-0000-000000000001', 'a2490000-0000-0000-0000-000000000001', 70, 'present');

select is(
  (select count(*)::int from public.audit_log where table_name = 'grading_scales' and school_id = 'a2400000-0000-0000-0000-00000000000a'),
  0, 'bands written with no signed-in user (the seed) are not logged'
);

-- As Alice, school A's admin.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2400000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$ select term_name, class_subjects from public.grading_scale_marked_class_subjects('a2410000-0000-0000-0000-000000000001') $$,
  $$ values ('Term 1'::text, 1) $$,
  'one class subject with marks in Term 1 (English has an assessment but no marks; Term 2 none)'
);

select lives_ok(
  $$ select public.save_grading_bands('a2410000-0000-0000-0000-000000000001',
       '[{"grade":"P","min_mark":60,"max_mark":100,"remark":"Pass"},{"grade":"F","min_mark":0,"max_mark":59}]') $$,
  'the admin moves the pass mark to 60'
);
select is(
  (select count(*)::int from public.audit_log where event = 'grading_bands_changed' and row_id = 'a2410000-0000-0000-0000-000000000001'),
  1, 'one audit row for one save'
);
select is(
  (select old_data -> 'bands' from public.audit_log where event = 'grading_bands_changed'),
  '[{"grade":"P","min_mark":50,"max_mark":100,"remark":null},{"grade":"F","min_mark":0,"max_mark":49,"remark":null}]'::jsonb,
  'the old bands are recorded'
);
select is(
  (select new_data -> 'bands' from public.audit_log where event = 'grading_bands_changed'),
  '[{"grade":"P","min_mark":60,"max_mark":100,"remark":"Pass"},{"grade":"F","min_mark":0,"max_mark":59,"remark":null}]'::jsonb,
  'the new bands are recorded'
);
select is(
  (select actor_id::text || ' ' || (new_data ->> 'scale_name') from public.audit_log where event = 'grading_bands_changed'),
  'e2400000-0000-0000-0000-000000000001 Our key',
  'the row names the admin and the scale'
);
select is(
  (select school_id from public.audit_log where event = 'grading_bands_changed'),
  'a2400000-0000-0000-0000-00000000000a'::uuid,
  'recorded against the scale''s school'
);

select lives_ok(
  $$ select public.save_grading_bands('a2410000-0000-0000-0000-000000000001',
       '[{"grade":"P","min_mark":60,"max_mark":100,"remark":"Pass"},{"grade":"F","min_mark":0,"max_mark":59}]') $$,
  'saving the same bands again'
);
select is(
  (select count(*)::int from public.audit_log where event = 'grading_bands_changed'),
  1, 'records nothing when nothing changed'
);

-- A direct write through the API is logged too, with the whole sets.
update public.grading_bands set remark = 'Fail'
 where scale_id = 'a2410000-0000-0000-0000-000000000001' and grade = 'F';
select is(
  (select count(*)::int from public.audit_log where event = 'grading_bands_changed'),
  2, 'a direct band update writes one more row'
);
select is(
  (select jsonb_build_array(old_data -> 'bands' -> 1 -> 'remark', new_data -> 'bands' -> 1 -> 'remark', jsonb_array_length(new_data -> 'bands'))
     from public.audit_log where event = 'grading_bands_changed' order by id desc limit 1),
  '[null, "Fail", 2]'::jsonb,
  'with the full band set before and after'
);

-- Others.
select set_config('request.jwt.claims', '{"sub":"e2400000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is_empty(
  $$ select * from public.grading_scale_marked_class_subjects('a2410000-0000-0000-0000-000000000001') $$,
  'a teacher gets no count'
);
select is_empty(
  $$ select * from public.audit_log where event = 'grading_bands_changed' $$,
  'a teacher cannot read the band audit rows'
);
select set_config('request.jwt.claims', '{"sub":"e2400000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is_empty(
  $$ select * from public.grading_scale_marked_class_subjects('a2410000-0000-0000-0000-000000000001') $$,
  'another school''s admin gets no count'
);
select is_empty(
  $$ select * from public.audit_log where event = 'grading_bands_changed' $$,
  'another school''s admin cannot read the band audit rows'
);

-- Append-only, even for the admin who made the change.
select set_config('request.jwt.claims', '{"sub":"e2400000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ delete from public.audit_log where event = 'grading_bands_changed' $$,
  '42501', null, 'the admin cannot delete band audit rows'
);

select * from finish();
rollback;
