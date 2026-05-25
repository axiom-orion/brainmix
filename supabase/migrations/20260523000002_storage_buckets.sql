-- Storage buckets + per-path RLS policies.

insert into storage.buckets (id, name, public)
values ('tracks', 'tracks', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('mixes', 'mixes', true)
on conflict (id) do update set public = true;

-- tracks bucket: owner-only by path convention <user_id>/<id>
create policy "tracks_owner_select" on storage.objects
  for select using (
    bucket_id = 'tracks' and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "tracks_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'tracks' and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "tracks_owner_update" on storage.objects
  for update using (
    bucket_id = 'tracks' and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "tracks_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'tracks' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- mixes bucket: owner can manage; reads are public via unguessable random path.
create policy "mixes_owner_select" on storage.objects
  for select using (
    bucket_id = 'mixes' and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "mixes_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'mixes' and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "mixes_owner_update" on storage.objects
  for update using (
    bucket_id = 'mixes' and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "mixes_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'mixes' and auth.uid()::text = (storage.foldername(name))[1]
  );
