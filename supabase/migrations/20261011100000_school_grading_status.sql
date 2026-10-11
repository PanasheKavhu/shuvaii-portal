-- Onboarding a school includes entering its grading key (D38, D42): the
-- super-admin console shows, per grade level, the scale it uses and
-- whether that scale covers 0 to 100 exactly. Platform admins have no read
-- of tenant tables (D5), so this security definer function answers them
-- (and only them) with names and a yes or no, never marks or people.

create function public.school_grading_status(p_school_id uuid)
returns table (grade_level_name text, scale_name text, complete boolean)
language sql
stable
security definer
set search_path = public
as $$
  select gl.name, s.name, public.grading_scale_is_complete(s.id)
  from public.grade_levels gl
  join public.grading_scales s on s.id = gl.grading_scale_id
  where gl.school_id = p_school_id
    and public.is_platform_admin()
  order by gl.sort_order, gl.name;
$$;

comment on function public.school_grading_status(uuid) is
  'Per grade level of a school: its scale and whether the scale is complete. Platform admins only (console, D42).';

revoke execute on function public.school_grading_status(uuid) from public, anon;
grant execute on function public.school_grading_status(uuid) to authenticated;
