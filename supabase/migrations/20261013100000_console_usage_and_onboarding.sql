-- The console's usage numbers (US-10.4) and onboarding checklist (D56).
--
--   school_usage(school or null)   per school: active learners, staff and
--                                  parents, storage bytes per bucket, last
--                                  sign in, last marks entry, published
--                                  reports and last activity
--   school_onboarding(school)      the eight onboarding items, done or not
--
-- Both are security definer and answer platform admins only (at aal2, D54),
-- like school_grading_status() (D42). They return numbers, times, yes or no
-- and fixed item keys: never a name, an email, a mark or any other personal
-- data (D5, D17).
--
-- Also: the school's privacy notice contact (Q20), two columns the platform
-- admin fills in at onboarding. The school admin may change them too, like
-- the school's other contact details (D3: the guard trigger only holds back
-- identity, branding, flags and status).

alter table public.schools
  add column privacy_contact_name text
    check (privacy_contact_name is null or length(trim(privacy_contact_name)) between 1 and 120),
  add column privacy_contact_email text
    check (privacy_contact_email is null or privacy_contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

comment on column public.schools.privacy_contact_name is
  'Who at the school answers data protection questions, named in the privacy notice (Q20).';

-- Usage -------------------------------------------------------------------------------

create function public.school_usage(p_school_id uuid default null)
returns table (
  school_id uuid,
  active_learners integer,
  active_staff integer,
  active_parents integer,
  reports_bytes bigint,
  attachments_bytes bigint,
  imports_bytes bigint,
  branding_bytes bigint,
  published_reports integer,
  last_sign_in_at timestamptz,
  last_marks_at timestamptz,
  last_activity_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with chosen as (
    select s.id
    from public.schools s
    where (p_school_id is null or s.id = p_school_id)
      and public.is_platform_admin()
  ),
  people as (
    select m.school_id,
      count(distinct m.user_id) filter (where m.role in ('school_admin', 'head', 'hod', 'teacher'))::int as staff,
      count(distinct m.user_id) filter (where m.role = 'parent')::int as parents,
      max(u.last_sign_in_at) as last_sign_in_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.status = 'active' and m.school_id in (select id from chosen)
    group by m.school_id
  ),
  learners as (
    select l.school_id, count(*)::int as n
    from public.learners l
    where l.status = 'active' and l.school_id in (select id from chosen)
    group by l.school_id
  ),
  -- Every bucket keeps a school's files under {school_id}/...; the stamp and
  -- the head's signature (report-assets) count as branding with the logo.
  files as (
    select o.school_id,
      coalesce(sum(o.size) filter (where o.bucket_id = 'reports'), 0)::bigint as reports,
      coalesce(sum(o.size) filter (where o.bucket_id = 'attachments'), 0)::bigint as attachments,
      coalesce(sum(o.size) filter (where o.bucket_id = 'imports'), 0)::bigint as imports,
      coalesce(sum(o.size) filter (where o.bucket_id in ('school-branding', 'report-assets')), 0)::bigint as branding
    from (
      select c.id as school_id, ob.bucket_id, coalesce((ob.metadata ->> 'size')::bigint, 0) as size
      from storage.objects ob
      join chosen c on split_part(ob.name, '/', 1) = c.id::text
      where ob.bucket_id in ('reports', 'attachments', 'imports', 'school-branding', 'report-assets')
    ) as o
    group by o.school_id
  ),
  marks as (
    select mk.school_id, max(mk.updated_at) as last_at
    from public.marks mk
    where mk.school_id in (select id from chosen)
    group by mk.school_id
  ),
  reports as (
    select r.school_id, count(*)::int as n
    from public.reports r
    where r.status = 'published' and r.school_id in (select id from chosen)
    group by r.school_id
  )
  select
    c.id,
    coalesce(l.n, 0),
    coalesce(p.staff, 0),
    coalesce(p.parents, 0),
    coalesce(f.reports, 0),
    coalesce(f.attachments, 0),
    coalesce(f.imports, 0),
    coalesce(f.branding, 0),
    coalesce(r.n, 0),
    p.last_sign_in_at,
    mk.last_at,
    greatest(p.last_sign_in_at, mk.last_at)
  from chosen c
  left join people p on p.school_id = c.id
  left join learners l on l.school_id = c.id
  left join files f on f.school_id = c.id
  left join marks mk on mk.school_id = c.id
  left join reports r on r.school_id = c.id
  order by greatest(p.last_sign_in_at, mk.last_at) asc nulls first, c.id;
$$;

comment on function public.school_usage(uuid) is
  'Platform admins only: per school (or one school) usage numbers and last activity, quietest first. No personal data (US-10.4).';

revoke execute on function public.school_usage(uuid) from public, anon;
grant execute on function public.school_usage(uuid) to authenticated;

-- Onboarding --------------------------------------------------------------------------

-- One row per item, in the order the console lists them. `missing` counts
-- what is still to do where that helps (levels, classes), else null.
create function public.school_onboarding(p_school_id uuid)
returns table (item text, done boolean, missing integer)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select * from public.schools where id = p_school_id and public.is_platform_admin()
  ),
  current_year as (
    select y.id from public.academic_years y
    where y.school_id = p_school_id and y.is_current
  ),
  levels as (
    select count(*)::int as total,
      count(*) filter (where not public.grading_scale_is_complete(gl.grading_scale_id))::int as incomplete
    from public.grade_levels gl
    where gl.school_id = p_school_id
  ),
  classes as (
    select count(*)::int as total,
      count(*) filter (where c.class_teacher_id is null)::int as without_teacher
    from public.classes c
    where c.school_id = p_school_id and c.academic_year_id in (select id from current_year)
  ),
  items (n, item, done, missing) as (
    select 1, 'grading_scales', lv.total > 0 and lv.incomplete = 0, lv.incomplete from levels lv
    union all
    select 2, 'term_dates', exists (
      select 1 from public.terms t
      where t.school_id = p_school_id and t.kind = 'term'
        and t.academic_year_id in (select id from current_year)
    ), null
    union all
    select 3, 'class_teachers', cl.total > 0 and cl.without_teacher = 0, cl.without_teacher from classes cl
    union all
    select 4, 'branding',
      (select logo_path is not null and primary_color is not null and accent_color is not null from s), null
    union all
    select 5, 'report_images',
      (select stamp_path is not null and head_signature_path is not null from s), null
    union all
    select 6, 'report_template', exists (
      select 1 from public.report_templates rt
      where rt.school_id = p_school_id and rt.term_kind = 'term' and rt.updated_at > rt.created_at
    ), null
    union all
    select 7, 'first_admin', exists (
      select 1
      from public.memberships m
      join auth.mfa_factors f on f.user_id = m.user_id and f.status = 'verified'
      where m.school_id = p_school_id and m.role = 'school_admin' and m.status = 'active'
    ), null
    union all
    select 8, 'privacy_contact',
      (select privacy_contact_name is not null and privacy_contact_email is not null from s), null
  )
  select i.item, coalesce(i.done, false), i.missing
  from items i
  where exists (select 1 from s)
  order by i.n;
$$;

comment on function public.school_onboarding(uuid) is
  'Platform admins only: the school''s onboarding items, each done or not, read from what exists (D56).';

revoke execute on function public.school_onboarding(uuid) from public, anon;
grant execute on function public.school_onboarding(uuid) to authenticated;
