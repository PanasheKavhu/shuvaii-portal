# Progress

Update at the end of every story (definition of done, `SPEC.md` section 6).

## Current phase

Phase 1 (E1: access, tenancy, branding). Tenancy schema, staff sign in, role-based navigation and school theming done.

## Done

- 2026-09-21: Project scaffold: Next.js + TypeScript strict, Tailwind, shadcn/ui, Supabase local config, Vitest, Playwright, ESLint, Prettier, CI (typecheck, lint, unit tests).
- 2026-10-07: Tenancy schema: `schools`, `profiles`, `platform_admins`, `memberships` with RLS helpers, policies, write guards (D2 to D5) and pgTAP tests (cross-school, anonymous, self-role, column guards). Seed script loads auth users, profiles, schools, platform admins and memberships from `seed/` (D6).
- 2026-10-07: Root layout shows the footer "Implemented by Panashe and Shuvai 2026" on every page (US-1.6) and the site title is SP Portal.
- 2026-10-07: US-1.1 staff sign in (email and password, lockout after 5 failures in 10 minutes, school picker and switch for multi-school users) and US-1.8 role-based navigation (menus per role, role home pages, 403 "Not allowed" on direct URLs). `sign_in_attempts` table with pgTAP test (D8), active-school cookie and role areas (D9, D10), two-school demo teacher in the seed (D11). Supabase clients in `src/lib/supabase` (server, admin, generated types via `npm run db:types`), session refresh in `src/proxy.ts`. Area pages are placeholders until their stories land. Fixed the sans font token so Geist is used.

- 2026-10-07: School theme and layout: `ThemeProvider` applies each school's colours (and logo, initials badge until uploads exist) as CSS variables in light and dark mode with AA enforced (D12); contrast helpers in `src/lib/branding/contrast.ts`; light/dark/system switch (D13); refreshed signed-in shell with logo, accent stripe and role menu. The proxy now blocks role areas before rendering (redirect to sign in or school picker, or 403 Not allowed), with pages checking the same rule (D10).

## In progress

_None._

## Next

- US-1.7 password reset, US-1.2 learner sign in (learner number and PIN).
- US-1.5 branding editor for super admins (save colours with `checkContrast()`, upload logo to the `school-branding` bucket).
- `invites` table with US-1.3 parent accounts (D7).

## Known gaps

- CI does not yet run `test:db` (needs Docker/Supabase) or `test:e2e`.
- `sign_in_attempts` rows are never pruned (D8).
- Two-factor sign in for super admin, school admin and head (SPEC section 5) is not built yet.
