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
