-- Band changes after marks exist (D40). Grades in every term are computed
-- live from the bands (D31) until Phase 4 publishes reports with their own
-- frozen key, so the band editor warns how many class subjects with marks a
-- change regrades, and every change is in the audit log with the old and
-- new bands.
--
-- 1. grading_scale_marked_class_subjects(scale): per term, the class
--    subjects (in classes whose grade level uses the scale) that already
--    have marks. School admin of the scale's school only.
-- 2. save_grading_bands() records one audit event, grading_bands_changed,
--    with the whole old and new band sets, when the bands differ.
-- 3. Direct writes to grading_bands by a signed-in user (the API) record
--    the same event per statement and scale, with the full sets before and
--    after, so the audit does not depend on the screen.

create function public.grading_scale_marked_class_subjects(p_scale_id uuid)
returns table (term_id uuid, term_name text, term_status public.term_status, class_subjects integer)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name, t.status, count(distinct a.class_subject_id)::integer
  from public.grading_scales s
  join public.grade_levels gl on gl.grading_scale_id = s.id
  join public.classes c on c.grade_level_id = gl.id
  join public.class_subjects cs on cs.class_id = c.id
  join public.assessments a on a.class_subject_id = cs.id
  join public.terms t on t.id = a.term_id
  where s.id = p_scale_id
    and public.has_role(s.school_id, 'school_admin')
    and exists (select 1 from public.marks m where m.assessment_id = a.id)
  group by t.id, t.name, t.status, t.starts_on
  order by t.starts_on;
$$;

comment on function public.grading_scale_marked_class_subjects(uuid) is
  'Per term, how many class subjects using this scale already have marks (band editor warning, D40). School admin only.';

revoke execute on function public.grading_scale_marked_class_subjects(uuid) from public, anon;
grant execute on function public.grading_scale_marked_class_subjects(uuid) to authenticated;

-- A scale's bands as a JSON array, highest first.
create function private.scale_bands_json(p_scale_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('grade', grade, 'min_mark', min_mark, 'max_mark', max_mark, 'remark', remark)
      order by min_mark desc, max_mark desc, grade
    ),
    '[]'::jsonb
  )
  from public.grading_bands
  where scale_id = p_scale_id;
$$;

-- One grading_bands_changed event, unless nothing changed.
create function private.log_band_change(p_scale_id uuid, p_old jsonb, p_new jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scale record;
begin
  if p_old = p_new then
    return;
  end if;
  select id, school_id, name into v_scale from public.grading_scales where id = p_scale_id;
  if not found then
    return;
  end if;
  insert into public.audit_log (school_id, actor_id, table_name, row_id, action, event, old_data, new_data)
  values (
    v_scale.school_id, auth.uid(), 'grading_scales', v_scale.id, 'event', 'grading_bands_changed',
    jsonb_build_object('scale_name', v_scale.name, 'bands', p_old),
    jsonb_build_object('scale_name', v_scale.name, 'bands', p_new)
  );
end;
$$;

revoke execute on function private.scale_bands_json(uuid) from public;
revoke execute on function private.log_band_change(uuid, jsonb, jsonb) from public;
grant execute on function private.scale_bands_json(uuid) to authenticated;
grant execute on function private.log_band_change(uuid, jsonb, jsonb) to authenticated;

-- The band editor's save, now audited as one event.
create or replace function public.save_grading_bands(p_scale_id uuid, p_bands jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_school_id uuid;
  v_old jsonb;
begin
  select school_id into v_school_id from public.grading_scales where id = p_scale_id;
  if v_school_id is null then
    raise exception 'grading scale not found' using errcode = 'no_data_found';
  end if;
  if jsonb_typeof(p_bands) <> 'array' then
    raise exception 'bands must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;

  v_old := private.scale_bands_json(p_scale_id);
  -- The statement triggers below leave this save to log itself, once.
  perform set_config('sp.saving_bands_for', p_scale_id::text, true);

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

  perform set_config('sp.saving_bands_for', '', true);

  -- Check a default scale now rather than at commit, so the caller gets the
  -- refusal from this call.
  if exists (select 1 from public.grading_scales where id = p_scale_id and is_default) then
    perform private.require_complete_scale(p_scale_id);
  end if;

  perform private.log_band_change(p_scale_id, v_old, private.scale_bands_json(p_scale_id));
end;
$$;

-- Direct writes: the full band set of each scale touched, before and after
-- the statement. Changes with no signed-in user (the seed, migrations) are
-- not logged, like the trusted writes of D30.
create function private.log_band_statement(p_old_rows jsonb, p_new_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scale uuid;
  v_after jsonb;
  v_before jsonb;
begin
  if auth.uid() is null then
    return;
  end if;
  for v_scale in
    select distinct (r ->> 'scale_id')::uuid
    from jsonb_array_elements(coalesce(p_old_rows, '[]') || coalesce(p_new_rows, '[]')) r
  loop
    continue when v_scale::text = current_setting('sp.saving_bands_for', true);
    v_after := private.scale_bands_json(v_scale);
    -- Before = after, without the rows this statement wrote, plus the rows
    -- it removed or replaced.
    select coalesce(
             jsonb_agg(
               jsonb_build_object('grade', b.grade, 'min_mark', b.min_mark, 'max_mark', b.max_mark, 'remark', b.remark)
               order by b.min_mark desc, b.max_mark desc, b.grade
             ),
             '[]'::jsonb
           )
      into v_before
    from (
      select g.grade, g.min_mark, g.max_mark, g.remark
      from public.grading_bands g
      where g.scale_id = v_scale
        and g.id not in (
          select (r ->> 'id')::uuid from jsonb_array_elements(coalesce(p_new_rows, '[]')) r
        )
      union all
      select r ->> 'grade', (r ->> 'min_mark')::integer, (r ->> 'max_mark')::integer, r ->> 'remark'
      from jsonb_array_elements(coalesce(p_old_rows, '[]')) r
      where (r ->> 'scale_id')::uuid = v_scale
    ) b;
    perform private.log_band_change(v_scale, v_before, v_after);
  end loop;
end;
$$;

revoke execute on function private.log_band_statement(jsonb, jsonb) from public;

create function private.audit_band_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.log_band_statement(null, (select jsonb_agg(to_jsonb(n)) from new_bands n));
  return null;
end;
$$;

create function private.audit_band_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.log_band_statement(
    (select jsonb_agg(to_jsonb(o)) from old_bands o),
    (select jsonb_agg(to_jsonb(n)) from new_bands n)
  );
  return null;
end;
$$;

create function private.audit_band_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.log_band_statement((select jsonb_agg(to_jsonb(o)) from old_bands o), null);
  return null;
end;
$$;

create trigger grading_bands_audit_insert
  after insert on public.grading_bands
  referencing new table as new_bands
  for each statement execute function private.audit_band_insert();
create trigger grading_bands_audit_update
  after update on public.grading_bands
  referencing old table as old_bands new table as new_bands
  for each statement execute function private.audit_band_update();
create trigger grading_bands_audit_delete
  after delete on public.grading_bands
  referencing old table as old_bands
  for each statement execute function private.audit_band_delete();
