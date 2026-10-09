-- Points d'intérêt rangés par quartier (tuiles au zoom 15), lieux visités et statistiques.

alter table public.pois
  add column latitude double precision,
  add column longitude double precision,
  add column zone_x integer,
  add column zone_y integer,
  add column score smallint not null default 1,
  add column wikipedia_url text;

create index pois_zone_idx on public.pois (zone_x, zone_y);

-- Un quartier est chargé une seule fois depuis OpenStreetMap : son nombre de lieux est fixe.
create table public.poi_zones (
  x integer not null,
  y integer not null,
  poi_count integer not null default 0,
  bbox extensions.geography (Polygon, 4326) not null,
  fetched_at timestamptz not null default now(),
  primary key (x, y)
);

create index poi_zones_bbox_idx on public.poi_zones using gist (bbox);

alter table public.poi_zones enable row level security;

create policy "Quartiers lisibles par les utilisateurs connectés" on public.poi_zones
  for select to authenticated using (true);

-- Enregistre la visite d'un lieu si l'utilisateur en est à moins de 60 m.
-- Renvoie vrai si c'est une nouvelle découverte.
create function public.record_poi_visit(p_poi_id bigint, p_latitude double precision, p_longitude double precision)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_inserted integer;
begin
  if v_user is null then
    raise exception 'Connexion requise';
  end if;

  if not exists (
    select 1 from public.pois p
    where p.id = p_poi_id
      and extensions.st_dwithin(
        p.location,
        extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
        60
      )
  ) then
    return false;
  end if;

  insert into public.poi_visits (user_id, poi_id) values (v_user, p_poi_id)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

revoke all on function public.record_poi_visit(bigint, double precision, double precision) from public, anon;
grant execute on function public.record_poi_visit(bigint, double precision, double precision) to authenticated;

-- Lieux vus sur le total, par quartier où l'utilisateur a marché ou découvert un lieu.
create function public.poi_zone_stats()
returns table (zone_x integer, zone_y integer, total integer, visited integer, label text)
language sql
stable
security invoker
set search_path = ''
as $$
  with my_zones as (
    select p.zone_x as x, p.zone_y as y
    from public.poi_visits v
    join public.pois p on p.id = v.poi_id
    where v.user_id = (select auth.uid())
    union
    select z.x, z.y
    from public.poi_zones z
    where exists (
      select 1 from public.walks w
      where w.user_id = (select auth.uid())
        and w.path is not null
        and extensions.st_intersects(w.path, z.bbox)
    )
  )
  select
    z.x,
    z.y,
    zone.poi_count,
    (
      select count(*)::integer
      from public.poi_visits v
      join public.pois p on p.id = v.poi_id
      where v.user_id = (select auth.uid()) and p.zone_x = z.x and p.zone_y = z.y
    ),
    (
      select p.name from public.pois p
      where p.zone_x = z.x and p.zone_y = z.y
      order by p.score desc, p.id
      limit 1
    )
  from my_zones z
  join public.poi_zones zone on zone.x = z.x and zone.y = z.y
  where zone.poi_count > 0
  order by 4 desc, 3 desc;
$$;

grant execute on function public.poi_zone_stats() to authenticated;
