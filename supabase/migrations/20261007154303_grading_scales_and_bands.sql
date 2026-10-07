-- grading_scales and grading_bands (docs/DATA_MODEL.md section 4.4,
-- docs/GRADING_AND_WEIGHTS.md). A scale is a set of bands over whole marks;
-- each band includes both its end marks (Q1). A scale may be a default only
-- while its bands cover 0 to 100 with no gaps or overlaps (D21).

create table public.grading_scales (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  name text not null check (length(trim(name)) between 1 and 120),
  stage public.level_stage not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  unique (school_id, name)
);

comment on table public.grading_scales is
  'A school''s grading key. Default only while its bands cover 0 to 100 exactly (grading_scale_is_complete).';

create index grading_scales_school_id_idx on public.grading_scales (school_id);
-- At most one default scale per school and stage.
create unique index grading_scales_one_default_idx
  on public.grading_scales (school_id, stage)
  where is_default;

create table public.grading_bands (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  scale_id uuid not null,
  grade text not null check (length(trim(grade)) between 1 and 10),
  min_mark integer not null,
  max_mark integer not null,
  remark text check (remark is null or length(remark) <= 120),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (scale_id, school_id) references public.grading_scales (id, school_id),
  unique (scale_id, grade),
  check (min_mark >= 0 and max_mark <= 100 and min_mark <= max_mark)
);

create index grading_bands_school_id_idx on public.grading_bands (school_id);
create index grading_bands_scale_id_idx on public.grading_bands (scale_id);

create trigger grading_scales_set_updated_at
  before update on public.grading_scales
  for each row execute function public.set_updated_at();
create trigger grading_bands_set_updated_at
  before update on public.grading_bands
  for each row execute function public.set_updated_at();
create trigger grading_scales_keep_school_id
  before update on public.grading_scales
  for each row execute function private.keep_school_id();
create trigger grading_bands_keep_school_id
  before update on public.grading_bands
  for each row execute function private.keep_school_id();

-- Coverage check ------------------------------------------------------------

-- Every gap (a whole mark from 0 to 100 in no band) and overlap (a mark in
-- more than one band) in a scale, as runs of consecutive marks. Empty means
-- the scale is complete. Security invoker, so a caller sees only bands RLS
-- lets them read: for another school's scale everything reads as one gap.
create function public.grading_scale_problems(p_scale_id uuid)
returns table (problem text, from_mark integer, to_mark integer)
language sql
stable
set search_path = public
as $$
  with coverage as (
    select mark,
           (select count(*)
              from public.grading_bands b
             where b.scale_id = p_scale_id
               and mark between b.min_mark and b.max_mark) as bands
    from generate_series(0, 100) as mark
  ),
  flagged as (
    select mark, case when bands = 0 then 'gap' else 'overlap' end as problem
    from coverage
    where bands <> 1
  ),
  runs as (
    select mark, problem,
           mark - row_number() over (partition by problem order by mark) as run
    from flagged
  )
  select problem, min(mark)::integer, max(mark)::integer
  from runs
  group by problem, run
  order by 2;
$$;

comment on function public.grading_scale_problems(uuid) is
  'Gaps and overlaps in a grading scale over whole marks 0 to 100. No rows means complete.';

create function public.grading_scale_is_complete(p_scale_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select not exists (select 1 from public.grading_scale_problems(p_scale_id));
$$;

comment on function public.grading_scale_is_complete(uuid) is
  'True when the scale''s bands cover every whole mark from 0 to 100 exactly once.';

grant execute on function public.grading_scale_problems(uuid) to authenticated;
grant execute on function public.grading_scale_is_complete(uuid) to authenticated;

-- Runs as the table owner so the check sees every band of the scale,
-- whatever the caller's RLS.
create function private.require_complete_scale(p_scale_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  first_problem record;
begin
  select * into first_problem from public.grading_scale_problems(p_scale_id) limit 1;
  if found then
    raise exception 'a default grading scale must cover 0 to 100 with no gaps or overlaps (% at %-%)',
      first_problem.problem, first_problem.from_mark, first_problem.to_mark
      using errcode = 'check_violation';
  end if;
end;
$$;

-- Making a scale default (on insert or update) is refused unless it passes.
create function private.check_default_scale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.require_complete_scale(new.id);
  return null;
end;
$$;

create trigger grading_scales_default_is_complete
  after insert or update of is_default on public.grading_scales
  for each row
  when (new.is_default)
  execute function private.check_default_scale();

-- Band edits on a default scale must leave it complete. Deferred to commit,
-- so moving a boundary can take several statements in one transaction.
create function private.check_bands_of_default_scale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE')
     and exists (select 1 from public.grading_scales where id = old.scale_id and is_default) then
    perform private.require_complete_scale(old.scale_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and exists (select 1 from public.grading_scales where id = new.scale_id and is_default) then
    perform private.require_complete_scale(new.scale_id);
  end if;
  return null;
end;
$$;

create constraint trigger grading_bands_default_scale_stays_complete
  after insert or update or delete on public.grading_bands
  deferrable initially deferred
  for each row
  execute function private.check_bands_of_default_scale();

-- RLS -----------------------------------------------------------------------
-- Read: staff of the school. Write: that school's school_admin (D20).

alter table public.grading_scales enable row level security;
alter table public.grading_bands enable row level security;

create policy grading_scales_select on public.grading_scales
  for select to authenticated
  using (public.is_staff(school_id));
create policy grading_scales_insert on public.grading_scales
  for insert to authenticated
  with check (public.has_role(school_id, 'school_admin'));
create policy grading_scales_update on public.grading_scales
  for update to authenticated
  using (public.has_role(school_id, 'school_admin'))
  with check (public.has_role(school_id, 'school_admin'));
create policy grading_scales_delete on public.grading_scales
  for delete to authenticated
  using (public.has_role(school_id, 'school_admin'));

create policy grading_bands_select on public.grading_bands
  for select to authenticated
  using (public.is_staff(school_id));
create policy grading_bands_insert on public.grading_bands
  for insert to authenticated
  with check (public.has_role(school_id, 'school_admin'));
create policy grading_bands_update on public.grading_bands
  for update to authenticated
  using (public.has_role(school_id, 'school_admin'))
  with check (public.has_role(school_id, 'school_admin'));
create policy grading_bands_delete on public.grading_bands
  for delete to authenticated
  using (public.has_role(school_id, 'school_admin'));
