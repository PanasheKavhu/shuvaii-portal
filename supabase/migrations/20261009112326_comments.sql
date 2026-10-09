-- Comments (E5: US-5.1, US-5.2, US-5.3; D34): subject_comments,
-- class_comments and comment_bank from docs/DATA_MODEL.md section 4.4.
--
-- Access:
--   subject_comments  read: school admin, head, the class subject's teacher
--                     and the class's class teacher (as marks, D30).
--                     write: the class subject's teacher, or a school admin.
--   class_comments    read: school admin, head and the class teacher.
--                     write: the class teacher, or a school admin.
--   comment_bank      read: the owner, and every active staff member of the
--                     school when shared. write: the owner only.
-- Parents and learners get nothing yet: published reports carry the
-- comments in their snapshot (Phase 4). The head's comment lives on
-- reports, so it comes in Phase 4 too.
--
-- Locking: the marks deadline lock (D30) applies to teachers. A subject
-- comment follows its class subject (private.marks_are_locked(), so an
-- unlock of the class subject reopens its comments too); a class comment
-- follows the term alone (term locked or closed, or deadline passed). A
-- school admin is never locked out. Every write is audited.
--
-- Lengths fit the report (REPORT_LAYOUT.md, D34): a subject comment is at
-- most 100 characters (two lines of the comment column at 9 pt), a class
-- comment at most 300 (three lines across the page). Mirrored in
-- src/lib/comments/rules.ts.

create type public.comment_status as enum ('draft', 'submitted');

-- subject_comments ----------------------------------------------------------

create table public.subject_comments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  term_id uuid not null,
  enrolment_id uuid not null,
  class_subject_id uuid not null,
  -- The subject teacher whose name goes on the report: the class subject's
  -- teacher when the comment was last written (set by trigger).
  teacher_id uuid references public.profiles (id),
  comment text not null default '' check (char_length(comment) <= 100),
  status public.comment_status not null default 'draft',
  -- When the comment was marked done; the report's digital signature (Q10).
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (term_id, school_id) references public.terms (id, school_id),
  foreign key (enrolment_id, school_id) references public.enrolments (id, school_id),
  foreign key (class_subject_id, school_id) references public.class_subjects (id, school_id),
  unique (term_id, enrolment_id, class_subject_id),
  constraint subject_comments_submitted_has_text check (
    status = 'draft' or (length(trim(comment)) > 0 and signed_at is not null)
  )
);

create index subject_comments_school_id_idx on public.subject_comments (school_id);
create index subject_comments_term_id_enrolment_id_idx
  on public.subject_comments (term_id, enrolment_id);
create index subject_comments_class_subject_id_idx on public.subject_comments (class_subject_id);

-- class_comments ------------------------------------------------------------

create table public.class_comments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  term_id uuid not null,
  enrolment_id uuid not null,
  author_id uuid references public.profiles (id),
  comment text not null default '' check (char_length(comment) <= 300),
  status public.comment_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (term_id, school_id) references public.terms (id, school_id),
  foreign key (enrolment_id, school_id) references public.enrolments (id, school_id),
  unique (term_id, enrolment_id),
  constraint class_comments_submitted_has_text check (
    status = 'draft' or length(trim(comment)) > 0
  )
);

create index class_comments_school_id_idx on public.class_comments (school_id);
create index class_comments_enrolment_id_idx on public.class_comments (enrolment_id);

-- comment_bank ----------------------------------------------------------------
-- A teacher's saved comments. Not about any learner, so the owner may
-- delete them. subject_id and grade narrow where an entry is suggested;
-- null means any subject or any grade.

create table public.comment_bank (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  owner_id uuid not null references public.profiles (id) default auth.uid(),
  subject_id uuid,
  grade text check (grade is null or length(trim(grade)) between 1 and 10),
  text text not null check (length(trim(text)) between 1 and 300),
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (subject_id, school_id) references public.subjects (id, school_id)
);

create index comment_bank_school_id_idx on public.comment_bank (school_id);
create index comment_bank_owner_id_idx on public.comment_bank (owner_id);

-- Housekeeping triggers -----------------------------------------------------------

create trigger subject_comments_set_updated_at
  before update on public.subject_comments
  for each row execute function public.set_updated_at();
create trigger class_comments_set_updated_at
  before update on public.class_comments
  for each row execute function public.set_updated_at();
create trigger comment_bank_set_updated_at
  before update on public.comment_bank
  for each row execute function public.set_updated_at();

create trigger subject_comments_keep_school_id
  before update on public.subject_comments
  for each row execute function private.keep_school_id();
create trigger class_comments_keep_school_id
  before update on public.class_comments
  for each row execute function private.keep_school_id();
create trigger comment_bank_keep_school_id
  before update on public.comment_bank
  for each row execute function private.keep_school_id();

create trigger subject_comments_audit
  after insert or update or delete on public.subject_comments
  for each row execute function private.audit_row_change();
create trigger class_comments_audit
  after insert or update or delete on public.class_comments
  for each row execute function private.audit_row_change();

-- Comments about a learner are never deleted (rule 6): clear the text instead.
create function private.comments_are_never_deleted()
returns trigger
language plpgsql
as $$
begin
  raise exception 'comments are never deleted; change the text instead';
end;
$$;

create trigger subject_comments_no_delete
  before delete on public.subject_comments
  for each row execute function private.comments_are_never_deleted();
create trigger subject_comments_no_truncate
  before truncate on public.subject_comments
  for each statement execute function private.comments_are_never_deleted();
create trigger class_comments_no_delete
  before delete on public.class_comments
  for each row execute function private.comments_are_never_deleted();
create trigger class_comments_no_truncate
  before truncate on public.class_comments
  for each statement execute function private.comments_are_never_deleted();

-- Locking ----------------------------------------------------------------------------

-- Whether teachers are locked out of a term's class comments: the same rule
-- as marks (private.marks_are_locked(), D30) with no class subject, so only
-- the term's status and deadline count. There is no unlock for class
-- comments; the school admin writes them after the lock (D34).
create function private.term_marks_are_locked(p_term_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.marks_are_locked(p_term_id, null);
$$;

revoke execute on function private.term_marks_are_locked(uuid) from public;
grant execute on function private.term_marks_are_locked(uuid) to authenticated;

-- Integrity, lock and signature -----------------------------------------------------

-- A subject comment's term and class subject are in the same year and its
-- learner takes the subject. Signed in: refused while the marks of the
-- class subject are locked (unless a school admin); teacher_id becomes the
-- class subject's teacher; signed_at is set when it is marked done and
-- cleared when it goes back to draft. Calls with no user (the seed) are
-- trusted and keep their values.
create function private.check_subject_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cs public.class_subjects;
begin
  select * into cs from public.class_subjects where id = new.class_subject_id and school_id = new.school_id;
  if not found
     or not exists (select 1 from public.terms where id = new.term_id and school_id = new.school_id)
     or not exists (select 1 from public.enrolments where id = new.enrolment_id and school_id = new.school_id) then
    return new; -- the foreign keys report it
  end if;

  if tg_op = 'UPDATE'
     and (new.term_id, new.enrolment_id, new.class_subject_id)
         is distinct from (old.term_id, old.enrolment_id, old.class_subject_id) then
    raise exception 'a comment cannot move to another learner, subject or term'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    if not exists (
      select 1
      from public.terms t
      join public.classes c on c.academic_year_id = t.academic_year_id
      where t.id = new.term_id and c.id = cs.class_id
    ) then
      raise exception 'the term and the class subject must be in the same academic year'
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1
      from public.enrolment_subjects es
      where es.enrolment_id = new.enrolment_id
        and es.class_subject_id = new.class_subject_id
    ) then
      raise exception 'the learner does not take this subject'
        using errcode = 'check_violation';
    end if;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if not public.has_role(new.school_id, 'school_admin')
     and private.marks_are_locked(new.term_id, new.class_subject_id) then
    raise exception 'comments for this class subject are locked; ask the school admin'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' or (new.comment, new.status) is distinct from (old.comment, old.status) then
    new.teacher_id := coalesce(cs.teacher_id, new.teacher_id);
    if new.status = 'submitted' then
      if tg_op = 'INSERT' or old.status <> 'submitted' or new.comment <> old.comment then
        new.signed_at := now();
      end if;
    else
      new.signed_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger subject_comments_check
  before insert or update on public.subject_comments
  for each row execute function private.check_subject_comment();

-- A class comment's learner is enrolled in the term's year, and the term is
-- not a vacation school (class comments are for term reports only, Q8).
-- Signed in: refused while the term is locked for teachers (unless a school
-- admin); author_id is whoever wrote it.
create function private.check_class_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.terms;
begin
  select * into t from public.terms where id = new.term_id and school_id = new.school_id;
  if not found
     or not exists (select 1 from public.enrolments where id = new.enrolment_id and school_id = new.school_id) then
    return new; -- the foreign keys report it
  end if;

  if tg_op = 'UPDATE'
     and (new.term_id, new.enrolment_id) is distinct from (old.term_id, old.enrolment_id) then
    raise exception 'a comment cannot move to another learner or term'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    if t.kind = 'vacation' then
      raise exception 'class comments are for term reports, not vacation reports'
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from public.enrolments e
      where e.id = new.enrolment_id and e.academic_year_id = t.academic_year_id
    ) then
      raise exception 'the learner is not enrolled in this term''s year'
        using errcode = 'check_violation';
    end if;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if not public.has_role(new.school_id, 'school_admin')
     and private.term_marks_are_locked(new.term_id) then
    raise exception 'class comments for this term are locked; ask the school admin'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' or (new.comment, new.status) is distinct from (old.comment, old.status) then
    new.author_id := auth.uid();
  end if;
  return new;
end;
$$;

create trigger class_comments_check
  before insert or update on public.class_comments
  for each row execute function private.check_class_comment();

-- A subject choice with a comment cannot be removed or changed, as with
-- marks (D30), so no comment is left for a subject the learner does not take.
create function private.check_enrolment_subject_has_no_comments()
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
    from public.subject_comments sc
    where sc.enrolment_id = old.enrolment_id
      and sc.class_subject_id = old.class_subject_id
      and length(trim(sc.comment)) > 0
  ) then
    raise exception 'the learner has a comment in this subject, so it cannot be removed'
      using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger enrolment_subjects_check_comments
  before update of enrolment_id, class_subject_id or delete on public.enrolment_subjects
  for each row execute function private.check_enrolment_subject_has_no_comments();

-- RLS helpers -----------------------------------------------------------------------

-- Enrolments of the classes the current user is the active class teacher of.
create function private.my_class_teacher_enrolment_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.enrolments e
  join public.classes c on c.id = e.class_id
  where c.class_teacher_id = auth.uid()
    and private.is_active_teacher(c.school_id, auth.uid());
$$;

revoke execute on function private.my_class_teacher_enrolment_ids() from public;
grant execute on function private.my_class_teacher_enrolment_ids() to authenticated;

-- RLS ----------------------------------------------------------------------------------

alter table public.subject_comments enable row level security;
alter table public.class_comments enable row level security;
alter table public.comment_bank enable row level security;

-- subject_comments: no delete policy (never deleted).
create policy subject_comments_select on public.subject_comments
  for select to authenticated
  using (
    private.is_admin_or_head(school_id)
    or class_subject_id in (select private.my_marks_class_subject_ids())
  );
create policy subject_comments_insert on public.subject_comments
  for insert to authenticated
  with check (public.has_role(school_id, 'school_admin') or public.teaches(class_subject_id));
create policy subject_comments_update on public.subject_comments
  for update to authenticated
  using (public.has_role(school_id, 'school_admin') or public.teaches(class_subject_id))
  with check (public.has_role(school_id, 'school_admin') or public.teaches(class_subject_id));

-- class_comments: no delete policy (never deleted).
create policy class_comments_select on public.class_comments
  for select to authenticated
  using (
    private.is_admin_or_head(school_id)
    or enrolment_id in (select private.my_class_teacher_enrolment_ids())
  );
create policy class_comments_insert on public.class_comments
  for insert to authenticated
  with check (
    public.has_role(school_id, 'school_admin')
    or enrolment_id in (select private.my_class_teacher_enrolment_ids())
  );
create policy class_comments_update on public.class_comments
  for update to authenticated
  using (
    public.has_role(school_id, 'school_admin')
    or enrolment_id in (select private.my_class_teacher_enrolment_ids())
  )
  with check (
    public.has_role(school_id, 'school_admin')
    or enrolment_id in (select private.my_class_teacher_enrolment_ids())
  );

-- comment_bank: the owner's own entries, plus entries shared with the
-- school, for its active staff. Only the owner changes or deletes one.
create policy comment_bank_select on public.comment_bank
  for select to authenticated
  using (public.is_staff(school_id) and (owner_id = auth.uid() or is_shared));
create policy comment_bank_insert on public.comment_bank
  for insert to authenticated
  with check (public.is_staff(school_id) and owner_id = auth.uid());
create policy comment_bank_update on public.comment_bank
  for update to authenticated
  using (public.is_staff(school_id) and owner_id = auth.uid())
  with check (public.is_staff(school_id) and owner_id = auth.uid());
create policy comment_bank_delete on public.comment_bank
  for delete to authenticated
  using (public.is_staff(school_id) and owner_id = auth.uid());

-- Class comment lock for the screens ----------------------------------------------------

-- Whether teachers are locked out of a class's comments for a term, why
-- (term_locked, term_closed, deadline_passed or null) and the deadline. One
-- row for the school admin, head and the class's class teacher; none
-- otherwise. Same rule as the write trigger above.
create function public.class_comment_lock(p_class_id uuid, p_term_id uuid)
returns table (teachers_locked boolean, lock_reason text, marks_deadline date)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_school_id uuid;
begin
  select c.school_id into v_school_id from public.classes c where c.id = p_class_id;
  if v_school_id is null or auth.uid() is null
     or not (private.is_admin_or_head(v_school_id) or public.is_class_teacher(p_class_id)) then
    return;
  end if;

  return query
  select
    private.term_marks_are_locked(t.id),
    case
      when t.status = 'locked' then 'term_locked'
      when t.status = 'closed' then 'term_closed'
      when t.marks_deadline is not null
           and (now() at time zone s.timezone)::date > t.marks_deadline then 'deadline_passed'
    end,
    t.marks_deadline
  from public.terms t
  join public.schools s on s.id = t.school_id
  where t.id = p_term_id
    and t.school_id = v_school_id;
end;
$$;

comment on function public.class_comment_lock(uuid, uuid) is
  'Whether teachers are locked out of a class''s comments for a term, and why (D34).';

revoke execute on function public.class_comment_lock(uuid, uuid) from public, anon;
grant execute on function public.class_comment_lock(uuid, uuid) to authenticated;
