# Backups and restore

What protects the data, how the weekly external copy is made, and how to prove a backup restores. Decision: D60.

## Layers

1. **Supabase daily backups** of the database, kept by Supabase for the plan's period (check the plan: the Pro plan keeps daily backups for 7 days, which is why production needs a paid plan). Point-in-time recovery is a paid add-on and is not assumed. These live inside Supabase and do not include Storage files.
2. **Weekly external backup** (this document): the database and the `reports` bucket, encrypted, stored outside Supabase. It is what we restore from if the Supabase project or account is lost.
3. **A restore test** at least once a term, and after any change to the backup scripts, into a scratch project.

## What the weekly backup holds

`scripts/backup/backup.sh` writes one archive, `sp-portal-<UTC time>.tar.gz.gpg`, encrypted with `BACKUP_PASSPHRASE` (gpg, AES-256). Inside:

| File             | What                                                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `roles.sql`      | Database roles (`supabase db dump --role-only`)                                                                                                                                         |
| `schema.sql`     | Our schemas: tables, functions, policies, triggers (`supabase db dump`)                                                                                                                 |
| `extras.sql`     | What the CLI dump leaves out because it sits in Supabase's own schemas or defaults: our policies on `storage.objects`, our trigger on `auth.users`, and the exact grants on our objects |
| `data.sql`       | All rows (`supabase db dump --data-only --use-copy`), without Auth sessions and tokens and without Storage tables we do not use                                                         |
| `migrations.txt` | The migration versions applied, for `supabase migration repair` after a restore                                                                                                         |
| `row-counts.csv` | Row counts per table and a fingerprint of policies, functions, triggers and grants, compared after a restore                                                                            |
| `storage/`       | Every file of the `reports` bucket (add buckets with `BACKUP_BUCKETS="reports report-assets school-branding"`) and `manifest.json` with each file's size and SHA-256                    |

Auth users, their identities and authenticator apps are in `data.sql`; sessions are not, so everyone signs in again after a restore. `attachments` (newsletter files) and `imports` (deleted after 30 days anyway) are not in the default copy; logos, stamps and signatures can be uploaded again.

## Where it runs

`.github/workflows/backup.yml` runs the script every Sunday at 02:00 UTC (and on demand from the Actions tab) and keeps the encrypted archive as a workflow artifact for 90 days. It needs four repository secrets (go-live checklist):

| Secret                    | Value                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `BACKUP_DB_URL`           | Production connection string, session pooler (Project Settings, Database, Connect), percent-encoded password |
| `BACKUP_SUPABASE_URL`     | Production project URL                                                                                       |
| `BACKUP_SERVICE_ROLE_KEY` | Production service-role key                                                                                  |
| `BACKUP_PASSPHRASE`       | A long random passphrase, also kept in the password manager: without it the backups cannot be opened         |

Until they are set the workflow warns and does nothing. Once a month, download the newest artifact and keep it somewhere else too (an encrypted drive or a second cloud account), so the copies do not all depend on GitHub.

Run it by hand (needs Docker for the CLI's `pg_dump`, `psql`, `gpg` and Node):

```sh
SUPABASE_DB_URL=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... BACKUP_PASSPHRASE=... \
  scripts/backup/backup.sh backups
```

## Restore test (against a scratch project, never production)

1. Create a new Supabase project in the same region (the scratch project). Do not run migrations on it: it must be as Supabase makes it.
2. Download the newest backup artifact (Actions, Weekly backup, the run, Artifacts) and unzip it to get the `.tar.gz.gpg`.
3. Run, with the scratch project's details:

   ```sh
   TARGET_DB_URL=<scratch connection string> \
   TARGET_SUPABASE_URL=<scratch project URL> \
   TARGET_SERVICE_ROLE_KEY=<scratch service-role key> \
   BACKUP_PASSPHRASE=... CONFIRM_SCRATCH=yes PRODUCTION_DB_URL=<production connection string> \
     scripts/backup/restore.sh sp-portal-<time>.tar.gz.gpg
   ```

   It loads roles, schema, extras and data in one transaction (with triggers off while data loads), uploads the files, then compares row counts, structure and grants with the backup and checks the files (all present, a sample by checksum). It stops with an error on any difference. `PRODUCTION_DB_URL` makes it refuse if the target is production.

4. Run the database tests against the restored copy: `npx supabase test db --db-url "<scratch connection string>"`. They must all pass, as on a fresh database.
5. Optionally point a local `.env.local` at the scratch project, sign in as a school admin and open a published report's PDF.
6. Record the date, the backup used, how long it took and the result in `docs/PROGRESS.md`, then pause or delete the scratch project.

To make the scratch project accept `supabase db push` later, run the `supabase migration repair` command the script prints.

## Restoring production for real

The same script, with the new production project as the target and `CONFIRM_SCRATCH=yes` (the name is a safeguard, not a requirement that it be scratch), followed by: `supabase migration repair` as printed, the Auth and dashboard settings from `docs/DEPLOY.md`, the new project's URL and keys in Vercel, and a redeploy. Everyone signs in again.

## The local run

The procedure was run on the local stack on 2026-10-13 (`docs/PROGRESS.md`). A second local Supabase stack with no migrations stood in for the scratch project. The first runs found two gaps, both fixed in the scripts before the recorded run: the CLI dump left out our policies on `storage.objects` and the `on_auth_user_created` trigger, and restoring into a Supabase database re-granted anon and authenticated everything our migrations had revoked (`prune_sign_in_attempts()` became callable by anon). `extras.sql` and the grants fingerprint in `row-counts.csv` exist because of that run.
