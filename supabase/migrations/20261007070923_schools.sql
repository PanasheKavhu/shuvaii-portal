-- schools: the tenant. See docs/DATA_MODEL.md section 4.1.
-- Exception to the "every tenant table has school_id" rule: a school's own
-- `id` is the tenant id.

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  motto text,
  stage public.school_stage not null,
  address text,
  phone text,
  email text,
  logo_path text,
  stamp_path text,
  head_signature_path text,
  primary_color text,
  accent_color text,
  report_footer_text text,
  timezone text not null default 'Africa/Harare',
  feature_flags jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.schools is 'The tenant. One row per school using the portal.';

create trigger schools_set_updated_at
  before update on public.schools
  for each row
  execute function public.set_updated_at();

-- RLS is enabled from the moment the table exists; policies are added once
-- the helper functions exist, in rls_helper_functions.sql.
alter table public.schools enable row level security;
