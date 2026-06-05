-- Storage buckets for DRIFT drawings and AI outputs

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('drawings', 'drawings', true, 5242880, array['image/png', 'image/jpeg']),
  ('ai-images', 'ai-images', true, 10485760, array['image/png', 'image/jpeg', 'image/svg+xml'])
on conflict (id) do update set public = excluded.public;

create policy "drawings_public_read"
  on storage.objects for select
  using (bucket_id = 'drawings');

create policy "ai_images_public_read"
  on storage.objects for select
  using (bucket_id = 'ai-images');

create policy "drawings_service_insert"
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'drawings');

create policy "ai_images_service_insert"
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'ai-images');

grant usage on schema public to authenticated;
grant select on public.rooms, public.players, public.chains, public.links to authenticated;
