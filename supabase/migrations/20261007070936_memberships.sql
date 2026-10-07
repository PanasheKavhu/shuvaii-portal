-- memberships: a person's role in a school. See docs/DATA_MODEL.md section 4.1.

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  user_id uuid not null references public.profiles (id),
  role public.app_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, user_id, role)
);

comment on table public.memberships is
  'A person''s role in a school. A person may hold several rows (e.g. teacher in two schools, or teacher and parent).';

create index memberships_school_id_idx on public.memberships (school_id);
create index memberships_user_id_idx on public.memberships (user_id);

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row
  execute function public.set_updated_at();

alter table public.memberships enable row level security;

-- Rule: a member cannot change their own role, even a school_admin acting on
-- their own membership row. Checked against auth.uid(), which is null for
-- the service role and for plain SQL sessions, so seeding and admin
-- back-office work are unaffected.
create function public.prevent_self_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.user_id = auth.uid() and new.role is distinct from old.role then
    raise exception 'members cannot change their own role';
  end if;
  return new;
end;
$$;

create trigger memberships_prevent_self_role_change
  before update on public.memberships
  for each row
  execute function public.prevent_self_role_change();
