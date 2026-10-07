# Progress

Update at the end of every story (definition of done, `SPEC.md` section 6).

## Current phase

Phase 1 (E1: access, tenancy, branding). Tenancy schema, staff sign in, role-based navigation, school theming and a minimal super-admin console done.

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

## In progress

_None._

## Next

- US-1.2 learner sign in (learner number and PIN), with the admin PIN reset that completes US-1.7 for learners.
- `invites` table with US-1.3 parent accounts (D7).
- US-10.3 feature flags and US-10.4 usage in the console.

## Known gaps

- CI does not yet run `test:db` (needs Docker/Supabase) or `test:e2e`.
- `sign_in_attempts` rows are never pruned (D8).
- Password reset by phone code (US-1.7) waits for an SMS provider (D19).
- Two-factor sign in for super admin, school admin and head (SPEC section 5) is not built yet.

## Go-live checklist

Things to do on the hosted Supabase project and deployment before the first real school uses the portal.

- [ ] Set the password-reset (recovery) email template from `supabase/templates/recovery.html` in the Supabase dashboard (D19).
- [ ] Set the invite email template (subject and the `/auth/confirm?token_hash=...&type=invite` link from `supabase/templates/invite.html`) and the site URL in the Supabase dashboard (D14).
