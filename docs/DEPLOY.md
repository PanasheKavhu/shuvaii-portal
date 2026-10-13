# Deploying SP Portal

One Next.js app on Vercel, one hosted Supabase project per environment (staging and production), one portal for every school. This is the how; `docs/PROGRESS.md` (go-live checklist) is the list of what is still to do and who does it.

## 1. Environments

| Environment | Supabase project       | Vercel                         | Who uses it                     |
| ----------- | ---------------------- | ------------------------------ | ------------------------------- |
| Local       | `npm run db:start`     | `npm run dev`                  | Developers, tests               |
| Staging     | `sp-portal-staging`    | Preview deployments (every PR) | Panashe and Shuvai, pilot demos |
| Production  | `sp-portal-production` | Production deployment (`main`) | Schools                         |

Create both Supabase projects in the same region, the closest one the Supabase dashboard offers to Zimbabwe at creation time (the region cannot be changed later; it is named on the privacy notice through `DATA_REGION`). Production needs a paid plan (Pro) for daily backups and to avoid pausing. Put the Vercel functions in the region next to it (Vercel, Settings, Functions, Function Region), or every page waits on a long round trip.

## 2. Environment variables

Set in Vercel (Settings, Environment Variables), separately for Production and for Preview (Preview points at staging). Never put a server-only value in a `NEXT_PUBLIC_` variable; those are sent to browsers.

| Variable                         | Scope       | Value                                                                                                                                                                         |
| -------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`       | Public      | The project URL (Supabase, Project Settings, API)                                                                                                                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Public      | The project's anon (publishable) key                                                                                                                                          |
| `SUPABASE_SERVICE_ROLE_KEY`      | Server only | The service-role (secret) key. Read only by `src/lib/supabase/admin.ts` (rule 2)                                                                                              |
| `LEARNER_PIN_SECRET`             | Server only | 32+ random characters (`node -e "console.log(crypto.randomBytes(32).toString('base64url'))"`). Never change it in production: every learner PIN stops working (D26)           |
| `SITE_URL`                       | Server only | The portal's public address, e.g. `https://portal.example.co.zw`, no trailing slash. Report QR codes and share links use it; production refuses to make PDFs without it (D45) |
| `DATA_REGION`                    | Server only | Where Supabase stores the data, in plain words, e.g. `Frankfurt, Germany (AWS eu-central-1)`. Printed on `/privacy` (D57)                                                     |
| `CRON_SECRET`                    | Server only | 32+ random characters. Vercel Cron sends it to `/api/cron/retention`; without it the clean-ups never run (D58)                                                                |
| `SENTRY_DSN`                     | Server only | The Sentry project's DSN; empty sends nothing (D59)                                                                                                                           |
| `NEXT_PUBLIC_SENTRY_DSN`         | Public      | The same DSN, for browser errors                                                                                                                                              |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Public      | `production` or `staging`                                                                                                                                                     |

Keep `LEARNER_PIN_SECRET`, `CRON_SECRET` and the backup passphrase in the password manager as well. Staging and production use different values for every secret.

The weekly backup reads its own GitHub Actions secrets (`BACKUP_DB_URL`, `BACKUP_SUPABASE_URL`, `BACKUP_SERVICE_ROLE_KEY`, `BACKUP_PASSPHRASE`; `docs/BACKUPS.md`).

## 3. Supabase dashboard settings

Each of these is on the hosted project only (the local stack reads `supabase/config.toml`). Do them on staging first, then production.

| Where (Supabase dashboard)            | Setting                                                                                                                       | Why             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Authentication, Sign In / Providers   | "Allow new users to sign up" off; Email provider on                                                                           | D27             |
| Authentication, URL Configuration     | Site URL = `SITE_URL`; Redirect URLs: `SITE_URL/**`                                                                           | D14, D19        |
| Authentication, Emails, SMTP Settings | A real SMTP sender (the built-in one sends only a few emails an hour, to team members only)                                   | Invites, resets |
| Authentication, Emails, Templates     | Invite: subject and body from `supabase/templates/invite.html`. Reset password: from `supabase/templates/recovery.html`       | D14, D19        |
| Authentication, Multi-Factor          | "Authenticator app (TOTP)" enabled                                                                                            | D54             |
| Authentication, Rate Limits           | Raise sign-ups and sign-ins (`sign_in_sign_ups`) well above the default: a class of learners signs in from one school address | D26             |
| Project Settings, Data API            | Exposed schemas: `public` only (the default; `private` must never be exposed)                                                 | D2              |
| Database, Settings                    | Enforce SSL on incoming connections                                                                                           | Transport       |
| Project Settings, Add-ons / Billing   | Pro plan (daily backups, no pausing)                                                                                          | `BACKUPS.md`    |

Storage buckets and their policies come from the migrations; do not create or change them in the dashboard.

## 4. Vercel settings

| Where (Vercel)                  | Setting                                                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| New project                     | Import the GitHub repository; framework Next.js; Node.js 24; build `npm run build`; production branch `main`                                          |
| Settings, Environment Variables | Section 2, Production and Preview separately                                                                                                          |
| Settings, Functions             | Function region next to the Supabase region                                                                                                           |
| Settings, Cron Jobs             | Shows `/api/cron/retention` daily at 01:00 UTC from `vercel.json` once deployed; needs `CRON_SECRET`. Cron jobs run on the production deployment only |
| Settings, Domains               | The portal domain (section 6)                                                                                                                         |
| Settings, Logs / Log Drains     | No log drain that keeps request URLs for long; the audit and People search boxes put learner names in `?q=` (D37)                                     |
| Plan                            | Pro: Hobby is for non-commercial use                                                                                                                  |

Vercel sets `x-real-ip` and `x-forwarded-for` itself, which the verification page, share links and learner sign in use to count tries (D48). Check it once after the first deploy (go-live checklist).

Uptime: point a free uptime monitor (for example UptimeRobot or Better Stack) at `https://<portal>/healthz` every 5 minutes. It answers `200 {"status":"ok"}` when the app and the database answer, `503 {"status":"unavailable"}` otherwise, and nothing more (D59).

Errors: create a Sentry project (platform Next.js, an EU data region if offered when the organisation is made), copy its DSN into the variables above, and in the project's Security and Privacy settings keep the server-side data scrubber on and turn on "Prevent storing of IP addresses". The app already strips names, marks, codes and tokens before sending (D59).

## 5. Migrations: staging, then production

Migrations in `supabase/migrations` are the only way the schema changes (rule 3). They are applied from a developer's machine with the Supabase CLI, staging first:

```sh
# Once per machine: log in and link each project by its reference (Project Settings, General).
npx supabase login

# Staging
npx supabase link --project-ref <staging-ref>
npx supabase db push --dry-run   # lists what will run
npx supabase db push
```

Then open the staging preview of the same commit, sign in as each role and check the changed screens. When staging is right and the PR is merged:

```sh
# Production: take a backup first (Actions, Weekly backup, Run workflow), then
npx supabase link --project-ref <production-ref>
npx supabase db push --dry-run
npx supabase db push
```

Push the migration before (or together with) the merge that needs it, never after: Vercel deploys `main` as soon as it is merged. Write migrations so the previous app version still works against the new schema (add columns and functions first, remove old ones in a later release); then an app rollback never needs a database rollback.

## 6. Domain: one portal for every school

Recommended: one domain for everyone (for example `portal.<your-domain>`), set as `SITE_URL`, with each school reached through links that name it:

- learners: `https://portal.../sign-in/learner?school=<slug>` (the school is preselected),
- the privacy notice: `https://portal.../privacy?school=<slug>`,
- staff and parents: `https://portal.../sign-in` (their school comes from their account; branding follows after sign in).

Why: the app picks a school's branding from the signed-in person's membership, not from the address; Supabase Auth has one Site URL; `SITE_URL` is one address for every QR code; and one domain means one certificate, one cookie scope and one set of redirect URLs.

A school that insists on its own address (`reports.school.ac.zw`) can have it later: add the domain in Vercel, add `https://reports.school.ac.zw/**` to the Supabase redirect URLs, and accept that its QR codes and emails still use `SITE_URL` until the app learns per-school addresses (not built).

## 7. Rolling back

| What went wrong                 | Do this                                                                                                                                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A bad deploy (app only)         | Vercel, Deployments, the last good production deployment, "Instant Rollback" (or Promote to Production). Then revert the commit on `main` so the next deploy does not bring it back.                                                                |
| A bad migration, no data harmed | Write a new migration that undoes it and push it (staging, then production). Never edit or delete a merged migration.                                                                                                                               |
| Data damaged or lost            | Stop writes if needed (pause the school's switches or the deployment), then restore: Supabase's daily backup (Database, Backups) into the project, or, if the project is lost, `docs/BACKUPS.md` into a new project. Tell the schools what changed. |
| A secret leaked                 | Rotate it: Supabase keys in Project Settings, API; Vercel variables; redeploy. `LEARNER_PIN_SECRET` cannot be rotated without resetting every learner PIN (D26).                                                                                    |

## 8. First deploy, in order

1. Supabase production project created (region, Pro plan), settings in section 3.
2. `npx supabase link --project-ref <production-ref> && npx supabase db push`.
3. Vercel project with the variables in section 2 and the domain in section 6; deploy `main`.
4. `curl https://<portal>/healthz` answers `{"status":"ok"}`; `/privacy` names the region.
5. Create the super admin (seed a platform admin by hand: their Auth user, then a `platform_admins` row in the SQL editor), sign in, set up two-factor, save the recovery codes.
6. Onboard the pilot school from the console (D56) and work through the rest of the go-live checklist.
