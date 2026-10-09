-- Saisons de Conquête : une saison par mois civil (heure de Paris). Le 1er du mois, toutes les
-- cases redeviennent libres pour tout le monde ; le classement de la saison qui se termine est
-- gardé. Au sein d'une saison, une case reste à son conquérant 7 jours au plus.

-- Début de la saison en cours à un instant donné.
create function public.conquest_season_start(p_at timestamptz default now())
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', p_at at time zone 'Europe/Paris') at time zone 'Europe/Paris';
$$;

-- Fin de validité d'une case prise à cet instant : 7 jours, ou la fin de sa saison.
create function public.conquest_expires_at(p_captured_at timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select least(
    p_captured_at + interval '7 days',
    (date_trunc('month', p_captured_at at time zone 'Europe/Paris') + interval '1 month')
      at time zone 'Europe/Paris'
  );
$$;

-- Les cases prises avant cette date sont libres : il y a plus de 7 jours, ou avant la saison.
create or replace function public.conquest_since()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select greatest(now() - interval '7 days', public.conquest_season_start());
$$;

create index conquest_cells_captured_idx on public.conquest_cells (captured_at);

-- Classements des saisons terminées.
create table public.conquest_seasons (
  season_start timestamptz primary key,
  archived_at timestamptz not null default now(),
  players integer not null
);

create table public.conquest_season_results (
  season_start timestamptz not null references public.conquest_seasons (season_start) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  cells integer not null,
  rank integer not null,
  primary key (season_start, user_id)
);

alter table public.conquest_seasons enable row level security;
alter table public.conquest_season_results enable row level security;

create policy "Saisons lisibles" on public.conquest_seasons
  for select to authenticated using (true);
create policy "Ses résultats de saison" on public.conquest_season_results
  for select to authenticated using ((select auth.uid()) = user_id);

-- Fige le classement de la saison précédente, une seule fois. Appelé avant toute nouvelle
-- conquête : les cases de la saison passée sont encore là, telles qu'au dernier jour.
create function public.archive_conquest_season()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_end timestamptz := public.conquest_season_start();
  v_start timestamptz := public.conquest_season_start(v_end - interval '1 day');
  v_players integer;
begin
  if exists (select 1 from public.conquest_seasons s where s.season_start = v_start) then
    return;
  end if;
  -- Un seul archivage à la fois.
  perform pg_advisory_xact_lock(hashtext('archive_conquest_season'));
  if exists (select 1 from public.conquest_seasons s where s.season_start = v_start) then
    return;
  end if;

  -- Ne comptent que les cases encore valables au dernier jour de la saison.
  select count(distinct c.owner_id) into v_players
  from public.conquest_cells c
  where c.captured_at >= v_start
    and c.captured_at < v_end
    and c.captured_at > v_end - interval '7 days';

  insert into public.conquest_seasons (season_start, players) values (v_start, v_players);

  insert into public.conquest_season_results (season_start, user_id, cells, rank)
  select v_start, t.owner_id, t.cells, rank() over (order by t.cells desc)
  from (
    select c.owner_id, count(*)::integer as cells
    from public.conquest_cells c
    where c.captured_at >= v_start
      and c.captured_at < v_end
      and c.captured_at > v_end - interval '7 days'
    group by c.owner_id
  ) t;
end;
$$;

revoke all on function public.archive_conquest_season() from public, anon;

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

-- Bientôt libérées : dans moins de 2 jours, par l'âge de la case ou la fin de la saison.
create or replace function public.my_territory_alerts()
returns table (kind text, x integer, y integer)
language sql
stable
security definer
set search_path = ''
as $$
  (
    select distinct 'lost'::text, l.x, l.y
    from public.conquest_losses l
    join public.conquest_cells c on c.x = l.x and c.y = l.y
    where l.user_id = (select auth.uid())
      and l.lost_at > now() - interval '7 days'
      and c.owner_id <> (select auth.uid())
      and c.captured_at > public.conquest_since()
    limit 500
  )
  union all
  (
    select 'expiring'::text, c.x, c.y
    from public.conquest_cells c
    where c.owner_id = (select auth.uid())
      and c.captured_at > public.conquest_since()
      and public.conquest_expires_at(c.captured_at) < now() + interval '2 days'
    limit 500
  );
$$;

-- Ma saison : dates, mes cases, mon rang parmi tous les conquérants, et la saison passée.
create function public.my_conquest_season()
returns table (
  season_start timestamptz,
  season_end timestamptz,
  cells integer,
  rank integer,
  players integer,
  last_season_start timestamptz,
  last_cells integer,
  last_rank integer,
  last_players integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := public.conquest_season_start();
  v_last timestamptz := public.conquest_season_start(v_start - interval '1 day');
begin
  perform public.archive_conquest_season();
  return query
  with owners as (
    select c.owner_id, count(*)::integer as cells
    from public.conquest_cells c
    where c.captured_at > public.conquest_since()
    group by c.owner_id
  ),
  me as (
    select coalesce((select o.cells from owners o where o.owner_id = auth.uid()), 0) as cells
  )
  select
    v_start,
    (date_trunc('month', v_start at time zone 'Europe/Paris') + interval '1 month')
      at time zone 'Europe/Paris',
    me.cells,
    case when me.cells > 0
      then (select count(*)::integer + 1 from owners o where o.cells > me.cells) end,
    (select count(*)::integer from owners),
    v_last,
    r.cells,
    r.rank,
    s.players
  from me
  left join public.conquest_seasons s on s.season_start = v_last
  left join public.conquest_season_results r
    on r.season_start = v_last and r.user_id = auth.uid();
end;
$$;

revoke all on function public.my_conquest_season() from public, anon;
grant execute on function public.my_conquest_season() to authenticated;
