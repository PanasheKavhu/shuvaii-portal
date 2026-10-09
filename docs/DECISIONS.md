# Decisions

Short records of choices that are not obvious from the code. Newest last.
Format: **D#. Title** (date). Decision. Why. Alternatives.

## D1. Scaffold stack (2026-09-21)

- Decision: Next.js App Router with `src/` dir, TypeScript strict, Tailwind v4, shadcn/ui, Supabase (`@supabase/ssr`), Vitest, Playwright, pgTAP for RLS tests, npm as package manager.
- Why: matches `SPEC.md` quality gates (typecheck, lint, unit, RLS, e2e) with one repo and one deployment serving many schools.
- Unit tests live in `tests/unit` (and beside source); pgTAP in `supabase/tests`; e2e in `tests/e2e` with mobile and desktop projects.
- CI runs typecheck, lint and unit tests. DB and e2e checks are local for now.

## D2. RLS helper `private.school_ids_for(user_id)` (2026-10-07)

- Decision: besides the helpers named in `DATA_MODEL.md` section 7, add a security-definer `school_ids_for(user_id)` used by `profiles_select`, in a `private` schema that PostgREST does not expose.
- Why: "readable by anyone who shares a school" needs another user's school ids, but `memberships` RLS hides colleagues' rows from plain teachers. Keeping it out of `public` stops any signed-in user calling it as an RPC to list another user's schools.

## D3. What a school admin may change on `schools` (2026-10-07)

- Decision: a trigger lets a school admin change only `motto`, `address`, `phone`, `email`, `report_footer_text`, `stamp_path`, `head_signature_path`. `slug`, `name`, `stage`, `logo_path`, colours, `timezone`, `feature_flags` and `status` are platform admin only.
- Why: SPEC gives branding and school creation to the super admin (US-1.5, US-10.1); without it a suspended school's admin could reactivate the school. Column grants cannot tell the two apart (both are `authenticated`), so a trigger does it.
- Revisit if schools should own their name or logo.

## D4. Membership write guards (2026-10-07)

- Decision: nobody changes their own role, nobody inserts a membership for themselves (platform admins excepted, to bootstrap a school), and a membership's `school_id` and `user_id` never change.
- Why: otherwise a school admin could give themselves `head` by inserting a row or repointing someone else's.

## D5. Super admin access to tenancy tables (2026-10-07)

- Decision: platform admins can read, create and update `schools` and `memberships` (to create schools and invite the first admin), but have no blanket read of `profiles`. A person may edit only their own `full_name` and `phone`; `email` mirrors `auth.users`.
- Why: `DATA_MODEL.md` says no policy grants super admins tenant data by default, and profiles include parents and learners.

## D6. Seeding through a Node script (2026-10-07)

- Decision: `supabase/seed.sql` stays empty; `npm run db:reset` runs `scripts/seed.mjs`, which creates Auth users with the admin API and upserts the CSVs. The script reads `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`; it is a local dev tool outside the Next.js app, so it is the one exception to "only `src/lib/supabase/admin.ts` reads it".
- Why: Auth users (and their profiles) cannot be created correctly from plain SQL. Demo password is a published local-only value.

## D7. `invites` table deferred (2026-10-07)

- Decision: `invites` (migration order step 2) lands with the parent-invite story (US-1.3), not in the tenancy migration.
- Why: it references `guardians` and `learners`, which do not exist until the people tables; adding it then keeps its foreign keys and RLS tests in one place.

## D8. Sign-in lockout in the app, recorded by hashed email (2026-10-07)

- Decision: the US-1.1 lockout (5 failures in 10 minutes block for 15 minutes from the 5th) is checked in the sign-in server action before calling Supabase Auth. Attempts go in `sign_in_attempts`, keyed by a SHA-256 hash of the normalised email, written and read only with the service-role client. A successful sign in clears earlier failures; only `invalid_credentials` errors count. Unknown emails are counted too, so the response never reveals whether an account exists.
- Why: Supabase Auth only rate-limits per IP, and a whole school shares one IP. Hashing keeps readable emails out of the table. The rule is a pure function (`src/lib/auth/lockout.ts`) so it is unit tested.
- Local `sign_in_sign_ups` in `supabase/config.toml` is raised to 300 so e2e runs from one IP are not throttled. Hosted projects keep their own setting.
- Known gap: old rows are never pruned. Add a scheduled clean-up before go-live.

## D9. Active school in a cookie, role areas as top-level routes (2026-10-07)

- Decision: the chosen school is an httpOnly `sp_school` cookie holding a school id, trusted only if it names one of the user's active memberships in an active school. Single-school users need no cookie. Multi-school users choose at every sign in and can switch from the top bar. Each role has one area: `/admin`, `/head`, `/department` (hod), `/teaching`, `/children` (parent), `/my-reports` (learner), `/platform` (super admin). Menus and home pages come from `src/lib/auth/roles.ts`; a person with several roles sees each area and lands on the first in that order.
- Why: keeps URLs short and school-free while RLS stays the real boundary (the cookie only picks which of your schools the UI shows). Area order puts staff work before the parent view for a teacher who is also a parent.
- Alternatives: school slug in every URL (longer links, and still needs the same check).

## D10. Role areas blocked in the proxy and again in each page (2026-10-07)

- Decision: `src/proxy.ts` (Next 16's name for middleware) looks up the user's memberships for any role-area path and redirects to sign in or the school picker, or rewrites to `/not-allowed` with HTTP 403. Each area page repeats the same rule through `requireArea()`, which calls Next's `forbidden()` (`src/app/forbidden.tsx`, needs `experimental.authInterrupts`). Both use one pure rule, `decideAreaAccess()` in `src/lib/auth/route-access.ts`.
- Why: the request asked for middleware blocking, and it stops forbidden pages before any rendering. Next's docs warn the proxy is not a full authorization layer, so pages check too, and RLS stays the guard on the data. The proxy costs two small queries only on role-area requests.
- If `authInterrupts` is removed from Next, render `NotAllowed` directly in `requireArea()`.

## D11. Two-school demo user (2026-10-07)

- Decision: the seed generator adds `relief1@demo.spportal.test`, a teacher in both schools with no class subjects.
- Why: US-1.1 needs a multi-school user to demonstrate the school picker; with no class subjects the marks and fixtures are unchanged.

## D12. School theme from the database, AA enforced automatically (2026-10-07)

- Decision: `ThemeProvider` (`src/components/theme/theme-provider.tsx`) takes the active school's `logo_path`, `primary_color` and `accent_color` and writes CSS variables for light and dark mode (`--primary`, `--primary-foreground`, `--ring`, `--brand-accent`, ...). Each brand colour is moved towards black (light mode) or white (dark mode) just enough to reach WCAG AA against the page, and its foreground is black or white, whichever reads better. Only validated hex colours are inlined. Pages outside a school (sign in, home) keep the neutral theme.
- Why: US-1.5 wants colours applied without a deploy and every page AA. Adjusting at render time keeps a school's colour readable in dark mode too. Rejecting a failing pair with a suggestion when the super admin saves it (US-1.5) will use `checkContrast()` from `src/lib/branding/contrast.ts`.
- Logos: `logo_path` is a path in a public `school-branding` Storage bucket (or a full URL). The bucket and upload arrive with US-1.5; until then schools show an initials badge.

## D13. Light and dark mode per device (2026-10-07)

- Decision: a Light / Dark / System switch above the footer, stored in `localStorage` (`sp-color-mode`), applied by a small inline script in `<head>` before first paint. System follows `prefers-color-scheme`.
- Why: no account setting needed, no flash of the wrong theme, works on sign-in pages too.

## D14. First school-admin invite through Supabase Auth, not an `invites` table (2026-10-07)

- Decision: the console invites a school's first admin with `auth.admin.inviteUserByEmail` (service-role client, in a server action that first checks the caller is a platform admin) and adds a `memberships` row with status `invited`. The email (`supabase/templates/invite.html`) links to `/auth/confirm?token_hash=...&type=invite`, which verifies the token server-side and signs the invitee in; `/welcome` asks for a password, then `public.accept_my_invites()` (security definer, own rows only, `invited` to `active` only) activates the membership. If the email already has an account, the membership is created `active` at once. The console shows the invite form only while the school has no admin.
- Why: US-10.1 needs only staff invites, which Auth handles (one-time token, email delivery); the `invites` table (D7) is still needed for parent codes in US-1.3. Server-side token verification works with the cookie-based SSR client; the default email link puts tokens in the URL fragment, which the server never sees.
- Hosted projects: set the same invite template (subject and link) in the dashboard, and the site URL, before go-live. Local `email_sent` is raised to 100 per hour for e2e runs.
- Resend (added later the same day): while the membership is still `invited`, the console shows "Resend invite", which calls `inviteUserByEmail` again. Auth issues a new link and the old one stops working; the resend is audited (D18).
- Known gaps: the link lasts `otp_expiry` (1 hour locally). A school with an un-accepted invite needs its membership disabled (SQL) before a new invite.

## D15. Logo storage: `school-branding` bucket, platform admin writes only (2026-10-07)

- Decision: a public bucket `school-branding` (named in D12; `DATA_MODEL.md` section 8 calls it `branding`), 1 MB limit, PNG, JPEG and WebP only. Object names start with the school id (`{school_id}/logo-<timestamp>.<ext>`), checked by `private.is_school_folder()`. Insert and update policies allow platform admins only (D3: logos are platform-admin only); no delete policy, so old logos stay (rule 6). The upload action checks the file's first bytes and stores it with the sniffed type.
- Why: SVG is excluded because an SVG opened from its public URL can run script. A new object name per upload means browsers never show a stale cached logo. Stamps and signatures (school-admin writes) will get their own policies with the report stories.

## D16. What "colour pairs failing AA" means when saving (2026-10-07)

- Decision: `parseBrandColors()` (`src/lib/branding/brand-colors.ts`) rejects a primary colour under 4.5:1 as text on the white page (so white button text on it passes too), and an accent where neither black nor white text reaches 4.5:1. Failures carry a suggestion from `adjustForContrast()`; the form shows the same check live with a "Use #......" button. Dark mode is not checked at save time because the theme adjusts colours per mode (D12).
- Note: every colour gets at least about 4.58:1 with black or white, so the accent rule in practice only rejects malformed values.

## D17. The console reads school-admin names with the service role (2026-10-07)

- Decision: the school page in the console shows each school admin's name, email and invite status. Memberships come through RLS; the matching `profiles` rows are read with the service-role client, limited to that school's `school_admin` memberships.
- Why: D5 gives platform admins no read of `profiles` (it holds parents and learners). A narrow server-side read keeps that rule while letting the super admin see who they invited.

## D18. Audit log: generic row trigger, console events against the school they changed (2026-10-07)

- Decision: `audit_log` (DATA_MODEL section 4.6) is written only by security-definer code. `private.audit_row_change()` is one generic `AFTER INSERT OR UPDATE OR DELETE` trigger recording `auth.uid()`, table, row id, action and the whole old and new row; it is attached to `memberships` now and to marks, comments, reports, assessments and learners as they land. Console events use action `event` plus an `event` name (a column added to the spec): `school_created` and `branding_changed` (logo or colours only) come from a trigger on `schools`, so they commit with the change; `admin_invited` and `invite_resent` come from `public.log_invite_event()`, called by the console after Auth sends the email, because an email leaves no row change (a resend changes nothing in the database). It is platform-admin only and accepts only `school_admin` memberships.
- Every console event is recorded against the school it changed (`school_id` = that school), not against a platform-level log. Why: `audit_log.school_id` stays `not null` like every tenant table (rule 1), the school's own admin and head can see who changed their branding or invited their admin, and no second log table is needed. Platform admins get no read of `audit_log` (only that school's `school_admin` and `head`), consistent with D5.
- Append-only: no insert, update or delete policy, those grants revoked from `anon`, `authenticated` and `service_role`, and a trigger that rejects update, delete and truncate even for the table owner.
- Known gap: `log_invite_event()` runs after the email is sent, so if it fails the invite still went; the console then says the event was not recorded.

## D19. Password reset by email link or code; phone codes and learner resets later (2026-10-07)

- Decision: US-1.7 for staff (and parents, once US-1.3 gives them accounts) uses Supabase Auth's recovery email. `/forgot-password` asks for the email and always answers the same way, whether or not an account exists (Auth's per-address resend limit, which only real accounts hit, is treated as success). The email (`supabase/templates/recovery.html`) carries both a link to `/auth/confirm?token_hash=...&type=recovery` and the 6-digit code, for people who read email on a phone and use the portal on another device. Either one signs the person in and sets an httpOnly `sp_reset` cookie holding that Auth session's id for 15 minutes; `/reset-password` works only while the cookie names the current session, so an ordinary signed-in session cannot change the password without the old one. Saving the new password signs out every other session, records a successful attempt (clearing any sign-in lockout) and lands the person as after a normal sign in.
- Wrong codes count towards the US-1.1 lockout in `sign_in_attempts` (D8): 5 wrong passwords or codes in 10 minutes block both for 15 minutes. A 6-digit code is otherwise guessable across many IPs; the link carries a long token and needs no lockout. Auth reports a wrong and an expired code the same way (`otp_expired`), so the message covers both.
- Not now: phone (SMS) codes need an SMS provider, and SMS is out of the MVP (SPEC section 1); add when a provider is chosen. Learner PIN resets by an admin land with US-1.2, which brings learner accounts. Password resets are not written to `audit_log`, which needs a school and covers marks, comments, reports and membership changes.
- Hosted projects: set the recovery template (subject and link) in the dashboard before go-live, as for the invite (D14).

## D20. Academic structure access and teaching staff (2026-10-07)

- Decision: `grading_scales`, `grading_bands`, `grade_levels`, `academic_years`, `terms`, `classes`, `subjects` and `class_subjects` are read by active staff of the school (`school_admin`, `head`, `hod`, `teacher`, through `public.is_staff()`) and written (insert, update, delete) only by that school's `school_admin`. Parents and learners get no direct read; `DATA_MODEL.md` section 7 said "any member", narrowed here as requested. What they need will reach them through published report snapshots. Platform admins get no read, as for other tenant data (D5).
- Every child row points at its parent through an `(id, school_id)` foreign key, so a school A row can never reference a school B year, level, scale, class or subject, and `private.keep_school_id()` stops any row changing school.
- A class teacher and a class subject's teacher must hold an active `teacher` or `hod` membership in the same school (`private.is_active_teacher()`, checked by triggers). Heads of department count because they teach: the seed has two HODs who teach and one who is a class teacher. Disabling a membership later does not clear existing assignments.
- One teacher per class subject: `teacher_id` is `not null` and `(class_id, subject_id)` is unique. A subject is added to a class when its teacher is known.
- Deletes are allowed for the school admin (these rows are not personal data, rule 6); foreign keys stop deleting anything still in use. `subjects.stage_scope` uses the `school_stage` enum (`combined` meaning both parts of the school).
- Not audited yet: the audit triggers named in `DATA_MODEL.md` cover marks, comments, reports, assessments, memberships and learners, none of which is in this step.

## D21. A default grading scale must cover 0 to 100 exactly (2026-10-07)

- Decision: `public.grading_scale_problems(scale_id)` lists every gap (a whole mark from 0 to 100 in no band) and overlap (a mark in more than one band) as runs, for example `gap 40-49`; `public.grading_scale_is_complete()` is true when it returns nothing. Both are security invoker, so they see only bands the caller may read. A trigger refuses making a scale default (on insert or update) unless it is complete, and a deferred constraint trigger refuses, at commit, any band change that leaves a default scale incomplete, so a boundary can still be moved in two statements within one transaction. At most one default scale per school and stage.
- Bands are whole marks with both ends included (Q1, Q4), `0 <= min_mark <= max_mark <= 100`, and a grade appears once per scale.
- The seed loads scales as non-default, then levels and bands, then sets the default, which exercises the rule.

## D22. Setup wizard: a class subject may wait for its teacher until the year is finished (2026-10-08)

- Decision: `/admin/setup` is the school admin's setup area (US-2.1 to US-2.4). Each academic year has its own wizard (`/admin/setup/[yearId]`) with seven steps: year and terms, grading scales, grade levels, subjects, classes and class teachers, class subjects and teachers, check and finish. Scales, levels and subjects belong to the school and are shared by every year; terms, classes and class subjects belong to the year.
- `class_subjects.teacher_id` is now nullable (it was `not null` in D20), so an admin can tick the subjects a class takes before knowing every teacher, and the wizard can list "English in 1 Green has no teacher" as a gap. New column `academic_years.setup_completed_at` records finishing. A trigger refuses setting it while `public.academic_year_setup_gaps(year)` returns rows (a class with no class teacher, a class subject with no teacher), and once set, triggers refuse a class without a class teacher or a class subject without a teacher in that year. Marks entry (Phase 3) can therefore rely on a finished year having every teacher.
- The page also lists softer gaps that block the Finish button but not the database: no terms, no classes, a class with no subjects, a class whose level uses a scale that does not cover 0 to 100. The pure rule is `findSetupGaps()` in `src/lib/setup/gaps.ts`.
- One teacher per class subject stays (unique `(class_id, subject_id)`); one teacher may take any number of class subjects across classes and grades, and be class teacher of several classes. Heads of department appear in the teacher lists as "Name (HOD)" (D20). The class subjects step shows each teacher's load.
- Defaults: a new year is proposed as the next numeric label (or this calendar year) with Term 1, April Vacation School, Term 2 and Term 3 on the seed's invented dates (Q23), all `planned`, marks due two weeks before a term ends and three days after vacation school. A new scale starts from the O-level bands of the sample report (GRADING_AND_WEIGHTS section 1), the primary placeholder bands, or nothing. All of it is editable.
- Band editor: `checkBands()` (`src/lib/setup/bands.ts`) mirrors `grading_scale_problems()` and names each problem: gaps and overlaps as mark runs ("Gap: marks 60 to 61 are in no band", "Overlap: marks 58 to 59 are in more than one band (B and C)"), and per row: out of range, lowest above highest, not a whole number, missing or repeated grade. Coverage is only judged once every row is a valid range, so one typo is reported once. Saving goes through `public.save_grading_bands(scale, bands)` (security invoker) so delete and insert are one transaction, and a default scale is checked within the call.
- Terms: status (`planned`, `open`, `locked`, `closed`) and marks deadline are stored and editable (US-2.4). Dates must fall inside the year, periods may not overlap, and a deadline may not be before the term starts (it may be after it ends, as the seed's vacation school is). Unlocking a class subject after the deadline, with a reason, is Phase 3.
- Finishing makes the year current if the school has no current year; otherwise "Make this the current year" calls `public.set_current_academic_year()`, which clears the flag on the school's other years in the same call.
- Forms in the setup area submit without React's automatic form reset (`src/components/setup/action-form.tsx`), so a rejected form keeps what the admin typed.
- Not audited: the audit triggers named in `DATA_MODEL.md` cover marks, comments, reports, assessments, memberships and learners, none of which this story changes.

## D23. People tables: admin and head write, teachers see only their classes (2026-10-08)

- Decision: `learners`, `enrolments`, `enrolment_subjects`, `guardians`, `guardian_links` and `import_jobs` (migration order step 4) are read and written by that school's `school_admin` and `head`. `DATA_MODEL.md` section 7 had the school admin as the only writer and gave heads of department a school-wide read; both changed as requested: heads write too, and a `hod` is scoped like any teacher.
- A teacher or hod reads a learner only while that learner is enrolled in a class where they are class teacher or teach a class subject (`private.my_teaching_class_ids()`), in any year. With the learner they read that enrolment, its subject choices, and the learner's guardians and guardian links (a class teacher needs the parent's phone). They write none of these tables and cannot read `import_jobs`. A disabled teacher loses access even while still assigned. `public.teaches()` and `public.is_class_teacher()` from section 7 exist for later policies (marks, comments).
- Parents and learners get no access to these tables yet; their own rows open up in Phase 4 with `is_guardian_of()` and `is_own_learner()`.
- Learners are never deleted (rule 6): no delete policy, and a trigger refuses delete and truncate even for the table owner; set `status` to `left` or `graduated`. Enrolments and guardians have no delete policy either. A wrong subject choice (`enrolment_subjects`) or a wrong guardian link can be deleted by the admin or head, since they are links rather than personal records.
- Every learner insert and update is written to `audit_log` by the generic trigger (D18).
- Integrity: every child points at its parent through `(id, school_id)` foreign keys, so nothing links across schools. An enrolment's year must be its class's year (foreign key on `classes (id, academic_year_id, school_id)`). A subject choice must be a class subject of the learner's own class (trigger), and an enrolment cannot move to another class while it still has subject choices from the old one. At most one primary guardian per learner. `learner_number` is free text, unique per school (Q14); `sex` is an enum of F and M (Q27); `learner_status`, `enrolment_status`, `import_kind` and `import_status` are enums.
- Not now: the import functions mentioned under migration order step 4 (CSV upload into `import_jobs`) wait for the import story; only the table exists. `import_jobs` is not seeded (seed/README.md).

## D24. People admin: two-step imports, all or nothing, staff invites through Auth (2026-10-08)

- Decision: `/admin/people` (school admin only, like the rest of `/admin`) has three tabs: Learners, Staff and Import (US-3.1 to US-3.4). Lists search by name, learner number or email, and filter by class, role and status; learners show 100 at a time.
- Imports are two steps. Upload and check: the file is read (CSV, or Excel .xlsx by its zip signature; old .xls is refused with a "save as .xlsx" message), checked against the school as it is now, stored in the private `imports` bucket as `{school_id}/{job_id}.csv|xlsx`, and recorded in `import_jobs` as `validated` or `failed` with every problem by spreadsheet row (up to 500 stored). Commit: the stored file is read and checked again (the school may have changed), then `commit_learner_import()` or `commit_staff_import()` adds everything and marks the job `committed` in one transaction; any database error rolls back the whole call. Nothing is imported from a file with errors.
- Learner rules: learner numbers unique in the school and the file, compared without case; class matched by name among the current year's classes, ignoring case and spaces; dates as YYYY-MM-DD, DD/MM/YYYY (day first) or Excel date cells; sex F/M (or female, male, girl, boy). One guardian per row, optional, but complete when any guardian column is filled (name plus phone or email). Phones are stored in one form (`+263 77...`, `263...` and a dropped leading zero all become `077...`) so they compare. Guardians are matched by phone or email against the school's guardians and earlier rows, so siblings share one guardian; a phone and email that point at two different guardians is an error. A matched existing guardian is linked, not updated. The first guardian of a new learner is primary.
- Subject choices (US-3.4): `set_learner_subjects()` replaces an enrolment's choices; the existing trigger refuses a subject from another class. Learners in an ECD or primary level get every class subject on enrolment (`private.add_default_subjects()`), and moving class (`set_learner_class()`) drops the old class's choices and adds the new class's defaults. Secondary learners start with none. Manual add uses the same `import_learners()` as the import, so a learner, enrolment, defaults and guardian are added together.
- Staff: one row per role (school_admin, head, hod, teacher, with everyday aliases such as "HOD" or "Headmaster"). Errors are a missing name, a bad email, an unknown role, an email twice in the file, and someone who already holds that role (a disabled role says to re-enable it). The commit creates any missing Auth accounts first with the service role (`createUser`, no email), adds every membership in one transaction, then sends the same `inviteUserByEmail` invite as the console (D14) and records `staff_invited` with `log_staff_invite_event()`. Someone with a confirmed account (a teacher at another school) is added `active` with no email. If the commit fails after accounts were created, those accounts stay, unused; a later import reuses them. An invite email that fails is listed on the job and on the person's page, with "Resend invite" (moved to `src/components/resend-invite-form.tsx` and shared with the console), which records `invite_resent`.
- Leavers: a learner's status (active, left, graduated) is edited on their page and this year's enrolment follows it (enrolled, left, graduated); a staff role is disabled, and re-enabled as `active`, or `invited` if they never set a password. Nobody changes their own roles. Nothing is deleted except a wrong guardian link (D23).
- Staff names: `public.school_staff()` (security definer) lists a school's staff with names and emails for its school admin and head, since `profiles_select` hides colleagues who have not accepted an invite. `update_staff_profile()` lets the school admin edit a staff member's name and phone (profiles are otherwise owner-only, D5) and records `staff_details_changed` in the audit log. Profiles are global, so the change shows in every school the person belongs to; the email (their sign-in) is not editable.
- `imports` bucket: private, 5 MB, CSV and xlsx types, insert and read by that school's school_admin or head (matching `import_jobs`, D23); no update or delete. DATA_MODEL section 8 said school admin only; head added for consistency with D23.
- Excel without a dependency: `src/lib/people/xlsx.ts` reads the first sheet of an .xlsx with Node's zlib (zip directory, shared and inline strings, numbers, booleans). Why: the import needs cell values only, and adding a package was not agreed. It ignores formatting, other sheets and zip64; dates arrive as serial numbers and the date parser converts them. Server action bodies are raised to 6 MB for 5 MB files.
- Not now: rate limiting imports (SPEC section 5), deleting stored files after 30 days, a guardian list page, more than one guardian per import row, updating existing learners or guardians from a file, and pagination beyond the first 100 learners (search narrows instead).

## D25. Parent accounts from a one-time code (2026-10-08)

- Decision: `invites` (D7) lands for parents only (a check constraint: `role = 'parent'` with a `guardian_id`; staff keep Auth invites, D14, and learners get PINs, D26). A school admin presses "Make a parent code" on a guardian's card on the learner page. The server makes a 12-character code from an alphabet without look-alikes (about 59 bits, shown as `XXXX-XXXX-XXXX`) and a link `/join?code=...`, shows both once, and stores only the code's SHA-256 hash through `create_parent_invite()`, which also stops any older waiting code for that guardian and records `parent_invite_created`. A code lasts 14 days and works once. Nobody writes `invites` directly; school admin and head read it.
- `/join` previews a code with `parent_invite_preview()` (callable signed out; it reveals the school, guardian name and email, and the number of children only for a usable code) and says plainly when a code is used, expired (including one replaced by a newer code) or unknown. A new parent gives name, email and password: the server creates the Auth account with the email marked confirmed (the code proves the school knows them), signs them in and calls `redeem_parent_invite()`. Someone already signed in (a teacher who is a parent, or a parent at a second school) presses "Add to my account" instead. An email that already has an account is asked to sign in first.
- `redeem_parent_invite()` (security definer, signed in) sets `guardians.user_id`, adds or re-activates an `active` parent membership (a transaction-local flag lets `guard_membership_insert()` allow this one self-grant) and marks the code accepted, all at once; the guardian's links make every sibling appear under one login. A guardian already linked to someone else stays theirs. `parent_invite_accepted` is recorded.
- Until the parent portal (Phase 4), `/children` lists the linked children's names and learner numbers through `my_children()`; parents still get no table access (D23).
- Password reset (US-1.7) for parents is the email flow of D19, unchanged.
- Not now: rate limiting `/join` (a code is not guessable, but repeated tries are not counted), sending codes by email or SMS (the admin hands over a slip or a message), and an admin list of waiting codes beyond the note on each guardian.

## D26. Learner sign in with learner number and PIN (2026-10-08)

- Decision (Q15): learners sign in at `/sign-in/learner` with their school (a list of active schools from `sign_in_schools()`, preselected by `?school=<slug>`), learner number (any case) and a 6-digit PIN. A school admin presses "Create PIN" or "Reset PIN" on the learner's page; the PIN is random, never a repeat or a run, shown once, and the learner must choose their own at the next sign in (`/change-pin`; the proxy and every area page send them there until they do). This is also how a learner's forgotten PIN is reset (US-1.7). Primary learners need no login (Q15): the admin simply does not make one.
- Accounts: the server makes the learner's Auth account with the service role, with a made-up address `<learner_id>@learners.sp-portal.invalid` (never receives mail) and `app_metadata` naming the learner and school (only the service role can write it). `link_learner_login()` then sets `learners.user_id`, adds an active learner membership and records `learner_pin_set` (never the PIN). It refuses an account whose `app_metadata` does not name that learner, and `learners.user_id` and `guardians.user_id` are no longer writable through the Data API (column grants), so an admin cannot point a learner record at a staff account and then reset that account's password.
- PIN to password: the Auth password is `HMAC-SHA256(LEARNER_PIN_SECRET, user_id:PIN)`. A 6-digit PIN typed straight into Supabase Auth would be guessable; this way only the server can turn a PIN into a password, so every try goes through the app's lockout. `LEARNER_PIN_SECRET` is server-only, read only in `src/lib/auth/learner-accounts.ts` (and the seed script); changing it stops every PIN working until reset.
- Lockout: the same rule and table as staff (D8): 5 wrong PINs in 10 minutes block that learner number for 15 minutes, counted under a hash of `learner:<school_id>:<LEARNER NUMBER>`. Unknown numbers and learners without an account count and answer exactly like a wrong PIN.
- Choosing a PIN signs the learner in afresh (so the session no longer carries the flag) and signs out their other sessions. An admin reset does not end a session already open.
- Seed: the two demo learner logins (MSH260001, KDP260001) sign in with PIN `246810` (`SEED_DEMO_PIN`); their email and demo password no longer work.
- Hosted projects: Supabase limits sign-ins per IP (30 per 5 minutes by default) and a whole class shares the school's IP, so raise `sign_in_sign_ups` before learners use the portal (go-live checklist).

## D27. Staff roles need a proved address and the person's own say (2026-10-08)

- Context: the Phase 2 review found that anyone could make a confirmed account for someone else's address (public sign-up was on with confirmations off, and `/join` marked any typed address confirmed). When that person was later added as staff, the existing account was given an `active` role with no email, so whoever registered first could sign in as the teacher or school admin. A school admin could also add another school's head and then rename them and read their phone number.
- Public sign-up is off (`[auth] enable_signup = false`; `[auth.email] enable_signup` stays on because it switches email sign in itself). Every account is made by the server. Hosted projects must turn sign-ups off too (go-live checklist). E2E helpers make test accounts with the local service-role key, as the seed script does.
- `/join` marks the address proved only when it is the guardian's email on file. Any other address is still confirmed (the parent signs in at once) but carries `app_metadata.email_unverified` (only the service role writes it) until a password reset by email proves the inbox and clears it. Adding an address like that as staff, from the console, the people page or an import, is refused with a message asking the person to reset their password first. Pure rules in `src/lib/auth/account-trust.ts`.
- Every new staff role starts `invited`, except a further role for someone who already has an active role in that school. Someone new gets the Auth invite email as before. Someone who already has an account gets no email: after their next sign in, they land on `/welcome`, which lists the schools and roles waiting (`my_pending_invites()`) with Accept and Decline (`decline_my_invites()` disables them). Re-enabling a disabled role follows the same rule. The console and `/admin/people` share `src/lib/auth/staff-accounts.ts`.
- `update_staff_profile()` refuses (`staff_shared`) anyone who also belongs to another school or is a platform admin: profiles are global, so only the person edits theirs. `school_staff()` shows a phone number only for someone with an active role in the school or who belongs to no other school.

## D28. Phase 2 review fixes: leavers, PIN guessing, scoping, audit, long lists (2026-10-08)

- Leavers: a learner whose status leaves `active` (left, graduated) can no longer sign in. `learnerLogin()` treats them like a wrong PIN, and a trigger (`private.sync_learner_membership()`) disables their learner membership, so a session already open loses access too; it is restored if they return.
- PIN guessing: besides the per-learner lockout (D26), wrong PINs are counted per school and network address (`x-forwarded-for`, first entry): 40 in 10 minutes block that address's learner sign in for that school for 15 minutes, and a success does not clear them. 40 is meant to stay out of the way of a whole class signing in from the school's one address. PINs that read as a date (DDMMYY, MMDDYY, YYMMDD) count as too easy, for chosen and generated PINs alike.
- Parent codes do not undo a school's decision: `redeem_parent_invite()` refuses (`membership_disabled`) when the person's parent membership in that school is disabled.
- Server actions scope every write by id to the active school as well as relying on RLS, so an admin of two schools cannot change the other school through an id from a stale page. Subject choices check the enrolment belongs to the learner; adding a guardian checks the learner first. Making a guardian primary is one call (`set_primary_guardian()`, security invoker).
- Audit: guardians, guardian links and enrolments now have the row audit trigger, like learners. Unlinking a guardian (the one hard delete of people data) keeps the old link, who removed it and when in `audit_log`.
- Long lists: the Data API returns at most 1,000 rows a request (`max_rows`), so import checks read guardians and learner numbers a page at a time. An e2e test imports a 1,000-row learner file in one go, and the same file with one bad row imports nothing.
- Duplicated helpers moved to one place: form results (`saved`, `failed`, `notAllowed` in `platform/form-state.ts`), the school-admin check for actions (`schoolAdminContext()` in `src/lib/auth/viewer.ts`) and `rowsOrThrow()` (`src/lib/supabase/rows.ts`).
- Parent codes in links: `/join?code=...` is moved by the proxy into a short-lived httpOnly cookie and redirected to a clean `/join`, so the one-time code does not stay in the address bar, history or later links.

## D29. CI runs the pgTAP database tests (2026-10-09)

- A second CI job (`db` in `.github/workflows/ci.yml`) runs beside the typecheck, lint and unit job on the same triggers (pushes to `main`, every pull request). It starts the local Supabase stack with the Supabase CLI from `package-lock.json` (2.117.0, the same one `npm run db:start` uses), which applies the migrations, then runs `npm run test:db`.
- Only Postgres, Auth and Storage are started (`supabase start -x` the rest): Auth creates the `auth` schema and Storage the `storage` schema that the branding and import tests use. Kong, PostgREST, Realtime, Studio, Mailpit, imgproxy, edge runtime, logflare, vector and supavisor are skipped.
- Caching: npm through `setup-node`. Docker images are pulled each run rather than cached; saving and restoring them through the Actions cache is usually no faster than pulling.
- e2e (Playwright) stays local for now.
