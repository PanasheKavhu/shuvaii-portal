-- Announcements (DATA_MODEL.md migration order step 7, section 4.6; SPEC
-- US-8.1 to US-8.4; D49): audience_type, announcements,
-- announcement_attachments, announcement_reads, the private `attachments`
-- bucket, my_announcements() and announcement_read_counts().
--
-- Access:
--   announcements             write: the school's school_admin and head
--                             (create, edit, publish, archive, pin). read:
--                             school_admin and head, every announcement in
--                             every state; anyone else only while it is
--                             published and not expired, and only if they
--                             are in its audience. Platform admins get no
--                             read (D5). Never deleted, only archived
--                             (rule 6); every change is audited.
--   announcement_attachments  read: whoever can read the announcement.
--                             write: school_admin and head. At most 3 per
--                             announcement, 5 MB each, PDF, PNG, JPEG or
--                             WebP (a trigger here, the bucket below).
--   announcement_reads        each person inserts and reads only their own
--                             rows, once per announcement they can see.
--                             school_admin and head get counts only, through
--                             announcement_read_counts() (US-8.4).
--
-- Audiences: all (every active member of the school), staff (school_admin,
-- head, hod, teacher), learners, parents, or one class: its class teacher
-- and subject teachers, the learners enrolled in it, and their parents.

create type public.audience_type as enum ('all', 'staff', 'learners', 'parents', 'class');
create type public.announcement_status as enum ('draft', 'published', 'archived');

-- announcements -----------------------------------------------------------------------

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null check (char_length(body) between 1 and 20000),
  audience public.audience_type not null default 'all',
  class_id uuid,
  pinned boolean not null default false,
  status public.announcement_status not null default 'draft',
  -- Set when first published (by the trigger below for signed-in writers).
  published_at timestamptz,
  -- After this the audience no longer sees it; admin and head still do.
  expires_at timestamptz,
  author_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (class_id, school_id) references public.classes (id, school_id),
  constraint announcements_class_audience check ((audience = 'class') = (class_id is not null)),
  constraint announcements_published_has_date check (status <> 'published' or published_at is not null),
  constraint announcements_expires_after_publishing check (
    expires_at is null or published_at is null or expires_at > published_at
  )
);

comment on table public.announcements is
  'School newsletter posts. Drafts and archived posts are seen by school admin and head only; never deleted.';

create index announcements_school_id_idx on public.announcements (school_id);
create index announcements_school_status_published_idx
  on public.announcements (school_id, status, published_at desc);
create index announcements_class_id_idx on public.announcements (class_id) where class_id is not null;

create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();
create trigger announcements_keep_school_id
  before update on public.announcements
  for each row execute function private.keep_school_id();

-- The author is whoever wrote it, and the published date is when it was
-- first published, for every signed-in writer. A published or archived
-- announcement never goes back to draft (its audience has seen it). The
-- service role (no user, the seed) may set both, as the seed does.
create function private.announcement_rules()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.author_id := auth.uid();
      new.published_at := case when new.status = 'published' then now() end;
    elsif new.status = 'published' then
      new.published_at := coalesce(new.published_at, now());
    end if;
    return new;
  end if;

  if new.author_id is distinct from old.author_id then
    raise exception 'the author of an announcement cannot change';
  end if;
  if old.status <> 'draft' and new.status = 'draft' then
    raise exception 'a published or archived announcement cannot go back to draft; archive it instead';
  end if;
  if auth.uid() is not null then
    new.published_at := case
      when new.status = 'published' and old.published_at is null then now()
      else old.published_at
    end;
  elsif new.status = 'published' then
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

create trigger announcements_rules
  before insert or update on public.announcements
  for each row execute function private.announcement_rules();

create function private.announcements_are_never_deleted()
returns trigger
language plpgsql
as $$
begin
  raise exception 'announcements are never deleted; archive them instead';
end;
$$;

create trigger announcements_no_delete
  before delete on public.announcements
  for each row execute function private.announcements_are_never_deleted();
create trigger announcements_no_truncate
  before truncate on public.announcements
  for each statement execute function private.announcements_are_never_deleted();

create trigger announcements_audit
  after insert or update or delete on public.announcements
  for each row execute function private.audit_row_change();

-- announcement_attachments ------------------------------------------------------------
--
-- The file is at {school_id}/{announcement_id}/{filename} in the
-- `attachments` bucket. The app sniffs the file's first bytes and stores it
-- with that type (src/lib/announcements/attachments.ts, as for logos, D15);
-- the bucket refuses anything over 5 MB or of another type.

create function private.announcement_attachment_type(p_filename text)
returns text
language sql
immutable
as $$
  select case lower(substring(p_filename from '\.([A-Za-z0-9]+)$'))
    when 'pdf' then 'application/pdf'
    when 'png' then 'image/png'
    when 'jpg' then 'image/jpeg'
    when 'jpeg' then 'image/jpeg'
    when 'webp' then 'image/webp'
  end
  where p_filename ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$' and p_filename !~ '\.\.';
$$;

create table public.announcement_attachments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id),
  announcement_id uuid not null,
  path text not null unique,
  filename text not null,
  content_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (announcement_id, school_id) references public.announcements (id, school_id),
  unique (announcement_id, filename),
  constraint announcement_attachments_type check (
    private.announcement_attachment_type(filename) is not null
    and content_type = private.announcement_attachment_type(filename)
  ),
  constraint announcement_attachments_path check (
    path = school_id::text || '/' || announcement_id::text || '/' || filename
  )
);

create index announcement_attachments_school_id_idx on public.announcement_attachments (school_id);
create index announcement_attachments_announcement_id_idx
  on public.announcement_attachments (announcement_id);

create trigger announcement_attachments_set_updated_at
  before update on public.announcement_attachments
  for each row execute function public.set_updated_at();
create trigger announcement_attachments_keep_school_id
  before update on public.announcement_attachments
  for each row execute function private.keep_school_id();

-- At most 3 per announcement, none added to an archived one. The
-- announcement row is locked first so two uploads at once cannot both be
-- the third.
create function private.announcement_attachment_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.announcement_status;
begin
  if tg_op = 'UPDATE' and (new.path, new.filename, new.content_type, new.size_bytes, new.announcement_id)
     is distinct from (old.path, old.filename, old.content_type, old.size_bytes, old.announcement_id) then
    raise exception 'an attachment cannot change; remove it and add the new file';
  end if;
  if tg_op = 'INSERT' then
    select status into v_status
    from public.announcements
    where id = new.announcement_id
    for update;
    if v_status = 'archived' then
      raise exception 'an archived announcement cannot get new attachments';
    end if;
    if (select count(*) from public.announcement_attachments
        where announcement_id = new.announcement_id) >= 3 then
      raise exception 'an announcement has at most 3 attachments';
    end if;
  end if;
  return new;
end;
$$;

create trigger announcement_attachments_rules
  before insert or update on public.announcement_attachments
  for each row execute function private.announcement_attachment_rules();

create trigger announcement_attachments_audit
  after insert or update or delete on public.announcement_attachments
  for each row execute function private.audit_row_change();

-- announcement_reads ------------------------------------------------------------------

create table public.announcement_reads (
  school_id uuid not null references public.schools (id),
  announcement_id uuid not null,
  user_id uuid not null references public.profiles (id),
  read_at timestamptz not null default now(),
  primary key (school_id, announcement_id, user_id),
  foreign key (announcement_id, school_id) references public.announcements (id, school_id)
);

create index announcement_reads_school_id_idx on public.announcement_reads (school_id);
create index announcement_reads_user_idx on public.announcement_reads (user_id, announcement_id);
create index announcement_reads_announcement_idx on public.announcement_reads (announcement_id);

-- A signed-in reader's read time is now.
create function private.announcement_read_time()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.read_at := now();
  end if;
  return new;
end;
$$;

create trigger announcement_reads_time
  before insert on public.announcement_reads
  for each row execute function private.announcement_read_time();

-- Audience helpers --------------------------------------------------------------------

-- The broad audiences the current user is in, per school where they hold an
-- active membership: 'all' always, plus 'staff', 'learners' or 'parents' by
-- role.
create function private.my_announcement_audiences()
returns table (school_id uuid, audience public.audience_type)
language sql
stable
security definer
set search_path = public
as $$
  select distinct m.school_id, a.audience
  from public.memberships m
  cross join lateral (values
    ('all'::public.audience_type),
    (case
      when m.role in ('school_admin', 'head', 'hod', 'teacher') then 'staff'::public.audience_type
      when m.role = 'learner' then 'learners'::public.audience_type
      when m.role = 'parent' then 'parents'::public.audience_type
    end)
  ) as a (audience)
  where m.user_id = auth.uid()
    and m.status = 'active'
    and a.audience is not null;
$$;

-- Classes whose class announcements the current user sees: classes they
-- teach in (class teacher or a subject's teacher, active teacher or hod),
-- and the classes they or their children are enrolled in now (enrolled or
-- repeating; not promoted, transferred, left or graduated).
create function private.my_announcement_class_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select private.my_teaching_class_ids()
  union
  select e.class_id
  from public.enrolments e
  where e.status in ('enrolled', 'repeating')
    and e.learner_id in (
      select private.my_guardian_learner_ids()
      union
      select private.my_own_learner_ids()
    );
$$;

-- Everyone an announcement is addressed to, by the same rules as the two
-- helpers above. Used only for counts (announcement_read_counts()).
create function private.announcement_audience(
  p_school_id uuid, p_audience public.audience_type, p_class_id uuid
)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id
  from public.memberships m
  where p_audience <> 'class'
    and m.school_id = p_school_id
    and m.status = 'active'
    and (
      p_audience = 'all'
      or (p_audience = 'staff' and m.role in ('school_admin', 'head', 'hod', 'teacher'))
      or (p_audience = 'learners' and m.role = 'learner')
      or (p_audience = 'parents' and m.role = 'parent')
    )
  union
  select x.user_id
  from (
    select c.class_teacher_id as user_id, array['teacher', 'hod']::public.app_role[] as roles
    from public.classes c
    where c.id = p_class_id
    union all
    select cs.teacher_id, array['teacher', 'hod']::public.app_role[]
    from public.class_subjects cs
    where cs.class_id = p_class_id
    union all
    select l.user_id, array['learner']::public.app_role[]
    from public.enrolments e
    join public.learners l on l.id = e.learner_id
    where e.class_id = p_class_id and e.status in ('enrolled', 'repeating')
    union all
    select g.user_id, array['parent']::public.app_role[]
    from public.enrolments e
    join public.guardian_links gl on gl.learner_id = e.learner_id
    join public.guardians g on g.id = gl.guardian_id
    where e.class_id = p_class_id and e.status in ('enrolled', 'repeating')
  ) as x
  where p_audience = 'class'
    and x.user_id is not null
    and exists (
      select 1
      from public.memberships m
      where m.user_id = x.user_id
        and m.school_id = p_school_id
        and m.status = 'active'
        and m.role = any (x.roles)
    );
$$;

revoke execute on function private.my_announcement_audiences() from public;
revoke execute on function private.my_announcement_class_ids() from public;
revoke execute on function private.announcement_audience(uuid, public.audience_type, uuid) from public;
grant execute on function private.my_announcement_audiences() to authenticated;
grant execute on function private.my_announcement_class_ids() to authenticated;

-- A class's name for the class announcements a parent or learner sees: they
-- have no read of classes (D20). Called only on rows the caller can read.
create function private.announcement_class_name(p_class_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.name from public.classes c where c.id = p_class_id;
$$;

revoke execute on function private.announcement_class_name(uuid) from public;
grant execute on function private.announcement_class_name(uuid) to authenticated;

-- RLS ---------------------------------------------------------------------------------

alter table public.announcements enable row level security;
alter table public.announcement_attachments enable row level security;
alter table public.announcement_reads enable row level security;

-- announcements: no delete policy (never deleted).
create policy announcements_select on public.announcements
  for select to authenticated
  using (
    private.is_admin_or_head(school_id)
    or (
      status = 'published'
      and (expires_at is null or expires_at > now())
      and (
        (school_id, audience) in (select a.school_id, a.audience from private.my_announcement_audiences() a)
        or (audience = 'class' and class_id in (select private.my_announcement_class_ids()))
      )
    )
  );
create policy announcements_insert on public.announcements
  for insert to authenticated
  with check (private.is_admin_or_head(school_id));
create policy announcements_update on public.announcements
  for update to authenticated
  using (private.is_admin_or_head(school_id))
  with check (private.is_admin_or_head(school_id));

-- announcement_attachments: readable with the announcement; added and
-- removed by school admin and head (a removal is audited).
create policy announcement_attachments_select on public.announcement_attachments
  for select to authenticated
  using (exists (select 1 from public.announcements a where a.id = announcement_id));
create policy announcement_attachments_insert on public.announcement_attachments
  for insert to authenticated
  with check (private.is_admin_or_head(school_id));
create policy announcement_attachments_delete on public.announcement_attachments
  for delete to authenticated
  using (private.is_admin_or_head(school_id));

-- announcement_reads: your own rows only, for announcements you can see now
-- (published and not expired; a draft an admin can open is not "read").
create policy announcement_reads_select on public.announcement_reads
  for select to authenticated
  using (user_id = auth.uid());
create policy announcement_reads_insert on public.announcement_reads
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.announcements a
      where a.id = announcement_id
        and a.school_id = announcement_reads.school_id
        and a.status = 'published'
        and (a.expires_at is null or a.expires_at > now())
    )
  );

revoke delete, truncate on public.announcements from anon, authenticated;
revoke update, truncate on public.announcement_attachments from anon, authenticated;
revoke update, delete, truncate on public.announcement_reads from anon, authenticated;

-- What the caller sees (US-8.2) -------------------------------------------------------

-- Every announcement of the school the caller may see, pinned live ones
-- first, then newest first, with whether the caller has read it. School
-- admin and head also get drafts and archived or expired ones (is_live
-- false). Security invoker: the policies above decide, in one query.
create function public.my_announcements(p_school_id uuid)
returns table (
  id uuid,
  title text,
  body text,
  audience public.audience_type,
  class_id uuid,
  class_name text,
  pinned boolean,
  status public.announcement_status,
  published_at timestamptz,
  expires_at timestamptz,
  is_live boolean,
  author_name text,
  attachment_count integer,
  is_unread boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.id, a.title, a.body, a.audience, a.class_id,
    case when a.class_id is not null then private.announcement_class_name(a.class_id) end,
    a.pinned, a.status,
    a.published_at, a.expires_at, l.is_live, p.full_name,
    (select count(*)::int from public.announcement_attachments aa where aa.announcement_id = a.id),
    l.is_live and not exists (
      select 1 from public.announcement_reads r
      where r.school_id = a.school_id and r.announcement_id = a.id and r.user_id = auth.uid()
    )
  from public.announcements a
  cross join lateral (
    select a.status = 'published' and (a.expires_at is null or a.expires_at > now()) as is_live
  ) as l
  left join public.profiles p on p.id = a.author_id
  where a.school_id = p_school_id
  order by (a.pinned and l.is_live) desc, coalesce(a.published_at, a.created_at) desc, a.id;
$$;

comment on function public.my_announcements(uuid) is
  'Announcements the caller may see in this school, pinned live ones first, newest first, with an unread flag.';

-- How many have read each announcement, and how many it is addressed to
-- (US-8.4). School admin and head only; numbers, never who.
create function public.announcement_read_counts(p_school_id uuid)
returns table (announcement_id uuid, read_count integer, audience_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    (select count(*)::int from public.announcement_reads r
     where r.school_id = a.school_id and r.announcement_id = a.id),
    (select count(distinct u)::int
     from private.announcement_audience(a.school_id, a.audience, a.class_id) as u)
  from public.announcements a
  where a.school_id = p_school_id
    and private.is_admin_or_head(p_school_id)
  order by coalesce(a.published_at, a.created_at) desc, a.id;
$$;

comment on function public.announcement_read_counts(uuid) is
  'Per announcement: how many have read it and how many it is addressed to. School admin and head only.';

revoke execute on function public.my_announcements(uuid) from public, anon;
revoke execute on function public.announcement_read_counts(uuid) from public, anon;
grant execute on function public.my_announcements(uuid) to authenticated;
grant execute on function public.announcement_read_counts(uuid) to authenticated;

-- attachments bucket ------------------------------------------------------------------
--
-- Private. Objects at {school_id}/{announcement_id}/{filename}. Uploaded by
-- the school's admin or head while the announcement is not archived, at most
-- 3 objects per announcement folder, 5 MB, PDF, PNG, JPEG or WebP. Read
-- exactly when the caller can read the attachment row (whose policy checks
-- the announcement), which is what creating a signed URL checks; the app
-- hands out 60-second signed URLs made with the viewer's own client
-- (src/lib/announcements/attachments.ts). Admin and head read every object
-- of their school's folder, and may remove one no attachment row points at
-- (after removing the row).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  5242880,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Whether the caller may upload this object: the name's shape, an existing
-- unarchived announcement of that school, the caller its admin or head, and
-- fewer than 3 objects in the folder already.
create function private.can_upload_announcement_attachment(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.announcement_attachment_type(split_part(p_name, '/', 3)) is not null
    and p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
    and exists (
      select 1
      from public.announcements a
      where a.school_id::text = split_part(p_name, '/', 1)
        and a.id::text = split_part(p_name, '/', 2)
        and a.status <> 'archived'
        and private.is_admin_or_head(a.school_id)
    )
    and (
      select count(*)
      from storage.objects o
      where o.bucket_id = 'attachments'
        and o.name like split_part(p_name, '/', 1) || '/' || split_part(p_name, '/', 2) || '/%'
    ) < 3;
$$;

-- Whether the caller is admin or head of the school whose folder this is.
create function private.is_attachments_folder_admin(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.schools s
    where s.id::text = split_part(p_name, '/', 1)
      and private.is_admin_or_head(s.id)
  );
$$;

-- Whether the caller may remove this object: admin or head of its school,
-- and no attachment row points at it.
create function private.can_remove_announcement_attachment(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_attachments_folder_admin(p_name)
    and not exists (select 1 from public.announcement_attachments aa where aa.path = p_name);
$$;

revoke execute on function private.can_upload_announcement_attachment(text) from public;
revoke execute on function private.is_attachments_folder_admin(text) from public;
revoke execute on function private.can_remove_announcement_attachment(text) from public;
grant execute on function private.can_upload_announcement_attachment(text) to authenticated;
grant execute on function private.is_attachments_folder_admin(text) to authenticated;
grant execute on function private.can_remove_announcement_attachment(text) to authenticated;

create policy attachments_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and (
      exists (select 1 from public.announcement_attachments aa where aa.path = objects.name)
      or private.is_attachments_folder_admin(name)
    )
  );

create policy attachments_insert on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'attachments' and private.can_upload_announcement_attachment(name));

create policy attachments_delete on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'attachments' and private.can_remove_announcement_attachment(name));
