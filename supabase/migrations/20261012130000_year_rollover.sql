-- Promotion and year rollover (US-3.5, D52).
--
-- 1. public.roll_over_year(plan, apply) moves the current year's learners
--    into the next year in one transaction: it creates the new classes the
--    plan names (copying the old class's subjects and still-active teachers),
--    a new enrolment for each learner who moves up or repeats with the
--    subject choices the new class also offers, and sets each old enrolment
--    to promoted, repeating, left or graduated (and a leaver's or graduate's
--    learner status to match). Marks, comments and reports are never touched.
--    With apply = false the same work runs and is rolled back, so the
--    preview is exactly what applying would do. Security invoker: RLS and
--    the existing triggers apply, and only the school admin passes.
-- 2. One audit event per rollover (who, which years, how many of each), on
--    top of the enrolment rows the audit trigger already records.
-- 3. public.family_enrolment_years(school) lists each family learner's years
--    and classes up to the school's current year, so the portal shows a new
--    year (with no reports yet) next to the earlier ones.
-- 4. Announcements treat only 'enrolled' as being in a class now:
--    'repeating' is the old year's status of a learner who repeats, set by
--    the rollover, and their new year's enrolment is 'enrolled' (D49 read it
--    the other way round before any rollover existed).

-- 1. The rollover -----------------------------------------------------------------------

-- Writes the rollover's audit event. Security definer because nobody may
-- insert into audit_log directly; it refuses anyone but the school admin.
create function private.log_year_rollover(
  p_school_id uuid, p_from_year_id uuid, p_summary jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(p_school_id, 'school_admin') then
    raise exception 'only the school admin can roll a year over' using errcode = '42501';
  end if;
  insert into public.audit_log (school_id, actor_id, table_name, row_id, action, event, new_data)
  values (p_school_id, auth.uid(), 'academic_years', p_from_year_id, 'event', 'year_rolled_over', p_summary);
end;
$$;

revoke execute on function private.log_year_rollover(uuid, uuid, jsonb) from public;
grant execute on function private.log_year_rollover(uuid, uuid, jsonb) to authenticated;

-- The plan (built by src/lib/rollover/plan.ts):
-- {
--   "from_year_id": uuid,           the school's current year
--   "to_year_id": uuid,             a later year of the same school
--   "new_classes": [{ "key": "n1", "name": "4 Green", "grade_level_id": uuid,
--                     "copy_from_class_id": uuid }],
--   "learners": [{ "enrolment_id": uuid,
--                  "outcome": "promoted" | "repeating" | "left" | "graduated",
--                  "to_class": uuid of a class in to_year, or a new class key,
--                              for promoted and repeating only }]
-- }
-- Only enrolments of from_year that are still 'enrolled' can be rolled over;
-- any not in the plan are left as they are (a class can go on its own).
--
-- Returns { "promoted", "repeating", "left", "graduated": counts,
--           "classes_created": [{ "id", "name" }],
--           "enrolments": [{ "learner_id", "learner_name", "learner_number",
--                            "outcome", "from_class", "to_class" }],
--           "not_carried": [{ "learner_id", "learner_name", "learner_number",
--                             "subject", "to_class" }] }
create function public.roll_over_year(p_plan jsonb, p_apply boolean default false)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_from public.academic_years;
  v_to public.academic_years;
  v_result jsonb;
  v_class_ids jsonb := '{}';
  v_created jsonb := '[]';
  v_moves jsonb := '[]';
  v_not_carried jsonb := '[]';
  v_counts jsonb := '{"promoted": 0, "repeating": 0, "left": 0, "graduated": 0}';
  nc jsonb;
  item jsonb;
  src public.classes;
  new_class_id uuid;
  old_enrolment public.enrolments;
  learner public.learners;
  target public.classes;
  target_ref text;
  new_enrolment_id uuid;
  v_outcome public.enrolment_status;
begin
  if jsonb_typeof(p_plan) <> 'object'
     or jsonb_typeof(p_plan -> 'learners') <> 'array'
     or jsonb_typeof(coalesce(p_plan -> 'new_classes', '[]')) <> 'array' then
    raise exception 'the rollover plan is not valid' using errcode = '22023';
  end if;

  select * into v_from from public.academic_years where id = (p_plan ->> 'from_year_id')::uuid;
  select * into v_to from public.academic_years where id = (p_plan ->> 'to_year_id')::uuid;
  if v_from.id is null or v_to.id is null then
    raise exception 'academic year not found' using errcode = 'P0002';
  end if;
  if not public.has_role(v_from.school_id, 'school_admin') then
    raise exception 'only the school admin can roll a year over' using errcode = '42501';
  end if;
  if v_to.school_id <> v_from.school_id then
    raise exception 'both years must belong to the same school' using errcode = '22023';
  end if;
  if not v_from.is_current then
    raise exception 'only the current year can be rolled over' using errcode = '22023';
  end if;
  if v_to.starts_on <= v_from.starts_on then
    raise exception 'the next year must start after %', v_from.label using errcode = '22023';
  end if;
  if jsonb_array_length(p_plan -> 'learners') = 0 then
    raise exception 'there is nobody to roll over' using errcode = '22023';
  end if;

  begin
    -- New classes, each a copy of its source class's subjects and still-active
    -- teachers. The setup triggers refuse a missing teacher once the next
    -- year's setup is finished (D22).
    for nc in select * from jsonb_array_elements(coalesce(p_plan -> 'new_classes', '[]'))
    loop
      if coalesce(nc ->> 'key', '') !~ '^n[0-9]{1,4}$' or v_class_ids ? (nc ->> 'key') then
        raise exception 'a new class in the plan has no key or a repeated one' using errcode = '22023';
      end if;
      select * into src
      from public.classes
      where id = (nc ->> 'copy_from_class_id')::uuid and academic_year_id = v_from.id;
      if src.id is null then
        raise exception 'a new class must copy a class of %', v_from.label using errcode = '22023';
      end if;
      insert into public.classes (school_id, academic_year_id, grade_level_id, name, class_teacher_id)
      values (
        v_from.school_id, v_to.id, (nc ->> 'grade_level_id')::uuid, trim(nc ->> 'name'),
        case when private.is_active_teacher(src.school_id, src.class_teacher_id) then src.class_teacher_id end
      )
      returning id into new_class_id;
      insert into public.class_subjects (school_id, class_id, subject_id, teacher_id)
      select cs.school_id, new_class_id, cs.subject_id,
             case when private.is_active_teacher(cs.school_id, cs.teacher_id) then cs.teacher_id end
      from public.class_subjects cs
      where cs.class_id = src.id;
      v_class_ids := v_class_ids || jsonb_build_object(nc ->> 'key', new_class_id);
      v_created := v_created || jsonb_build_object('id', new_class_id, 'name', trim(nc ->> 'name'));
    end loop;

    for item in select * from jsonb_array_elements(p_plan -> 'learners')
    loop
      select * into old_enrolment
      from public.enrolments
      where id = (item ->> 'enrolment_id')::uuid
      for update;
      if old_enrolment.id is null or old_enrolment.academic_year_id <> v_from.id then
        raise exception 'a learner in the plan is not enrolled in %', v_from.label using errcode = '22023';
      end if;
      select * into learner from public.learners where id = old_enrolment.learner_id;
      if old_enrolment.status <> 'enrolled' then
        raise exception '% (%) has already been moved on from %',
          learner.first_name || ' ' || learner.last_name, learner.learner_number, v_from.label
          using errcode = '22023';
      end if;

      v_outcome := case item ->> 'outcome'
        when 'promoted' then 'promoted'::public.enrolment_status
        when 'repeating' then 'repeating'
        when 'left' then 'left'
        when 'graduated' then 'graduated'
      end;
      if v_outcome is null then
        raise exception 'choose what happens to % (%)',
          learner.first_name || ' ' || learner.last_name, learner.learner_number
          using errcode = '22023';
      end if;

      target := null;
      if v_outcome in ('promoted', 'repeating') then
        target_ref := item ->> 'to_class';
        select * into target
        from public.classes
        where id = coalesce((v_class_ids ->> target_ref)::uuid,
                            case when target_ref ~* '^[0-9a-f-]{36}$' then target_ref::uuid end)
          and academic_year_id = v_to.id;
        if target.id is null then
          raise exception 'choose a % class for % (%)', v_to.label,
            learner.first_name || ' ' || learner.last_name, learner.learner_number
            using errcode = '22023';
        end if;
        if exists (
          select 1 from public.enrolments
          where learner_id = learner.id and academic_year_id = v_to.id
        ) then
          raise exception '% (%) is already in a % class', learner.first_name || ' ' || learner.last_name,
            learner.learner_number, v_to.label
            using errcode = '22023';
        end if;

        insert into public.enrolments (school_id, learner_id, class_id, academic_year_id)
        values (learner.school_id, learner.id, target.id, v_to.id)
        returning id into new_enrolment_id;

        -- Subject choices carry over where the new class teaches the same
        -- subject; the rest are listed for the admin.
        insert into public.enrolment_subjects (school_id, enrolment_id, class_subject_id)
        select learner.school_id, new_enrolment_id, ncs.id
        from public.enrolment_subjects es
        join public.class_subjects ocs on ocs.id = es.class_subject_id
        join public.class_subjects ncs on ncs.class_id = target.id and ncs.subject_id = ocs.subject_id
        where es.enrolment_id = old_enrolment.id;
        -- A primary (or ECD) learner takes every subject of their class (US-3.4).
        perform private.add_default_subjects(new_enrolment_id);

        v_not_carried := v_not_carried || coalesce((
          select jsonb_agg(jsonb_build_object(
                   'learner_id', learner.id,
                   'learner_name', learner.first_name || ' ' || learner.last_name,
                   'learner_number', learner.learner_number,
                   'subject', s.name,
                   'to_class', target.name
                 ) order by s.sort_order, s.name)
          from public.enrolment_subjects es
          join public.class_subjects ocs on ocs.id = es.class_subject_id
          join public.subjects s on s.id = ocs.subject_id
          where es.enrolment_id = old_enrolment.id
            and not exists (
              select 1 from public.class_subjects ncs
              where ncs.class_id = target.id and ncs.subject_id = ocs.subject_id
            )
        ), '[]');
      elsif item ? 'to_class' and item ->> 'to_class' is not null then
        raise exception '% (%) is leaving, so has no % class',
          learner.first_name || ' ' || learner.last_name, learner.learner_number, v_to.label
          using errcode = '22023';
      end if;

      update public.enrolments set status = v_outcome where id = old_enrolment.id;
      if v_outcome in ('left', 'graduated') then
        update public.learners set status = v_outcome::text::public.learner_status
        where id = learner.id;
      end if;

      v_counts := jsonb_set(v_counts, array[v_outcome::text], to_jsonb((v_counts ->> v_outcome::text)::int + 1));
      v_moves := v_moves || jsonb_build_object(
        'learner_id', learner.id,
        'learner_name', learner.first_name || ' ' || learner.last_name,
        'learner_number', learner.learner_number,
        'outcome', v_outcome,
        'from_class', (select name from public.classes where id = old_enrolment.class_id),
        'to_class', target.name
      );
    end loop;

    v_result := v_counts || jsonb_build_object(
      'classes_created', v_created,
      'enrolments', v_moves,
      'not_carried', v_not_carried
    );

    perform private.log_year_rollover(
      v_from.school_id, v_from.id,
      v_counts || jsonb_build_object(
        'from_year', v_from.label,
        'to_year', v_to.label,
        'classes_created', jsonb_array_length(v_created),
        'subjects_not_carried', jsonb_array_length(v_not_carried)
      )
    );

    if not p_apply then
      -- Undo everything above; v_result keeps what it would have done.
      raise exception 'rollover preview' using errcode = 'SPRV1';
    end if;
  exception
    when sqlstate 'SPRV1' then
      null;
  end;

  return v_result || jsonb_build_object('applied', p_apply);
end;
$$;

comment on function public.roll_over_year(jsonb, boolean) is
  'US-3.5: moves the current year''s learners into the next year in one transaction (new classes, enrolments, carried subject choices, old enrolments promoted, repeating, left or graduated). apply = false previews and rolls back. School admin only (D52).';

revoke execute on function public.roll_over_year(jsonb, boolean) from public, anon;
grant execute on function public.roll_over_year(jsonb, boolean) to authenticated;

-- 3. The family's years for the portal ---------------------------------------------------

create function public.family_enrolment_years(p_school_id uuid)
returns table (learner_id uuid, year_label text, class_name text)
language sql
stable
security definer
set search_path = public
as $$
  select e.learner_id, y.label, c.name
  from public.enrolments e
  join public.academic_years y on y.id = e.academic_year_id
  join public.classes c on c.id = e.class_id
  where e.school_id = p_school_id
    and auth.uid() is not null
    and e.id in (select private.my_family_enrolment_ids())
    and y.starts_on <= coalesce(
      (select cy.starts_on from public.academic_years cy
       where cy.school_id = p_school_id and cy.is_current),
      y.starts_on)
  order by y.starts_on desc;
$$;

comment on function public.family_enrolment_years(uuid) is
  'The caller''s children''s (and their own) years and classes in a school, newest first, up to the current year, so the portal can show a year with no reports yet (US-3.5, D52).';

revoke execute on function public.family_enrolment_years(uuid) from public, anon;
grant execute on function public.family_enrolment_years(uuid) to authenticated;

-- 4. Announcements: only 'enrolled' is in the class now ------------------------------------

create or replace function private.my_announcement_class_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select private.my_teaching_class_ids()
  union
  select e.class_id
  from public.enrolments e
  where e.status = 'enrolled'
    and e.learner_id in (
      select private.my_guardian_learner_ids()
      union
      select private.my_own_learner_ids()
    );
$$;

create or replace function private.announcement_audience(
  p_school_id uuid, p_audience public.audience_type, p_class_id uuid
)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id
  from public.memberships m
  where p_audience <> 'class'
    and m.school_id = p_school_id
    and m.status = 'active'
    and (
      p_audience = 'all'
      or (p_audience = 'staff' and m.role in ('school_admin', 'head', 'hod', 'teacher'))
      or (p_audience = 'learners' and m.role = 'learner')
      or (p_audience = 'parents' and m.role = 'parent')
    )
  union
  select x.user_id
  from (
    select c.class_teacher_id as user_id, array['teacher', 'hod']::public.app_role[] as roles
    from public.classes c
    where c.id = p_class_id
    union all
    select cs.teacher_id, array['teacher', 'hod']::public.app_role[]
    from public.class_subjects cs
    where cs.class_id = p_class_id
    union all
    select l.user_id, array['learner']::public.app_role[]
    from public.enrolments e
    join public.learners l on l.id = e.learner_id
    where e.class_id = p_class_id and e.status = 'enrolled'
    union all
    select g.user_id, array['parent']::public.app_role[]
    from public.enrolments e
    join public.guardian_links gl on gl.learner_id = e.learner_id
    join public.guardians g on g.id = gl.guardian_id
    where e.class_id = p_class_id and e.status = 'enrolled'
  ) as x
  where p_audience = 'class'
    and x.user_id is not null
    and exists (
      select 1
      from public.memberships m
      where m.user_id = x.user_id
        and m.school_id = p_school_id
        and m.status = 'active'
        and m.role = any (x.roles)
    );
$$;
