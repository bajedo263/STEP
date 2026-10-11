-- Conquête sans trajet : une fois les 10 000 pas du jour atteints, l'app colore les cases libres
-- où l'on passe, même sans avoir lancé de trajet. Elle envoie les positions suivies pendant
-- qu'elle est ouverte ; seules les cases libres (ou déjà à soi) sont prises : prendre la case
-- d'un autre marcheur reste réservé aux trajets enregistrés.

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
