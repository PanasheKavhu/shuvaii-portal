-- Row counts of every table in public, auth and storage, one "schema.table,count"
-- line each (docs/BACKUPS.md). Written into the backup as row-counts.csv and
-- compared after a restore. Counts only, never contents.
select format('%I.%I', table_schema, table_name) || ',' ||
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name),
                           false, true, '')))[1]::text
from information_schema.tables
where table_type = 'BASE TABLE'
  and table_schema in ('public', 'auth', 'storage')
order by 1;

-- Structure, so a restore that loses policies, functions or triggers fails
-- the comparison too.
select 'structure.policies,' || count(*) from pg_policies;
select 'structure.functions,' || count(*) from pg_proc
where pronamespace in ('public'::regnamespace, 'private'::regnamespace);
select 'structure.triggers,' || count(*) from pg_trigger where not tgisinternal;
select 'structure.rls_tables,' || count(*) from pg_class
where relrowsecurity and relnamespace = 'public'::regnamespace;
-- What anon, authenticated and service_role may do on our objects, as one
-- fingerprint (a restore must not reopen what the migrations closed).
select 'structure.privileges,' || md5(coalesce(string_agg(entry, ';' order by entry), ''))
from (
  select p.oid::regprocedure::text || ':' || coalesce(r.rolname, 'public') || ':' || a.privilege_type as entry
  from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  left join pg_roles r on r.oid = a.grantee
  where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
    and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))
  union all
  select c.oid::regclass::text || ':' || coalesce(r.rolname, 'public') || ':' || a.privilege_type
  from pg_class c
  cross join lateral aclexplode(coalesce(
    c.relacl, acldefault((case when c.relkind = 'S' then 's' else 'r' end)::"char", c.relowner)
  )) a
  left join pg_roles r on r.oid = a.grantee
  where c.relnamespace in ('public'::regnamespace, 'private'::regnamespace)
    and c.relkind in ('r', 'v', 'm', 'S', 'p')
    and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))
  union all
  select c.oid::regclass::text || '.' || att.attname || ':' || coalesce(r.rolname, 'public') || ':' || a.privilege_type
  from pg_attribute att
  join pg_class c on c.oid = att.attrelid
  cross join lateral aclexplode(att.attacl) a
  left join pg_roles r on r.oid = a.grantee
  where c.relnamespace in ('public'::regnamespace, 'private'::regnamespace)
    and att.attacl is not null and not att.attisdropped
    and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))
) privileges;
