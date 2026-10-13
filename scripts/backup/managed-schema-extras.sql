-- What `supabase db dump` leaves out because it lives in Supabase's own
-- auth and storage schemas, written as SQL to run after schema.sql
-- (docs/BACKUPS.md): our row-level security policies on storage tables,
-- our triggers on auth and storage tables (such as on_auth_user_created)
-- and the exact privileges on our own objects.
-- The first restore test found the policies and the trigger missing without
-- this file. An empty search_path makes every name in the policies
-- schema-qualified.
set search_path = '';
select format(
  'create policy %I on %I.%I as %s for %s to %s%s%s;',
  policyname, schemaname, tablename, permissive, cmd,
  (select string_agg(quote_ident(r), ', ') from unnest(roles) as r),
  coalesce(' using (' || qual || ')', ''),
  coalesce(' with check (' || with_check || ')', '')
)
from pg_policies
where schemaname in ('auth', 'storage')
union all
select pg_get_triggerdef(t.oid) || ';'
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where c.relnamespace in ('auth'::regnamespace, 'storage'::regnamespace)
  and not t.tgisinternal
  and p.pronamespace in ('public'::regnamespace, 'private'::regnamespace);

-- Exact privileges on our functions, tables and sequences. pg_dump writes
-- grants relative to Postgres's built-in defaults, but a Supabase project
-- grants anon and authenticated everything on objects created in public, so
-- a restore would quietly reopen every function and table we closed (the
-- second restore test found prune_sign_in_attempts() callable by anon).
-- Revoke everything from the API roles, then grant back exactly what the
-- source had.
select format('revoke all on function %s from public, anon, authenticated, service_role;', p.oid::regprocedure)
from pg_proc p
where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace) and p.prokind in ('f', 'p');

select format('grant %s on function %s to %s;', a.privilege_type, p.oid::regprocedure,
              case when a.grantee = 0 then 'public' else quote_ident(r.rolname) end)
from pg_proc p
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
left join pg_roles r on r.oid = a.grantee
where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace) and p.prokind in ('f', 'p')
  and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'));

-- A table-level revoke also takes away column grants, so those come last.
select format('revoke all on %s from public, anon, authenticated, service_role;', c.oid::regclass)
from pg_class c
where c.relnamespace in ('public'::regnamespace, 'private'::regnamespace)
  and c.relkind in ('r', 'v', 'm', 'S', 'p');

select format('grant %s on %s to %s;', a.privilege_type, c.oid::regclass,
              case when a.grantee = 0 then 'public' else quote_ident(r.rolname) end)
from pg_class c
cross join lateral aclexplode(coalesce(
  c.relacl, acldefault((case when c.relkind = 'S' then 's' else 'r' end)::"char", c.relowner)
)) a
left join pg_roles r on r.oid = a.grantee
where c.relnamespace in ('public'::regnamespace, 'private'::regnamespace)
  and c.relkind in ('r', 'v', 'm', 'S', 'p')
  and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'));

select format('grant %s (%I) on %s to %s;', a.privilege_type, att.attname, c.oid::regclass,
              case when a.grantee = 0 then 'public' else quote_ident(r.rolname) end)
from pg_attribute att
join pg_class c on c.oid = att.attrelid
cross join lateral aclexplode(att.attacl) a
left join pg_roles r on r.oid = a.grantee
where c.relnamespace in ('public'::regnamespace, 'private'::regnamespace)
  and att.attacl is not null and not att.attisdropped
  and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'));
