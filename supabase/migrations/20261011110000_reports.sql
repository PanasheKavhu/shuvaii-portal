-- Reports (DATA_MODEL.md migration order step 6, section 4.5; SPEC E6;
-- REPORT_LAYOUT.md; D43): report_status, report_templates, reports and
-- report_shares, the family read helpers, the private `reports` bucket for
-- PDFs and the private `report-assets` bucket for the stamp and the head's
-- signature.
--
-- Access (SPEC section 2):
--   report_templates  read: the school's active staff. write: school admin
--                     (one row per school and term kind, made by trigger).
--   reports           read: school admin and head, every report of the
--                     school; whoever teaches in a class (class teacher,
--                     subject teacher, hod), that class's reports in every
--                     state; a hod also every published report; a parent
--                     or learner only published (never withdrawn) reports
--                     of their own children or themselves, with no fee
--                     check (Q19, D39: a per-school rule goes here later).
--                     write: the class teacher makes and edits drafts and
--                     submits them; the head returns, approves, writes the
--                     head's comment, publishes and withdraws.
--   report_shares     nobody through the API; only functions (later).
--
-- The state machine (DATA_MODEL section 5) is enforced for every writer,
-- including the service role: draft -> submitted -> approved -> published
-- -> withdrawn, and submitted -> draft when the head returns a report with
-- a note. A published report never changes except to be withdrawn with a
-- reason; a withdrawn one never changes. A correction is a new row with
-- version + 1, allowed only once every earlier version is withdrawn.
-- Reports are never deleted. Every change is audited.

create type public.report_status as enum ('draft', 'submitted', 'approved', 'published', 'withdrawn');

-- report_templates --------------------------------------------------------------
--
-- One per school and term kind. `sections` switches the parts of the report
-- in REPORT_LAYOUT.md section 2 that a school may turn off. The school
-- header, title and period, learner block, subject table (subject, mark,
-- grade) and the platform footer are always printed. Mirrored in
-- src/lib/reports/sections.ts.

create function private.report_section_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'subject_comments', 'teacher_signature', 'average_position', 'attendance',
    'class_comment', 'head_comment', 'head_signature', 'school_stamp',
    'grading_key', 'legal_line', 'verification'
  ];
$$;

-- Defaults from REPORT_LAYOUT.md section 2. A vacation report has no class
-- average, position or class teacher's comment (Q7, Q8) and its head's
-- part is the stamp and "checked by" signature only. A mock report starts
-- like a term report.
create function private.default_report_sections(p_kind public.term_kind)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'subject_comments', true,
    'teacher_signature', true,
    'average_position', p_kind <> 'vacation',
    'attendance', false,
    'class_comment', p_kind <> 'vacation',
    'head_comment', p_kind <> 'vacation',
    'head_signature', true,
    'school_stamp', true,
    'grading_key', true,
    'legal_line', true,
    'verification', true
  );
$$;

-- Exactly the known keys, each true or false; a vacation report cannot show
-- positions or a class teacher's comment, which it never has (Q8).
create function private.report_sections_are_valid(p_sections jsonb, p_kind public.term_kind)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(p_sections) = 'object'
    and (select array_agg(k order by k) from jsonb_object_keys(p_sections) k)
        = (select array_agg(k order by k) from unnest(private.report_section_keys()) k)
    and not exists (
      select 1 from jsonb_each(p_sections) e where jsonb_typeof(e.value) <> 'boolean'
    )
    and (p_kind <> 'vacation'
         or not ((p_sections ->> 'average_position')::boolean
                 or (p_sections ->> 'class_comment')::boolean));
$$;

create table public.report_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  term_kind public.term_kind not null,
  name text not null check (length(trim(name)) between 1 and 80),
  sections jsonb not null,
  -- The legal line (REPORT_LAYOUT section 2).
  footer_text text not null default 'This report is issued without erasure or amendments.'
    check (char_length(footer_text) <= 200),
  -- The subject comment column's heading (Q28).
  comment_label text not null default 'Teacher''s comment'
    check (length(trim(comment_label)) between 1 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, term_kind),
  unique (id, school_id),
  constraint report_templates_sections_valid check (private.report_sections_are_valid(sections, term_kind))
);

comment on table public.report_templates is
  'What a school''s reports show, one per term kind (REPORT_LAYOUT.md section 2, Q28).';

create index report_templates_school_id_idx on public.report_templates (school_id);

create trigger report_templates_set_updated_at
  before update on public.report_templates
  for each row execute function public.set_updated_at();
create trigger report_templates_keep_school_id
  before update on public.report_templates
  for each row execute function private.keep_school_id();

-- A template's kind never changes; it is the row for that kind.
create function private.keep_report_template_kind()
returns trigger
language plpgsql
as $$
begin
  if new.term_kind is distinct from old.term_kind then
    raise exception 'a report template''s term kind cannot change'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger report_templates_keep_kind
  before update on public.report_templates
  for each row execute function private.keep_report_template_kind();

-- Every school gets its three templates with the defaults: new schools by
-- trigger, existing ones here.
create function private.create_report_templates(p_school_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.report_templates (school_id, term_kind, name, sections)
  select p_school_id, k.kind, k.name, private.default_report_sections(k.kind)
  from (values
    ('term'::public.term_kind, 'Term report'),
    ('vacation'::public.term_kind, 'Vacation school report'),
    ('mock'::public.term_kind, 'Mock examination report')
  ) as k (kind, name)
  on conflict (school_id, term_kind) do nothing;
$$;

revoke execute on function private.create_report_templates(uuid) from public;

create function private.school_report_templates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.create_report_templates(new.id);
  return null;
end;
$$;

create trigger schools_report_templates
  after insert on public.schools
  for each row execute function private.school_report_templates();

select private.create_report_templates(id) from public.schools;

-- reports ------------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  term_id uuid not null,
  enrolment_id uuid not null,
  template_id uuid not null,
  version int not null default 1 check (version >= 1),
  status public.report_status not null default 'draft',
  -- Set by the database on insert and never changed.
  reference_code text not null unique,
  verification_code text not null unique,
  average_percent numeric(4, 1) check (average_percent between 0 and 100),
  class_position int check (class_position >= 1),
  class_size int check (class_size >= 1),
  head_comment text check (char_length(head_comment) <= 300),
  -- Workflow stamps: set by the trigger on each transition, never by hand.
  submitted_by uuid references public.profiles (id),
  submitted_at timestamptz,
  return_note text check (char_length(return_note) <= 500),
  returned_by uuid references public.profiles (id),
  returned_at timestamptz,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  published_by uuid references public.profiles (id),
  published_at timestamptz,
  withdrawn_reason text check (char_length(withdrawn_reason) <= 500),
  withdrawn_by uuid references public.profiles (id),
  withdrawn_at timestamptz,
  -- Frozen subject lines, comments, grading key, branding and names.
  snapshot jsonb,
  -- {school_id}/{report_id}/v{version}.pdf in the `reports` bucket.
  pdf_path text,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (term_id, school_id) references public.terms (id, school_id),
  foreign key (enrolment_id, school_id) references public.enrolments (id, school_id),
  foreign key (template_id, school_id) references public.report_templates (id, school_id),
  unique (term_id, enrolment_id, version),
  unique (id, school_id),
  constraint reports_pdf_path_shape check (
    pdf_path is null or pdf_path = school_id::text || '/' || id::text || '/v' || version || '.pdf'
  ),
  constraint reports_published_is_complete check (
    status not in ('published', 'withdrawn') or (snapshot is not null and pdf_path is not null)
  ),
  constraint reports_withdrawn_has_reason check (
    status <> 'withdrawn' or length(trim(coalesce(withdrawn_reason, ''))) > 0
  )
);

comment on table public.reports is
  'A learner''s report for a term, one row per version. Never deleted; frozen once published (D43).';

create index reports_school_id_idx on public.reports (school_id);
create index reports_term_id_status_idx on public.reports (term_id, status);
create index reports_enrolment_id_idx on public.reports (enrolment_id);
-- One live (not withdrawn) version per learner and term.
create unique index reports_one_live_version_idx
  on public.reports (term_id, enrolment_id) where status <> 'withdrawn';
-- The `reports` bucket's read policy looks a PDF up by its path.
create unique index reports_pdf_path_idx on public.reports (pdf_path) where pdf_path is not null;

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();
create trigger reports_keep_school_id
  before update on public.reports
  for each row execute function private.keep_school_id();
create trigger reports_audit
  after insert or update or delete on public.reports
  for each row execute function private.audit_row_change();

-- Reports are never deleted (rule 6): withdraw one instead.
create function private.reports_are_never_deleted()
returns trigger
language plpgsql
as $$
begin
  raise exception 'reports are never deleted; withdraw the report instead';
end;
$$;

create trigger reports_no_delete
  before delete on public.reports
  for each row execute function private.reports_are_never_deleted();
create trigger reports_no_truncate
  before truncate on public.reports
  for each statement execute function private.reports_are_never_deleted();

-- A random code from 32 letters and digits that cannot be confused (no I,
-- O, 0 or 1). 256 is a multiple of 32, so every character is equally likely.
create function private.new_report_code(p_length int)
returns text
language sql
volatile
set search_path = public
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', get_byte(b.bytes, i) % 32 + 1, 1), '' order by i)
  from (select extensions.gen_random_bytes(p_length) as bytes) b,
       generate_series(0, p_length - 1) as i;
$$;

revoke execute on function private.new_report_code(int) from public;

-- Integrity, workflow and immutability. Runs for every writer; the role
-- checks apply to signed-in users (the service role is the server).
create function private.check_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_term public.terms;
  v_class_id uuid;
  v_is_head boolean;
  v_is_class_teacher boolean;
  v_frozen text[] := array['status', 'withdrawn_reason', 'withdrawn_by', 'withdrawn_at', 'updated_at'];
begin
  if tg_op = 'INSERT' then
    -- Signed in: only the class teacher makes drafts, for their own class
    -- (checked first, so nothing about another class's reports leaks).
    if v_uid is not null
       and new.enrolment_id not in (select private.my_class_teacher_enrolment_ids()) then
      raise exception 'only the class teacher makes a draft report' using errcode = '42501';
    end if;

    select * into v_term from public.terms where id = new.term_id and school_id = new.school_id;
    select e.class_id into v_class_id
    from public.enrolments e
    where e.id = new.enrolment_id and e.school_id = new.school_id
      and e.academic_year_id = v_term.academic_year_id;
    if v_term.id is not null and v_class_id is null
       and exists (select 1 from public.enrolments where id = new.enrolment_id and school_id = new.school_id) then
      raise exception 'the learner is not enrolled in this term''s year'
        using errcode = 'check_violation';
    end if;
    if v_term.id is not null and not exists (
      select 1 from public.report_templates rt
      where rt.id = new.template_id and rt.school_id = new.school_id and rt.term_kind = v_term.kind
    ) and exists (select 1 from public.report_templates where id = new.template_id and school_id = new.school_id) then
      raise exception 'the template is for another kind of term'
        using errcode = 'check_violation';
    end if;

    if new.status <> 'draft' then
      raise exception 'a report starts as a draft' using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from public.reports r
      where r.term_id = new.term_id and r.enrolment_id = new.enrolment_id and r.status <> 'withdrawn'
    ) then
      raise exception 'this learner already has a report for this term; withdraw it before issuing a new version'
        using errcode = 'unique_violation';
    end if;

    select coalesce(max(r.version), 0) + 1 into new.version
    from public.reports r
    where r.term_id = new.term_id and r.enrolment_id = new.enrolment_id;
    new.reference_code := private.new_report_code(10);
    new.verification_code := private.new_report_code(24);
    new.created_by := v_uid;
    new.created_at := now();
    new.head_comment := null;
    new.pdf_path := null;
    new.submitted_by := null; new.submitted_at := null;
    new.return_note := null; new.returned_by := null; new.returned_at := null;
    new.approved_by := null; new.approved_at := null;
    new.published_by := null; new.published_at := null;
    new.withdrawn_reason := null; new.withdrawn_by := null; new.withdrawn_at := null;
    return new;
  end if;

  -- UPDATE -----------------------------------------------------------------------

  if old.status = 'withdrawn' then
    raise exception 'a withdrawn report never changes' using errcode = 'check_violation';
  end if;
  if old.status = 'published' then
    if to_jsonb(new) - v_frozen is distinct from to_jsonb(old) - v_frozen
       or new.status not in ('published', 'withdrawn') then
      raise exception 'a published report cannot change; withdraw it and issue a new version'
        using errcode = 'check_violation';
    end if;
  end if;

  if (new.term_id, new.enrolment_id, new.version, new.reference_code, new.verification_code,
      new.created_by, new.created_at)
     is distinct from
     (old.term_id, old.enrolment_id, old.version, old.reference_code, old.verification_code,
      old.created_by, old.created_at) then
    raise exception 'a report''s learner, term, version and codes never change'
      using errcode = 'check_violation';
  end if;

  if not (new.status = old.status
          or (old.status, new.status) in (
            ('draft', 'submitted'), ('submitted', 'draft'), ('submitted', 'approved'),
            ('approved', 'published'), ('published', 'withdrawn'))) then
    raise exception 'a report cannot go from % to %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- Stamps are the database's: keep them unless this change sets them.
  new.submitted_by := old.submitted_by; new.submitted_at := old.submitted_at;
  new.returned_by := old.returned_by; new.returned_at := old.returned_at;
  new.approved_by := old.approved_by; new.approved_at := old.approved_at;
  new.published_by := old.published_by; new.published_at := old.published_at;
  new.withdrawn_by := old.withdrawn_by; new.withdrawn_at := old.withdrawn_at;

  if new.template_id is distinct from old.template_id
     or (new.average_percent, new.class_position, new.class_size)
        is distinct from (old.average_percent, old.class_position, old.class_size) then
    if old.status <> 'draft' then
      raise exception 'only a draft report''s template and results can change'
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from public.report_templates rt join public.terms t on t.kind = rt.term_kind
      where rt.id = new.template_id and t.id = new.term_id
    ) then
      raise exception 'the template is for another kind of term'
        using errcode = 'check_violation';
    end if;
  end if;
  if new.pdf_path is distinct from old.pdf_path and old.status <> 'approved' then
    raise exception 'the PDF is stored when the report is approved and published'
      using errcode = 'check_violation';
  end if;
  if new.return_note is distinct from old.return_note
     and not (old.status = 'submitted' and new.status = 'draft') then
    raise exception 'a return note is written when the head returns a report'
      using errcode = 'check_violation';
  end if;
  if new.withdrawn_reason is distinct from old.withdrawn_reason and new.status <> 'withdrawn' then
    raise exception 'a withdrawal reason is written when a report is withdrawn'
      using errcode = 'check_violation';
  end if;
  if new.head_comment is distinct from old.head_comment and old.status not in ('submitted', 'approved') then
    raise exception 'the head''s comment is written while the report is submitted or approved'
      using errcode = 'check_violation';
  end if;

  case
    when old.status = 'draft' and new.status = 'submitted' then
      new.submitted_by := v_uid; new.submitted_at := now();
    when old.status = 'submitted' and new.status = 'draft' then
      if length(trim(coalesce(new.return_note, ''))) = 0 then
        raise exception 'say why the report is returned' using errcode = 'check_violation';
      end if;
      new.returned_by := v_uid; new.returned_at := now();
    when old.status = 'submitted' and new.status = 'approved' then
      new.approved_by := v_uid; new.approved_at := now();
    when old.status = 'approved' and new.status = 'published' then
      new.published_by := v_uid; new.published_at := now();
    when old.status = 'published' and new.status = 'withdrawn' then
      new.withdrawn_by := v_uid; new.withdrawn_at := now();
    else
      null;
  end case;

  if v_uid is null then
    return new;
  end if;

  -- Who may make this change. RLS already limits the rows; this limits the
  -- columns and transitions per role.
  v_is_head := public.has_role(new.school_id, 'head');
  v_is_class_teacher := new.enrolment_id in (select private.my_class_teacher_enrolment_ids());

  if old.status = 'draft' then
    if not v_is_class_teacher then
      raise exception 'only the class teacher changes or submits a draft report'
        using errcode = '42501';
    end if;
  elsif not v_is_head then
    raise exception 'only the head returns, approves, publishes or withdraws a report'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger reports_check
  before insert or update on public.reports
  for each row execute function private.check_report();

-- report_shares --------------------------------------------------------------------
--
-- Share links for a published report (US-7.x). Only the token's SHA-256
-- hash is stored. Nobody reads or writes this table through the API: the
-- share functions (with the share story) are the only way in.

create table public.report_shares (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  report_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  foreign key (report_id, school_id) references public.reports (id, school_id)
);

comment on table public.report_shares is
  'Share links for published reports, by token hash. No API access; functions only.';

create index report_shares_school_id_idx on public.report_shares (school_id);
create index report_shares_report_id_idx on public.report_shares (report_id);

create trigger report_shares_keep_school_id
  before update on public.report_shares
  for each row execute function private.keep_school_id();

-- Family helpers (DATA_MODEL section 7) --------------------------------------------

-- Learners the current user is a linked guardian of, with an active parent
-- membership in the learner's school.
create function private.my_guardian_learner_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select gl.learner_id
  from public.guardians g
  join public.guardian_links gl on gl.guardian_id = g.id
  where g.user_id = auth.uid()
    and public.has_role(g.school_id, 'parent');
$$;

-- The current user's own learner record, with an active learner membership.
create function private.my_own_learner_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.id
  from public.learners l
  where l.user_id = auth.uid()
    and public.has_role(l.school_id, 'learner');
$$;

create function public.is_guardian_of(p_learner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_learner_id in (select private.my_guardian_learner_ids());
$$;

comment on function public.is_guardian_of(uuid) is
  'Whether the current user is a linked guardian of this learner, with an active parent membership.';

create function public.is_own_learner(p_learner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_learner_id in (select private.my_own_learner_ids());
$$;

comment on function public.is_own_learner(uuid) is
  'Whether this learner record is the current user''s own, with an active learner membership.';

-- Enrolments of the current user's children and of themselves.
create function private.my_family_enrolment_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.enrolments e
  where e.learner_id in (
    select private.my_guardian_learner_ids()
    union
    select private.my_own_learner_ids()
  );
$$;

revoke execute on function private.my_guardian_learner_ids() from public;
revoke execute on function private.my_own_learner_ids() from public;
revoke execute on function private.my_family_enrolment_ids() from public;
grant execute on function private.my_guardian_learner_ids() to authenticated;
grant execute on function private.my_own_learner_ids() to authenticated;
grant execute on function private.my_family_enrolment_ids() to authenticated;
grant execute on function public.is_guardian_of(uuid) to anon, authenticated;
grant execute on function public.is_own_learner(uuid) to anon, authenticated;

-- RLS ---------------------------------------------------------------------------------

alter table public.report_templates enable row level security;
alter table public.reports enable row level security;
alter table public.report_shares enable row level security;

-- report_templates: no insert or delete policy (made by trigger, never removed).
create policy report_templates_select on public.report_templates
  for select to authenticated
  using (public.is_staff(school_id));
create policy report_templates_update on public.report_templates
  for update to authenticated
  using (public.has_role(school_id, 'school_admin'))
  with check (public.has_role(school_id, 'school_admin'));

-- reports: no delete policy (never deleted). The family clause is the one
-- place a per-school rule (for example fees, Q19) would go.
create policy reports_select on public.reports
  for select to authenticated
  using (
    private.is_admin_or_head(school_id)
    or enrolment_id in (select private.my_teaching_enrolment_ids())
    or (status = 'published' and public.has_role(school_id, 'hod'))
    or (status = 'published' and enrolment_id in (select private.my_family_enrolment_ids()))
  );
create policy reports_insert on public.reports
  for insert to authenticated
  with check (enrolment_id in (select private.my_class_teacher_enrolment_ids()));
create policy reports_update on public.reports
  for update to authenticated
  using (
    public.has_role(school_id, 'head')
    or (status = 'draft' and enrolment_id in (select private.my_class_teacher_enrolment_ids()))
  )
  with check (
    public.has_role(school_id, 'head')
    or (status in ('draft', 'submitted')
        and enrolment_id in (select private.my_class_teacher_enrolment_ids()))
  );

-- report_shares: no policies and no privileges for API roles.
revoke all on public.report_shares from anon, authenticated;
revoke delete, truncate on public.reports from anon, authenticated;
revoke delete, truncate on public.report_templates from anon, authenticated;

-- Audit context: a report is about its enrolment's learner and class (D35).
create or replace function private.audit_log_fill_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb;
  v_enrolment uuid;
  v_learner uuid;
  v_class uuid;
  v_class_subject uuid;
begin
  if new.table_name not in (
    'marks', 'subject_comments', 'class_comments', 'enrolments', 'learners',
    'guardian_links', 'assessments', 'class_subject_unlocks', 'reports'
  ) then
    return new;
  end if;

  d := coalesce(new.new_data, new.old_data);
  case new.table_name
    when 'marks' then
      v_enrolment := (d ->> 'enrolment_id')::uuid;
      select a.class_subject_id into v_class_subject
      from public.assessments a where a.id = (d ->> 'assessment_id')::uuid;
    when 'subject_comments' then
      v_enrolment := (d ->> 'enrolment_id')::uuid;
      v_class_subject := (d ->> 'class_subject_id')::uuid;
    when 'class_comments', 'reports' then
      v_enrolment := (d ->> 'enrolment_id')::uuid;
    when 'enrolments' then
      v_learner := (d ->> 'learner_id')::uuid;
      v_class := (d ->> 'class_id')::uuid;
    when 'learners' then
      v_learner := new.row_id;
    when 'guardian_links' then
      v_learner := (d ->> 'learner_id')::uuid;
    else -- assessments, class_subject_unlocks
      v_class_subject := (d ->> 'class_subject_id')::uuid;
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

  new.learner_id := coalesce(new.learner_id, v_learner);
  new.class_id := coalesce(new.class_id, v_class);
  new.class_subject_id := coalesce(new.class_subject_id, v_class_subject);
  return new;
end;
$$;

-- reports bucket -----------------------------------------------------------------------
--
-- Published PDFs at {school_id}/{report_id}/v{version}.pdf. Private. Only the
-- server (service role, which bypasses RLS) writes: there is no insert,
-- update or delete policy. Reading is allowed exactly when the caller can
-- read the report whose pdf_path is the object (the reports policy above
-- runs inside this one), which is what creating a signed URL checks; the
-- app hands out short signed URLs (src/lib/reports/storage.ts).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy reports_pdf_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'reports'
    and exists (select 1 from public.reports r where r.pdf_path = objects.name)
  );

-- report-assets bucket ------------------------------------------------------------------
--
-- The school stamp and the head's signature image, uploaded by the school
-- admin (PNG, JPEG or WebP, 1 MB, checked like the logo, D15). Object names
-- are {school_id}/stamp-<ms>.<ext> and {school_id}/head-signature-<ms>.<ext>,
-- new per upload; old ones stay (no update or delete policy). No read
-- policy: only report rendering (the server) reads them.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-assets', 'report-assets', false, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Whether the object name is a stamp or head's signature in a school where
-- the caller is an active school admin.
create function private.is_report_asset_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_name ~ '^[0-9a-f-]{36}/(stamp|head-signature)-[0-9]{1,15}\.(png|jpg|webp)$'
    and exists (
      select 1
      from public.memberships m
      where m.school_id::text = split_part(p_name, '/', 1)
        and m.user_id = auth.uid()
        and m.role = 'school_admin'
        and m.status = 'active'
    );
$$;

revoke execute on function private.is_report_asset_path(text) from public;
grant execute on function private.is_report_asset_path(text) to authenticated;

create policy report_assets_insert on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'report-assets' and private.is_report_asset_path(name));

-- The school's stamp and signature paths point into its own folder of the
-- report-assets bucket.
alter table public.schools
  add constraint schools_stamp_path_shape check (
    stamp_path is null or stamp_path ~ ('^' || id::text || '/stamp-[0-9]{1,15}\.(png|jpg|webp)$')
  ),
  add constraint schools_head_signature_path_shape check (
    head_signature_path is null
    or head_signature_path ~ ('^' || id::text || '/head-signature-[0-9]{1,15}\.(png|jpg|webp)$')
  );
