-- Playlists + join table with owner-checked RLS.

create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  created_at timestamptz default now()
);
create index playlists_user_idx on public.playlists(user_id, created_at desc);

create table public.playlist_tracks (
  playlist_id uuid not null references public.playlists on delete cascade,
  track_id uuid not null references public.tracks on delete cascade,
  position integer not null default 0,
  added_at timestamptz default now(),
  primary key (playlist_id, track_id)
);
create index playlist_tracks_playlist_idx on public.playlist_tracks(playlist_id, position);

alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;

create policy "playlists_select_own" on public.playlists for select using (auth.uid() = user_id);
create policy "playlists_insert_own" on public.playlists for insert with check (auth.uid() = user_id);
create policy "playlists_update_own" on public.playlists for update using (auth.uid() = user_id);
create policy "playlists_delete_own" on public.playlists for delete using (auth.uid() = user_id);

create policy "playlist_tracks_select_own" on public.playlist_tracks for select using (
  exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid())
);
create policy "playlist_tracks_insert_own" on public.playlist_tracks for insert with check (
  exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid())
);
create policy "playlist_tracks_delete_own" on public.playlist_tracks for delete using (
  exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid())
);
create policy "playlist_tracks_update_own" on public.playlist_tracks for update using (
  exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid())
);
