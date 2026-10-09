-- Territoire vivant : on garde la trace des cases qu'un autre marcheur nous a prises, pour
-- prévenir à l'ouverture de l'app (cases reprises, cases bientôt libérées) et proposer une
-- boucle pour les défendre.

create table public.conquest_losses (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  x integer not null,
  y integer not null,
  taken_by uuid not null references public.profiles (id) on delete cascade,
  lost_at timestamptz not null default now()
);

create index conquest_losses_user_idx on public.conquest_losses (user_id, lost_at);

-- Aucune lecture directe : on passe par my_territory_alerts, qui ne dit pas qui a pris la case.
alter table public.conquest_losses enable row level security;

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

-- Mes alertes de territoire :
--   lost     : cases qu'on m'a prises ces 7 derniers jours et que je n'ai pas reprises ;
--   expiring : mes cases qui seront libérées dans moins de 2 jours.
create function public.my_territory_alerts()
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
      and c.captured_at < public.conquest_since() + interval '2 days'
    limit 500
  );
$$;

revoke all on function public.my_territory_alerts() from public, anon;
grant execute on function public.my_territory_alerts() to authenticated;
