-- Marks upload (US-4.3; D33). A teacher downloads a template for one class
-- subject and term, fills it in and uploads it back. The upload is checked
-- and recorded in import_jobs (kind 'marks') like the people imports (D24);
-- a clean file is committed by public.commit_marks_import() in one
-- transaction, through the same RLS, lock triggers and audit trigger as the
-- marks grid (D30).

-- import_jobs: a marks job names its class subject and term ---------------------------

alter table public.import_jobs
  add column class_subject_id uuid,
  add column term_id uuid,
  add constraint import_jobs_class_subject_fkey
    foreign key (class_subject_id, school_id) references public.class_subjects (id, school_id),
  add constraint import_jobs_term_fkey
    foreign key (term_id, school_id) references public.terms (id, school_id),
  add constraint import_jobs_marks_target_check
    check ((kind = 'marks') = (class_subject_id is not null and term_id is not null));

create index import_jobs_class_subject_term_idx
  on public.import_jobs (class_subject_id, term_id)
  where kind = 'marks';

-- A job keeps its class subject, term, kind and author.
create function private.keep_import_job_target()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind is distinct from old.kind
     or new.class_subject_id is distinct from old.class_subject_id
     or new.term_id is distinct from old.term_id
     or new.created_by is distinct from old.created_by then
    raise exception 'an import''s kind, class subject, term and author cannot change'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger import_jobs_keep_target
  before update on public.import_jobs
  for each row execute function private.keep_import_job_target();

-- import_jobs policies: admin and head as before (D23); a teacher (or hod)
-- reads, adds and updates only their own marks jobs for class subjects they
-- teach.
drop policy import_jobs_select on public.import_jobs;
drop policy import_jobs_insert on public.import_jobs;
drop policy import_jobs_update on public.import_jobs;

create policy import_jobs_select on public.import_jobs
  for select to authenticated
  using (
    private.is_admin_or_head(school_id)
    or (kind = 'marks' and created_by = auth.uid() and public.teaches(class_subject_id))
  );
create policy import_jobs_insert on public.import_jobs
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      private.is_admin_or_head(school_id)
      or (kind = 'marks' and public.teaches(class_subject_id))
    )
  );
create policy import_jobs_update on public.import_jobs
  for update to authenticated
  using (
    private.is_admin_or_head(school_id)
    or (kind = 'marks' and created_by = auth.uid() and public.teaches(class_subject_id))
  )
  with check (
    private.is_admin_or_head(school_id)
    or (kind = 'marks' and created_by = auth.uid() and public.teaches(class_subject_id))
  );

-- imports bucket: marks files ------------------------------------------------------------
--
-- Marks files are stored as `{school_id}/marks/{class_subject_id}/{job_id}.csv|xlsx`.
-- The class subject's teacher may upload and read them (admin and head
-- already may, through the existing policies on the school folder).

create function private.teaches_marks_folder(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (storage.foldername(p_name))[2] = 'marks'
    and exists (
      select 1
      from public.class_subjects cs
      where cs.id::text = (storage.foldername(p_name))[3]
        and cs.school_id::text = (storage.foldername(p_name))[1]
        and cs.teacher_id = auth.uid()
        and private.is_active_teacher(cs.school_id, auth.uid())
    );
$$;

revoke execute on function private.teaches_marks_folder(text) from public;
grant execute on function private.teaches_marks_folder(text) to authenticated;

create policy imports_marks_insert on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'imports' and private.teaches_marks_folder(name));

create policy imports_marks_select on storage.objects
  for select
  to authenticated
  using (bucket_id = 'imports' and private.teaches_marks_folder(name));

-- Commit ------------------------------------------------------------------------------------

-- Saves a validated marks upload in one transaction, or nothing. Security
-- invoker: the marks RLS policies, the lock triggers (a locked teacher is
-- refused), the learner-takes-the-subject trigger, the score check and the
-- audit trigger all apply exactly as for the grid. Every mark must belong
-- to an assessment of the job's class subject and term.
-- p_marks: [{assessment_id, enrolment_id, status, score}]
create function public.commit_marks_import(p_job_id uuid, p_marks jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  job public.import_jobs;
  saved integer;
begin
  select * into job
  from public.import_jobs
  where id = p_job_id and kind = 'marks' and status = 'validated'
  for update;
  if not found then
    raise exception 'this upload is no longer waiting to be saved' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_marks) as m
    left join public.assessments a on a.id = (m ->> 'assessment_id')::uuid
    where a.id is null
       or a.class_subject_id <> job.class_subject_id
       or a.term_id <> job.term_id
  ) then
    raise exception 'every mark must be for an assessment of this upload''s subject and term'
      using errcode = '22023';
  end if;

  insert into public.marks (school_id, assessment_id, enrolment_id, status, score)
  select job.school_id,
         (m ->> 'assessment_id')::uuid,
         (m ->> 'enrolment_id')::uuid,
         (m ->> 'status')::public.mark_status,
         (m ->> 'score')::numeric
  from jsonb_array_elements(p_marks) as m
  on conflict (assessment_id, enrolment_id) do update
    set status = excluded.status,
        score = excluded.score;
  get diagnostics saved = row_count;

  update public.import_jobs
  set status = 'committed',
      error_report = coalesce(error_report, '{}') || jsonb_build_object('committed', jsonb_build_object('marks', saved))
  where id = job.id;
  return saved;
end;
$$;

comment on function public.commit_marks_import(uuid, jsonb) is
  'Saves a validated marks upload (US-4.3) in one transaction through the marks RLS, lock and audit triggers.';

revoke execute on function public.commit_marks_import(uuid, jsonb) from public, anon;
grant execute on function public.commit_marks_import(uuid, jsonb) to authenticated;
