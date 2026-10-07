-- grade_levels, academic_years and terms (docs/DATA_MODEL.md section 4.2).
-- Child rows point at parents through (id, school_id) foreign keys, so a row
-- can never reference another school's year, level or scale.

create table public.grade_levels (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  name text not null check (length(trim(name)) between 1 and 60),
  stage public.level_stage not null,
  sort_order integer not null default 0,
  grading_scale_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (grading_scale_id, school_id) references public.grading_scales (id, school_id),
  unique (id, school_id),
  unique (school_id, name)
);

create index grade_levels_school_id_idx on public.grade_levels (school_id);
create index grade_levels_grading_scale_id_idx on public.grade_levels (grading_scale_id);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  label text not null check (length(trim(label)) between 1 and 20),
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_on < ends_on),
  unique (id, school_id),
  unique (school_id, label)
);

create index academic_years_school_id_idx on public.academic_years (school_id);
-- At most one current year per school.
create unique index academic_years_one_current_idx
  on public.academic_years (school_id)
  where is_current;

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  academic_year_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 60),
  kind public.term_kind not null default 'term',
  starts_on date not null,
  ends_on date not null,
  marks_deadline date,
  status public.term_status not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (academic_year_id, school_id) references public.academic_years (id, school_id),
  check (starts_on <= ends_on),
  unique (id, school_id),
  unique (academic_year_id, name)
);

create index terms_school_id_idx on public.terms (school_id);
create index terms_academic_year_id_idx on public.terms (academic_year_id);

create trigger grade_levels_set_updated_at
  before update on public.grade_levels
  for each row execute function public.set_updated_at();
create trigger academic_years_set_updated_at
  before update on public.academic_years
  for each row execute function public.set_updated_at();
create trigger terms_set_updated_at
  before update on public.terms
  for each row execute function public.set_updated_at();
create trigger grade_levels_keep_school_id
  before update on public.grade_levels
  for each row execute function private.keep_school_id();
create trigger academic_years_keep_school_id
  before update on public.academic_years
  for each row execute function private.keep_school_id();
create trigger terms_keep_school_id
  before update on public.terms
  for each row execute function private.keep_school_id();

-- RLS: staff of the school read; that school's school_admin writes (D20).

alter table public.grade_levels enable row level security;
alter table public.academic_years enable row level security;
alter table public.terms enable row level security;

create policy grade_levels_select on public.grade_levels
  for select to authenticated
  using (public.is_staff(school_id));
create policy grade_levels_insert on public.grade_levels
  for insert to authenticated
  with check (public.has_role(school_id, 'school_admin'));
create policy grade_levels_update on public.grade_levels
  for update to authenticated
  using (public.has_role(school_id, 'school_admin'))
  with check (public.has_role(school_id, 'school_admin'));
create policy grade_levels_delete on public.grade_levels
  for delete to authenticated
  using (public.has_role(school_id, 'school_admin'));

create policy academic_years_select on public.academic_years
  for select to authenticated
  using (public.is_staff(school_id));
create policy academic_years_insert on public.academic_years
  for insert to authenticated
  with check (public.has_role(school_id, 'school_admin'));
create policy academic_years_update on public.academic_years
  for update to authenticated
  using (public.has_role(school_id, 'school_admin'))
  with check (public.has_role(school_id, 'school_admin'));
create policy academic_years_delete on public.academic_years
  for delete to authenticated
  using (public.has_role(school_id, 'school_admin'));

create policy terms_select on public.terms
  for select to authenticated
  using (public.is_staff(school_id));
create policy terms_insert on public.terms
  for insert to authenticated
  with check (public.has_role(school_id, 'school_admin'));
create policy terms_update on public.terms
  for update to authenticated
  using (public.has_role(school_id, 'school_admin'))
  with check (public.has_role(school_id, 'school_admin'));
create policy terms_delete on public.terms
  for delete to authenticated
  using (public.has_role(school_id, 'school_admin'));
