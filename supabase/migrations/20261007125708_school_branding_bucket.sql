-- Storage bucket for school logos (SPEC US-1.5, DATA_MODEL.md section 8,
-- docs/DECISIONS.md D12 and D15).
--
-- Public read: logos appear on sign-in-free pages and in PDFs, so they are
-- served from the public URL without a policy. Object names start with the
-- school id (`{school_id}/logo-....png`). Only a platform admin may upload
-- or replace objects, matching D3 (branding is platform-admin only). No
-- delete policy: an old logo stays in the bucket when a new one is uploaded
-- (rule 6). SVG is not accepted, because an SVG opened directly from the
-- public URL can run script.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'school-branding',
  'school-branding',
  true,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The first folder of the object name must be an existing school's id.
create function private.is_school_folder(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.schools
    where id::text = (storage.foldername(p_name))[1]
  );
$$;

revoke execute on function private.is_school_folder(text) from public;
grant execute on function private.is_school_folder(text) to authenticated;

create policy school_branding_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'school-branding'
    and public.is_platform_admin()
    and private.is_school_folder(name)
  );

create policy school_branding_update on storage.objects
  for update
  to authenticated
  using (bucket_id = 'school-branding' and public.is_platform_admin())
  with check (
    bucket_id = 'school-branding'
    and public.is_platform_admin()
    and private.is_school_folder(name)
  );
