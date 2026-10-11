-- The learner and parent portal (SPEC E7, US-7.1 to US-7.5; D47).
--
-- 1. The family's read of reports moves into one helper,
--    private.family_can_read_report(), used by the reports policy and every
--    portal function, so a per-school rule (for example fees, Q19, D39) is
--    still written in one place.
-- 2. public.portal_reports(school): the published reports of the caller's
--    linked children and of themselves, newest term first, from the frozen
--    snapshot. A parent keeps the reports of a child who has left the school
--    (the guardian link and parent membership stay); a learner who has left
--    loses their login, so their own read ends with it (D28).
-- 3. Share links (US-7.3): a family member makes a link to a published
--    report's PDF that works without signing in for 7 days. The token is
--    made here and returned once; only its SHA-256 hash is stored. The owner
--    lists and revokes their own links; withdrawing the report already ends
--    them (D46), and a withdrawn report never opens anyway. Opening a link
--    is the server's job (service role only), which also logs each open in
--    report_share_opens with no personal data (no address, no device). The
--    rate limit per network address is the server's (sign_in_attempts, under
--    a hash, as the verification page does, D45).

-- 1. One family rule ---------------------------------------------------------------

-- Plain SQL (not security definer) so it inlines into the policy.
create function private.family_can_read_report(p_status public.report_status, p_enrolment_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  -- Q19 (D39): parents see published reports directly, with no fee check.
  -- A school's own rule would be added here.
  select p_status = 'published'
    and p_enrolment_id in (select private.my_family_enrolment_ids());
$$;

comment on function private.family_can_read_report(public.report_status, uuid) is
  'Whether the current user may read this report as the learner or a linked parent: published only (Q19: no fee rule).';

revoke execute on function private.family_can_read_report(public.report_status, uuid) from public;
grant execute on function private.family_can_read_report(public.report_status, uuid) to authenticated;

drop policy reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (
    private.is_admin_or_head(school_id)
    or enrolment_id in (select private.my_teaching_enrolment_ids())
    or (status = 'published' and public.has_role(school_id, 'hod'))
    or private.family_can_read_report(status, enrolment_id)
  );

-- Whether a given user (not the caller) is still the learner or a linked
-- parent of a learner, with an active membership. Share links stop working
-- when their owner loses access.
create function private.is_family_user_of(p_user_id uuid, p_learner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.guardians g
    join public.guardian_links gl on gl.guardian_id = g.id
    join public.memberships m
      on m.school_id = g.school_id and m.user_id = g.user_id and m.role = 'parent' and m.status = 'active'
    where g.user_id = p_user_id and gl.learner_id = p_learner_id
  ) or exists (
    select 1
    from public.learners l
    join public.memberships m
      on m.school_id = l.school_id and m.user_id = l.user_id and m.role = 'learner' and m.status = 'active'
    where l.user_id = p_user_id and l.id = p_learner_id
  );
$$;

revoke execute on function private.is_family_user_of(uuid, uuid) from public;

-- 2. The portal's list ---------------------------------------------------------------

create function public.portal_reports(p_school_id uuid)
returns table (
  report_id uuid,
  learner_id uuid,
  is_own boolean,
  learner_name text,
  class_name text,
  year_label text,
  term_name text,
  term_kind public.term_kind,
  version int,
  published_at timestamptz,
  has_pdf boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, e.learner_id,
         e.learner_id in (select private.my_own_learner_ids()),
         r.snapshot -> 'learner' ->> 'name', r.snapshot ->> 'class', r.snapshot ->> 'year',
         r.snapshot -> 'term' ->> 'name', t.kind, r.version, r.published_at, r.pdf_path is not null
  from public.reports r
  join public.enrolments e on e.id = r.enrolment_id
  join public.terms t on t.id = r.term_id
  join public.academic_years y on y.id = t.academic_year_id
  where r.school_id = p_school_id
    and auth.uid() is not null
    and private.family_can_read_report(r.status, r.enrolment_id)
  order by y.starts_on desc, t.starts_on desc, r.snapshot -> 'learner' ->> 'name', r.published_at desc;
$$;

comment on function public.portal_reports(uuid) is
  'US-7.1, US-7.5: published reports of the caller''s linked children and themselves in a school, newest year and term first (D47).';

revoke execute on function public.portal_reports(uuid) from public, anon;
grant execute on function public.portal_reports(uuid) to authenticated;

-- 3. Share links ----------------------------------------------------------------------

alter table public.report_shares add constraint report_shares_id_school_id_key unique (id, school_id);

-- Each time a share link opened the PDF. No address, device or token: just
-- which link and when.
create table public.report_share_opens (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  share_id uuid not null,
  opened_at timestamptz not null default now(),
  foreign key (share_id, school_id) references public.report_shares (id, school_id)
);

comment on table public.report_share_opens is
  'One row per opened share link, with no personal data. No API access; written by open_report_share() (D47).';

create index report_share_opens_school_id_idx on public.report_share_opens (school_id);
create index report_share_opens_share_id_idx on public.report_share_opens (share_id);

alter table public.report_share_opens enable row level security;
revoke all on public.report_share_opens from anon, authenticated;

-- At most this many live links per person and report.
create function private.report_share_limit()
returns int
language sql
immutable
as $$ select 10 $$;

create function public.create_report_share(p_report_id uuid)
returns table (share_id uuid, token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_report public.reports;
  v_token text;
begin
  select * into v_report
  from public.reports r
  where r.id = p_report_id and private.family_can_read_report(r.status, r.enrolment_id);
  if v_uid is null or v_report.id is null then
    raise exception 'only the learner or their parent can share this report' using errcode = '42501';
  end if;
  if v_report.pdf_path is null then
    raise exception 'the PDF of this report is not ready yet' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.report_shares s
      where s.report_id = p_report_id and s.created_by = v_uid
        and s.revoked_at is null and s.expires_at > now()) >= private.report_share_limit() then
    raise exception 'you already have % live links for this report; revoke one first',
      private.report_share_limit() using errcode = 'check_violation';
  end if;

  -- 32 random bytes, base64url without padding: 43 characters.
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  return query
  insert into public.report_shares (school_id, report_id, token_hash, expires_at, created_by)
  values (v_report.school_id, v_report.id, encode(extensions.digest(v_token, 'sha256'), 'hex'),
          now() + interval '7 days', v_uid)
  returning report_shares.id, v_token, report_shares.expires_at;
end;
$$;

comment on function public.create_report_share(uuid) is
  'US-7.3: a link to a published report''s PDF for 7 days. Returns the token once; only its hash is stored (D47).';

-- The caller's own live links for a report, with how often each opened.
create function public.my_report_shares(p_report_id uuid)
returns table (share_id uuid, created_at timestamptz, expires_at timestamptz, opens int)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.created_at, s.expires_at,
         (select count(*)::int from public.report_share_opens o where o.share_id = s.id)
  from public.report_shares s
  join public.reports r on r.id = s.report_id
  where s.report_id = p_report_id
    and s.created_by = auth.uid()
    and s.revoked_at is null
    and s.expires_at > now()
    and private.family_can_read_report(r.status, r.enrolment_id)
  order by s.created_at desc;
$$;

create function public.revoke_report_share(p_share_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.report_shares where id = p_share_id and created_by = auth.uid()
  ) then
    raise exception 'only the person who made a link can revoke it' using errcode = '42501';
  end if;
  update public.report_shares
  set revoked_at = now()
  where id = p_share_id and revoked_at is null;
end;
$$;

-- The server opening a link (service role only): the PDF path when the link
-- is live (not revoked, not expired), the report is still published with
-- its PDF, and the link's owner can still read it. Logs the open.
create function public.open_report_share(p_token_hash text)
returns table (share_id uuid, pdf_path text, reference_code text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_share uuid;
  v_school uuid;
begin
  select s.id, s.school_id, r.pdf_path, r.reference_code
  into v_share, v_school, pdf_path, reference_code
  from public.report_shares s
  join public.reports r on r.id = s.report_id
  join public.enrolments e on e.id = r.enrolment_id
  where s.token_hash = p_token_hash
    and s.revoked_at is null
    and s.expires_at > now()
    and r.status = 'published'
    and r.pdf_path is not null
    and private.is_family_user_of(s.created_by, e.learner_id);
  if v_share is null then
    return;
  end if;
  insert into public.report_share_opens (school_id, share_id) values (v_school, v_share);
  share_id := v_share;
  return next;
end;
$$;

comment on function public.open_report_share(text) is
  'US-7.3: the server opens a share link by its token hash; nothing for a revoked, expired or withdrawn one. Logs the open (D47).';

revoke execute on function public.create_report_share(uuid) from public, anon;
revoke execute on function public.my_report_shares(uuid) from public, anon;
revoke execute on function public.revoke_report_share(uuid) from public, anon;
revoke execute on function public.open_report_share(text) from public, anon, authenticated;
grant execute on function public.create_report_share(uuid) to authenticated;
grant execute on function public.my_report_shares(uuid) to authenticated;
grant execute on function public.revoke_report_share(uuid) to authenticated;
grant execute on function public.open_report_share(text) to service_role;
