create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (length(username) between 3 and 24),
  role text not null default 'user' check (role in ('admin', 'user')),
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  settings jsonb not null default '{"accent":"cyan","wallpaper":"aurora"}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  used_by uuid references public.profiles(id) on delete set null,
  used_at timestamptz,
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.mods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  category text not null default 'Utility',
  image_url text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mod_versions (
  id uuid primary key default gen_random_uuid(),
  mod_id uuid not null references public.mods(id) on delete cascade,
  version text not null,
  minecraft_version text not null,
  loaders text[] not null default '{}',
  changelog text not null default '',
  file_path text not null unique,
  file_size bigint not null check (file_size > 0 and file_size <= 262144000),
  downloads bigint not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  unique (mod_id, version)
);

create table public.download_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mod_version_id uuid not null references public.mod_versions(id) on delete cascade,
  downloaded_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index invitations_created_at_idx on public.invitations (created_at desc);
create index mod_versions_mod_created_idx on public.mod_versions (mod_id, created_at desc);
create index download_history_user_date_idx on public.download_history (user_id, downloaded_at desc);
create index audit_log_created_at_idx on public.audit_log (created_at desc);

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    split_part(coalesce(new.email, 'player'), '@', 1)
  );
  insert into public.profiles (id, username)
  values (new.id, left(requested_username, 24))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

create or replace function public.redeem_invitation(p_user_id uuid, p_code_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invitations
  set used_by = p_user_id, used_at = now()
  where code_hash = p_code_hash
    and used_by is null
    and not disabled
    and expires_at > now();
  if not found then
    return false;
  end if;
  update public.profiles set status = 'active' where id = p_user_id and status = 'pending';
  return found;
end;
$$;

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
  if exists (select 1 from public.profiles where role = 'admin') then
    return false;
  end if;
  update public.profiles set role = 'admin', status = 'active'
  where id = p_user_id and status = 'pending';
  return found;
end;
$$;

create or replace function public.record_download(p_user_id uuid, p_version_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.mod_versions v
    join public.mods m on m.id = v.mod_id
    where v.id = p_version_id and v.published and m.active
  ) then
    return false;
  end if;
  update public.mod_versions set downloads = downloads + 1 where id = p_version_id;
  insert into public.download_history (user_id, mod_version_id) values (p_user_id, p_version_id);
  return true;
end;
$$;

revoke all on function public.redeem_invitation(uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_invitation(uuid, text) to service_role;
revoke all on function public.bootstrap_first_admin(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_first_admin(uuid) to service_role;
revoke all on function public.record_download(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_download(uuid, uuid) to service_role;
revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.mods enable row level security;
alter table public.mod_versions enable row level security;
alter table public.download_history enable row level security;
alter table public.audit_log enable row level security;

grant select on public.profiles to authenticated;
grant select on public.mods, public.mod_versions to authenticated;
grant select on public.download_history to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "Users can change their own settings"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy "Users can read active mods"
  on public.mods for select to authenticated
  using (
    active and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.status = 'active'
    )
  );
create policy "Users can read published versions"
  on public.mod_versions for select to authenticated
  using (
    published
    and exists (
      select 1 from public.mods where mods.id = mod_versions.mod_id and mods.active
    )
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid()) and profiles.status = 'active'
    )
  );
create policy "Users can read their own download history"
  on public.download_history for select to authenticated
  using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mod-files', 'mod-files', false, 262144000, array['application/java-archive', 'application/zip'])
on conflict (id) do update set public = false, file_size_limit = 262144000;

revoke all on public.invitations, public.audit_log from anon, authenticated;
revoke insert, update, delete on public.profiles, public.mods, public.mod_versions, public.download_history from anon, authenticated;
grant update (settings) on public.profiles to authenticated;
