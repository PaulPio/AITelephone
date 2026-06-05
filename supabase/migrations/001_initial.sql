-- DRIFT initial schema

create extension if not exists "pgcrypto";

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_player_id uuid,
  state text not null default 'LOBBY',
  round int not null default 0,
  max_players int not null default 16,
  min_players int not null default 3,
  config jsonb not null default '{"drawTimerSec":30,"numRounds":4,"styleSuffix":"detailed vivid digital illustration, coherent subject, clean rendering"}'::jsonb,
  reveal_chain_index int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  auth_user_id uuid not null,
  name text not null,
  display_index int,
  socket_id text,
  connected boolean not null default true,
  submitted boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, auth_user_id)
);

alter table public.rooms
  add constraint rooms_host_player_id_fkey
  foreign key (host_player_id) references public.players(id) on delete set null;

create table if not exists public.chains (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  chain_index int not null,
  seed_word text not null,
  unique (room_id, chain_index)
);

create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.chains(id) on delete cascade,
  round int not null,
  type text not null check (type in ('word', 'drawing', 'image')),
  author_player_id uuid references public.players(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists players_room_id_idx on public.players(room_id);
create index if not exists chains_room_id_idx on public.chains(room_id);
create index if not exists links_chain_id_round_idx on public.links(chain_id, round);

-- Storage buckets (run in Supabase dashboard or via API):
-- drawings (public read), ai-images (public read)

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.chains enable row level security;
alter table public.links enable row level security;

create policy "rooms_read_authenticated" on public.rooms
  for select to authenticated using (true);

create policy "players_read_own_room" on public.players
  for select to authenticated
  using (auth.uid() = auth_user_id);

create policy "chains_read_authenticated" on public.chains
  for select to authenticated using (true);

create policy "links_read_authenticated" on public.links
  for select to authenticated using (true);
