-- Audit log screen (SPEC section 3, "View audit log"; D35).
--
-- 1. Each audit row also records the learner, class and class subject it is
--    about, filled in by a BEFORE INSERT trigger from the row's own data, so
--    every writer (the generic row trigger and the event functions) gets
--    them without change. They are what the screen filters on, each with its
--    own (school_id, ..., created_at desc, id desc) index, so a filtered page
--    reads the index in order and stops after one page. Existing rows are
--    filled in once below. The class is the one at the time of the change.
-- 2. public.audit_entries() returns one page of a school's log, newest first,
--    with the names the screen needs (actor, learner, class, subject,
--    assessment, term, the person or guardian concerned). School admin and head
--    only, as the audit_log select policy. Keyset paging on
--    (created_at, id); conditions are added only when a filter is set, so
--    the plan always uses the matching index.

alter table public.audit_log
  add column learner_id uuid,
  add column class_id uuid,
  add column class_subject_id uuid;

comment on column public.audit_log.learner_id is
  'Learner the change is about, if any (filled by trigger, D35). Not a foreign key: history outlives rows.';
comment on column public.audit_log.class_id is
  'Class the change is about at the time it was made, if any (filled by trigger, D35).';
comment on column public.audit_log.class_subject_id is
  'Class subject the change is about, if any (filled by trigger, D35).';

-- What an audit row is about, from its table and data. Learner and class come
-- from the enrolment for marks and comments; the class of a class subject
-- from class_subjects; a learner change takes the learner's latest class.
create function private.audit_context(p_table text, p_row_id uuid, p_data jsonb)
returns table (learner_id uuid, class_id uuid, class_subject_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  v_enrolment uuid;
  v_learner uuid;
  v_class uuid;
  v_class_subject uuid;
begin
  case p_table
    when 'marks' then
      v_enrolment := (p_data ->> 'enrolment_id')::uuid;
      select a.class_subject_id into v_class_subject
      from public.assessments a where a.id = (p_data ->> 'assessment_id')::uuid;
    when 'subject_comments' then
      v_enrolment := (p_data ->> 'enrolment_id')::uuid;
      v_class_subject := (p_data ->> 'class_subject_id')::uuid;
    when 'class_comments' then
      v_enrolment := (p_data ->> 'enrolment_id')::uuid;
    when 'enrolments' then
      v_learner := (p_data ->> 'learner_id')::uuid;
      v_class := (p_data ->> 'class_id')::uuid;
    when 'learners' then
      v_learner := p_row_id;
    when 'guardian_links' then
      v_learner := (p_data ->> 'learner_id')::uuid;
    when 'assessments', 'class_subject_unlocks' then
      v_class_subject := (p_data ->> 'class_subject_id')::uuid;
    else
      null;
  end case;

  if v_enrolment is not null then
    select e.learner_id, e.class_id into v_learner, v_class
    from public.enrolments e where e.id = v_enrolment;
  end if;
  if v_class is null and v_class_subject is not null then
    select cs.class_id into v_class from public.class_subjects cs where cs.id = v_class_subject;
  end if;
  if v_class is null and v_learner is not null then
    select e.class_id into v_class
    from public.enrolments e
    where e.learner_id = v_learner
    order by e.created_at desc
    limit 1;
  end if;

  return query select v_learner, v_class, v_class_subject;
end;
$$;

revoke execute on function private.audit_context(text, uuid, jsonb) from public;

create function private.audit_log_fill_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ctx record;
begin
  select * into ctx
  from private.audit_context(new.table_name, new.row_id, coalesce(new.new_data, new.old_data));
  new.learner_id := coalesce(new.learner_id, ctx.learner_id);
  new.class_id := coalesce(new.class_id, ctx.class_id);
  new.class_subject_id := coalesce(new.class_subject_id, ctx.class_subject_id);
  return new;
end;
$$;

create trigger audit_log_fill_context
  before insert on public.audit_log
  for each row execute function private.audit_log_fill_context();

-- Fill in the rows written before this migration. The append-only trigger
-- is lifted for this one statement only; nothing but the three new
-- columns changes.
alter table public.audit_log disable trigger audit_log_no_update_delete;
update public.audit_log a
set learner_id = ctx.learner_id, class_id = ctx.class_id, class_subject_id = ctx.class_subject_id
from public.audit_log src
cross join lateral private.audit_context(
  src.table_name, src.row_id, coalesce(src.new_data, src.old_data)
) ctx
where src.id = a.id
  and (ctx.learner_id is not null or ctx.class_id is not null or ctx.class_subject_id is not null);
alter table public.audit_log enable trigger audit_log_no_update_delete;

create index audit_log_learner_idx
  on public.audit_log (school_id, learner_id, created_at desc, id desc)
  where learner_id is not null;
create index audit_log_class_idx
  on public.audit_log (school_id, class_id, created_at desc, id desc)
  where class_id is not null;
create index audit_log_actor_idx
  on public.audit_log (school_id, actor_id, created_at desc, id desc)
  where actor_id is not null;

-- One page of the log -------------------------------------------------------------

create function public.audit_entries(
  p_school_id uuid,
  p_learner_id uuid default null,
  p_class_id uuid default null,
  p_actor_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_before_at timestamptz default null,
  p_before_id bigint default null,
  p_limit int default 50
)
returns table (
  id bigint,
  created_at timestamptz,
  table_name text,
  action public.audit_action,
  event text,
  reason text,
  old_data jsonb,
  new_data jsonb,
  actor_name text,
  learner_name text,
  learner_number text,
  class_name text,
  subject_name text,
  assessment_name text,
  term_name text,
  person_name text,
  other_class_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_where text := 'a.school_id = $1';
begin
  if auth.uid() is null
     or not (public.has_role(p_school_id, 'school_admin') or public.has_role(p_school_id, 'head')) then
    return;
  end if;
  select s.timezone into v_tz from public.schools s where s.id = p_school_id;

  if p_learner_id is not null then v_where := v_where || ' and a.learner_id = $2'; end if;
  if p_class_id is not null then v_where := v_where || ' and a.class_id = $3'; end if;
  if p_actor_id is not null then v_where := v_where || ' and a.actor_id = $4'; end if;
  if p_from is not null then
    v_where := v_where || ' and a.created_at >= ($5::timestamp at time zone $10)';
  end if;
  if p_to is not null then
    v_where := v_where || ' and a.created_at < (($6 + 1)::timestamp at time zone $10)';
  end if;
  if p_before_at is not null and p_before_id is not null then
    v_where := v_where || ' and (a.created_at, a.id) < ($7, $8)';
  end if;

  return query execute format($q$
    with page as (
      select a.*
      from public.audit_log a
      where %s
      order by a.created_at desc, a.id desc
      limit $9
    )
    select
      a.id,
      a.created_at,
      a.table_name,
      a.action,
      a.event,
      a.reason,
      a.old_data,
      a.new_data,
      actor.full_name,
      nullif(trim(l.first_name || ' ' || l.last_name), ''),
      l.learner_number,
      c.name,
      s.name,
      asm.name,
      t.name,
      coalesce(g.full_name, p.full_name, sc.name),
      oc.name
    from page a
    left join public.profiles actor on actor.id = a.actor_id
    left join public.learners l on l.id = a.learner_id
    left join public.classes c on c.id = a.class_id
    left join public.class_subjects cs on cs.id = a.class_subject_id
    left join public.subjects s on s.id = cs.subject_id
    left join public.assessments asm
      on asm.id = case
        when a.table_name = 'marks' then (coalesce(a.new_data, a.old_data) ->> 'assessment_id')::uuid
        when a.table_name = 'assessments' then a.row_id
      end
    left join public.terms t
      on t.id = coalesce(asm.term_id, (coalesce(a.new_data, a.old_data) ->> 'term_id')::uuid)
    left join public.guardians g
      on g.id = case
        when a.table_name = 'guardians' then a.row_id
        when a.table_name in ('guardian_links', 'invites')
          then (coalesce(a.new_data, a.old_data) ->> 'guardian_id')::uuid
      end
    left join public.profiles p
      on p.id = case
        when a.table_name = 'memberships' then (coalesce(a.new_data, a.old_data) ->> 'user_id')::uuid
        when a.table_name = 'profiles' then a.row_id
      end
    left join public.schools sc on a.table_name = 'schools' and sc.id = a.row_id
    left join public.classes oc
      on a.table_name = 'enrolments' and a.action = 'update'
         and oc.id = (a.old_data ->> 'class_id')::uuid
    order by a.created_at desc, a.id desc
  $q$, v_where)
  using p_school_id, p_learner_id, p_class_id, p_actor_id, p_from, p_to,
        p_before_at, p_before_id, least(greatest(coalesce(p_limit, 50), 1), 200),
        coalesce(v_tz, 'Africa/Harare');
end;
$$;

comment on function public.audit_entries(uuid, uuid, uuid, uuid, date, date, timestamptz, bigint, int) is
  'One page of a school''s audit log, newest first, with the names the audit screen shows. Keyset paging on (created_at, id); dates are in the school''s time zone. School admin and head only (D35).';

revoke execute on function public.audit_entries(uuid, uuid, uuid, uuid, date, date, timestamptz, bigint, int)
  from public, anon;
grant execute on function public.audit_entries(uuid, uuid, uuid, uuid, date, date, timestamptz, bigint, int)
  to authenticated;
