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
