-- Extensions and enums shared by the tenancy tables (schools, profiles,
-- platform_admins, memberships). See docs/DATA_MODEL.md sections 1 and 3.

-- gen_random_uuid() is native since Postgres 13; pgcrypto is still needed for
-- crypt()/gen_salt(), used by the local seed script to create demo passwords.
create extension if not exists pgcrypto;

-- Internal helpers that must not be callable through the Data API. Only
-- `public` (and `graphql_public`) are exposed by PostgREST, so functions here
-- can be used inside RLS policies without becoming RPC endpoints.
create schema if not exists private;
grant usage on schema private to anon, authenticated;

create type public.school_stage as enum ('primary', 'secondary', 'combined');

-- Super admin lives in platform_admins, not in this enum.
create type public.app_role as enum (
  'school_admin',
  'head',
  'hod',
  'teacher',
  'parent',
  'learner'
);

create type public.membership_status as enum ('invited', 'active', 'disabled');

-- Shared trigger function: keeps `updated_at` current on every table that has
-- one. Declared here so later migrations can attach it to new tables.
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
