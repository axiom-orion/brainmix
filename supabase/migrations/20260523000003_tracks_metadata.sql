-- Add ID3 / media metadata columns to tracks.
alter table public.tracks
  add column if not exists artist text,
  add column if not exists album text,
  add column if not exists year integer,
  add column if not exists duration_sec numeric,
  add column if not exists cover_path text;
