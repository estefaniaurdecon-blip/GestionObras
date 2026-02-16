-- Storage policies for app updates uploads
-- Allow only admins to manage files in the 'app-updates' bucket

-- INSERT (upload)
create policy "Admins can upload app updates"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'app-updates' and public.has_role(auth.uid(), 'admin')
);

-- UPDATE (rename/move/metadata changes)
create policy "Admins can update app updates"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'app-updates' and public.has_role(auth.uid(), 'admin')
)
with check (
  bucket_id = 'app-updates' and public.has_role(auth.uid(), 'admin')
);

-- DELETE
create policy "Admins can delete app updates"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'app-updates' and public.has_role(auth.uid(), 'admin')
);

-- SELECT (listing/downloading): keep public read for this bucket
create policy "Anyone can view app updates"
on storage.objects
for select
using (bucket_id = 'app-updates');