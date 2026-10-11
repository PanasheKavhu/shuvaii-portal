-- The school's usual assessment set (D41, Q5): names, types, maximums and
-- weights per term kind, set in setup and offered as one tap on the marks
-- screens. Was fixed in code as Test 1, Test 2 and Exam (D32), which stays
-- the starting point and what a school without its own set gets.
--
-- A kind's set is either empty (use the starting point) or adds up to
-- exactly 100; save_assessment_set() replaces a kind's set in one call.

create table public.assessment_set_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  term_kind public.term_kind not null,
  name text not null check (length(trim(name)) between 1 and 80),
  type public.assessment_type not null,
  max_mark numeric not null check (max_mark > 0 and max_mark <= 1000 and max_mark = round(max_mark, 2)),
  weight_percent numeric not null
    check (weight_percent > 0 and weight_percent <= 100 and weight_percent = round(weight_percent, 2)),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.assessment_set_items is
  'A school''s usual assessments per term kind (D41). Weights of a kind add up to 100, or the kind has none.';

create index assessment_set_items_school_id_idx on public.assessment_set_items (school_id, term_kind);
create unique index assessment_set_items_name_idx
  on public.assessment_set_items (school_id, term_kind, lower(trim(name)));

create trigger assessment_set_items_set_updated_at
  before update on public.assessment_set_items
  for each row execute function public.set_updated_at();
create trigger assessment_set_items_keep_school_id
  before update on public.assessment_set_items
  for each row execute function private.keep_school_id();

-- Weights of each kind add up to 100 (or the kind is empty), checked at
-- commit so a set can be edited in several statements.
create function private.check_assessment_set_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school uuid := coalesce(new.school_id, old.school_id);
  v_kind public.term_kind := coalesce(new.term_kind, old.term_kind);
  v_total numeric;
  v_count integer;
begin
  select coalesce(sum(weight_percent), 0), count(*) into v_total, v_count
  from public.assessment_set_items
  where school_id = v_school and term_kind = v_kind;
  if v_count > 0 and v_total <> 100 then
    raise exception 'the usual % set''s weights must add up to 100 (they add up to %)',
      case v_kind when 'term' then 'term' when 'vacation' then 'vacation' else 'mock exam' end,
      trim_scale(v_total)
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger assessment_set_items_total_is_100
  after insert or update or delete on public.assessment_set_items
  deferrable initially deferred
  for each row execute function private.check_assessment_set_total();

alter table public.assessment_set_items enable row level security;

-- Read: staff of the school (the marks screens). Write: school_admin (D20).
create policy assessment_set_items_select on public.assessment_set_items
  for select to authenticated
  using (public.is_staff(school_id));
create policy assessment_set_items_insert on public.assessment_set_items
  for insert to authenticated
  with check (public.has_role(school_id, 'school_admin'));
create policy assessment_set_items_update on public.assessment_set_items
  for update to authenticated
  using (public.has_role(school_id, 'school_admin'))
  with check (public.has_role(school_id, 'school_admin'));
create policy assessment_set_items_delete on public.assessment_set_items
  for delete to authenticated
  using (public.has_role(school_id, 'school_admin'));

-- Replaces a kind's set with p_items, a JSON array of
-- {name, type, max_mark, weight_percent}. Security invoker: RLS decides
-- (school admin). Refuses a set that does not add up to 100 at once.
create function public.save_assessment_set(p_school_id uuid, p_term_kind public.term_kind, p_items jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'add at least one assessment' using errcode = 'invalid_parameter_value';
  end if;
  if not public.has_role(p_school_id, 'school_admin') then
    raise exception 'only the school admin can change the usual assessments'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.assessment_set_items where school_id = p_school_id and term_kind = p_term_kind;

  insert into public.assessment_set_items (school_id, term_kind, name, type, max_mark, weight_percent, sort_order)
  select p_school_id,
         p_term_kind,
         trim(regexp_replace(i ->> 'name', '\s+', ' ', 'g')),
         (i ->> 'type')::public.assessment_type,
         (i ->> 'max_mark')::numeric,
         (i ->> 'weight_percent')::numeric,
         ordinality::integer
  from jsonb_array_elements(p_items) with ordinality as t (i, ordinality);

  set constraints public.assessment_set_items_total_is_100 immediate;
  set constraints public.assessment_set_items_total_is_100 deferred;
end;
$$;

comment on function public.save_assessment_set(uuid, public.term_kind, jsonb) is
  'Replaces a school''s usual assessments for one term kind (setup, D41). Weights must add up to 100.';

grant execute on function public.save_assessment_set(uuid, public.term_kind, jsonb) to authenticated;
