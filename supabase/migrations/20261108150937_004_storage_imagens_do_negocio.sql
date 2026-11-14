-- Bucket público para leitura (logos/capas/fotos aparecem na página pública),
-- escrita só do proprietário e só na pasta do seu negócio: {business_id}/ficheiro.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-assets', 'business-assets', true, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy assets_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'business-assets'
         and (storage.foldername(name))[1] = (select app_private.my_business_id())::text);

create policy assets_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'business-assets'
              and (storage.foldername(name))[1] = (select app_private.my_business_id())::text);

create policy assets_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'business-assets'
         and (storage.foldername(name))[1] = (select app_private.my_business_id())::text)
  with check (bucket_id = 'business-assets'
              and (storage.foldername(name))[1] = (select app_private.my_business_id())::text);

create policy assets_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'business-assets'
         and (storage.foldername(name))[1] = (select app_private.my_business_id())::text);

-- Os caminhos guardados nas tabelas só podem apontar para a pasta do próprio negócio.
alter table public.businesses
  add constraint businesses_logo_path_pasta check (logo_path is null or logo_path like id::text || '/%'),
  add constraint businesses_cover_path_pasta check (cover_path is null or cover_path like id::text || '/%');
alter table public.professionals
  add constraint professionals_photo_path_pasta check (photo_path is null or photo_path like business_id::text || '/%');
