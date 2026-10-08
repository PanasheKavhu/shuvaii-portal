-- Setup wizard support (US-2.1 to US-2.4, D22).
--
-- 1. A class subject may be added before its teacher is known, so the wizard
--    can list "no teacher yet" as a gap. A year's setup cannot be finished
--    while any class has no class teacher or any class subject has no
--    teacher, and once finished those gaps cannot come back.
-- 2. academic_years.setup_completed_at records when the admin finished.
-- 3. save_grading_bands() replaces a scale's bands in one transaction, so a
--    default scale is checked once, at commit, against its new bands.
-- 4. set_current_academic_year() moves the "current" flag in one call.

alter table public.class_subjects alter column teacher_id drop not null;

alter table public.academic_years add column setup_completed_at timestamptz;

comment on column public.academic_years.setup_completed_at is
  'When the school admin finished the setup wizard for this year. Null while setup is in progress.';

-- A teacher, when given, must still be active teaching staff (D20).
create or replace function private.check_subject_teacher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.teacher_id is not null
     and not private.is_active_teacher(new.school_id, new.teacher_id) then
    raise exception 'the subject teacher must be an active teacher of this school'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Gaps that block finishing a year: classes with no class teacher and class
-- subjects with no teacher. Security invoker: callers see what RLS allows.
create function public.academic_year_setup_gaps(p_year_id uuid)
returns table (gap text, class_id uuid, class_subject_id uuid)
language sql
stable
set search_path = public
as $$
  select 'no_class_teacher', c.id, null::uuid
  from public.classes c
  where c.academic_year_id = p_year_id and c.class_teacher_id is null
  union all
  select 'no_subject_teacher', cs.class_id, cs.id
  from public.class_subjects cs
  join public.classes c on c.id = cs.class_id
  where c.academic_year_id = p_year_id and cs.teacher_id is null;
$$;

comment on function public.academic_year_setup_gaps(uuid) is
  'Classes without a class teacher and class subjects without a teacher in a year. No rows means setup can finish.';

grant execute on function public.academic_year_setup_gaps(uuid) to authenticated;

-- Finishing (setting setup_completed_at) is refused while gaps remain.
-- Security definer so the check sees every class of the year.
create function private.check_year_setup_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gaps integer;
begin
  select count(*) into gaps from public.academic_year_setup_gaps(new.id);
  if gaps > 0 then
    raise exception 'setup cannot be finished: % class(es) or class subject(s) still need a teacher', gaps
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger academic_years_setup_complete
  before insert or update of setup_completed_at on public.academic_years
  for each row
  when (new.setup_completed_at is not null)
  execute function private.check_year_setup_complete();

-- After finishing, a class keeps a class teacher and a class subject keeps a teacher.
create function private.year_is_set_up(p_year_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.academic_years
    where id = p_year_id and setup_completed_at is not null
  );
$$;

revoke execute on function private.year_is_set_up(uuid) from public;
grant execute on function private.year_is_set_up(uuid) to authenticated;

create function private.keep_class_teacher_after_setup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.class_teacher_id is null and private.year_is_set_up(new.academic_year_id) then
    raise exception 'this year''s setup is finished, so every class needs a class teacher'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger classes_keep_class_teacher_after_setup
  before insert or update of class_teacher_id, academic_year_id on public.classes
  for each row execute function private.keep_class_teacher_after_setup();

create function private.keep_subject_teacher_after_setup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.teacher_id is null
     and private.year_is_set_up((select academic_year_id from public.classes where id = new.class_id)) then
    raise exception 'this year''s setup is finished, so every class subject needs a teacher'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger class_subjects_keep_teacher_after_setup
  before insert or update of teacher_id, class_id on public.class_subjects
  for each row execute function private.keep_subject_teacher_after_setup();

-- Band editor save --------------------------------------------------------------

-- Replaces every band of a scale with p_bands, a JSON array of
-- {grade, min_mark, max_mark, remark}. Security invoker: RLS decides
-- (school_admin of the scale's school). One call is one transaction, so the
-- deferred default-scale check runs once on the final bands.
create function public.save_grading_bands(p_scale_id uuid, p_bands jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  select school_id into v_school_id from public.grading_scales where id = p_scale_id;
  if v_school_id is null then
    raise exception 'grading scale not found' using errcode = 'no_data_found';
  end if;
  if jsonb_typeof(p_bands) <> 'array' then
    raise exception 'bands must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;

  delete from public.grading_bands where scale_id = p_scale_id;

  insert into public.grading_bands (school_id, scale_id, grade, min_mark, max_mark, remark, sort_order)
  select v_school_id,
         p_scale_id,
         trim(b ->> 'grade'),
         (b ->> 'min_mark')::integer,
         (b ->> 'max_mark')::integer,
         nullif(trim(b ->> 'remark'), ''),
         ordinality::integer
  from jsonb_array_elements(p_bands) with ordinality as t (b, ordinality);

  -- Check a default scale now rather than at commit, so the caller gets the
  -- refusal from this call.
  if exists (select 1 from public.grading_scales where id = p_scale_id and is_default) then
    perform private.require_complete_scale(p_scale_id);
  end if;
end;
$$;

comment on function public.save_grading_bands(uuid, jsonb) is
  'Replaces a grading scale''s bands in one transaction (band editor, US-2.3).';

grant execute on function public.save_grading_bands(uuid, jsonb) to authenticated;

-- Current year ------------------------------------------------------------------

-- Makes one year the school's current year and clears the flag on the others.
-- Security invoker: only that school's school_admin can update the rows.
create function public.set_current_academic_year(p_year_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  select school_id into v_school_id from public.academic_years where id = p_year_id;
  if v_school_id is null then
    raise exception 'academic year not found' using errcode = 'no_data_found';
  end if;
  update public.academic_years set is_current = false
   where school_id = v_school_id and is_current and id <> p_year_id;
  update public.academic_years set is_current = true where id = p_year_id;
  if not found then
    raise exception 'not allowed to change this year' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

grant execute on function public.set_current_academic_year(uuid) to authenticated;
