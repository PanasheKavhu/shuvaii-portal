#!/usr/bin/env bash
# Restores a backup made by backup.sh into a SCRATCH Supabase project and
# checks it (docs/BACKUPS.md, D60). Never point it at production.
#
#   TARGET_DB_URL=...  TARGET_SUPABASE_URL=...  TARGET_SERVICE_ROLE_KEY=... \
#   BACKUP_PASSPHRASE=...  CONFIRM_SCRATCH=yes \
#   scripts/backup/restore.sh <backup.tar.gz.gpg | backup.tar.gz | unpacked dir>
#
# The target must be a new project with no tables of its own in public (as
# Supabase makes it). TARGET_STORAGE_URL overrides
# `${TARGET_SUPABASE_URL}/storage/v1`. Steps: roles, schema, our policies
# and triggers on auth and storage tables, and data in one transaction (triggers off while the data loads, as Supabase's restore
# guide does), then the files, then row counts and files compared with the
# backup. Exits non-zero if anything differs.
set -euo pipefail

: "${TARGET_DB_URL:?Set TARGET_DB_URL}"
: "${TARGET_SERVICE_ROLE_KEY:?Set TARGET_SERVICE_ROLE_KEY}"
if [[ "${CONFIRM_SCRATCH:-}" != "yes" ]]; then
  echo "Refusing: set CONFIRM_SCRATCH=yes to confirm the target is a scratch project." >&2
  exit 2
fi
if [[ -n "${PRODUCTION_DB_URL:-}" && "$TARGET_DB_URL" == "$PRODUCTION_DB_URL" ]]; then
  echo "Refusing: the target is the production database." >&2
  exit 2
fi

here="$(cd "$(dirname "$0")" && pwd)"
src="${1:?Give the backup file or folder}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [[ -d "$src" ]]; then
  dir="$src"
else
  if [[ "$src" == *.gpg ]]; then
    : "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE to decrypt}"
    gpg --batch --pinentry-mode loopback --passphrase-fd 3 -d "$src" 3<<<"$BACKUP_PASSPHRASE" |
      tar -C "$work" -xzf -
  else
    tar -C "$work" -xzf "$src"
  fi
  dir="$(find "$work" -mindepth 1 -maxdepth 1 -type d | head -1)"
fi

echo "Restoring roles, schema and data"
psql "$TARGET_DB_URL" -X -q --single-transaction -v ON_ERROR_STOP=1 \
  -f "$dir/roles.sql" \
  -f "$dir/schema.sql" \
  -f "$dir/extras.sql" \
  -c 'set session_replication_role = replica' \
  -f "$dir/data.sql" > /dev/null

echo "Restoring files"
SUPABASE_URL="${TARGET_SUPABASE_URL:-}" STORAGE_URL="${TARGET_STORAGE_URL:-}" \
  SUPABASE_SERVICE_ROLE_KEY="$TARGET_SERVICE_ROLE_KEY" \
  node "$here/storage.mjs" upload "$dir/storage"

echo "Checking row counts"
psql "$TARGET_DB_URL" -X -At -v ON_ERROR_STOP=1 -f "$here/row-counts.sql" > "$work/after.csv"
# Compared: every public table, the auth and storage tables the backup
# keeps (backup.sh leaves out sessions, tokens and unused storage tables),
# the numbers of policies, functions, triggers and RLS tables, and a
# fingerprint of what the API roles may do.
kept='^(public\.[a-z_]+|structure\.[a-z_]+|auth\.(users|identities|mfa_factors)|storage\.(buckets|objects)),'
if diff <(grep -E "$kept" "$dir/row-counts.csv") <(grep -E "$kept" "$work/after.csv") > "$work/diff.txt"; then
  echo "Row counts and structure match ($(grep -cE "$kept" "$dir/row-counts.csv") lines)"
else
  echo "Row counts differ (backup on the left, restored on the right):" >&2
  cat "$work/diff.txt" >&2
  exit 1
fi

echo "Checking files"
SUPABASE_URL="${TARGET_SUPABASE_URL:-}" STORAGE_URL="${TARGET_STORAGE_URL:-}" \
  SUPABASE_SERVICE_ROLE_KEY="$TARGET_SERVICE_ROLE_KEY" \
  node "$here/storage.mjs" verify "$dir/storage"
echo "Restore check passed"
if [[ -s "$dir/migrations.txt" ]]; then
  echo "To let 'supabase db push' work against this project, record the migrations it already has:"
  echo "  npx supabase migration repair --db-url \"\$TARGET_DB_URL\" --status applied $(tr '\n' ' ' < "$dir/migrations.txt")"
fi
