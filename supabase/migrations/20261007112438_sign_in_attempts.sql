-- sign_in_attempts: per-account sign-in lockout for US-1.1 (5 failed
-- attempts in 10 minutes block further attempts for 15 minutes). The rule
-- itself lives in src/lib/auth/lockout.ts; this table only records attempts.
--
-- Not a tenant table: a sign-in happens before we know the school, so there
-- is no school_id (listed as an exception in docs/DATA_MODEL.md). The email
-- is stored only as a SHA-256 hash of the trimmed, lower-cased address, so
-- the table holds no readable personal data.
--
-- Only the service role (the sign-in server action, via
-- src/lib/supabase/admin.ts) reads or writes it. RLS is enabled with no
-- policies and table privileges are revoked from anon and authenticated, so
-- nobody can read or forge attempts through the Data API.

create table public.sign_in_attempts (
  id bigint generated always as identity primary key,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  succeeded boolean not null,
  created_at timestamptz not null default now()
);

comment on table public.sign_in_attempts is
  'Sign-in attempts per hashed email, for lockout. Service role only.';

create index sign_in_attempts_email_hash_created_at_idx
  on public.sign_in_attempts (email_hash, created_at desc);

alter table public.sign_in_attempts enable row level security;

revoke all on table public.sign_in_attempts from anon, authenticated;
