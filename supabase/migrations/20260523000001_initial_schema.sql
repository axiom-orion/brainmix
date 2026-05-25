-- Initial schema: profiles, tracks, mixes + RLS.

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamptz default now()
);

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  bpm numeric,
  hot_cues jsonb default '[null,null,null,null]'::jsonb,
  loop_start numeric,
  loop_end numeric,
  storage_path text not null,
  size bigint default 0,
  created_at timestamptz default now()
);
create index tracks_user_created_idx on public.tracks(user_id, created_at desc);

create table public.mixes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  duration_ms bigint not null,
  storage_path text not null,
  size bigint default 0,
  mime_type text,
  is_public boolean default false,
  share_token text unique default encode(gen_random_bytes(8), 'hex'),
  plays integer default 0,
  created_at timestamptz default now()
);
create index mixes_user_created_idx on public.mixes(user_id, created_at desc);
create index mixes_share_token_idx on public.mixes(share_token);

alter table public.profiles enable row level security;
alter table public.tracks enable row level security;
alter table public.mixes enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

create policy "tracks_select_own" on public.tracks for select using (auth.uid() = user_id);
create policy "tracks_insert_own" on public.tracks for insert with check (auth.uid() = user_id);
create policy "tracks_update_own" on public.tracks for update using (auth.uid() = user_id);
create policy "tracks_delete_own" on public.tracks for delete using (auth.uid() = user_id);

create policy "mixes_select_own_or_public" on public.mixes for select using (auth.uid() = user_id or is_public = true);
create policy "mixes_insert_own" on public.mixes for insert with check (auth.uid() = user_id);
create policy "mixes_update_own" on public.mixes for update using (auth.uid() = user_id);
create policy "mixes_delete_own" on public.mixes for delete using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.increment_mix_plays(token text)
returns void
security definer
set search_path = public
language plpgsql
as $$
begin
  update public.mixes set plays = plays + 1 where share_token = token and is_public = true;
end;
$$;
grant execute on function public.increment_mix_plays(text) to anon, authenticated;
