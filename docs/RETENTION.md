# Retention

How long SP Portal keeps each kind of data, and what deletes it. These are the rules we assume until the lawyer's review of the privacy notice (Q20) says otherwise; the notice at `/privacy` says the same in plain words. Decision: D58.

## Rules

| Data                                                                                              | Kept                                                                          | How it ends                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reports (rows and PDFs), marks, subject and class comments, results                               | For the life of the school's record of the learner                            | Never deleted. A withdrawn report stays, marked withdrawn (D46).                                                                                                 |
| Learners, guardians, enrolments, staff memberships                                                | For the life of the school's record                                           | Never hard-deleted (CLAUDE.md rule 6): a leaver is `left`, a disabled login is `disabled`. Unlinking a parent is audited (D28).                                  |
| Audit log                                                                                         | For the life of the school's record                                           | Never deleted.                                                                                                                                                   |
| Announcements and their files                                                                     | For the life of the school's record                                           | Archived, not deleted (D49).                                                                                                                                     |
| Import files (uploaded spreadsheets in the `imports` bucket)                                      | 30 days                                                                       | Deleted daily once older than 30 days. The `import_jobs` row stays with `file_path` cleared and `file_deleted_at` set; what the file added stays in the records. |
| `sign_in_attempts` (hashed emails, learner numbers and network addresses for lockouts and limits) | 30 days                                                                       | Deleted daily once older than 30 days. The lockout looks back 15 minutes and the limits a day at most, so nothing still needs them.                              |
| Auth sessions and tokens                                                                          | As Supabase Auth keeps them                                                   | Supabase Auth.                                                                                                                                                   |
| Hosting access logs                                                                               | As short as the host allows                                                   | Vercel's log retention (go-live checklist: no query strings, short retention).                                                                                   |
| Error reports                                                                                     | Sentry's retention for the plan                                               | Sentry. Scrubbed before sending (D59).                                                                                                                           |
| Backups                                                                                           | Supabase daily backups as the plan keeps them; weekly external copies 90 days | Replaced as they age out (docs/BACKUPS.md).                                                                                                                      |

"Nothing personal is hard-deleted" means rows about people stay, with a status. The two exceptions above hold no readable personal data in the database itself: an import file is a copy of what is already in the records, and a sign-in attempt holds only a hash.

When a school leaves the portal, what happens to its data (export and hand over, then delete) is a decision for the school and the lawyer; there is no automated deletion of a school.

## The clean-ups

Both run once a day from one place: `GET /api/cron/retention`, called by Vercel Cron at 01:00 UTC (03:00 in Harare), configured in `vercel.json`.

1. `prune_sign_in_attempts()` deletes `sign_in_attempts` rows older than 30 days and returns how many.
2. `expired_import_files()` lists `imports` bucket files older than 30 days (500 a round, up to 10 rounds a run). The route deletes them through the Storage API, then `forget_import_files(names)` clears `file_path` on the jobs whose files are really gone and sets `file_deleted_at`.

The functions are in migration `privacy_and_retention`, callable by the service role only. The route answers 401 unless the request carries `Authorization: Bearer $CRON_SECRET` (Vercel Cron adds that header when the `CRON_SECRET` environment variable is set), and its answer is counts only:

```json
{ "signInAttemptsDeleted": 412, "importFilesDeleted": 3, "importJobsCleared": 3 }
```

pgTAP `39_privacy_and_retention` checks that only rows and files older than 30 days go, that other buckets are never listed, and that old rows in `audit_log`, `reports` and `marks` survive a run.

### Why a route and not pg_cron

Supabase Storage refuses SQL deletes on `storage.objects` (its `protect_delete` trigger), and deleting the row would leave the file behind anyway, so import files can only be removed through the Storage API. A database-only schedule (pg_cron) could prune `sign_in_attempts` but not the files. One route called by the host's scheduler does both, keeps the schedule in the repository (`vercel.json`), and shows each run in Vercel's logs. If the portal moves off Vercel, any scheduler that can send the header (GitHub Actions, a cron job) can call the same route.

### Running it by hand

```sh
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<portal>/api/cron/retention
```

Safe to run any time: a second run the same day deletes nothing new.
