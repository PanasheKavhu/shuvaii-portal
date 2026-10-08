-- People tables (migration order step 4 in docs/DATA_MODEL.md): learners,
-- enrolments, enrolment_subjects, guardians, guardian_links, import_jobs.
--
-- Access (D23): that school's school_admin and head read and write. A
-- teacher (or hod) reads only the learners enrolled in classes where they
-- are class teacher or teach a class subject, and those learners'
-- enrolments, subject choices, guardians and guardian links; they write
-- nothing here. Parents and learners get no access yet (Phase 4).
-- import_jobs is admin and head only.
--
-- Learners are never deleted, only their status changes (rule 6): there is
-- no delete policy and a trigger refuses deletes even for the table owner.
-- Every learner change is written to audit_log (D18).

create type public.sex as enum ('F', 'M');
create type public.learner_status as enum ('active', 'left', 'graduated');
create type public.enrolment_status as enum (
  'enrolled', 'promoted', 'repeating', 'transferred', 'left', 'graduated'
);
create type public.import_kind as enum ('staff', 'learners', 'marks');
create type public.import_status as enum ('validated', 'committed', 'failed');

-- An enrolment's year must be its class's year; this lets enrolments point
-- at (class, year, school) in one foreign key.
alter table public.classes
  add constraint classes_id_year_school_key unique (id, academic_year_id, school_id);

-- learners ----------------------------------------------------------------

create table public.learners (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  learner_number text not null check (length(trim(learner_number)) between 1 and 30),
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name text not null check (length(trim(last_name)) between 1 and 80),
  date_of_birth date,
  sex public.sex,
  status public.learner_status not null default 'active',
  -- The learner's own login (US-1.2), when they have one.
  user_id uuid references public.profiles (id),
  admission_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  unique (school_id, learner_number)
);

create index learners_school_id_idx on public.learners (school_id);
create index learners_user_id_idx on public.learners (user_id);

-- enrolments --------------------------------------------------------------

create table public.enrolments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  learner_id uuid not null,
  class_id uuid not null,
  academic_year_id uuid not null,
  status public.enrolment_status not null default 'enrolled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (learner_id, school_id) references public.learners (id, school_id),
  foreign key (class_id, academic_year_id, school_id)
    references public.classes (id, academic_year_id, school_id),
  unique (id, school_id),
  -- One class per learner per year.
  unique (learner_id, academic_year_id)
);

create index enrolments_school_id_idx on public.enrolments (school_id);
create index enrolments_class_id_idx on public.enrolments (class_id);

-- enrolment_subjects --------------------------------------------------------

create table public.enrolment_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  enrolment_id uuid not null,
  class_subject_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (enrolment_id, school_id) references public.enrolments (id, school_id),
  foreign key (class_subject_id, school_id) references public.class_subjects (id, school_id),
  unique (enrolment_id, class_subject_id)
);

create index enrolment_subjects_school_id_idx on public.enrolment_subjects (school_id);
create index enrolment_subjects_class_subject_id_idx on public.enrolment_subjects (class_subject_id);

-- guardians and guardian_links ---------------------------------------------------

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  phone text check (phone is null or length(trim(phone)) between 1 and 30),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+$'),
  -- The parent login (US-1.3), when they have one.
  user_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id)
);

create index guardians_school_id_idx on public.guardians (school_id);
create index guardians_user_id_idx on public.guardians (user_id);

create table public.guardian_links (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  guardian_id uuid not null,
  learner_id uuid not null,
  relationship text not null check (length(trim(relationship)) between 1 and 40),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (guardian_id, school_id) references public.guardians (id, school_id),
  foreign key (learner_id, school_id) references public.learners (id, school_id),
  -- One guardian linked to two learners is how siblings share a parent login.
  unique (guardian_id, learner_id)
);

create index guardian_links_school_id_idx on public.guardian_links (school_id);
create index guardian_links_learner_id_idx on public.guardian_links (learner_id);
-- At most one primary guardian per learner.
create unique index guardian_links_one_primary_idx
  on public.guardian_links (learner_id) where is_primary;

-- import_jobs ---------------------------------------------------------------

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  kind public.import_kind not null,
  status public.import_status not null default 'validated',
  -- Path in the private `imports` bucket, `{school_id}/...` (DATA_MODEL section 8).
  file_path text,
  error_report jsonb,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index import_jobs_school_id_idx on public.import_jobs (school_id);

-- Housekeeping triggers ----------------------------------------------------------

create trigger learners_set_updated_at
  before update on public.learners
  for each row execute function public.set_updated_at();
create trigger enrolments_set_updated_at
  before update on public.enrolments
  for each row execute function public.set_updated_at();
create trigger enrolment_subjects_set_updated_at
  before update on public.enrolment_subjects
  for each row execute function public.set_updated_at();
create trigger guardians_set_updated_at
  before update on public.guardians
  for each row execute function public.set_updated_at();
create trigger guardian_links_set_updated_at
  before update on public.guardian_links
  for each row execute function public.set_updated_at();
create trigger import_jobs_set_updated_at
  before update on public.import_jobs
  for each row execute function public.set_updated_at();

create trigger learners_keep_school_id
  before update on public.learners
  for each row execute function private.keep_school_id();
create trigger enrolments_keep_school_id
  before update on public.enrolments
  for each row execute function private.keep_school_id();
create trigger enrolment_subjects_keep_school_id
  before update on public.enrolment_subjects
  for each row execute function private.keep_school_id();
create trigger guardians_keep_school_id
  before update on public.guardians
  for each row execute function private.keep_school_id();
create trigger guardian_links_keep_school_id
  before update on public.guardian_links
  for each row execute function private.keep_school_id();
create trigger import_jobs_keep_school_id
  before update on public.import_jobs
  for each row execute function private.keep_school_id();

-- Learners are never deleted (rule 6) -----------------------------------------------

create function private.learners_are_never_deleted()
returns trigger
language plpgsql
as $$
begin
  raise exception 'learners are never deleted; set status to left or graduated instead';
end;
$$;

create trigger learners_no_delete
  before delete on public.learners
  for each row execute function private.learners_are_never_deleted();

create trigger learners_no_truncate
  before truncate on public.learners
  for each statement execute function private.learners_are_never_deleted();

create trigger learners_audit
  after insert or update or delete on public.learners
  for each row execute function private.audit_row_change();

-- A learner takes only subjects offered to their own class ---------------------------

-- Security definer so the check sees both rows whatever the caller may read.
create function private.check_enrolment_subject_class()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.enrolments e
    join public.class_subjects cs on cs.class_id = e.class_id
    where e.id = new.enrolment_id
      and cs.id = new.class_subject_id
  ) then
    raise exception 'the class subject must belong to the learner''s class'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger enrolment_subjects_check_class
  before insert or update of enrolment_id, class_subject_id on public.enrolment_subjects
  for each row execute function private.check_enrolment_subject_class();

-- The same rule seen from the other side: an enrolment cannot move to
-- another class while it still takes subjects of the old one.
create function private.check_enrolment_class_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.enrolment_subjects es
    join public.class_subjects cs on cs.id = es.class_subject_id
    where es.enrolment_id = new.id
      and cs.class_id <> new.class_id
  ) then
    raise exception 'remove the learner''s subjects in the old class before moving them to another class'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger enrolments_check_class_change
  after update of class_id on public.enrolments
  for each row execute function private.check_enrolment_class_change();

-- RLS helpers -------------------------------------------------------------------
--
-- DATA_MODEL section 7 names teaches(class_subject_id) and
-- is_class_teacher(class_id). Both require an active teacher or hod
-- membership in the class's school, so a disabled teacher loses access even
-- while still assigned. The private *_ids() functions are what the policies
-- use: security definer so they read classes, enrolments and links without
-- re-entering those tables' RLS, and they only ever answer for auth.uid().

create function public.teaches(p_class_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_subjects cs
    where cs.id = p_class_subject_id
      and cs.teacher_id = auth.uid()
      and private.is_active_teacher(cs.school_id, auth.uid())
  );
$$;

comment on function public.teaches(uuid) is
  'Whether the current user is the active teacher of this class subject.';

create function public.is_class_teacher(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = p_class_id
      and c.class_teacher_id = auth.uid()
      and private.is_active_teacher(c.school_id, auth.uid())
  );
$$;

comment on function public.is_class_teacher(uuid) is
  'Whether the current user is the active class teacher of this class.';

grant execute on function public.teaches(uuid) to anon, authenticated;
grant execute on function public.is_class_teacher(uuid) to anon, authenticated;

-- Classes the current user teaches in: as class teacher or as the teacher
-- of any of the class's subjects.
create function private.my_teaching_class_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.classes c
  where c.class_teacher_id = auth.uid()
    and private.is_active_teacher(c.school_id, auth.uid())
  union
  select cs.class_id
  from public.class_subjects cs
  where cs.teacher_id = auth.uid()
    and private.is_active_teacher(cs.school_id, auth.uid());
$$;

create function private.my_teaching_enrolment_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.enrolments e
  where e.class_id in (select private.my_teaching_class_ids());
$$;

create function private.my_teaching_learner_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.learner_id
  from public.enrolments e
  where e.class_id in (select private.my_teaching_class_ids());
$$;

create function private.my_teaching_guardian_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select gl.guardian_id
  from public.guardian_links gl
  where gl.learner_id in (select private.my_teaching_learner_ids());
$$;

revoke execute on function private.my_teaching_class_ids() from public;
revoke execute on function private.my_teaching_enrolment_ids() from public;
revoke execute on function private.my_teaching_learner_ids() from public;
revoke execute on function private.my_teaching_guardian_ids() from public;
grant execute on function private.my_teaching_class_ids() to authenticated;
grant execute on function private.my_teaching_enrolment_ids() to authenticated;
grant execute on function private.my_teaching_learner_ids() to authenticated;
grant execute on function private.my_teaching_guardian_ids() to authenticated;

-- school_admin or head of this school: full read and write here.
create function private.is_admin_or_head(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(p_school_id, 'school_admin') or public.has_role(p_school_id, 'head');
$$;

revoke execute on function private.is_admin_or_head(uuid) from public;
grant execute on function private.is_admin_or_head(uuid) to authenticated;

-- RLS --------------------------------------------------------------------------------

alter table public.learners enable row level security;
alter table public.enrolments enable row level security;
alter table public.enrolment_subjects enable row level security;
alter table public.guardians enable row level security;
alter table public.guardian_links enable row level security;
alter table public.import_jobs enable row level security;

-- learners: no delete policy (never deleted).
create policy learners_select on public.learners
  for select to authenticated
  using (
    private.is_admin_or_head(school_id)
    or id in (select private.my_teaching_learner_ids())
  );
create policy learners_insert on public.learners
  for insert to authenticated
  with check (private.is_admin_or_head(school_id));
create policy learners_update on public.learners
  for update to authenticated
  using (private.is_admin_or_head(school_id))
  with check (private.is_admin_or_head(school_id));

-- enrolments: no delete policy (history; use status).
create policy enrolments_select on public.enrolments
  for select to authenticated
  using (
    private.is_admin_or_head(school_id)
    or class_id in (select private.my_teaching_class_ids())
  );
create policy enrolments_insert on public.enrolments
  for insert to authenticated
  with check (private.is_admin_or_head(school_id));
create policy enrolments_update on public.enrolments
  for update to authenticated
  using (private.is_admin_or_head(school_id))
  with check (private.is_admin_or_head(school_id));

-- enrolment_subjects: a wrong subject choice can be removed.
create policy enrolment_subjects_select on public.enrolment_subjects
  for select to authenticated
  using (
    private.is_admin_or_head(school_id)
    or enrolment_id in (select private.my_teaching_enrolment_ids())
  );
create policy enrolment_subjects_insert on public.enrolment_subjects
  for insert to authenticated
  with check (private.is_admin_or_head(school_id));
create policy enrolment_subjects_update on public.enrolment_subjects
  for update to authenticated
  using (private.is_admin_or_head(school_id))
  with check (private.is_admin_or_head(school_id));
create policy enrolment_subjects_delete on public.enrolment_subjects
  for delete to authenticated
  using (private.is_admin_or_head(school_id));

-- guardians: no delete policy (personal data).
create policy guardians_select on public.guardians
  for select to authenticated
  using (
    private.is_admin_or_head(school_id)
    or id in (select private.my_teaching_guardian_ids())
  );
create policy guardians_insert on public.guardians
  for insert to authenticated
  with check (private.is_admin_or_head(school_id));
create policy guardians_update on public.guardians
  for update to authenticated
  using (private.is_admin_or_head(school_id))
  with check (private.is_admin_or_head(school_id));

-- guardian_links: a wrong link can be removed.
create policy guardian_links_select on public.guardian_links
  for select to authenticated
  using (
    private.is_admin_or_head(school_id)
    or learner_id in (select private.my_teaching_learner_ids())
  );
create policy guardian_links_insert on public.guardian_links
  for insert to authenticated
  with check (private.is_admin_or_head(school_id));
create policy guardian_links_update on public.guardian_links
  for update to authenticated
  using (private.is_admin_or_head(school_id))
  with check (private.is_admin_or_head(school_id));
create policy guardian_links_delete on public.guardian_links
  for delete to authenticated
  using (private.is_admin_or_head(school_id));

-- import_jobs: admin and head only; no delete (a job's history stays).
create policy import_jobs_select on public.import_jobs
  for select to authenticated
  using (private.is_admin_or_head(school_id));
create policy import_jobs_insert on public.import_jobs
  for insert to authenticated
  with check (private.is_admin_or_head(school_id));
create policy import_jobs_update on public.import_jobs
  for update to authenticated
  using (private.is_admin_or_head(school_id))
  with check (private.is_admin_or_head(school_id));
