-- Persistent live-room metadata. The host's tab still owns the audio (mesh
-- WebRTC), but the room ROW exists in Supabase so listeners can discover
-- rooms, see "host offline" when a tab closes, and resume on restart.

create table if not exists public.live_rooms (
  token text primary key,
  host_user_id uuid references auth.users on delete set null,
  name text not null default 'untitled session',
  is_active boolean default true,
  listener_count integer default 0,
  created_at timestamptz default now(),
  last_active_at timestamptz default now()
);
create index if not exists live_rooms_active_idx on public.live_rooms(is_active, last_active_at desc);

alter table public.live_rooms enable row level security;

drop policy if exists "live_rooms_select_public" on public.live_rooms;
create policy "live_rooms_select_public" on public.live_rooms
  for select using (true);

drop policy if exists "live_rooms_insert_own" on public.live_rooms;
create policy "live_rooms_insert_own" on public.live_rooms
  for insert with check (auth.uid() = host_user_id);

drop policy if exists "live_rooms_update_own" on public.live_rooms;
create policy "live_rooms_update_own" on public.live_rooms
  for update using (auth.uid() = host_user_id);

alter publication supabase_realtime add table public.live_rooms;
