-- Audit de sécurité du 2026-10-10 : corrections des droits d'accès.

-- 1. Premium ---------------------------------------------------------------
-- Le « revoke update (is_premium) » du schéma initial n'avait aucun effet : un retrait sur une
-- colonne ne compte pas quand le droit UPDATE est accordé sur toute la table, ce que Supabase fait
-- par défaut. N'importe quel utilisateur pouvait donc se passer Premium depuis l'API.
-- On retire le droit sur la table et on n'accorde que les colonnes que l'app modifie.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (username, height_cm, weight_kg, sex, daily_goal, timezone, updated_at)
  on public.profiles to authenticated;

-- 2. Fuseau horaire --------------------------------------------------------
-- my_friends calcule les pas du jour dans le fuseau de chaque ami : un fuseau invalide, écrit
-- directement par l'API, faisait échouer la liste d'amis de tous ses amis.
create function public.is_valid_timezone(p_timezone text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform now() at time zone p_timezone;
  return true;
exception when others then
  return false;
end;
$$;

update public.profiles set timezone = 'Europe/Paris' where not public.is_valid_timezone(timezone);

alter table public.profiles
  add constraint profiles_timezone_valid check (public.is_valid_timezone(timezone));

-- 3. Conquête --------------------------------------------------------------
-- Le tracé d'un trajet vient de l'app : un tracé inventé de centaines de kilomètres prenait
-- d'un coup les cases de toute une ville (et coûtait cher à découper). Au-delà de 100 km,
-- plus qu'une journée à 100 000 pas, le trajet est gardé mais ne conquiert rien.
create or replace function public.capture_walk_cells()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line extensions.geometry;
  v_length double precision;
begin
  if new.path is null or not new.conquers then
    return new;
  end if;

  v_length := extensions.st_length(new.path);
  if v_length < 400 or v_length > 100000 then
    return new;
  end if;

  -- Nouvelle saison : on fige d'abord le classement de la précédente.
  perform public.archive_conquest_season();

  -- Tracé découpé tous les 10 m, sans ses deux bouts.
  v_line := extensions.st_linesubstring(
    extensions.st_segmentize(new.path, 10)::extensions.geometry,
    150 / v_length,
    1 - 150 / v_length
  );

  -- Les deux écritures voient les cases telles qu'elles étaient avant ce trajet.
  with pts as (
    select distinct
      public.conquest_cell_x(extensions.st_x(pt.geom)) as x,
      public.conquest_cell_y(extensions.st_y(pt.geom)) as y
    from extensions.st_dumppoints(v_line) pt
  ),
  losses as (
    insert into public.conquest_losses (user_id, x, y, taken_by)
    select c.owner_id, c.x, c.y, new.user_id
    from public.conquest_cells c
    join pts on pts.x = c.x and pts.y = c.y
    where c.owner_id <> new.user_id
      and c.captured_at > public.conquest_since()
  )
  insert into public.conquest_cells (x, y, owner_id, captured_at)
  select pts.x, pts.y, new.user_id, now()
  from pts
  on conflict (x, y) do update
    set owner_id = excluded.owner_id, captured_at = excluded.captured_at;

  return new;
exception when others then
  -- Une erreur de conquête ne doit jamais empêcher d'enregistrer le trajet.
  raise warning 'Conquête du trajet % : %', new.id, sqlerrm;
  return new;
end;
$$;

-- 4. Fonctions ------------------------------------------------------------
-- Supabase rend toute nouvelle fonction appelable par anon et authenticated. Les fonctions
-- internes (déclencheurs, archivage) ne doivent pas l'être : les déclencheurs et les fonctions
-- SECURITY DEFINER qui les appellent continuent de marcher.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.capture_walk_cells() from public, anon, authenticated;
revoke all on function public.archive_conquest_season() from public, anon, authenticated;

-- Les fonctions « mes … » ne servent qu'aux utilisateurs connectés.
revoke all on function public.poi_zone_stats() from public, anon;
revoke all on function public.my_conquest_count() from public, anon;
revoke all on function public.my_badge_stats() from public, anon;
grant execute on function public.poi_zone_stats() to authenticated;
grant execute on function public.my_conquest_count() to authenticated;
grant execute on function public.my_badge_stats() to authenticated;
