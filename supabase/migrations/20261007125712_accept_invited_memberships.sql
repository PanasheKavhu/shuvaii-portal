-- Accepting a staff invite (SPEC US-10.1, docs/DECISIONS.md D14).
--
-- A super admin invites a school's first admin through Supabase Auth, which
-- creates the auth user (and, by trigger, the profile), and adds a
-- membership with status 'invited'. When the invitee opens the email link
-- and sets a password, this function turns their own invited memberships
-- into active ones.
--
-- Security definer because memberships_update only lets a school admin or
-- platform admin write, and the invitee is neither yet. It only ever
-- touches the caller's own rows, only moves 'invited' to 'active' (never
-- re-enables a disabled membership), and changes no role.

create function public.accept_my_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted integer;
begin
  if auth.uid() is null then
    return 0;
  end if;

  update public.memberships
  set status = 'active'
  where user_id = auth.uid()
    and status = 'invited';

  get diagnostics accepted = row_count;
  return accepted;
end;
$$;

comment on function public.accept_my_invites() is
  'Activates the calling user''s invited memberships after they accept an invite. Returns how many.';

revoke execute on function public.accept_my_invites() from public, anon;
grant execute on function public.accept_my_invites() to authenticated;
