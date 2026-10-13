alter table public.profiles
  add column if not exists premium boolean not null default false,
  add column if not exists bio text not null default '' check (length(bio) <= 280),
  add column if not exists avatar_path text;

alter table public.mod_versions
  add column if not exists premium_only boolean not null default false;

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  conversation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id),
  unique (sender_id, recipient_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'support')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.friend_requests
  add constraint friend_requests_conversation_id_fkey
  foreign key (conversation_id) references public.conversations(id) on delete set null;

create unique index conversations_one_support_per_user
  on public.conversations (created_by) where kind = 'support';
create unique index friend_requests_one_active_per_pair
  on public.friend_requests (least(sender_id, recipient_id), greatest(sender_id, recipient_id))
  where status in ('pending', 'accepted');

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_one uuid not null references public.profiles(id) on delete cascade,
  user_two uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null unique references public.conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_one < user_two),
  unique (user_one, user_two)
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at);

create table public.mailbox_messages (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_name text not null default 'XLXOS',
  subject text not null check (length(subject) between 1 and 160),
  body text not null check (length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index mailbox_messages_recipient_created_idx
  on public.mailbox_messages (recipient_id, created_at desc);

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.mailbox_messages enable row level security;

grant select on public.friend_requests, public.friendships, public.conversations,
  public.conversation_members, public.chat_messages, public.mailbox_messages to authenticated;
grant update (read_at) on public.mailbox_messages to authenticated;

create policy "Users can read their friend requests"
  on public.friend_requests for select to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));
create policy "Friends can read their friendships"
  on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_one, user_two));
create policy "Conversation members and admins can read support conversations"
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
        where p.id = (select auth.uid()) and p.role = 'admin' and p.status = 'active'
      )
    )
  );
create policy "Users can read their conversation memberships"
  on public.conversation_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Members and admins can read their messages"
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
        and p.role = 'admin'
        and p.status = 'active'
    )
  );
create policy "Users can read their mailbox"
  on public.mailbox_messages for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy "Users can mark their mailbox messages read"
  on public.mailbox_messages for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

revoke insert, update, delete on public.friend_requests, public.friendships,
  public.conversations, public.conversation_members, public.chat_messages,
  public.mailbox_messages from anon, authenticated;

create or replace function public.accept_friend_request(p_request_id uuid, p_actor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.friend_requests%rowtype;
  conversation_uuid uuid;
  first_user uuid;
  second_user uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select * into request_row
  from public.friend_requests
  where id = p_request_id and recipient_id = p_actor_id and status = 'pending'
  for update;

  if not found then
    return null;
  end if;

  first_user := least(request_row.sender_id, request_row.recipient_id);
  second_user := greatest(request_row.sender_id, request_row.recipient_id);
  if exists (
    select 1 from public.friendships
    where user_one = first_user and user_two = second_user
  ) then
    return null;
  end if;

  insert into public.conversations (kind, created_by)
  values ('direct', p_actor_id)
  returning id into conversation_uuid;

  insert into public.conversation_members (conversation_id, user_id)
  values (conversation_uuid, request_row.sender_id),
    (conversation_uuid, request_row.recipient_id);

  insert into public.friendships (user_one, user_two, conversation_id)
  values (first_user, second_user, conversation_uuid);

  update public.friend_requests
  set status = 'accepted', conversation_id = conversation_uuid, updated_at = now()
  where id = p_request_id;

  return conversation_uuid;
end;
$$;

revoke all on function public.accept_friend_request(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_friend_request(uuid, uuid) to service_role;

create or replace function public.deliver_welcome_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status = 'active' then
    insert into public.mailbox_messages (recipient_id, sender_name, subject, body)
    values (
      new.id,
      'XLXOS',
      'Willkommen bei XLXOS',
      'Dein Zugang ist eingerichtet. Entdecke die Mod-Bibliothek, richte deinen Desktop ein und finde andere Mitglieder über ihre Benutzer-ID.'
    );
  end if;
  return new;
end;
$$;

create trigger profile_welcome_message
  after update of status on public.profiles
  for each row execute function public.deliver_welcome_message();

revoke all on function public.deliver_welcome_message() from public, anon, authenticated;

create or replace function public.cleanup_deleted_profile_conversations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.conversations c
  where c.kind = 'direct'
    and not exists (
      select 1 from public.friendships f where f.conversation_id = c.id
    );
  return old;
end;
$$;

create trigger profile_cleanup_conversations
  after delete on public.profiles
  for each row execute function public.cleanup_deleted_profile_conversations();

revoke all on function public.cleanup_deleted_profile_conversations() from public, anon, authenticated;

create or replace function public.publish_mod_version_and_notify(
  p_mod_id uuid,
  p_version text,
  p_minecraft_version text,
  p_loaders text[],
  p_changelog text,
  p_file_path text,
  p_file_size bigint,
  p_premium_only boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  version_uuid uuid;
  mod_name text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select name into mod_name from public.mods where id = p_mod_id and active;
  if not found then
    raise exception 'mod not found';
  end if;

  insert into public.mod_versions (
    mod_id, version, minecraft_version, loaders, changelog, file_path, file_size, premium_only
  )
  values (
    p_mod_id, p_version, p_minecraft_version, p_loaders, p_changelog, p_file_path, p_file_size, p_premium_only
  )
  returning id into version_uuid;

  insert into public.mailbox_messages (recipient_id, sender_name, subject, body)
  select
    profiles.id,
    'XLXOS',
    left('Neue Mod-Version: ' || mod_name, 160),
    left(
      'Die Version ' || p_version || ' für Minecraft ' || p_minecraft_version
        || ' ist jetzt in der Mod-Bibliothek verfügbar.'
        || case when p_premium_only then ' Diese Version ist exklusiv für PRO-Mitglieder.' else '' end
        || case when p_changelog = '' then '' else E'\n\nÄnderungsprotokoll:\n' || p_changelog end,
      5000
    )
  from public.profiles
  where status = 'active';

  return version_uuid;
end;
$$;

revoke all on function public.publish_mod_version_and_notify(uuid, text, text, text[], text, text, bigint, boolean) from public, anon, authenticated;
grant execute on function public.publish_mod_version_and_notify(uuid, text, text, text[], text, text, bigint, boolean) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mailbox_messages'
  ) then
    alter publication supabase_realtime add table public.mailbox_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friend_requests'
  ) then
    alter publication supabase_realtime add table public.friend_requests;
  end if;
end;
$$;
