-- Add public-share tokens to playlists, mirroring how mixes work. RLS opens
-- read access (rows only — audio stays private in storage) when is_public=true.

alter table public.playlists
  add column if not exists is_public boolean default false,
  add column if not exists share_token text unique default encode(gen_random_bytes(8), 'hex');
create index if not exists playlists_share_token_idx on public.playlists(share_token);

-- Allow public read when is_public, otherwise owner-only.
drop policy if exists "playlists_select_own_or_public" on public.playlists;
drop policy if exists "playlists_select_own" on public.playlists;
create policy "playlists_select_own_or_public" on public.playlists
  for select using (auth.uid() = user_id or is_public = true);

-- Join table follows the parent playlist's visibility.
drop policy if exists "playlist_tracks_select_own_or_public" on public.playlist_tracks;
drop policy if exists "playlist_tracks_select_own" on public.playlist_tracks;
create policy "playlist_tracks_select_own_or_public" on public.playlist_tracks
  for select using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id
        and (p.user_id = auth.uid() or p.is_public = true)
    )
  );

-- Allow tracks to be read for display when referenced by a public playlist.
-- (Storage policies still gate the audio bytes — only the row metadata leaks.)
drop policy if exists "tracks_select_own_or_public_playlist" on public.tracks;
create policy "tracks_select_own_or_public_playlist" on public.tracks
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.playlist_tracks pt
      join public.playlists p on p.id = pt.playlist_id
      where pt.track_id = tracks.id and p.is_public = true
    )
  );
drop policy if exists "tracks_select_own" on public.tracks;
