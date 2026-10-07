-- profiles: one row per person, global. See docs/DATA_MODEL.md section 4.1.
-- Exception to the "every tenant table has school_id" rule: profiles is
-- global, shared across schools (e.g. a teacher at two schools).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per person. Readable by the person themselves and by anyone who shares a school with them through memberships.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Creates a profile row whenever a new auth.users row appears, so the app
-- never has to insert into profiles directly. Security definer: runs as the
-- function owner, bypassing RLS, since the signing-up user has no profile
-- (and therefore no membership) yet to satisfy any policy.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.email,
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
