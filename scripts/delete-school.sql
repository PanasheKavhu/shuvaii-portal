-- Deletes ONE suspended school and everything in it, for good (D63).
--
-- For test and demo schools only. A real school's data is never deleted
-- this way: suspend it and follow docs/RETENTION.md instead.
--
-- How to run (docs/DEPLOY.md, "Deleting a test school"):
--   1. In the console, open the school and press "Suspend school".
--   2. Supabase dashboard, Storage: in each bucket (school-branding,
--      report-assets, reports, attachments, imports) delete the folder
--      named after the school's id, if there is one. The script lists what
--      is left and stops until the folders are gone.
--   3. Supabase dashboard, SQL Editor: paste this whole file, change the
--      slug on the line marked CHANGE ME, and press Run.
--
-- It refuses unless the school exists and is suspended. Everything happens
-- in one transaction: if any step fails, nothing is deleted. It deletes
-- every row with the school's id, the school itself, and the sign-in
-- accounts of people who belonged to this school only (never a super
-- admin, never anyone who is also in another school). It prints how many
-- rows it deleted from each table, never names or other personal data.
-- The temporary table it reports in disappears when the session ends.

create temp table if not exists deleted_rows (what text, row_count bigint) on commit preserve rows;
truncate deleted_rows;

do $$
declare
  target_slug constant text := 'test-high-school';  -- CHANGE ME: the school's slug
  target public.schools;
  leftover_files bigint;
  t record;
  n bigint;
  people uuid[];
begin
  select * into target from public.schools where slug = target_slug;
  if not found then
    raise exception 'No school has the slug %. Check it in the console.', target_slug;
  end if;
  if target.status <> 'suspended' then
    raise exception '% is not suspended. Suspend it in the console first.', target.name;
  end if;

  select count(*) into leftover_files
  from storage.objects
  where split_part(name, '/', 1) = target.id::text;
  if leftover_files > 0 then
    raise exception '% still has % file(s) in Storage. Delete the folder % in each bucket first: %',
      target.name, leftover_files, target.id,
      (select string_agg(bucket_id || ' (' || c || ')', ', ')
         from (select bucket_id, count(*) c from storage.objects
               where split_part(name, '/', 1) = target.id::text group by bucket_id) b);
  end if;

  -- People whose only memberships are in this school and who are not super
  -- admins: their sign-in accounts go too.
  select coalesce(array_agg(distinct m.user_id), '{}') into people
  from public.memberships m
  where m.school_id = target.id
    and not exists (select 1 from public.memberships o
                    where o.user_id = m.user_id and o.school_id <> target.id)
    and not exists (select 1 from public.platform_admins p where p.user_id = m.user_id);

  -- Triggers off for the school's rows: the append-only and audit triggers
  -- would refuse or record these deletes, and foreign keys are checked by
  -- triggers too, so the tables can be emptied in any order. Same-school
  -- foreign keys (D20, D23) mean no other school's rows point at them.
  set local session_replication_role = replica;

  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'school_id'
      and tb.table_type = 'BASE TABLE'
    order by c.table_name
  loop
    execute format('delete from public.%I where school_id = $1', t.table_name) using target.id;
    get diagnostics n = row_count;
    if n > 0 then
      insert into deleted_rows values (t.table_name, n);
    end if;
  end loop;

  delete from public.schools where id = target.id;
  insert into deleted_rows values ('schools', 1);

  -- Back on, so deleting the accounts also removes their profiles,
  -- recovery codes and Auth sessions through the cascades.
  set local session_replication_role = origin;

  delete from auth.users where id = any(people);
  get diagnostics n = row_count;
  insert into deleted_rows values ('sign-in accounts (people in this school only)', n);
end;
$$;

-- What was deleted. If this shows nothing, the block above stopped with a
-- message and nothing was deleted.
select what, row_count from deleted_rows order by what;
