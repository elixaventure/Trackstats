-- Splitline rider platform: core schema.
-- Column names are the snake_case of the TypeScript model in src/domain/types.ts;
-- the sync layer (src/sync/mapping.ts) relies on that one-to-one mapping.
-- Every id is a UUID generated on the device, so offline-created rows sync with
-- idempotent upserts and never collide.


-- Lookup: track conditions -------------------------------------------------
create table public.conditions (
  code text primary key,
  label text not null,
  is_wet boolean not null default false
);
insert into public.conditions (code, label, is_wet) values
  ('dry', 'Dry', false), ('damp', 'Damp', false), ('wet', 'Wet', true), ('muddy', 'Muddy', true), ('mixed', 'Mixed', true);

-- Riders & bikes ------------------------------------------------------------
-- A user (auth.users) can manage several riders, e.g. a parent and two children.
create table public.rider_profiles (
  id uuid primary key,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  username text not null default '',
  race_number text not null default '',
  rider_class text not null default '',
  age_category text,
  home_region text,
  image_path text,                      -- Supabase Storage path (not yet uploaded by the app)
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  default_bike_id uuid,                 -- no FK: avoids a rider↔bike cycle during offline sync
  created_at timestamptz not null default now()
);
create unique index rider_profiles_username_key on public.rider_profiles (lower(username)) where username <> '';
create index on public.rider_profiles (owner_user_id);

create table public.bikes (
  id uuid primary key,
  rider_id uuid not null references public.rider_profiles (id) on delete cascade,
  manufacturer text not null,
  model text not null,
  capacity text not null default '',
  bike_class text not null default '',
  year int check (year between 1950 and 2100),
  nickname text,
  image_path text,
  archived boolean not null default false
);
create index on public.bikes (rider_id);

-- Groups (family / team / friends) -----------------------------------------
create table public.groups (
  id uuid primary key,
  name text not null,
  kind text not null check (kind in ('family', 'team', 'friends')),
  created_by_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  id uuid primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  rider_id uuid not null references public.rider_profiles (id) on delete cascade,
  role text not null check (role in ('manager', 'rider')),
  joined_at timestamptz not null default now(),
  unique (group_id, rider_id)
);
create index on public.group_members (rider_id);

-- Transponders --------------------------------------------------------------
create table public.transponders (
  id uuid primary key,
  code text not null unique,
  nickname text not null,
  ownership text not null check (ownership in ('personal', 'shared')),
  owner_rider_id uuid references public.rider_profiles (id) on delete set null,
  owner_group_id uuid references public.groups (id) on delete set null,
  battery_pct int check (battery_pct between 0 and 100),
  last_seen_at timestamptz,
  status text not null default 'active' check (status in ('active', 'lost', 'retired')),
  check ((ownership = 'personal' and owner_rider_id is not null) or (ownership = 'shared' and owner_group_id is not null))
);

-- Who wore which tag when. Laps never reference this table: they belong to the
-- session (and therefore the rider), so reassigning a tag can't move history.
create table public.transponder_assignments (
  id uuid primary key,
  transponder_id uuid not null references public.transponders (id) on delete cascade,
  rider_id uuid not null references public.rider_profiles (id) on delete cascade,
  assigned_by_user_id uuid not null references auth.users (id),
  assigned_at timestamptz not null,
  released_at timestamptz,
  check (released_at is null or released_at >= assigned_at)
);
-- A tag can only be worn by one rider at a time.
create unique index transponder_one_active on public.transponder_assignments (transponder_id) where released_at is null;

-- Routes --------------------------------------------------------------------
create table public.routes (
  id uuid primary key,
  name text not null,
  route_type text not null check (route_type in ('mx_circuit', 'enduro_loop', 'point_to_point', 'sprint', 'free_ride')),
  is_loop boolean not null,
  created_by_user_id uuid not null references auth.users (id) on delete cascade,
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  distance_m numeric not null,
  elevation_gain_m numeric,
  gates jsonb not null default '[]',    -- [{role, distanceM, halfWidthM}]
  config_version int not null default 1, -- bumped when geometry/gates/sectors change
  location text,
  created_at timestamptz not null default now()
);
create index on public.routes (visibility);

create table public.route_points (
  route_id uuid not null references public.routes (id) on delete cascade,
  seq int not null,
  lng double precision not null,
  lat double precision not null,
  altitude_m double precision,
  primary key (route_id, seq)
);

create table public.route_sectors (
  id uuid primary key,
  route_id uuid not null references public.routes (id) on delete cascade,
  seq int not null,
  name text not null,
  end_distance_m numeric not null
);
create index on public.route_sectors (route_id);

-- Sessions, raw timing events, derived laps, GPS -----------------------------
create table public.sessions (
  id uuid primary key,
  rider_id uuid not null references public.rider_profiles (id) on delete cascade,
  bike_id uuid references public.bikes (id) on delete set null,
  route_id uuid references public.routes (id) on delete set null,
  route_config_version int,
  transponder_id uuid references public.transponders (id) on delete set null,
  ride_type text not null,
  timing jsonb not null,                -- {mode, pods:[{podId, role}], isLoop}
  condition text not null references public.conditions (code),
  notes text not null default '',
  status text not null check (status in ('active', 'completed', 'abandoned')),
  started_at timestamptz not null,
  ended_at timestamptz,
  summary jsonb,                        -- denormalised SessionSummary for fast lists
  has_gps boolean not null default false,
  simulated boolean not null default false, -- recorded with the simulator; never ranked
  import_info jsonb                     -- set for rides imported from GoPro/GPX/FIT/TCX files
);
create index on public.sessions (rider_id, started_at desc);
create index on public.sessions (route_id, route_config_version);

-- Raw crossings exactly as received (hardware or GPS gate). Laps are derived and
-- can always be recomputed from these.
create table public.timing_events (
  id uuid primary key,
  session_id uuid not null references public.sessions (id) on delete cascade,
  rider_id uuid not null references public.rider_profiles (id) on delete cascade,
  transponder_id uuid references public.transponders (id) on delete set null,
  tag_code text,
  pod_id text not null,
  role text not null,
  source text not null check (source in ('transponder', 'gps', 'manual')),
  at timestamptz not null,
  signal_strength int
);
create index on public.timing_events (session_id, at);

create table public.laps (
  id uuid primary key,
  session_id uuid not null references public.sessions (id) on delete cascade,
  rider_id uuid not null references public.rider_profiles (id) on delete cascade,
  lap_number int not null,
  started_at timestamptz not null,
  duration_ms int not null check (duration_ms > 0),
  splits_ms int[] not null default '{}',
  source text not null check (source in ('transponder', 'gps', 'manual')),
  valid boolean not null default true,
  unique (session_id, lap_number)
);
create index on public.laps (rider_id);

-- ≤1 Hz, filtered on the device (see src/location/sampler.ts): ~3,600 rows per riding hour.
create table public.gps_points (
  session_id uuid not null references public.sessions (id) on delete cascade,
  t timestamptz not null,
  lat double precision not null,
  lng double precision not null,
  accuracy_m real not null,
  speed_mps real,
  heading real,
  altitude_m real,
  primary key (session_id, t)
);

-- Achievements: the app derives these from history; this table lets the server
-- record them (e.g. for notifications) without trusting client counters.
create table public.achievements (
  rider_id uuid not null references public.rider_profiles (id) on delete cascade,
  key text not null,
  achieved_at timestamptz not null,
  session_id uuid references public.sessions (id) on delete set null,
  primary key (rider_id, key)
);

-- Subscriptions (later). Written only by a server-side billing webhook using the service role.
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'active',
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- Public leaderboard: each public rider's best valid lap per session on public
-- routes. Manual laps never rank. Defined as a view so it can't drift from laps;
-- switch to a materialised view refreshed on a schedule when volume demands it.
create view public.leaderboard_entries as
select
  s.id as id,
  s.route_id,
  s.route_config_version,
  r.id as rider_id,
  r.name as rider_name,
  r.race_number,
  coalesce(nullif(b.bike_class, ''), r.rider_class) as rider_class,
  coalesce(b.manufacturer || ' ' || b.model, '') as bike_label,
  s.condition,
  best.source,
  best.duration_ms as lap_ms,
  best.started_at as set_at,
  s.id as session_id
from public.sessions s
join public.rider_profiles r on r.id = s.rider_id and r.visibility = 'public'
join public.routes rt on rt.id = s.route_id and rt.visibility = 'public' and rt.config_version = s.route_config_version
left join public.bikes b on b.id = s.bike_id
join lateral (
  select l.duration_ms, l.started_at, l.source
  from public.laps l
  where l.session_id = s.id and l.valid and l.source <> 'manual'
  order by l.duration_ms
  limit 1
) best on true
where s.status = 'completed' and not s.simulated;
