-- classes, subjects and class_subjects (docs/DATA_MODEL.md section 4.2).
-- A class subject has exactly one teacher (unique class and subject, one
-- teacher column). Class teachers and subject teachers must be active
-- teaching staff (teacher or hod) of the same school (D20).

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  academic_year_id uuid not null,
  grade_level_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 60),
  class_teacher_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (academic_year_id, school_id) references public.academic_years (id, school_id),
  foreign key (grade_level_id, school_id) references public.grade_levels (id, school_id),
  unique (id, school_id),
  unique (academic_year_id, name)
);

create index classes_school_id_idx on public.classes (school_id);
create index classes_grade_level_id_idx on public.classes (grade_level_id);
create index classes_class_teacher_id_idx on public.classes (class_teacher_id);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,12}$'),
  name text not null check (length(trim(name)) between 1 and 80),
  -- Which part of the school offers it; `combined` means both.
  stage_scope public.school_stage not null,
  is_core boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  unique (school_id, code)
);

create index subjects_school_id_idx on public.subjects (school_id);

create table public.class_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  class_id uuid not null,
  subject_id uuid not null,
  teacher_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (class_id, school_id) references public.classes (id, school_id),
  foreign key (subject_id, school_id) references public.subjects (id, school_id),
  unique (id, school_id),
  -- One row, so one teacher, per subject in a class.
  unique (class_id, subject_id)
);

create index class_subjects_school_id_idx on public.class_subjects (school_id);
create index class_subjects_subject_id_idx on public.class_subjects (subject_id);
create index class_subjects_teacher_id_idx on public.class_subjects (teacher_id);

create trigger classes_set_updated_at
  before update on public.classes
  for each row execute function public.set_updated_at();
create trigger subjects_set_updated_at
  before update on public.subjects
  for each row execute function public.set_updated_at();
create trigger class_subjects_set_updated_at
  before update on public.class_subjects
  for each row execute function public.set_updated_at();
create trigger classes_keep_school_id
  before update on public.classes
  for each row execute function private.keep_school_id();
create trigger subjects_keep_school_id
  before update on public.subjects
  for each row execute function private.keep_school_id();
create trigger class_subjects_keep_school_id
  before update on public.class_subjects
  for each row execute function private.keep_school_id();

-- Teaching staff checks ---------------------------------------------------------

create function private.check_class_teacher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.class_teacher_id is not null
     and not private.is_active_teacher(new.school_id, new.class_teacher_id) then
    raise exception 'the class teacher must be an active teacher of this school'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger classes_check_class_teacher
  before insert or update of class_teacher_id, school_id on public.classes
  for each row execute function private.check_class_teacher();

create function private.check_subject_teacher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_active_teacher(new.school_id, new.teacher_id) then
    raise exception 'the subject teacher must be an active teacher of this school'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger class_subjects_check_teacher
  before insert or update of teacher_id, school_id on public.class_subjects
  for each row execute function private.check_subject_teacher();

-- RLS: staff of the school read; that school's school_admin writes (D20).

alter table public.classes enable row level security;
alter table public.subjects enable row level security;
alter table public.class_subjects enable row level security;

create policy classes_select on public.classes
  for select to authenticated
  using (public.is_staff(school_id));
create policy classes_insert on public.classes
  for insert to authenticated
  with check (public.has_role(school_id, 'school_admin'));
create policy classes_update on public.classes
  for update to authenticated
  using (public.has_role(school_id, 'school_admin'))
  with check (public.has_role(school_id, 'school_admin'));
create policy classes_delete on public.classes
  for delete to authenticated
  using (public.has_role(school_id, 'school_admin'));

create policy subjects_select on public.subjects
  for select to authenticated
  using (public.is_staff(school_id));
create policy subjects_insert on public.subjects
  for insert to authenticated
  with check (public.has_role(school_id, 'school_admin'));
create policy subjects_update on public.subjects
  for update to authenticated
  using (public.has_role(school_id, 'school_admin'))
  with check (public.has_role(school_id, 'school_admin'));
create policy subjects_delete on public.subjects
  for delete to authenticated
  using (public.has_role(school_id, 'school_admin'));

create policy class_subjects_select on public.class_subjects
  for select to authenticated
  using (public.is_staff(school_id));
create policy class_subjects_insert on public.class_subjects
  for insert to authenticated
  with check (public.has_role(school_id, 'school_admin'));
create policy class_subjects_update on public.class_subjects
  for update to authenticated
  using (public.has_role(school_id, 'school_admin'))
  with check (public.has_role(school_id, 'school_admin'));
create policy class_subjects_delete on public.class_subjects
  for delete to authenticated
  using (public.has_role(school_id, 'school_admin'));
