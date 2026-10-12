-- The school admin's and head's oversight (US-9.1, US-9.2; D51).
--
-- Four read-only functions for /admin. None of them calculates anything
-- new: they count rows that already exist, in one query each for the whole
-- school, so the dashboard costs the same handful of calls however many
-- classes and learners a school has. Completion still comes from
-- completion_class_subjects() and completion_classes() (D36) and recent
-- activity from audit_entries() (D35).
--
-- Who: school admin and head of the school get every row. A hod gets only
-- what D23 and D36 already give them: browse_search() finds the learners
-- and classes they teach and themselves; the school-wide counts, report
-- statuses and guardian lists return nothing to them. Teachers, parents,
-- learners, another school's staff and anonymous callers get nothing.

-- Counts ---------------------------------------------------------------------

create function public.oversight_counts(p_school_id uuid)
returns table (
  active_learners int,
  staff int,
  -- Guardians linked to at least one active learner.
  guardians int,
  -- Of those, with a parent login and an active parent role (US-1.3).
  parents_linked int,
  -- Of those, never signed in: no login yet, or a login never used.
  guardians_never_signed_in int
)
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    select 1
    where auth.uid() is not null
      and private.is_admin_or_head(p_school_id)
  ),
  families as (
    select g.id,
           g.user_id is not null and exists (
             select 1 from public.memberships m
             where m.school_id = g.school_id and m.user_id = g.user_id
               and m.role = 'parent' and m.status = 'active'
           ) as linked,
           u.last_sign_in_at
    from public.guardians g
    left join auth.users u on u.id = g.user_id
    where g.school_id = p_school_id
      and exists (
        select 1
        from public.guardian_links gl
        join public.learners l on l.id = gl.learner_id
        where gl.guardian_id = g.id and l.status = 'active'
      )
  )
  select
    (select count(*) from public.learners l
     where l.school_id = p_school_id and l.status = 'active')::int,
    (select count(distinct m.user_id) from public.memberships m
     where m.school_id = p_school_id and m.status = 'active'
       and m.role in ('school_admin', 'head', 'hod', 'teacher'))::int,
    (select count(*) from families)::int,
    (select count(*) from families f where f.linked)::int,
    (select count(*) from families f where f.last_sign_in_at is null)::int
  from allowed;
$$;

comment on function public.oversight_counts(uuid) is
  'Active learners, active staff, guardians of active learners, how many have a parent login and how many never signed in. School admin and head only (D51).';

-- Reports by status ------------------------------------------------------------

create function public.oversight_reports(p_term_id uuid)
returns table (
  class_id uuid,
  class_name text,
  class_teacher_name text,
  drafts int,
  -- Drafts the head sent back (D44); also counted in drafts.
  returned int,
  submitted int,
  approved int,
  published int,
  withdrawn int
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, p.full_name,
         count(r.id) filter (where r.status = 'draft')::int,
         count(r.id) filter (where r.status = 'draft' and r.returned_at is not null)::int,
         count(r.id) filter (where r.status = 'submitted')::int,
         count(r.id) filter (where r.status = 'approved')::int,
         count(r.id) filter (where r.status = 'published')::int,
         count(r.id) filter (where r.status = 'withdrawn')::int
  from public.terms t
  join public.classes c on c.academic_year_id = t.academic_year_id and c.school_id = t.school_id
  left join public.profiles p on p.id = c.class_teacher_id
  left join public.enrolments e on e.class_id = c.id
  left join public.reports r on r.enrolment_id = e.id and r.term_id = t.id
  where t.id = p_term_id
    and auth.uid() is not null
    and private.is_admin_or_head(t.school_id)
  group by c.id, c.name, p.full_name
  order by c.name;
$$;

comment on function public.oversight_reports(uuid) is
  'Per class of a term: report versions by status, withdrawn ones included. School admin and head only (D51).';

-- Guardians, by whether they have signed in -----------------------------------------

create function public.oversight_guardians(
  p_school_id uuid,
  p_filter text,
  p_limit int default 100,
  p_offset int default 0
)
returns table (
  guardian_id uuid,
  full_name text,
  phone text,
  has_login boolean,
  last_sign_in_at timestamptz,
  -- [{id, name, number}] of the active learners they are linked to.
  learners jsonb,
  -- Rows matching the filter, before the page is cut.
  total int
)
language sql
stable
security definer
set search_path = public
as $$
  with families as (
    select g.id, g.full_name, g.phone,
           g.user_id is not null and exists (
             select 1 from public.memberships m
             where m.school_id = g.school_id and m.user_id = g.user_id
               and m.role = 'parent' and m.status = 'active'
           ) as linked,
           u.last_sign_in_at
    from public.guardians g
    left join auth.users u on u.id = g.user_id
    where g.school_id = p_school_id
      and auth.uid() is not null
      and private.is_admin_or_head(p_school_id)
      and exists (
        select 1
        from public.guardian_links gl
        join public.learners l on l.id = gl.learner_id
        where gl.guardian_id = g.id and l.status = 'active'
      )
  ),
  picked as (
    select f.*, count(*) over () as total
    from families f
    where (p_filter = 'never' and f.last_sign_in_at is null)
       or (p_filter = 'linked' and f.linked)
    order by f.full_name, f.id
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
    offset greatest(coalesce(p_offset, 0), 0)
  ),
  linked_learners as (
    select gl.guardian_id,
           jsonb_agg(jsonb_build_object(
             'id', l.id, 'name', l.first_name || ' ' || l.last_name, 'number', l.learner_number
           ) order by l.last_name, l.first_name) as learners
    from public.guardian_links gl
    join public.learners l on l.id = gl.learner_id
    where gl.guardian_id in (select pk.id from picked pk)
      and l.status = 'active'
    group by gl.guardian_id
  )
  select pk.id, pk.full_name, pk.phone, pk.linked, pk.last_sign_in_at,
         coalesce(ll.learners, '[]'::jsonb), pk.total::int
  from picked pk
  left join linked_learners ll on ll.guardian_id = pk.id
  order by pk.full_name, pk.id;
$$;

comment on function public.oversight_guardians(uuid, text, int, int) is
  'Guardians of active learners who never signed in (filter ''never'') or who have a parent login (''linked''), a page at a time, with their learners. School admin and head only (D51).';

-- Browse search --------------------------------------------------------------------

create function public.browse_search(p_school_id uuid, p_query text)
returns table (
  kind text,
  id uuid,
  label text,
  -- Learner: number and latest class; class: its year; staff: email.
  detail text,
  -- Staff only: their active or invited roles here.
  roles public.app_role[]
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select private.is_admin_or_head(p_school_id) as whole_school,
           public.has_role(p_school_id, 'hod') as is_hod
    where auth.uid() is not null
  ),
  query as (
    select lower(trim(left(coalesce(p_query, ''), 100))) as q
  ),
  -- Up to five words, each matched anywhere (LIKE wildcards escaped).
  words as (
    select array_agg(replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_')) as ws
    from (
      select w from query, regexp_split_to_table(query.q, '\s+') as w
      where w <> '' limit 5
    ) split
  ),
  learner_hits as (
    select 'learner'::text as kind, l.id,
           l.first_name || ' ' || l.last_name as label,
           l.learner_number || coalesce(' · ' || latest.name, '') as detail,
           null::public.app_role[] as roles,
           case when lower(l.learner_number) = (select q from query) then 0 else 1 end as rank,
           l.last_name || ' ' || l.first_name as sort_name
    from public.learners l
    cross join viewer v
    cross join words
    left join lateral (
      select c.name
      from public.enrolments e
      join public.classes c on c.id = e.class_id
      join public.academic_years y on y.id = e.academic_year_id
      where e.learner_id = l.id
      order by y.starts_on desc
      limit 1
    ) latest on true
    where l.school_id = p_school_id
      and words.ws is not null
      and (v.whole_school or (v.is_hod and l.id in (select private.my_teaching_learner_ids())))
      and not exists (
        select 1 from unnest(words.ws) w
        where lower(l.first_name || ' ' || l.last_name || ' ' || l.learner_number) not like '%' || w || '%'
      )
    order by rank, sort_name
    limit 20
  ),
  staff_hits as (
    select 'staff'::text as kind, p.id, coalesce(p.full_name, p.email) as label,
           p.email as detail,
           array_agg(m.role order by m.role) as roles
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    cross join viewer v
    cross join words
    where m.school_id = p_school_id
      and m.role in ('school_admin', 'head', 'hod', 'teacher')
      and m.status in ('active', 'invited')
      and words.ws is not null
      and (v.whole_school or (v.is_hod and m.user_id = auth.uid()))
      and not exists (
        select 1 from unnest(words.ws) w
        where lower(coalesce(p.full_name, '') || ' ' || coalesce(p.email, '')) not like '%' || w || '%'
      )
    group by p.id, p.full_name, p.email
    order by label
    limit 20
  ),
  class_hits as (
    select 'class'::text as kind, c.id, c.name as label, y.label as detail,
           null::public.app_role[] as roles
    from public.classes c
    join public.academic_years y on y.id = c.academic_year_id
    cross join viewer v
    cross join query
    where c.school_id = p_school_id
      and query.q <> ''
      and (v.whole_school or (v.is_hod and c.id in (select private.my_teaching_class_ids())))
      and replace(lower(c.name), ' ', '')
          like '%' || replace(replace(replace(replace(query.q, ' ', ''), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by y.starts_on desc, c.name
    limit 20
  )
  select h.kind, h.id, h.label, h.detail, h.roles from learner_hits h
  union all
  select h.kind, h.id, h.label, h.detail, h.roles from staff_hits h
  union all
  select h.kind, h.id, h.label, h.detail, h.roles from class_hits h;
$$;

comment on function public.browse_search(uuid, text) is
  'Learners (name or number), staff (name or email) and classes (name) matching a search, at most 20 of each. Admin and head: the whole school; a hod: the learners and classes they teach and themselves (D23, D36, D51).';

revoke execute on function public.oversight_counts(uuid) from public, anon;
revoke execute on function public.oversight_reports(uuid) from public, anon;
revoke execute on function public.oversight_guardians(uuid, text, int, int) from public, anon;
revoke execute on function public.browse_search(uuid, text) from public, anon;
grant execute on function public.oversight_counts(uuid) to authenticated;
grant execute on function public.oversight_reports(uuid) to authenticated;
grant execute on function public.oversight_guardians(uuid, text, int, int) to authenticated;
grant execute on function public.browse_search(uuid, text) to authenticated;
