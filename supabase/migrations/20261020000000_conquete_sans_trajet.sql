-- Conquête sans trajet : une fois les 10 000 pas du jour atteints, l'app colore les cases libres
-- où l'on passe, même sans avoir lancé de trajet. Elle envoie les positions suivies pendant
-- qu'elle est ouverte ; seules les cases libres (ou déjà à soi) sont prises : prendre la case
-- d'un autre marcheur reste réservé aux trajets enregistrés.
--
-- Garde-fou de vitesse (vélo, voiture) : l'app écarte les positions prises à plus de 15 km/h,
-- et un trajet enregistré à plus de 15 km/h de moyenne ne prend plus de cases.

create function public.capture_free_cells(p_points jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  if v_user is null or jsonb_typeof(p_points) <> 'array' then
    return 0;
  end if;
  -- Un envoi couvre quelques minutes de marche, pas une ville entière.
  if jsonb_array_length(p_points) = 0 or jsonb_array_length(p_points) > 50 then
    return 0;
  end if;
  -- Plafond par jour, comme les trajets (100 km) : environ 2 000 cases.
  if (
    select count(*) from public.conquest_cells c
    where c.owner_id = v_user and c.captured_at > date_trunc('day', now())
  ) >= 2000 then
    return 0;
  end if;

  perform public.archive_conquest_season();

  with pts as (
    select distinct
      public.conquest_cell_x((p ->> 'longitude')::double precision) as x,
      public.conquest_cell_y((p ->> 'latitude')::double precision) as y
    from jsonb_array_elements(p_points) p
    where jsonb_typeof(p -> 'latitude') = 'number'
      and jsonb_typeof(p -> 'longitude') = 'number'
      and (p ->> 'latitude')::double precision between -85 and 85
      and (p ->> 'longitude')::double precision between -180 and 180
  ),
  taken as (
    insert into public.conquest_cells (x, y, owner_id, captured_at)
    select pts.x, pts.y, v_user, now()
    from pts
    on conflict (x, y) do update
      set owner_id = excluded.owner_id, captured_at = excluded.captured_at
      -- Case libre (expirée) ou déjà à soi (elle est renouvelée) ; jamais celle d'un autre.
      where public.conquest_cells.owner_id = excluded.owner_id
        or public.conquest_cells.captured_at <= public.conquest_since()
    returning 1
  )
  select count(*) into v_count from taken;
  return v_count;
end;
$$;

revoke all on function public.capture_free_cells(jsonb) from public, anon;
grant execute on function public.capture_free_cells(jsonb) to authenticated;

-- Trajets : même garde-fou de vitesse (le reste est inchangé depuis la migration Sécurité).
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

  -- Garde-fou de vitesse : un trajet fait en moyenne à plus de 15 km/h (vélo, voiture,
  -- transports) ne conquiert rien. La course à pied reste en dessous.
  if new.ended_at is not null
    and new.ended_at > new.started_at
    and v_length / extract(epoch from new.ended_at - new.started_at) > 15 / 3.6 then
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

revoke all on function public.capture_walk_cells() from public, anon, authenticated;
