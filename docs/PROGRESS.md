# Progress

Update at the end of every story (definition of done, `SPEC.md` section 6).

## Current phase

Phase 1 (E1: access, tenancy, branding). Tenancy schema done; sign in not started.

## Done

- 2026-09-21: Project scaffold: Next.js + TypeScript strict, Tailwind, shadcn/ui, Supabase local config, Vitest, Playwright, ESLint, Prettier, CI (typecheck, lint, unit tests).
- 2026-10-07: Tenancy schema: `schools`, `profiles`, `platform_admins`, `memberships` with RLS helpers, policies, write guards (D2 to D5) and pgTAP tests (cross-school, anonymous, self-role, column guards). Seed script loads auth users, profiles, schools, platform admins and memberships from `seed/` (D6).
- 2026-10-07: Root layout shows the footer "Implemented by Panashe and Shuvai 2026" on every page (US-1.6) and the site title is SP Portal.

## In progress

_None._

## Next

- US-1.1 staff sign in (email and password, school picker for multi-school users) and US-1.8 role-based navigation.
- `invites` table with US-1.3 parent accounts (D7).

## Known gaps

- CI does not yet run `test:db` (needs Docker/Supabase) or `test:e2e`.
