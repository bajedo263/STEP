-- Schéma initial de STEP : profils, pas quotidiens, trajets, points d'intérêt.
-- Les tables du mode Conquête et des amis arriveront avec la V2.

create extension if not exists postgis with schema extensions;

-- Profils ------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (char_length(username) between 3 and 30),
  height_cm smallint check (height_cm between 100 and 250),
  weight_kg numeric(5, 1) check (weight_kg between 25 and 300),
  sex text not null default 'unspecified' check (sex in ('female', 'male', 'unspecified')),
  daily_goal integer not null default 10000 check (daily_goal between 1000 and 100000),
  timezone text not null default 'Europe/Paris',
  is_premium boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Lecture de son profil" on public.profiles
  for select using ((select auth.uid()) = id);
create policy "Mise à jour de son profil" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- `is_premium` n'est modifiable que par le backend (webhook RevenueCat).
revoke update (is_premium) on public.profiles from authenticated;

-- Crée automatiquement le profil à l'inscription.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Pas quotidiens (synchronisés depuis HealthKit / Health Connect) ----------

create table public.daily_steps (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  steps integer not null default 0 check (steps >= 0),
  distance_m integer check (distance_m >= 0),
  calories_kcal integer check (calories_kcal >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.daily_steps enable row level security;

create policy "Gestion de ses pas" on public.daily_steps
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Trajets réalisés ---------------------------------------------------------

create table public.walks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('loop', 'destination', 'free')),
  path extensions.geography (LineString, 4326),
  started_at timestamptz not null,
  ended_at timestamptz,
  steps integer check (steps >= 0),
  distance_m integer check (distance_m >= 0),
  calories_kcal integer check (calories_kcal >= 0),
  created_at timestamptz not null default now()
);

create index walks_user_started_idx on public.walks (user_id, started_at desc);

alter table public.walks enable row level security;

create policy "Gestion de ses trajets" on public.walks
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Points d'intérêt (importés depuis OpenStreetMap / Wikidata) -------------

create table public.pois (
  id bigint generated always as identity primary key,
  osm_id text unique,
  wikidata_id text,
  name text not null,
  category text not null,
  location extensions.geography (Point, 4326) not null,
  image_url text,
  description text
);

create index pois_location_idx on public.pois using gist (location);

alter table public.pois enable row level security;

create policy "POI lisibles par les utilisateurs connectés" on public.pois
  for select to authenticated using (true);

create table public.poi_visits (
  user_id uuid not null references public.profiles (id) on delete cascade,
  poi_id bigint not null references public.pois (id) on delete cascade,
  visited_at timestamptz not null default now(),
  primary key (user_id, poi_id)
);

alter table public.poi_visits enable row level security;

create policy "Lecture de ses POI découverts" on public.poi_visits
  for select using ((select auth.uid()) = user_id);
-- L'ajout d'une visite passera par une fonction serveur qui vérifie la distance au POI.
