-- Marche libre par défaut : sans trajet lancé, une fois les 10 000 pas du jour atteints, les
-- cases où l'on passe sont prises comme pendant un trajet, y compris celles des autres
-- marcheurs (la perte leur est signalée). Remplace capture_free_cells (migration 20261020),
-- qui ne prenait que les cases libres.

create or replace function public.capture_free_cells(p_points jsonb)
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

  -- Les deux écritures voient les cases telles qu'elles étaient avant cet envoi.
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
  losses as (
    insert into public.conquest_losses (user_id, x, y, taken_by)
    select c.owner_id, c.x, c.y, v_user
    from public.conquest_cells c
    join pts on pts.x = c.x and pts.y = c.y
    where c.owner_id <> v_user
      and c.captured_at > public.conquest_since()
  ),
  taken as (
    insert into public.conquest_cells (x, y, owner_id, captured_at)
    select pts.x, pts.y, v_user, now()
    from pts
    on conflict (x, y) do update
      set owner_id = excluded.owner_id, captured_at = excluded.captured_at
    returning 1
  )
  select count(*) into v_count from taken;
  return v_count;
end;
$$;

revoke all on function public.capture_free_cells(jsonb) from public, anon;
grant execute on function public.capture_free_cells(jsonb) to authenticated;
