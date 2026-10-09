-- La Conquête n'est plus un mode à choisir : elle s'active quand l'utilisateur a fait
-- 10 000 pas dans la journée. L'app l'indique à l'enregistrement du trajet (colonne conquers),
-- et seuls ces trajets prennent des cases.

alter table public.walks add column conquers boolean not null default false;

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
  if v_length < 400 then
    return new;
  end if;

  -- Tracé découpé tous les 10 m, sans ses deux bouts.
  v_line := extensions.st_linesubstring(
    extensions.st_segmentize(new.path, 10)::extensions.geometry,
    150 / v_length,
    1 - 150 / v_length
  );

  insert into public.conquest_cells (x, y, owner_id, captured_at)
  select distinct
    public.conquest_cell_x(extensions.st_x(pt.geom)),
    public.conquest_cell_y(extensions.st_y(pt.geom)),
    new.user_id,
    now()
  from extensions.st_dumppoints(v_line) pt
  on conflict (x, y) do update
    set owner_id = excluded.owner_id, captured_at = excluded.captured_at;

  return new;
exception when others then
  -- Une erreur de conquête ne doit jamais empêcher d'enregistrer le trajet.
  raise warning 'Conquête du trajet % : %', new.id, sqlerrm;
  return new;
end;
$$;
