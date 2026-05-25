-- Enable Supabase Realtime broadcast on library tables so the client can
-- subscribe to inserts/updates/deletes. Used by the live-sync hook in
-- app/page.tsx that re-fetches playlists when changes happen elsewhere.

alter publication supabase_realtime add table public.playlists;
alter publication supabase_realtime add table public.playlist_tracks;
alter publication supabase_realtime add table public.tracks;
