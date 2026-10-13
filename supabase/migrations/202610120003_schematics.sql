alter table public.mods
  add column if not exists asset_type text not null default 'mod'
  check (asset_type in ('mod', 'schematic'));

update storage.buckets
set allowed_mime_types = array[
  'application/java-archive',
  'application/zip',
  'application/octet-stream',
  'application/gzip',
  'application/x-gzip'
]
where id = 'mod-files';

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
  content_name text;
  content_type text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select name, asset_type into content_name, content_type
  from public.mods
  where id = p_mod_id and active;
  if not found then
    raise exception 'mod not found';
  end if;

  insert into public.mod_versions (
    mod_id, version, minecraft_version, loaders, changelog, file_path, file_size, premium_only
  )
  values (
    p_mod_id, p_version, p_minecraft_version, p_loaders, p_changelog,
    p_file_path, p_file_size, p_premium_only
  )
  returning id into version_uuid;

  insert into public.mailbox_messages (recipient_id, sender_name, subject, body)
  select
    profiles.id,
    'XLXOS',
    left(
      case when content_type = 'schematic' then 'Neue Vorlage: ' else 'Neue Mod-Version: ' end
        || content_name,
      160
    ),
    left(
      case when content_type = 'schematic' then 'Die Vorlage ' else 'Die Version ' end
        || p_version || ' für Minecraft ' || p_minecraft_version
        || case
          when content_type = 'schematic' then ' ist jetzt im Schematics-Browser verfügbar.'
          else ' ist jetzt in der Mod-Bibliothek verfügbar.'
        end
        || case when p_premium_only then ' Diese Veröffentlichung ist exklusiv für PRO-Mitglieder.' else '' end
        || case when p_changelog = '' then '' else E'\n\nÄnderungsprotokoll:\n' || p_changelog end,
      5000
    )
  from public.profiles
  where status = 'active';

  return version_uuid;
end;
$$;

revoke all on function public.publish_mod_version_and_notify(uuid, text, text, text[], text, text, bigint, boolean)
  from public, anon, authenticated;
grant execute on function public.publish_mod_version_and_notify(uuid, text, text, text[], text, text, bigint, boolean)
  to service_role;
