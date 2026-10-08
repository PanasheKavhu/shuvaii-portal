# Progress

Update at the end of every story (definition of done, `SPEC.md` section 6).

## Current phase

Phase 1 (E1: access, tenancy, branding). Tenancy schema, staff sign in, password reset, role-based navigation, school theming and a minimal super-admin console done. Phase 2 started: academic structure tables, the school admin setup area (US-2.1 to US-2.4) and the people tables are in.

## Done

- 2026-09-21: Project scaffold: Next.js + TypeScript strict, Tailwind, shadcn/ui, Supabase local config, Vitest, Playwright, ESLint, Prettier, CI (typecheck, lint, unit tests).
- 2026-10-07: Tenancy schema: `schools`, `profiles`, `platform_admins`, `memberships` with RLS helpers, policies, write guards (D2 to D5) and pgTAP tests (cross-school, anonymous, self-role, column guards). Seed script loads auth users, profiles, schools, platform admins and memberships from `seed/` (D6).
- 2026-10-07: Root layout shows the footer "Implemented by Panashe and Shuvai 2026" on every page (US-1.6) and the site title is SP Portal.
- 2026-10-07: US-1.1 staff sign in (email and password, lockout after 5 failures in 10 minutes, school picker and switch for multi-school users) and US-1.8 role-based navigation (menus per role, role home pages, 403 "Not allowed" on direct URLs). `sign_in_attempts` table with pgTAP test (D8), active-school cookie and role areas (D9, D10), two-school demo teacher in the seed (D11). Supabase clients in `src/lib/supabase` (server, admin, generated types via `npm run db:types`), session refresh in `src/proxy.ts`. Area pages are placeholders until their stories land. Fixed the sans font token so Geist is used.
- 2026-10-07: School theme and layout: `ThemeProvider` applies each school's colours (and logo, initials badge until uploads exist) as CSS variables in light and dark mode with AA enforced (D12); contrast helpers in `src/lib/branding/contrast.ts`; light/dark/system switch (D13); refreshed signed-in shell with logo, accent stripe and role menu. The proxy now blocks role areas before rendering (redirect to sign in or school picker, or 403 Not allowed), with pages checking the same rule (D10).
- 2026-10-07: Minimal super-admin console (US-10.1 create school, US-1.5 branding). `/platform` lists schools; `/platform/schools/new` creates one (name, slug suggested from the name, stage); each school's page saves colours with a live AA check and a one-tap suggested fix (D16), uploads a logo to the `school-branding` bucket (D15), and invites the first school admin by email, who accepts at `/auth/confirm` and `/welcome` (D14, D17). pgTAP tests for the bucket policies and `accept_my_invites()`. Playwright: a super admin creates, brands and invites, and the new admin sees the theme and logo, then a later colour change, with no deploy; a school admin gets 403 on every console page; a school A teacher sees no school B data on any page, even with the school cookie pointed at school B.
- 2026-10-07: Line endings normalised to LF (`.gitattributes`, Prettier `endOfLine`), so `format:check` passes on Windows.
- 2026-10-07: `audit_log` (append-only, read by that school's admin and head) with a generic row trigger on `memberships` and console events for school created, branding changed and admin invited, each recorded against the school it changed (D18). pgTAP: cross-school read, no update/delete/truncate for anyone, one row per membership role change, console events.
- 2026-10-07: "Resend invite" on the console school page for a school admin whose invite is not accepted yet: re-sends the Auth invite (platform admin checked first), which replaces the old link, and records an `invite_resent` audit event (D14, D18). Playwright: the old link is rejected, the new one works, the button disappears once accepted, and the new admin sees `school_created`, `admin_invited` and `invite_resent` in their audit log.

- 2026-10-07: US-1.7 password reset for email accounts: "Forgot your password?" on sign in, `/forgot-password` emails a link and a 6-digit code (same reply for unknown addresses), `/reset-password` sets the new password only in the session the link or code opened, then signs out other sessions (D19). Wrong codes share the sign-in lockout. Playwright: reset by link (link then rejected on reuse), reset by code after a wrong code, old password rejected and new one works, unknown email gets the same reply, 5 wrong codes lock out, and the new-password page refuses an ordinary session.

- 2026-10-07: Academic structure tables (migration order step 3): `grading_scales`, `grading_bands`, `grade_levels`, `academic_years`, `terms`, `classes`, `subjects`, `class_subjects`, each with `school_id`, same-school foreign keys and RLS (staff read, school admin writes, D20). `grading_scale_problems()` and `grading_scale_is_complete()` check a scale covers 0 to 100 with no gaps or overlaps, and a scale cannot be default unless it does (D21). One teacher per class subject; class and subject teachers must be active teaching staff of the school. `scripts/seed.mjs` loads these CSVs in the documented order; types regenerated. pgTAP (`08_academic_structure.test.sql`, 104 tests): cross-school read and write for every table, a teacher who reads but cannot write any of them, head and parent reads, gap, overlap, good and empty scales, the default guard, teacher checks and cross-school references.

- 2026-10-08: School admin setup area at `/admin/setup` (US-2.1 setup wizard, US-2.2 assign teachers, US-2.3 grading scale editor, US-2.4 term status and marks deadline). A new year is proposed with three terms and the April vacation school; a new scale starts from the O-level bands. Steps for terms, scales and the band editor (names each gap, overlap and out-of-range band as you type), grade levels, subjects, classes with class teachers, and class subjects with one teacher each; a teacher (or HOD) may take many subjects across classes and grades, and the class subjects step shows who teaches what. Finishing is blocked, with a linked list of gaps, while a class has no class teacher or a class subject has no teacher (D22). Migration `setup_wizard`: class subject teacher optional until finish, `academic_years.setup_completed_at`, `academic_year_setup_gaps()`, `save_grading_bands()`, `set_current_academic_year()`. Pure rules in `src/lib/setup` with unit tests; pgTAP `09_setup_wizard.test.sql` (24 tests); Playwright at 360 px: an admin of a new school sets up a year from scratch, finishing is refused until the gaps are fixed, and a teacher gets 403 on `/admin/setup`.
- 2026-10-08: People tables (migration order step 4): `learners`, `enrolments`, `enrolment_subjects`, `guardians`, `guardian_links`, `import_jobs`, each with `school_id`, same-school foreign keys and RLS (D23). School admin and head read and write; a teacher or hod reads only learners in classes where they are class teacher or teach a subject (with their enrolments, subject choices, guardians and links); parents and learners get nothing yet. Learners are never deleted and every learner change is audited. A subject choice must belong to the learner's class (trigger, both directions). `scripts/seed.mjs` loads the people CSVs in the documented order; types regenerated. pgTAP `10_people.test.sql` (68 tests): cross-school read and write for every table, head access, teacher scoping (a 4 Blue teacher cannot read a 3 Green learner; subject teacher, disabled teacher, school B teacher), parents, learners and anonymous see nothing, the class check, no deletes, and an audit row per learner update.

## In progress

_None._

## Next

- US-1.2 learner sign in (learner number and PIN), with the admin PIN reset that completes US-1.7 for learners.
- `invites` table with US-1.3 parent accounts (D7).
- Learner and guardian screens for the school admin, and CSV import into `import_jobs` (D23).
- US-10.3 feature flags and US-10.4 usage in the console.

## Known gaps

- CI does not yet run `test:db` (needs Docker/Supabase) or `test:e2e`.
- `sign_in_attempts` rows are never pruned (D8).
- Password reset by phone code (US-1.7) waits for an SMS provider (D19).
- Two-factor sign in for super admin, school admin and head (SPEC section 5) is not built yet.
- Setup area: terms, classes, grade levels, subjects and scales can be added and edited but not removed from the screens yet (class subjects can). Locking marks after the deadline and unlocking with a reason (US-2.4) come with marks entry in Phase 3 (D22).

## Go-live checklist

Things to do on the hosted Supabase project and deployment before the first real school uses the portal.

- [ ] Set the password-reset (recovery) email template from `supabase/templates/recovery.html` in the Supabase dashboard (D19).
- [ ] Set the invite email template (subject and the `/auth/confirm?token_hash=...&type=invite` link from `supabase/templates/invite.html`) and the site URL in the Supabase dashboard (D14).
