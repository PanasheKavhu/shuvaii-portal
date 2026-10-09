# SP Portal seed data (FAKE)

All names, numbers, marks and comments are invented. School names are fictional; dates are illustrative (Q23). Regenerate identically with `python3 generate_seed.py <output_dir>` (fixed random seed, stable UUIDs).

## Contents

| Item | Count |
| --- | --- |
| Schools | 2: Msasa Demo High School (secondary, Forms 3 and 4), Kudzai Demo Primary School (Grades 5 and 6) |
| Classes | 6 (3 per school) |
| Teachers | 12 (8 secondary with 2 as `hod`, 4 primary); plus 2 school admins, 2 heads, 1 platform admin, 1 relief teacher (`relief1@demo.spportal.test`) who belongs to both schools and teaches no class subjects |
| Learners | 60 (30 per school, 10 per class); 10 sibling pairs share one guardian |
| Guardians | 50; 4 parent logins and 2 learner logins for portal testing |
| Subjects | 10 secondary, 8 primary; secondary learners take 3 core plus 4 electives |
| Terms | Term 1 (with marks), Term 2, Term 3, plus April 2026 Vacation School (Msasa only) |
| Assessments | Term 1: Test 1 (/30, 20%), Test 2 (/50, 20%), Exam (/100, 60%) for every class subject; vacation: single mark at 100% for four subjects of 4 Blue |
| Marks | 1,386 including 8 absences (4 per school) |
| Comments | 486 subject comments, 60 class teacher comments (loaded by `scripts/seed.mjs`, D34) |

Teaching patterns covered: one teacher per subject (secondary, some teachers with two subjects) and one class teacher for almost all subjects plus a specialist (primary, PEA).

## Test fixtures (do not edit by hand)

- `expected_subject_results.csv`: weighted percent, rounded mark, grade and `complete` or `incomplete` for every learner and subject. Rounding is half up; grade comes from the school's bands.
- `expected_class_positions.csv`: subjects counted, average (1 dp) and competition rank per class for Term 1. Contains one tie. Vacation results have no positions.

Phase 3 tests must reproduce both files exactly from `marks`, `assessments` and `grading_bands`.

## Load order

1. Create Supabase Auth users for every row in `profiles.csv` with the same `id` (use the admin API in the seed script; give all users a known test password in local and staging only).
2. Load CSVs in this order: schools, platform_admins, memberships, grading_scales, grade_levels, grading_bands, academic_years, terms, classes, subjects, class_subjects, learners, enrolments, enrolment_subjects, guardians, guardian_links, assessments, marks, subject_comments, class_comments, announcements.
3. `profiles.csv` is loaded as part of step 1 (a trigger on `auth.users` may create the profile row; update it rather than insert).
4. Learner and parent logins in the seed: learner emails are `<learner_number>@<school>.demo.spportal.test`; parent logins are `parent0` and `parent5` at each school's demo domain. The seed script then turns the two learner logins into learner-number-and-PIN accounts (PIN `246810`, D26), so they sign in at `/sign-in/learner`, not with their email.

## Not seeded on purpose

`reports`, `report_templates`, `report_shares`, `invites`, `import_jobs`, `audit_log`, `attendance_summaries`, `comment_bank`, `announcement_attachments`, `announcement_reads` (created by the application in later phases). Logos, stamps and signatures are empty (Q21). The primary grading scale is a placeholder (Q2). Do not load this data into production.
