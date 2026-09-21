# SP Portal

Multi-tenant school reports portal for Zimbabwean schools (marks, comments, PDF reports, learner/parent portal, newsletter). One deployment, many schools. Source of truth: `docs/SPEC.md` (with `DATA_MODEL.md`, `GRADING_AND_WEIGHTS.md`, `REPORT_LAYOUT.md`, `OPEN_QUESTIONS.md`). Seed data lives in `seed/`.

Status: scaffold only, no features yet. Read `docs/PROGRESS.md` first, and log choices in `docs/DECISIONS.md`.

## Stack

- Next.js (App Router), React, TypeScript `strict`. This Next.js version has breaking changes: read `node_modules/next/dist/docs/` before using an API you are unsure of (see `AGENTS.md`).
- Tailwind CSS v4 + shadcn/ui (`components.json`, components in `src/components/ui`).
- Supabase (Postgres, Auth, Storage) via `@supabase/supabase-js` and `@supabase/ssr`. Local stack from the Supabase CLI.
- Vitest (unit, jsdom), pgTAP via `supabase test db` (RLS), Playwright (e2e, mobile + desktop).
- ESLint + Prettier (with tailwind plugin). GitHub Actions CI in `.github/workflows/ci.yml`.

## Folder layout

```
src/app/            routes (App Router); route groups per role, e.g. (admin), (teacher), (portal)
src/components/     shared components; ui/ is shadcn output
src/lib/            pure logic (grading, weights, formatting); no I/O, easy to unit test
src/lib/supabase/   Supabase clients: browser, server (cookies), admin (service role, server-only)
supabase/migrations/ version-controlled SQL migrations (the only way the schema changes)
supabase/tests/     pgTAP tests (RLS, cross-school)
supabase/seed.sql   local seed (generated from seed/ CSVs)
tests/unit/         Vitest tests (also allowed: *.test.ts next to source)
tests/e2e/          Playwright specs
docs/               spec, data model, PROGRESS.md, DECISIONS.md
seed/               pilot seed CSVs and generator
```

## Naming

- Files and folders: `kebab-case`. React components: `PascalCase` exports. Hooks: `useThing`.
- Database: `snake_case`, plural tables, enums as Postgres enum types, uuid PKs. Match column names in `docs/DATA_MODEL.md` and `seed/*.csv`.
- Migrations: `supabase migration new <short_snake_case_name>`; never edit a migration that has been merged, add a new one.
- Tests: `thing.test.ts` (unit), `thing.spec.ts` (e2e), `NN_thing.test.sql` (pgTAP).
- Server actions and route handlers validate input at the boundary; keep money-free, pure grading math in `src/lib`.

## Rules (non-negotiable)

1. **Every tenant table has `school_id uuid not null references schools(id)` and RLS enabled**, with policies and a cross-school pgTAP test. Child tables repeat `school_id`. Exceptions are only those listed in `docs/DATA_MODEL.md`.
2. **The service-role key is server-only.** Only one module (`src/lib/supabase/admin.ts`, created when first needed) may read `SUPABASE_SERVICE_ROLE_KEY`; import it only from server code (route handlers, server actions, jobs). Never prefix it with `NEXT_PUBLIC_`, never send it to the client, never log it. Prefer the user-scoped client so RLS applies.
3. **Schema changes only through migrations** in `supabase/migrations`. No manual edits to a shared database.
4. **Small commits**: one logical change each, imperative message, tests included, CI green before the next. Do not commit `.env*` (except `.env.example`).
5. **No personal data in logs** (learner names, marks, contact details, tokens).
6. Nothing personal is hard-deleted; use `status` fields.
7. Mobile-first: works from 360 px wide, large tap targets, labelled inputs, WCAG AA contrast.
8. Footer on every page: "Implemented by Panashe and Shuvai 2026".
9. Do not build beyond the current story. Unclear requirement: check `docs/OPEN_QUESTIONS.md`, then record the assumption in `docs/DECISIONS.md`.

## Definition of done (docs/SPEC.md section 6)

1. Acceptance criteria demonstrated on seed data on a phone-sized screen.
2. Automated tests added; CI green.
3. New tables have RLS and a cross-school test.
4. Audit logging present where marks, comments or reports change.
5. `docs/PROGRESS.md` and `docs/DECISIONS.md` updated.

## Running checks

Requires Node 24, and Docker for the local Supabase stack.

| Task                 | Command                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Install              | `npm ci`                                                                                     |
| Dev server           | `npm run dev`                                                                                |
| Typecheck            | `npm run typecheck`                                                                          |
| Lint                 | `npm run lint`                                                                               |
| Format               | `npm run format` (check only: `npm run format:check`)                                        |
| Unit tests           | `npm test` (watch: `npx vitest`)                                                             |
| Database (RLS) tests | `npm run test:db` (needs `npm run db:start` first)                                           |
| End-to-end           | `npm run test:e2e` (first time: `npx playwright install`)                                    |
| Local Supabase       | `npm run db:start` / `npm run db:stop` / `npm run db:reset` (re-applies migrations and seed) |

Before declaring a story done run: `typecheck`, `lint`, `test`, `test:db`, `test:e2e`. CI runs `typecheck`, `lint` and `test` only; `test:db` and `test:e2e` are run locally until CI gets Docker/Playwright jobs.

## Environment

Copy `.env.example` to `.env.local`. Local Supabase prints the URL and keys on `npm run db:start`.
