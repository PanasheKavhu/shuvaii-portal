-- platform_admins: super admins. See docs/DATA_MODEL.md section 4.1.
-- Exception to the "every tenant table has school_id" rule: this table is
-- global. No policy grants a platform admin tenant data by default; support
-- access into a school's own data is a deliberate later feature.

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.platform_admins is
  'Super admins. Membership here grants no tenant data access by itself.';

create trigger platform_admins_set_updated_at
  before update on public.platform_admins
  for each row
  execute function public.set_updated_at();

alter table public.platform_admins enable row level security;
