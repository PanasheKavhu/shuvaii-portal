-- Learner numbers made by the portal, per school (D64). A third feature
-- switch, `auto_learner_numbers` (default off). When a platform admin turns
-- it on for a school, a learner added there without a number (import or
-- the add form) gets the next one in the pattern PREFIX + YY + 0001:
-- the school's initials (words like "School" and "of" left out), the last
-- two digits of the year in the school's time zone, and a running number
-- per prefix and year, e.g. Test High School's first learner in 2026 is
-- TH260001. Schools that keep their own numbers leave it off and must
-- give a number, as before. Numbers already given are never changed.

-- Shape and defaults (D55): the new key ----------------------------------------------

create or replace function private.feature_default(p_feature text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_feature
    when 'newsletter' then true
    when 'attendance' then false
    when 'auto_learner_numbers' then false
  end;
$$;

create or replace function private.feature_flags_are_valid(p_flags jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_flags) = 'object'
    and not exists (
      select 1
      from jsonb_each(p_flags) as f (key, value)
      where f.key not in ('newsletter', 'attendance', 'auto_learner_numbers')
         or jsonb_typeof(f.value) <> 'boolean'
    );
$$;

-- Audit: feature_changed covers the new switch too. ---------------------------------

create or replace function private.audit_school_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_branding jsonb;
  new_branding jsonb;
  old_features jsonb := '{}'::jsonb;
  new_features jsonb := '{}'::jsonb;
  f text;
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (school_id, actor_id, table_name, row_id, action, event, new_data)
    values (new.id, auth.uid(), 'schools', new.id, 'event', 'school_created', to_jsonb(new));
    return null;
  end if;

  old_branding := jsonb_build_object(
    'logo_path', old.logo_path, 'primary_color', old.primary_color, 'accent_color', old.accent_color);
  new_branding := jsonb_build_object(
    'logo_path', new.logo_path, 'primary_color', new.primary_color, 'accent_color', new.accent_color);
  if old_branding is distinct from new_branding then
    insert into public.audit_log (
      school_id, actor_id, table_name, row_id, action, event, old_data, new_data
    )
    values (new.id, auth.uid(), 'schools', new.id, 'event', 'branding_changed',
            old_branding, new_branding);
  end if;

  foreach f in array array['newsletter', 'attendance', 'auto_learner_numbers'] loop
    if coalesce((old.feature_flags ->> f)::boolean, private.feature_default(f))
       is distinct from coalesce((new.feature_flags ->> f)::boolean, private.feature_default(f)) then
      old_features := old_features
        || jsonb_build_object(f, coalesce((old.feature_flags ->> f)::boolean, private.feature_default(f)));
      new_features := new_features
        || jsonb_build_object(f, coalesce((new.feature_flags ->> f)::boolean, private.feature_default(f)));
    end if;
  end loop;
  if old.status is distinct from new.status then
    insert into public.audit_log (
      school_id, actor_id, table_name, row_id, action, event, old_data, new_data
    )
    values (new.id, auth.uid(), 'schools', new.id, 'event',
            case when new.status = 'suspended' then 'school_suspended' else 'school_reactivated' end,
            jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  end if;

  if new_features <> '{}'::jsonb then
    insert into public.audit_log (
      school_id, actor_id, table_name, row_id, action, event, old_data, new_data
    )
    values (new.id, auth.uid(), 'schools', new.id, 'event', 'feature_changed',
            old_features, new_features);
  end if;
  return null;
end;
$$;

-- The pattern -------------------------------------------------------------------------

-- A school's initials for its learner numbers: the first letter of each
-- word of its name (apostrophes dropped, so St Mary's is SM), leaving
-- out small words and "school", at most four.
-- Two letters at least: a one-word name gives its first three letters.
create function private.learner_number_prefix(p_school_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  with words as (
    select w, ord
    from regexp_split_to_table(
      upper(regexp_replace(coalesce(p_school_name, ''), '[''’]', '', 'g')), '[^A-Z]+')
      with ordinality as t (w, ord)
    where w <> '' and w not in ('OF', 'THE', 'AND', 'SCHOOL', 'SCHOOLS')
  ),
  initials as (
    select left(string_agg(left(w, 1), '' order by ord), 4) as i from words
  )
  select case
    when length(i) >= 2 then i
    else coalesce(nullif(left((select w from words order by ord limit 1), 3), ''), 'L')
  end
  from initials;
$$;

-- The next free number for a school, e.g. TH260001. Serialised per school
-- with a transaction lock, so two imports at once never pick the same
-- number. Compares without case, as the app does (D24).
create function private.next_learner_number(p_school_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  stem text;
  last_seq integer;
  candidate text;
begin
  perform pg_advisory_xact_lock(hashtextextended('learner_number:' || p_school_id::text, 0));
  select private.learner_number_prefix(s.name)
           || to_char(now() at time zone coalesce(s.timezone, 'Africa/Harare'), 'YY')
    into stem
  from public.schools s
  where s.id = p_school_id;
  if stem is null then
    raise exception 'school not found' using errcode = 'no_data_found';
  end if;

  select coalesce(max(substring(upper(l.learner_number) from length(stem) + 1)::integer), 0)
    into last_seq
  from public.learners l
  where l.school_id = p_school_id
    and upper(l.learner_number) ~ ('^' || stem || '[0-9]{4,6}$');

  loop
    last_seq := last_seq + 1;
    candidate := stem || lpad(last_seq::text, 4, '0');
    exit when not exists (
      select 1 from public.learners
      where school_id = p_school_id and upper(learner_number) = candidate
    );
  end loop;
  return candidate;
end;
$$;

revoke execute on function private.learner_number_prefix(text) from public;
revoke execute on function private.next_learner_number(uuid) from public;
grant execute on function private.learner_number_prefix(text) to authenticated, service_role;
grant execute on function private.next_learner_number(uuid) to authenticated, service_role;

-- A blank number on insert: made when the school's switch is on, refused
-- in plain words when it is off.
create function private.fill_learner_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(coalesce(new.learner_number, '')), '') is null then
    if not private.school_feature_on(new.school_id, 'auto_learner_numbers') then
      raise exception 'learner number is required' using errcode = 'not_null_violation';
    end if;
    new.learner_number := private.next_learner_number(new.school_id);
  end if;
  return new;
end;
$$;

create trigger learners_fill_number
  before insert on public.learners
  for each row
  execute function private.fill_learner_number();
