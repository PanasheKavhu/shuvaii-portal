-- The newsletter screens' database functions (US-8.1 to US-8.4; D50), on top
-- of the announcements tables (20261012080000_announcements.sql, D49).
--
--   save_announcement(school, ..., id)   admin or head: a new draft (id null)
--                                        or an edit of a draft or published
--                                        announcement; never an archived one
--   publish_announcement(id)             admin or head: draft or archived ->
--                                        published, unless its expiry passed
--   archive_announcement(id)             admin or head: draft or published ->
--                                        archived
--   mark_announcement_read(id)           anyone it is addressed to, once,
--                                        while it is live
--   my_news(school)                      my_announcements() narrowed to what
--                                        is live and addressed to the caller
--   my_news_summary(school)              the caller's unread count and the
--                                        newest unread title (menu, home)
--
-- All security invoker: the policies and triggers of D49 still decide (and
-- audit) every write; the functions add the role and state checks and say
-- what went wrong in words. Admin and head see every announcement of their
-- school, so the audience rule is applied here too: the feed, the unread
-- count and the reads hold only announcements the caller is addressed to,
-- and a read count never counts someone outside the audience.

-- Whether the current user is in an announcement's audience, as a set of
-- ids read once per query (the D48 lesson), for the functions below.
create function private.my_audience_announcement_ids(p_school_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.id
  from public.announcements a
  where a.school_id = p_school_id
    and (
      (a.school_id, a.audience) in (select x.school_id, x.audience from private.my_announcement_audiences() x)
      or (a.audience = 'class' and a.class_id in (select private.my_announcement_class_ids()))
    );
$$;

revoke execute on function private.my_audience_announcement_ids(uuid) from public;
grant execute on function private.my_audience_announcement_ids(uuid) to authenticated;

-- Writing -----------------------------------------------------------------------------

create function public.save_announcement(
  p_school_id uuid,
  p_title text,
  p_body text,
  p_audience public.audience_type,
  p_pinned boolean,
  p_announcement_id uuid default null,
  p_class_id uuid default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old public.announcements;
  v_id uuid;
  v_class_id uuid := case when p_audience = 'class' then p_class_id end;
begin
  if not private.is_admin_or_head(p_school_id) then
    raise exception 'only the school admin or head can write announcements' using errcode = '42501';
  end if;
  if p_audience = 'class' and not exists (
    select 1 from public.classes c where c.id = v_class_id and c.school_id = p_school_id
  ) then
    raise exception 'choose the class this announcement is for' using errcode = 'check_violation';
  end if;

  if p_announcement_id is not null then
    select * into v_old
    from public.announcements
    where id = p_announcement_id and school_id = p_school_id
    for update;
    if v_old.id is null then
      raise exception 'announcement not found' using errcode = 'no_data_found';
    end if;
    if v_old.status = 'archived' then
      raise exception 'an archived announcement cannot be edited; publish it again first'
        using errcode = 'check_violation';
    end if;
  end if;

  -- A new expiry must be in the future; an unchanged one may have passed
  -- (fixing a typo in an expired post keeps it expired).
  if p_expires_at is not null and p_expires_at <= now()
     and p_expires_at is distinct from v_old.expires_at then
    raise exception 'the expiry date must be in the future' using errcode = 'check_violation';
  end if;

  if v_old.id is null then
    insert into public.announcements (school_id, title, body, audience, class_id, pinned, expires_at, author_id, status)
    values (p_school_id, btrim(p_title), p_body, p_audience, v_class_id, coalesce(p_pinned, false),
            p_expires_at, auth.uid(), 'draft')
    returning id into v_id;
  else
    update public.announcements
    set title = btrim(p_title),
        body = p_body,
        audience = p_audience,
        class_id = v_class_id,
        pinned = coalesce(p_pinned, false),
        expires_at = p_expires_at
    where id = v_old.id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

comment on function public.save_announcement(uuid, text, text, public.audience_type, boolean, uuid, uuid, timestamptz) is
  'Admin or head: saves a new draft (id null) or edits a draft or published announcement.';

create function public.publish_announcement(p_announcement_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old public.announcements;
begin
  select * into v_old from public.announcements where id = p_announcement_id for update;
  if v_old.id is null then
    raise exception 'announcement not found' using errcode = 'no_data_found';
  end if;
  if not private.is_admin_or_head(v_old.school_id) then
    raise exception 'only the school admin or head can publish announcements' using errcode = '42501';
  end if;
  if v_old.status = 'published' then
    raise exception 'this announcement is already published' using errcode = 'check_violation';
  end if;
  if v_old.expires_at is not null and v_old.expires_at <= now() then
    raise exception 'its expiry date has passed; choose a later one or clear it before publishing'
      using errcode = 'check_violation';
  end if;
  update public.announcements set status = 'published' where id = v_old.id;
end;
$$;

comment on function public.publish_announcement(uuid) is
  'Admin or head: publishes a draft, or an archived announcement again (it keeps its first date).';

create function public.archive_announcement(p_announcement_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old public.announcements;
begin
  select * into v_old from public.announcements where id = p_announcement_id for update;
  if v_old.id is null then
    raise exception 'announcement not found' using errcode = 'no_data_found';
  end if;
  if not private.is_admin_or_head(v_old.school_id) then
    raise exception 'only the school admin or head can archive announcements' using errcode = '42501';
  end if;
  if v_old.status = 'archived' then
    raise exception 'this announcement is already archived' using errcode = 'check_violation';
  end if;
  update public.announcements set status = 'archived' where id = v_old.id;
end;
$$;

comment on function public.archive_announcement(uuid) is
  'Admin or head: archives a draft or published announcement (never deleted).';

-- Reading -----------------------------------------------------------------------------

-- Records that the caller opened it: once, only while it is live, and only
-- if they are in its audience (an admin opening a parents-only post is not a
-- reader). Returns whether a new read was recorded.
create function public.mark_announcement_read(p_announcement_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rows integer;
begin
  insert into public.announcement_reads (school_id, announcement_id, user_id)
  select a.school_id, a.id, auth.uid()
  from public.announcements a
  where a.id = p_announcement_id
    and a.status = 'published'
    and (a.expires_at is null or a.expires_at > now())
    and a.id in (select private.my_audience_announcement_ids(a.school_id))
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

comment on function public.mark_announcement_read(uuid) is
  'Records the caller''s read of a live announcement addressed to them, once.';

-- The caller's news feed (US-8.2): my_announcements() rows that are live
-- and addressed to them, pinned first, then newest first.
create function public.my_news(p_school_id uuid)
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
  select m.*
  from public.my_announcements(p_school_id) m
  where m.is_live
    and m.id in (select private.my_audience_announcement_ids(p_school_id))
  order by m.pinned desc, m.published_at desc, m.id;
$$;

comment on function public.my_news(uuid) is
  'Live announcements addressed to the caller in this school, pinned first, newest first, with an unread flag.';

-- For the menu and the parent and learner home: how many unread, and the
-- newest unread one.
create function public.my_news_summary(p_school_id uuid)
returns table (unread_count integer, latest_id uuid, latest_title text)
language sql
stable
security invoker
set search_path = public
as $$
  with unread as (
    select a.id, a.title, a.published_at
    from public.announcements a
    where a.school_id = p_school_id
      and a.status = 'published'
      and (a.expires_at is null or a.expires_at > now())
      and a.id in (select private.my_audience_announcement_ids(p_school_id))
      and not exists (
        select 1 from public.announcement_reads r
        where r.school_id = a.school_id and r.announcement_id = a.id and r.user_id = auth.uid()
      )
  )
  select
    (select count(*)::int from unread),
    (select u.id from unread u order by u.published_at desc, u.id limit 1),
    (select u.title from unread u order by u.published_at desc, u.id limit 1);
$$;

comment on function public.my_news_summary(uuid) is
  'The caller''s unread announcement count in this school and the newest unread one.';

revoke execute on function public.save_announcement(uuid, text, text, public.audience_type, boolean, uuid, uuid, timestamptz) from public, anon;
revoke execute on function public.publish_announcement(uuid) from public, anon;
revoke execute on function public.archive_announcement(uuid) from public, anon;
revoke execute on function public.mark_announcement_read(uuid) from public, anon;
revoke execute on function public.my_news(uuid) from public, anon;
revoke execute on function public.my_news_summary(uuid) from public, anon;
grant execute on function public.save_announcement(uuid, text, text, public.audience_type, boolean, uuid, uuid, timestamptz) to authenticated;
grant execute on function public.publish_announcement(uuid) to authenticated;
grant execute on function public.archive_announcement(uuid) to authenticated;
grant execute on function public.mark_announcement_read(uuid) to authenticated;
grant execute on function public.my_news(uuid) to authenticated;
grant execute on function public.my_news_summary(uuid) to authenticated;
