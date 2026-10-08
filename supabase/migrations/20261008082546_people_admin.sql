-- People admin (SPEC US-3.1 to US-3.4, docs/DECISIONS.md D24): the
-- functions behind /admin/people and the `imports` storage bucket.
--
-- Every write function here is security invoker, so the people-table
-- policies (D23) and checks still decide what the caller may do; each one
-- runs as a single statement from the API, so a failure anywhere rolls the
-- whole call back (all-or-nothing imports). The only security-definer
-- functions read or change staff details that RLS on profiles cannot
-- express (a school admin seeing an invited colleague's name), and each
-- checks the caller's role first.

-- imports bucket ----------------------------------------------------------------
--
-- Uploaded staff and learner files (DATA_MODEL section 8), kept so the
-- commit step re-reads exactly the file that was checked. Private; object
-- names start with the school id. That school's school_admin or head may
-- upload and read (as for import_jobs, D23). No update or delete policy.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imports',
  'imports',
  false,
  5242880,
  array['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Whether the object's first folder is a school where the caller is
-- school_admin or head. Compares text, so a folder that is not a uuid is
-- simply refused.
create function private.is_admin_or_head_folder(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.school_id::text = (storage.foldername(p_name))[1]
      and m.user_id = auth.uid()
      and m.role in ('school_admin', 'head')
      and m.status = 'active'
  );
$$;

revoke execute on function private.is_admin_or_head_folder(text) from public;
grant execute on function private.is_admin_or_head_folder(text) to authenticated;

create policy imports_insert on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'imports' and private.is_admin_or_head_folder(name));

create policy imports_select on storage.objects
  for select
  to authenticated
  using (bucket_id = 'imports' and private.is_admin_or_head_folder(name));

-- Staff list ------------------------------------------------------------------------
--
-- A school's staff with their names and emails, for its school_admin and
-- head. profiles_select only shows people who share an *active* school, so
-- a colleague who has not accepted their invite yet would show no name;
-- this reads around that for the school's own staff only.

create function public.school_staff(p_school_id uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  full_name text,
  email text,
  phone text,
  role public.app_role,
  status public.membership_status,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.user_id, p.full_name, p.email, p.phone, m.role, m.status, m.created_at
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  where m.school_id = p_school_id
    and m.role in ('school_admin', 'head', 'hod', 'teacher')
    and private.is_admin_or_head(p_school_id)
  order by p.full_name, p.email, m.role;
$$;

comment on function public.school_staff(uuid) is
  'Staff memberships of a school with names and emails. Empty unless the caller is that school''s school_admin or head.';

revoke execute on function public.school_staff(uuid) from public, anon;
grant execute on function public.school_staff(uuid) to authenticated;

-- A school admin edits a staff member's name and phone (US-3.3). Profiles
-- are global and otherwise only editable by their owner (D5), so this
-- checks the person holds a staff role in the admin's school and records
-- the change in that school's audit log.
create function public.update_staff_profile(
  p_school_id uuid,
  p_user_id uuid,
  p_full_name text,
  p_phone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  before public.profiles;
  after public.profiles;
begin
  if not public.has_role(p_school_id, 'school_admin') then
    raise exception 'only the school admin can edit staff details' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.memberships
    where school_id = p_school_id
      and user_id = p_user_id
      and role in ('school_admin', 'head', 'hod', 'teacher')
  ) then
    raise exception 'that person is not on this school''s staff' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_full_name, ''))) not between 2 and 120 then
    raise exception 'enter the full name' using errcode = 'check_violation';
  end if;
  if p_phone is not null and p_phone !~ '^\+?\d{7,15}$' then
    raise exception 'enter a valid phone number' using errcode = 'check_violation';
  end if;

  select * into before from public.profiles where id = p_user_id;
  update public.profiles
  set full_name = trim(p_full_name), phone = p_phone
  where id = p_user_id
  returning * into after;

  insert into public.audit_log (school_id, actor_id, table_name, row_id, action, event, old_data, new_data)
  values (
    p_school_id, auth.uid(), 'profiles', p_user_id, 'event', 'staff_details_changed',
    jsonb_build_object('full_name', before.full_name, 'phone', before.phone),
    jsonb_build_object('full_name', after.full_name, 'phone', after.phone)
  );
end;
$$;

revoke execute on function public.update_staff_profile(uuid, uuid, text, text) from public, anon;
grant execute on function public.update_staff_profile(uuid, uuid, text, text) to authenticated;

-- A school admin records sending (or re-sending) a staff invite email
-- (D14, D18). The platform console keeps using log_invite_event().
create function public.log_staff_invite_event(p_membership_id uuid, p_event text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.memberships;
begin
  if p_event not in ('staff_invited', 'invite_resent') then
    raise exception 'unknown invite event %', p_event;
  end if;
  select * into m from public.memberships where id = p_membership_id;
  if not found
     or not public.has_role(m.school_id, 'school_admin')
     or m.role not in ('school_admin', 'head', 'hod', 'teacher')
     or m.user_id = auth.uid() then
    raise exception 'only the school admin can log a staff invite' using errcode = '42501';
  end if;

  insert into public.audit_log (school_id, actor_id, table_name, row_id, action, event, new_data)
  values (
    m.school_id, auth.uid(), 'memberships', m.id, 'event', p_event,
    jsonb_build_object('user_id', m.user_id, 'role', m.role, 'status', m.status)
  );
end;
$$;

revoke execute on function public.log_staff_invite_event(uuid, text) from public, anon;
grant execute on function public.log_staff_invite_event(uuid, text) to authenticated;

-- Learners -------------------------------------------------------------------------

-- US-3.4: a learner in a primary (or ECD) class takes every subject of the
-- class. Secondary learners start with none and the admin ticks theirs.
create function private.add_default_subjects(p_enrolment_id uuid)
returns integer
language plpgsql
as $$
declare
  added integer;
begin
  insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id)
  select e.school_id, e.id, cs.id
  from public.enrolments e
  join public.classes c on c.id = e.class_id
  join public.grade_levels gl on gl.id = c.grade_level_id
  join public.class_subjects cs on cs.class_id = c.id
  where e.id = p_enrolment_id
    and gl.stage in ('ecd', 'primary')
  on conflict (enrolment_id, class_subject_id) do nothing;
  get diagnostics added = row_count;
  return added;
end;
$$;

revoke execute on function private.add_default_subjects(uuid) from public;
grant execute on function private.add_default_subjects(uuid) to authenticated;

-- Adds learners, their enrolments, default subjects, guardians and links in
-- one call (US-3.2 import and US-3.3 manual add). The app has already
-- validated and matched everything; the database repeats what matters
-- (unique learner numbers, same-school classes and guardians, RLS).
--
-- p_guardians: [{ref, id (existing guardian) | null, full_name, phone, email}]
-- p_learners:  [{learner_number, first_name, last_name, date_of_birth, sex,
--                admission_date, class_id | null, guardian_ref | null, relationship}]
create function public.import_learners(p_school_id uuid, p_guardians jsonb, p_learners jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  g jsonb;
  l jsonb;
  refs jsonb := '{}';
  guardian_id uuid;
  learner_id uuid;
  enrolment_id uuid;
  year_id uuid;
  new_guardians integer := 0;
  learner_ids uuid[] := '{}';
begin
  if not private.is_admin_or_head(p_school_id) then
    raise exception 'only the school admin or head can add learners' using errcode = '42501';
  end if;

  for g in select * from jsonb_array_elements(coalesce(p_guardians, '[]')) loop
    if g ->> 'id' is not null then
      select id into guardian_id
      from public.guardians
      where id = (g ->> 'id')::uuid and school_id = p_school_id;
      if not found then
        raise exception 'guardian % is not in this school', g ->> 'ref' using errcode = '23503';
      end if;
    else
      insert into public.guardians (school_id, full_name, phone, email)
      values (p_school_id, g ->> 'full_name', nullif(g ->> 'phone', ''), nullif(g ->> 'email', ''))
      returning id into guardian_id;
      new_guardians := new_guardians + 1;
    end if;
    refs := refs || jsonb_build_object(g ->> 'ref', guardian_id);
  end loop;

  for l in select * from jsonb_array_elements(coalesce(p_learners, '[]')) loop
    insert into public.learners (
      school_id, learner_number, first_name, last_name, date_of_birth, sex, admission_date
    )
    values (
      p_school_id,
      l ->> 'learner_number',
      l ->> 'first_name',
      l ->> 'last_name',
      (l ->> 'date_of_birth')::date,
      (l ->> 'sex')::public.sex,
      (l ->> 'admission_date')::date
    )
    returning id into learner_id;
    learner_ids := learner_ids || learner_id;

    if l ->> 'class_id' is not null then
      select academic_year_id into year_id
      from public.classes
      where id = (l ->> 'class_id')::uuid and school_id = p_school_id;
      if not found then
        raise exception 'class for learner % is not in this school', l ->> 'learner_number'
          using errcode = '23503';
      end if;
      insert into public.enrolments (school_id, learner_id, class_id, academic_year_id)
      values (p_school_id, learner_id, (l ->> 'class_id')::uuid, year_id)
      returning id into enrolment_id;
      perform private.add_default_subjects(enrolment_id);
    end if;

    if l ->> 'guardian_ref' is not null then
      if refs ->> (l ->> 'guardian_ref') is null then
        raise exception 'unknown guardian reference %', l ->> 'guardian_ref';
      end if;
      insert into public.guardian_links (school_id, guardian_id, learner_id, relationship, is_primary)
      values (
        p_school_id,
        (refs ->> (l ->> 'guardian_ref'))::uuid,
        learner_id,
        coalesce(nullif(l ->> 'relationship', ''), 'guardian'),
        true
      );
    end if;
  end loop;

  return jsonb_build_object(
    'learners', coalesce(array_length(learner_ids, 1), 0),
    'new_guardians', new_guardians,
    'linked_guardians', jsonb_array_length(coalesce(p_guardians, '[]')) - new_guardians,
    'learner_ids', to_jsonb(learner_ids)
  );
end;
$$;

comment on function public.import_learners(uuid, jsonb, jsonb) is
  'Adds learners with enrolments, default subjects, guardians and links in one transaction. School admin or head.';

revoke execute on function public.import_learners(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.import_learners(uuid, jsonb, jsonb) to authenticated;

-- Commits a validated learners import job (US-3.2): adds everything and
-- marks the job committed, or changes nothing at all.
create function public.commit_learner_import(p_job_id uuid, p_guardians jsonb, p_learners jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  job public.import_jobs;
  result jsonb;
begin
  select * into job
  from public.import_jobs
  where id = p_job_id and kind = 'learners' and status = 'validated'
  for update;
  if not found then
    raise exception 'this import is no longer waiting to be committed' using errcode = 'P0002';
  end if;

  result := public.import_learners(job.school_id, p_guardians, p_learners);

  update public.import_jobs
  set status = 'committed',
      error_report = coalesce(error_report, '{}') || jsonb_build_object('committed', result - 'learner_ids')
  where id = job.id;
  return result;
end;
$$;

revoke execute on function public.commit_learner_import(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.commit_learner_import(uuid, jsonb, jsonb) to authenticated;

-- Commits a validated staff import job (US-3.1): adds every membership and
-- marks the job committed, or changes nothing. The Auth accounts already
-- exist (the app creates them first); invite emails go after the commit.
-- p_members: [{user_id, role, status}]
create function public.commit_staff_import(p_job_id uuid, p_members jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  job public.import_jobs;
  added integer;
begin
  select * into job
  from public.import_jobs
  where id = p_job_id and kind = 'staff' and status = 'validated'
  for update;
  if not found then
    raise exception 'this import is no longer waiting to be committed' using errcode = 'P0002';
  end if;

  insert into public.memberships (school_id, user_id, role, status)
  select job.school_id, (m ->> 'user_id')::uuid, (m ->> 'role')::public.app_role,
         (m ->> 'status')::public.membership_status
  from jsonb_array_elements(p_members) as m;
  get diagnostics added = row_count;

  update public.import_jobs
  set status = 'committed',
      error_report = coalesce(error_report, '{}') || jsonb_build_object('committed', jsonb_build_object('staff', added))
  where id = job.id;
  return added;
end;
$$;

revoke execute on function public.commit_staff_import(uuid, jsonb) from public, anon;
grant execute on function public.commit_staff_import(uuid, jsonb) to authenticated;

-- Puts a learner in a class for that class's year (US-3.3): creates the
-- enrolment, or moves it, dropping the old class's subject choices and
-- adding the new class's defaults. Returns the enrolment id.
create function public.set_learner_class(p_learner_id uuid, p_class_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  klass public.classes;
  enrolment public.enrolments;
begin
  select * into klass from public.classes where id = p_class_id;
  if not found then
    raise exception 'class not found' using errcode = '23503';
  end if;
  if not private.is_admin_or_head(klass.school_id) then
    raise exception 'only the school admin or head can change a learner''s class'
      using errcode = '42501';
  end if;

  select * into enrolment
  from public.enrolments
  where learner_id = p_learner_id and academic_year_id = klass.academic_year_id;

  if not found then
    insert into public.enrolments (school_id, learner_id, class_id, academic_year_id)
    values (klass.school_id, p_learner_id, klass.id, klass.academic_year_id)
    returning * into enrolment;
  elsif enrolment.class_id <> klass.id then
    delete from public.enrolment_subjects where enrolment_id = enrolment.id;
    update public.enrolments set class_id = klass.id where id = enrolment.id;
  else
    return enrolment.id;
  end if;

  perform private.add_default_subjects(enrolment.id);
  return enrolment.id;
end;
$$;

revoke execute on function public.set_learner_class(uuid, uuid) from public, anon;
grant execute on function public.set_learner_class(uuid, uuid) to authenticated;

-- Replaces a learner's subject choices for one enrolment (US-3.4). The
-- enrolment_subjects trigger refuses a subject from another class.
create function public.set_learner_subjects(p_enrolment_id uuid, p_class_subject_ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  enrolment public.enrolments;
begin
  select * into enrolment from public.enrolments where id = p_enrolment_id;
  if not found or not private.is_admin_or_head(enrolment.school_id) then
    raise exception 'only the school admin or head can change subject choices'
      using errcode = '42501';
  end if;

  delete from public.enrolment_subjects
  where enrolment_id = enrolment.id
    and class_subject_id <> all (coalesce(p_class_subject_ids, '{}'));

  insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id)
  select enrolment.school_id, enrolment.id, cs_id
  from unnest(coalesce(p_class_subject_ids, '{}')) as cs_id
  on conflict (enrolment_id, class_subject_id) do nothing;
end;
$$;

revoke execute on function public.set_learner_subjects(uuid, uuid[]) from public, anon;
grant execute on function public.set_learner_subjects(uuid, uuid[]) to authenticated;
