-- Grading is a per-school choice (D38): each school enters its own key per
-- grade level during setup, so nothing may go live on a level whose scale
-- does not cover 0 to 100.
--
-- 1. academic_year_scale_gaps(year) lists the grade levels with classes in a
--    year whose scale is incomplete (gaps, overlaps or no bands).
-- 2. Finishing a year's setup and opening a term are refused while it has
--    rows. Later edits (a new class on a level with a blank scale) are not
--    refused; the setup page lists them as gaps (D38).

create function public.academic_year_scale_gaps(p_year_id uuid)
returns table (grade_level_id uuid, grade_level_name text, scale_id uuid, scale_name text)
language sql
stable
set search_path = public
as $$
  select gl.id, gl.name, s.id, s.name
  from public.grade_levels gl
  join public.grading_scales s on s.id = gl.grading_scale_id
  where exists (
          select 1 from public.classes c
          where c.grade_level_id = gl.id and c.academic_year_id = p_year_id
        )
    and not public.grading_scale_is_complete(s.id)
  order by gl.sort_order, gl.name;
$$;

comment on function public.academic_year_scale_gaps(uuid) is
  'Grade levels with classes in a year whose grading scale does not cover 0 to 100 exactly. No rows means every level has a complete scale.';

grant execute on function public.academic_year_scale_gaps(uuid) to authenticated;

-- Raises when a year has a level with classes and no complete scale.
-- Security definer so it sees every class, level and band of the year.
create function private.require_year_scales(p_year_id uuid, p_doing text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  first_gap record;
begin
  select * into first_gap from public.academic_year_scale_gaps(p_year_id) limit 1;
  if found then
    raise exception '% while a grade level with classes has no complete grading scale (% uses "%")',
      p_doing, first_gap.grade_level_name, first_gap.scale_name
      using errcode = 'check_violation';
  end if;
end;
$$;

-- Finishing: the teacher gaps (D22), then the scales.
create or replace function private.check_year_setup_complete()
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
  perform private.require_year_scales(new.id, 'setup cannot be finished');
  return new;
end;
$$;

-- Opening a term.
create function private.check_term_opens_with_scales()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.require_year_scales(new.academic_year_id, 'a term cannot open');
  return new;
end;
$$;

create trigger terms_open_needs_complete_scales
  before insert on public.terms
  for each row
  when (new.status = 'open')
  execute function private.check_term_opens_with_scales();

-- Only the change to open is checked, so an open term's dates can still be edited.
create trigger terms_opening_needs_complete_scales
  before update of status on public.terms
  for each row
  when (new.status = 'open' and old.status <> 'open')
  execute function private.check_term_opens_with_scales();

revoke execute on function private.require_year_scales(uuid, text) from public;
