insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mod-covers',
  'mod-covers',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];
