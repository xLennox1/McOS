alter table public.profiles
  drop constraint if exists profiles_role_check;

with ranked_admins as (
  select id, row_number() over (order by created_at asc, id asc) as position
  from public.profiles
  where role = 'admin'
)
update public.profiles as profiles
set role = case when ranked_admins.position = 1 then 'owner' else 'co_owner' end
from ranked_admins
where profiles.id = ranked_admins.id;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'co_owner', 'user'));

create or replace function public.bootstrap_first_admin(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;
  perform pg_advisory_xact_lock(843219204);
  if exists (
    select 1 from public.profiles where role in ('owner', 'co_owner')
  ) then
    return false;
  end if;
  update public.profiles set role = 'owner', status = 'active'
  where id = p_user_id and status = 'pending';
  return found;
end;
$$;

drop policy if exists "Conversation members and admins can read support conversations"
  on public.conversations;
create policy "Conversation members and staff can read support conversations"
  on public.conversations for select to authenticated
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversations.id and cm.user_id = (select auth.uid())
    )
    or (
      kind = 'support'
      and exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.role in ('owner', 'co_owner')
          and p.status = 'active'
      )
    )
  );

drop policy if exists "Members and admins can read their messages" on public.chat_messages;
create policy "Members and staff can read their messages"
  on public.chat_messages for select to authenticated
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = chat_messages.conversation_id
        and cm.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.conversations c
      join public.profiles p on p.id = (select auth.uid())
      where c.id = chat_messages.conversation_id
        and c.kind = 'support'
        and p.role in ('owner', 'co_owner')
        and p.status = 'active'
    )
  );
