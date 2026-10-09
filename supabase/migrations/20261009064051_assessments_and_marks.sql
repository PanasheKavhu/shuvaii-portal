-- Assessment tables (migration order step 5 in docs/DATA_MODEL.md, first
-- half): assessments and marks, plus class_subject_unlocks, which records
-- marks unlocked after the deadline (US-2.4, US-4.5). Calculation functions
-- (subject results, positions) come in the second half.
--
-- Access (D30): a teacher (or hod, scoped like a teacher as in D23) reads
-- and writes assessments and marks only for class subjects they teach
-- (public.teaches()); a class teacher also reads every assessment and mark
-- in their class; school_admin and head read and write everything in the
-- school (Q18). Parents and learners get nothing yet (Phase 4).
--
-- Locking is enforced here, not only in the screens: a teacher cannot write
-- an assessment or mark once the term is locked or closed, the marks
-- deadline has passed, or the assessment itself is locked, unless a school
-- admin or head has unlocked that class subject for the term with a reason
-- (unlock_class_subject()). Admin and head writes are never locked, and are
-- audited like every other write to these tables (D18).

create type public.assessment_type as enum ('test', 'assignment', 'exam', 'practical', 'vacation');
create type public.mark_status as enum ('present', 'absent', 'excused');

-- assessments ---------------------------------------------------------------

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  term_id uuid not null,
  class_subject_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 80),
  type public.assessment_type not null,
  max_mark numeric not null check (max_mark > 0 and max_mark <= 1000),
  weight_percent numeric not null check (weight_percent > 0 and weight_percent <= 100),
  sort_order int not null default 0,
  assessed_on date,
  -- Set by a school admin or head to stop teachers changing this
  -- assessment and its marks; an unlock of the class subject overrides it.
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (term_id, school_id) references public.terms (id, school_id),
  foreign key (class_subject_id, school_id) references public.class_subjects (id, school_id),
  unique (id, school_id)
);

create index assessments_school_id_idx on public.assessments (school_id);
create index assessments_term_id_class_subject_id_idx
  on public.assessments (term_id, class_subject_id);
create index assessments_class_subject_id_idx on public.assessments (class_subject_id);

-- marks ---------------------------------------------------------------------

create table public.marks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  assessment_id uuid not null,
  enrolment_id uuid not null,
  score numeric,
  status public.mark_status not null default 'present',
  entered_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (assessment_id, school_id) references public.assessments (id, school_id),
  foreign key (enrolment_id, school_id) references public.enrolments (id, school_id),
  unique (assessment_id, enrolment_id),
  -- A present learner has a score; an absent or excused one has none. The
  -- upper bound (the assessment's max_mark) is checked by trigger below.
  constraint marks_score_matches_status check (
    (status = 'present' and score is not null and score >= 0)
    or (status <> 'present' and score is null)
  )
);

create index marks_school_id_idx on public.marks (school_id);
create index marks_enrolment_id_idx on public.marks (enrolment_id);

-- class_subject_unlocks -----------------------------------------------------
-- One row per unlock. Written only by unlock_class_subject() and
-- relock_class_subject(); never deleted, so the history of who unlocked
-- what and why stays. At most one open unlock per term and class subject.

create table public.class_subject_unlocks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  term_id uuid not null,
  class_subject_id uuid not null,
  reason text not null check (length(trim(reason)) between 1 and 500),
  unlocked_by uuid references public.profiles (id),
  unlocked_at timestamptz not null default now(),
  relocked_by uuid references public.profiles (id),
  relocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (term_id, school_id) references public.terms (id, school_id),
  foreign key (class_subject_id, school_id) references public.class_subjects (id, school_id)
);

create index class_subject_unlocks_school_id_idx on public.class_subject_unlocks (school_id);
create unique index class_subject_unlocks_one_open_idx
  on public.class_subject_unlocks (term_id, class_subject_id) where relocked_at is null;

-- Housekeeping triggers -------------------------------------------------------

create trigger assessments_set_updated_at
  before update on public.assessments
  for each row execute function public.set_updated_at();
create trigger marks_set_updated_at
  before update on public.marks
  for each row execute function public.set_updated_at();
create trigger class_subject_unlocks_set_updated_at
  before update on public.class_subject_unlocks
  for each row execute function public.set_updated_at();

create trigger assessments_keep_school_id
  before update on public.assessments
  for each row execute function private.keep_school_id();
create trigger marks_keep_school_id
  before update on public.marks
  for each row execute function private.keep_school_id();
create trigger class_subject_unlocks_keep_school_id
  before update on public.class_subject_unlocks
  for each row execute function private.keep_school_id();

create trigger assessments_audit
  after insert or update or delete on public.assessments
  for each row execute function private.audit_row_change();
create trigger marks_audit
  after insert or update or delete on public.marks
  for each row execute function private.audit_row_change();

-- Marks are never deleted (rule 6) -------------------------------------------------
-- Correct a wrong mark by changing it, or mark the learner absent or excused.

create function private.marks_are_never_deleted()
returns trigger
language plpgsql
as $$
begin
  raise exception 'marks are never deleted; change the score or status instead';
end;
$$;

create trigger marks_no_delete
  before delete on public.marks
  for each row execute function private.marks_are_never_deleted();

create trigger marks_no_truncate
  before truncate on public.marks
  for each statement execute function private.marks_are_never_deleted();

-- Integrity --------------------------------------------------------------------------

-- An assessment's term and class subject belong to the same academic year.
-- Once it has marks, it cannot move to another term or class subject.
create function private.check_assessment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.class_subjects where id = new.class_subject_id and school_id = new.school_id)
     or not exists (select 1 from public.terms where id = new.term_id and school_id = new.school_id) then
    return new; -- the foreign keys report it
  end if;
  if not exists (
    select 1
    from public.class_subjects cs
    join public.classes c on c.id = cs.class_id
    join public.terms t on t.academic_year_id = c.academic_year_id
    where cs.id = new.class_subject_id
      and t.id = new.term_id
  ) then
    raise exception 'the term and the class subject must be in the same academic year'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' then
    if (new.term_id, new.class_subject_id) is distinct from (old.term_id, old.class_subject_id)
       and exists (select 1 from public.marks m where m.assessment_id = new.id) then
      raise exception 'an assessment with marks cannot move to another term or class subject'
        using errcode = 'check_violation';
    end if;
    if new.max_mark < old.max_mark
       and exists (
         select 1 from public.marks m where m.assessment_id = new.id and m.score > new.max_mark
       ) then
      raise exception 'some marks are above the new maximum mark'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger assessments_check
  before insert or update of term_id, class_subject_id, max_mark on public.assessments
  for each row execute function private.check_assessment();

-- A mark's score is at most its assessment's max_mark, and its learner takes
-- that class subject (enrolment_subjects). entered_by is whoever saved it.
create function private.check_mark()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.assessments;
begin
  select * into a from public.assessments where id = new.assessment_id;
  if not found or a.school_id <> new.school_id
     or not exists (select 1 from public.enrolments where id = new.enrolment_id and school_id = new.school_id) then
    return new; -- the foreign keys report it
  end if;

  if new.score > a.max_mark then
    raise exception 'the score must be between 0 and %', a.max_mark
      using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' or (new.assessment_id, new.enrolment_id) is distinct from (old.assessment_id, old.enrolment_id) then
    if not exists (
      select 1
      from public.enrolment_subjects es
      where es.enrolment_id = new.enrolment_id
        and es.class_subject_id = a.class_subject_id
    ) then
      raise exception 'the learner does not take this subject'
        using errcode = 'check_violation';
    end if;
  end if;

  if auth.uid() is not null
     and (tg_op = 'INSERT' or (new.score, new.status) is distinct from (old.score, old.status)) then
    new.entered_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger marks_check
  before insert or update on public.marks
  for each row execute function private.check_mark();

-- The same rule from the other side: a subject choice with marks cannot be
-- removed or changed, so no mark is left for a subject the learner does not
-- take. (Moving a learner with marks to another class is refused the same way.)
create function private.check_enrolment_subject_has_no_marks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and (new.enrolment_id, new.class_subject_id) is not distinct from (old.enrolment_id, old.class_subject_id) then
    return new;
  end if;
  if exists (
    select 1
    from public.marks m
    join public.assessments a on a.id = m.assessment_id
    where m.enrolment_id = old.enrolment_id
      and a.class_subject_id = old.class_subject_id
  ) then
    raise exception 'the learner has marks in this subject, so it cannot be removed'
      using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger enrolment_subjects_check_marks
  before update of enrolment_id, class_subject_id or delete on public.enrolment_subjects
  for each row execute function private.check_enrolment_subject_has_no_marks();

-- Locking ------------------------------------------------------------------------------

-- Whether an open unlock exists for this term and class subject.
create function private.class_subject_is_unlocked(p_term_id uuid, p_class_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_subject_unlocks u
    where u.term_id = p_term_id
      and u.class_subject_id = p_class_subject_id
      and u.relocked_at is null
  );
$$;

-- Whether teachers are locked out of this term's marks for this class
-- subject: the term is locked or closed, or its marks deadline (a date in
-- the school's time zone) has passed, and no unlock is open. An assessment's
-- own is_locked is checked by the callers below.
create function private.marks_are_locked(p_term_id uuid, p_class_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.terms t
    join public.schools s on s.id = t.school_id
    where t.id = p_term_id
      and (
        t.status in ('locked', 'closed')
        or (t.marks_deadline is not null
            and (now() at time zone s.timezone)::date > t.marks_deadline)
      )
  )
  and not private.class_subject_is_unlocked(p_term_id, p_class_subject_id);
$$;

revoke execute on function private.class_subject_is_unlocked(uuid, uuid) from public;
revoke execute on function private.marks_are_locked(uuid, uuid) from public;
grant execute on function private.class_subject_is_unlocked(uuid, uuid) to authenticated;
grant execute on function private.marks_are_locked(uuid, uuid) to authenticated;

-- Raises unless this write is allowed for the current user given the lock.
-- School admin and head are never locked out. Calls with no user (the seed,
-- server jobs with the service role) are trusted. RLS has already decided
-- whether the user may write this class subject at all.
create function private.assert_assessment_writable(p_assessment public.assessments)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or private.is_admin_or_head(p_assessment.school_id) then
    return;
  end if;
  if private.marks_are_locked(p_assessment.term_id, p_assessment.class_subject_id)
     or (p_assessment.is_locked
         and not private.class_subject_is_unlocked(p_assessment.term_id, p_assessment.class_subject_id)) then
    raise exception 'marks for this class subject are locked; ask the school admin or head to unlock them'
      using errcode = '42501';
  end if;
end;
$$;

revoke execute on function private.assert_assessment_writable(public.assessments) from public;
grant execute on function private.assert_assessment_writable(public.assessments) to authenticated;

create function private.check_assessment_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'DELETE' and auth.uid() is not null and not private.is_admin_or_head(new.school_id) then
    if (tg_op = 'INSERT' and new.is_locked)
       or (tg_op = 'UPDATE' and new.is_locked is distinct from old.is_locked) then
      raise exception 'only a school admin or head can lock or unlock an assessment'
        using errcode = '42501';
    end if;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.assert_assessment_writable(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.assert_assessment_writable(new);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger assessments_check_lock
  before insert or update or delete on public.assessments
  for each row execute function private.check_assessment_lock();

create function private.check_mark_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.assessments;
begin
  if tg_op = 'UPDATE' and old.assessment_id <> new.assessment_id then
    select * into a from public.assessments where id = old.assessment_id;
    perform private.assert_assessment_writable(a);
  end if;
  select * into a from public.assessments where id = new.assessment_id;
  perform private.assert_assessment_writable(a);
  return new;
end;
$$;

create trigger marks_check_lock
  before insert or update on public.marks
  for each row execute function private.check_mark_lock();

-- Unlock and relock (US-2.4, US-4.5; Q17) ------------------------------------------

create function public.unlock_class_subject(
  p_class_subject_id uuid,
  p_term_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cs public.class_subjects;
  unlock public.class_subject_unlocks;
begin
  select * into cs from public.class_subjects where id = p_class_subject_id;
  if not found or not private.is_admin_or_head(cs.school_id) then
    raise exception 'only a school admin or head can unlock marks' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'give a reason for unlocking marks' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.terms t
    join public.classes c on c.academic_year_id = t.academic_year_id
    where t.id = p_term_id and c.id = cs.class_id and t.school_id = cs.school_id
  ) then
    raise exception 'the term and the class subject must be in the same academic year'
      using errcode = '22023';
  end if;
  if private.class_subject_is_unlocked(p_term_id, p_class_subject_id) then
    raise exception 'marks for this class subject are already unlocked' using errcode = '22023';
  end if;

  insert into public.class_subject_unlocks (school_id, term_id, class_subject_id, reason, unlocked_by)
  values (cs.school_id, p_term_id, p_class_subject_id, trim(p_reason), auth.uid())
  returning * into unlock;

  insert into public.audit_log (
    school_id, actor_id, table_name, row_id, action, event, new_data, reason
  )
  values (
    unlock.school_id, auth.uid(), 'class_subject_unlocks', unlock.id, 'event', 'marks_unlocked',
    jsonb_build_object('term_id', unlock.term_id, 'class_subject_id', unlock.class_subject_id),
    unlock.reason
  );
  return unlock.id;
end;
$$;

comment on function public.unlock_class_subject(uuid, uuid, text) is
  'Lets the teacher of a class subject change its marks for a term after the lock. School admin or head only; needs a reason, which is audited.';

create function public.relock_class_subject(p_class_subject_id uuid, p_term_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cs public.class_subjects;
  unlock public.class_subject_unlocks;
begin
  select * into cs from public.class_subjects where id = p_class_subject_id;
  if not found or not private.is_admin_or_head(cs.school_id) then
    raise exception 'only a school admin or head can relock marks' using errcode = '42501';
  end if;

  update public.class_subject_unlocks
  set relocked_at = now(), relocked_by = auth.uid()
  where term_id = p_term_id
    and class_subject_id = p_class_subject_id
    and relocked_at is null
  returning * into unlock;
  if not found then
    raise exception 'marks for this class subject are not unlocked' using errcode = '22023';
  end if;

  insert into public.audit_log (school_id, actor_id, table_name, row_id, action, event, old_data, new_data)
  values (
    unlock.school_id, auth.uid(), 'class_subject_unlocks', unlock.id, 'event', 'marks_relocked',
    jsonb_build_object('reason', unlock.reason, 'unlocked_by', unlock.unlocked_by,
                       'unlocked_at', unlock.unlocked_at),
    jsonb_build_object('term_id', unlock.term_id, 'class_subject_id', unlock.class_subject_id)
  );
end;
$$;

comment on function public.relock_class_subject(uuid, uuid) is
  'Ends an unlock made by unlock_class_subject(). School admin or head only; audited.';

revoke execute on function public.unlock_class_subject(uuid, uuid, text) from public, anon;
revoke execute on function public.relock_class_subject(uuid, uuid) from public, anon;
grant execute on function public.unlock_class_subject(uuid, uuid, text) to authenticated;
grant execute on function public.relock_class_subject(uuid, uuid) to authenticated;

-- RLS helpers -----------------------------------------------------------------------
-- Class subjects whose assessments and marks the current user reads: those
-- they teach, and every class subject of a class they are class teacher of.
-- Those they write: only the ones they teach. Both answer only for
-- auth.uid() and require an active teacher or hod membership (D23).

create function private.my_marks_class_subject_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select cs.id
  from public.class_subjects cs
  where cs.teacher_id = auth.uid()
    and private.is_active_teacher(cs.school_id, auth.uid())
  union
  select cs.id
  from public.class_subjects cs
  join public.classes c on c.id = cs.class_id
  where c.class_teacher_id = auth.uid()
    and private.is_active_teacher(c.school_id, auth.uid());
$$;

create function private.my_marks_assessment_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.id
  from public.assessments a
  where a.class_subject_id in (select private.my_marks_class_subject_ids());
$$;

create function private.my_taught_assessment_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.id
  from public.assessments a
  join public.class_subjects cs on cs.id = a.class_subject_id
  where cs.teacher_id = auth.uid()
    and private.is_active_teacher(cs.school_id, auth.uid());
$$;

revoke execute on function private.my_marks_class_subject_ids() from public;
revoke execute on function private.my_marks_assessment_ids() from public;
revoke execute on function private.my_taught_assessment_ids() from public;
grant execute on function private.my_marks_class_subject_ids() to authenticated;
grant execute on function private.my_marks_assessment_ids() to authenticated;
grant execute on function private.my_taught_assessment_ids() to authenticated;

-- RLS ----------------------------------------------------------------------------------

alter table public.assessments enable row level security;
alter table public.marks enable row level security;
alter table public.class_subject_unlocks enable row level security;

-- assessments: an assessment without marks can be removed (not personal data;
-- the marks foreign key stops removing one that has marks).
create policy assessments_select on public.assessments
  for select to authenticated
  using (
    private.is_admin_or_head(school_id)
    or class_subject_id in (select private.my_marks_class_subject_ids())
  );
create policy assessments_insert on public.assessments
  for insert to authenticated
  with check (private.is_admin_or_head(school_id) or public.teaches(class_subject_id));
create policy assessments_update on public.assessments
  for update to authenticated
  using (private.is_admin_or_head(school_id) or public.teaches(class_subject_id))
  with check (private.is_admin_or_head(school_id) or public.teaches(class_subject_id));
create policy assessments_delete on public.assessments
  for delete to authenticated
  using (private.is_admin_or_head(school_id) or public.teaches(class_subject_id));

-- marks: no delete policy (never deleted).
create policy marks_select on public.marks
  for select to authenticated
  using (
    private.is_admin_or_head(school_id)
    or assessment_id in (select private.my_marks_assessment_ids())
  );
create policy marks_insert on public.marks
  for insert to authenticated
  with check (
    private.is_admin_or_head(school_id)
    or assessment_id in (select private.my_taught_assessment_ids())
  );
create policy marks_update on public.marks
  for update to authenticated
  using (
    private.is_admin_or_head(school_id)
    or assessment_id in (select private.my_taught_assessment_ids())
  )
  with check (
    private.is_admin_or_head(school_id)
    or assessment_id in (select private.my_taught_assessment_ids())
  );

-- class_subject_unlocks: read by admin, head and the class subject's
-- teacher (so the marks screen can say it is unlocked); written only by the
-- functions above.
create policy class_subject_unlocks_select on public.class_subject_unlocks
  for select to authenticated
  using (private.is_admin_or_head(school_id) or public.teaches(class_subject_id));

revoke insert, update, delete, truncate on public.class_subject_unlocks from anon, authenticated;

-- Weights check (GRADING_AND_WEIGHTS, Q5) ----------------------------------------------
-- Security invoker: each caller sees only the assessments they may read.

create function public.assessment_weights_are_complete(p_term_id uuid, p_class_subject_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(a.weight_percent), 0) = 100
  from public.assessments a
  where a.term_id = p_term_id
    and a.class_subject_id = p_class_subject_id;
$$;

comment on function public.assessment_weights_are_complete(uuid, uuid) is
  'Whether the weights of a class subject''s assessments in a term add up to exactly 100.';

-- Every class subject of the term's year that the caller may see marks for
-- whose weights for the term do not add up to 100 (0 when it has none).
create function public.assessment_weight_problems(p_term_id uuid)
returns table (class_subject_id uuid, total_weight numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select cs.id, coalesce(sum(a.weight_percent), 0)
  from public.terms t
  join public.classes c on c.academic_year_id = t.academic_year_id
  join public.class_subjects cs on cs.class_id = c.id
  left join public.assessments a on a.class_subject_id = cs.id and a.term_id = t.id
  where t.id = p_term_id
    and (private.is_admin_or_head(cs.school_id)
         or cs.id in (select private.my_marks_class_subject_ids()))
  group by cs.id
  having coalesce(sum(a.weight_percent), 0) <> 100;
$$;

comment on function public.assessment_weight_problems(uuid) is
  'Class subjects the caller may see whose assessment weights for this term do not add up to 100.';

revoke execute on function public.assessment_weights_are_complete(uuid, uuid) from public, anon;
revoke execute on function public.assessment_weight_problems(uuid) from public, anon;
grant execute on function public.assessment_weights_are_complete(uuid, uuid) to authenticated;
grant execute on function public.assessment_weight_problems(uuid) to authenticated;
