alter table public.mods
  drop constraint if exists mods_asset_type_check;

alter table public.mods
  add constraint mods_asset_type_check
  check (asset_type in ('mod', 'schematic', 'resourcepack'));

update storage.buckets
set
  file_size_limit = 262144000,
  allowed_mime_types = array[
    'application/java-archive',
    'application/zip',
    'application/octet-stream',
    'application/gzip',
    'application/x-gzip'
  ]
where id = 'mod-files';
