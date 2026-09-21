# Decisions

Short records of choices that are not obvious from the code. Newest last.
Format: **D#. Title** (date). Decision. Why. Alternatives.

## D1. Scaffold stack (2026-09-21)

- Decision: Next.js App Router with `src/` dir, TypeScript strict, Tailwind v4, shadcn/ui, Supabase (`@supabase/ssr`), Vitest, Playwright, pgTAP for RLS tests, npm as package manager.
- Why: matches `SPEC.md` quality gates (typecheck, lint, unit, RLS, e2e) with one repo and one deployment serving many schools.
- Unit tests live in `tests/unit` (and beside source); pgTAP in `supabase/tests`; e2e in `tests/e2e` with mobile and desktop projects.
- CI runs typecheck, lint and unit tests. DB and e2e checks are local for now.
