-- Souvenirs et image de partage : les tracés de ses propres trajets, simplifiés, en GeoJSON.
-- Le client ne sait pas lire le format binaire des colonnes geography ; cette fonction les
-- renvoie lisibles et allégés (environ 3 m de tolérance). Les droits sont ceux de l'appelant :
-- la règle d'accès de walks ne laisse lire que ses propres trajets.
create or replace function public.my_walk_paths(p_since timestamptz default null)
returns table (id uuid, started_at timestamptz, distance_m integer, path jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    w.id,
    w.started_at,
    w.distance_m,
    extensions.st_asgeojson(
      extensions.st_simplify(w.path::extensions.geometry, 0.00003),
      5
    )::jsonb
  from public.walks w
  where w.user_id = (select auth.uid())
    and w.path is not null
    and (p_since is null or w.started_at >= p_since)
  order by w.started_at desc
  limit 1000;
$$;

revoke execute on function public.my_walk_paths(timestamptz) from public, anon;
grant execute on function public.my_walk_paths(timestamptz) to authenticated;
