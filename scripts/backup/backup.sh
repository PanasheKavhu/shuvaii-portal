#!/usr/bin/env bash
# Weekly external backup (docs/BACKUPS.md, D60): the database as SQL files
# (roles, schema, data) made with the Supabase CLI, plus our policies and
# triggers on Supabase's auth and storage tables (extras.sql), the reports
# bucket (and any other buckets named in BACKUP_BUCKETS), row counts and a
# file manifest, packed into one archive and encrypted with
# BACKUP_PASSPHRASE (gpg, AES-256).
#
#   SUPABASE_DB_URL=...  SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=... \
#   BACKUP_PASSPHRASE=... scripts/backup/backup.sh [out-dir]
#
# SUPABASE_DB_URL is the session pooler or direct connection string of the
# project (Project Settings, Database). Without BACKUP_PASSPHRASE the archive
# is left unencrypted and the script says so: never upload that one.
# Needs Docker (the CLI's pg_dump), psql, tar, gpg and Node.
set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL}"
: "${SUPABASE_URL:?Set SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY}"

here="$(cd "$(dirname "$0")" && pwd)"
stamp="$(date -u +%Y%m%dT%H%MZ)"
out="${1:-backups}"
work="$(mktemp -d)"
name="sp-portal-$stamp"
mkdir -p "$out" "$work/$name"
trap 'rm -rf "$work"' EXIT

echo "Dumping roles, schema and data"
npx supabase db dump --db-url "$SUPABASE_DB_URL" --role-only -f "$work/$name/roles.sql"
npx supabase db dump --db-url "$SUPABASE_DB_URL" -f "$work/$name/schema.sql"
# Storage keeps only buckets and objects (the files themselves are copied
# below); its other tables belong to features we do not use and are not
# writable by the postgres role on restore. Auth keeps users, identities and
# factors; sessions, tokens and its own log are left out, so everyone signs
# in again after a restore.
excluded=(
  storage.buckets_analytics storage.buckets_vectors storage.vector_indexes
  storage.iceberg_namespaces storage.iceberg_tables
  storage.s3_multipart_uploads storage.s3_multipart_uploads_parts
  auth.sessions auth.refresh_tokens auth.flow_state auth.one_time_tokens
  auth.mfa_challenges auth.mfa_amr_claims auth.audit_log_entries
  auth.saml_relay_states auth.oauth_authorizations auth.oauth_client_states
  auth.webauthn_challenges
)
npx supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy \
  -x "$(IFS=,; echo "${excluded[*]}")" -f "$work/$name/data.sql"

echo "Saving our policies and triggers on auth and storage tables"
psql "$SUPABASE_DB_URL" -X -q -At -v ON_ERROR_STOP=1 -f "$here/managed-schema-extras.sql" > "$work/$name/extras.sql"

echo "Listing applied migrations"
psql "$SUPABASE_DB_URL" -X -q -At -v ON_ERROR_STOP=1 \
  -c "select version from supabase_migrations.schema_migrations order by version" \
  > "$work/$name/migrations.txt"

echo "Counting rows"
psql "$SUPABASE_DB_URL" -X -At -v ON_ERROR_STOP=1 -f "$here/row-counts.sql" > "$work/$name/row-counts.csv"

echo "Copying storage"
# shellcheck disable=SC2086
node "$here/storage.mjs" download "$work/$name/storage" ${BACKUP_BUCKETS:-reports}

if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
  tar -C "$work" -czf - "$name" |
    gpg --batch --yes --pinentry-mode loopback --symmetric --cipher-algo AES256 \
      --passphrase-fd 3 -o "$out/$name.tar.gz.gpg" 3<<<"$BACKUP_PASSPHRASE"
  echo "Wrote $out/$name.tar.gz.gpg"
else
  tar -C "$work" -czf "$out/$name.tar.gz" "$name"
  echo "Wrote $out/$name.tar.gz (NOT encrypted: BACKUP_PASSPHRASE is not set; do not upload it)"
fi
