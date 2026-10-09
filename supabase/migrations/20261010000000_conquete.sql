-- Conquête : la carte est découpée en cases d'environ 50 m (tuiles cartographiques au zoom 19).
-- Le dernier marcheur à traverser une case la possède jusqu'à minuit (heure locale).

create table public.conquest_cells (
  x integer not null,
  y integer not null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  -- Jour local du marcheur au moment de la prise : la case redevient libre le lendemain.
  day date not null,
  captured_at timestamptz not null default now(),
  primary key (x, y)
);

create index conquest_cells_owner_day_idx on public.conquest_cells (owner_id, day);

alter table public.conquest_cells enable row level security;

-- On voit les cases de tout le monde, sans savoir à qui elles sont (voir conquest_cells_in_box).
-- Aucune écriture directe : les cases sont prises à l'enregistrement d'un trajet.
create policy "Ses propres cases" on public.conquest_cells
  for select to authenticated using ((select auth.uid()) = owner_id);

-- Case (zoom 19) d'un point.
create function public.conquest_cell_x(p_longitude double precision)
returns integer
language sql
immutable
set search_path = ''
as $$
  select floor((p_longitude + 180) / 360 * 524288)::integer;
$$;

create function public.conquest_cell_y(p_latitude double precision)
returns integer
language sql
immutable
set search_path = ''
as $$
  select floor(
    (1 - ln(tan(radians(p_latitude)) + 1 / cos(radians(p_latitude))) / pi()) / 2 * 524288
  )::integer;
$$;

-- À l'enregistrement d'un trajet, ses cases passent à son auteur.
-- Les 150 premiers et derniers mètres sont ignorés pour ne pas dessiner l'adresse de départ.
create function public.capture_walk_cells()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line extensions.geometry;
  v_length double precision;
  v_day date;
begin
  if new.path is null then
    return new;
  end if;

  v_length := extensions.st_length(new.path);
  if v_length < 400 then
    return new;
  end if;

  select (now() at time zone coalesce(p.timezone, 'Europe/Paris'))::date into v_day
  from public.profiles p where p.id = new.user_id;

  -- Tracé découpé tous les 10 m, sans ses deux bouts.
  v_line := extensions.st_linesubstring(
    extensions.st_segmentize(new.path, 10)::extensions.geometry,
    150 / v_length,
    1 - 150 / v_length
  );

  insert into public.conquest_cells (x, y, owner_id, day, captured_at)
  select distinct
    public.conquest_cell_x(extensions.st_x(pt.geom)),
    public.conquest_cell_y(extensions.st_y(pt.geom)),
    new.user_id,
    coalesce(v_day, current_date),
    now()
  from extensions.st_dumppoints(v_line) pt
  on conflict (x, y) do update
    set owner_id = excluded.owner_id, day = excluded.day, captured_at = excluded.captured_at;

  return new;
exception when others then
  -- Une erreur de conquête ne doit jamais empêcher d'enregistrer le trajet.
  raise warning 'Conquête du trajet % : %', new.id, sqlerrm;
  return new;
end;
$$;

create trigger walks_capture_cells
  after insert on public.walks
  for each row execute function public.capture_walk_cells();

-- Cases prises aujourd'hui dans un rectangle : les miennes et celles des autres, sans leur nom.
create function public.conquest_cells_in_box(
  p_min_x integer,
  p_min_y integer,
  p_max_x integer,
  p_max_y integer
)
returns table (x integer, y integer, mine boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.x, c.y, c.owner_id = (select auth.uid())
  from public.conquest_cells c
  where c.x between p_min_x and p_max_x
    and c.y between p_min_y and p_max_y
    and p_max_x - p_min_x <= 400
    and p_max_y - p_min_y <= 400
    and c.day >= (
      select (now() at time zone coalesce(p.timezone, 'Europe/Paris'))::date
      from public.profiles p where p.id = (select auth.uid())
    )
  limit 5000;
$$;

revoke all on function public.conquest_cells_in_box(integer, integer, integer, integer) from public, anon;
grant execute on function public.conquest_cells_in_box(integer, integer, integer, integer) to authenticated;

-- Mon nombre de cases aujourd'hui.
create function public.my_conquest_count()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.conquest_cells c
  join public.profiles p on p.id = c.owner_id
  where c.owner_id = (select auth.uid())
    and c.day = (now() at time zone p.timezone)::date;
$$;

grant execute on function public.my_conquest_count() to authenticated;
