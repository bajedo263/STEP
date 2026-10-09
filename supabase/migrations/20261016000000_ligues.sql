-- Ligues hebdomadaires : chaque semaine (du lundi au dimanche, heure de Paris), les marcheurs
-- actifs sont répartis en groupes de 30 au plus, par niveau (Bronze, Argent, Or, Platine,
-- Diamant) et classés au nombre de pas de la semaine. En fin de semaine, les premiers montent
-- d'un niveau et les derniers descendent. On rejoint sa ligue en ouvrant l'app.

-- Lundi de la semaine en cours à un instant donné.
create function public.league_week_start(p_at timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('week', p_at at time zone 'Europe/Paris')::date;
$$;

create table public.league_members (
  week date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  tier smallint not null check (tier between 0 and 4),
  group_no integer not null,
  joined_at timestamptz not null default now(),
  primary key (week, user_id)
);

create index league_members_group_idx on public.league_members (week, tier, group_no);

alter table public.league_members enable row level security;

create policy "Ses ligues" on public.league_members
  for select to authenticated using ((select auth.uid()) = user_id);

-- Classement d'un groupe : pas de la semaine, à égalité le premier arrivé devant.
create function public.league_group_ranking(p_week date, p_tier smallint, p_group integer)
returns table (user_id uuid, steps integer, rank integer, players integer)
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select m.user_id, m.joined_at, coalesce(sum(d.steps), 0)::integer as steps
    from public.league_members m
    left join public.daily_steps d
      on d.user_id = m.user_id and d.day between p_week and p_week + 6
    where m.week = p_week and m.tier = p_tier and m.group_no = p_group
    group by m.user_id, m.joined_at
  )
  select
    t.user_id,
    t.steps,
    (row_number() over (order by t.steps desc, t.joined_at))::integer,
    (count(*) over ())::integer
  from totals t;
$$;

revoke all on function public.league_group_ranking(date, smallint, integer) from public, anon, authenticated;

-- Places qui montent (et qui descendent) dans un groupe : 5 au plus, un tiers du groupe au
-- plus, et au moins une qui monte pour qu'un petit groupe puisse progresser.
create function public.league_movers(p_players integer, p_up boolean)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_up then greatest(1, least(5, p_players / 3))
    else least(5, p_players / 3)
  end;
$$;

-- Inscrit l'utilisateur dans la ligue de la semaine, une seule fois : son niveau dépend de son
-- classement de la semaine passée (montée, maintien ou descente, et descente sans aucun pas).
create function public.join_league()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_week date := public.league_week_start();
  v_prev record;
  v_rank record;
  v_tier smallint := 0;
  v_group integer;
begin
  if v_user is null then
    raise exception 'Connexion requise';
  end if;
  if exists (select 1 from public.league_members m where m.week = v_week and m.user_id = v_user) then
    return;
  end if;
  -- Un seul placement à la fois, pour ne pas dépasser 30 dans un groupe.
  perform pg_advisory_xact_lock(hashtext('league:' || v_week::text));
  if exists (select 1 from public.league_members m where m.week = v_week and m.user_id = v_user) then
    return;
  end if;

  select m.week, m.tier, m.group_no into v_prev
  from public.league_members m
  where m.user_id = v_user and m.week < v_week
  order by m.week desc
  limit 1;

  if found then
    v_tier := v_prev.tier;
    -- Seule la semaine juste avant fait monter ou descendre.
    if v_prev.week = v_week - 7 then
      select r.steps, r.rank, r.players into v_rank
      from public.league_group_ranking(v_prev.week, v_prev.tier, v_prev.group_no) r
      where r.user_id = v_user;
      if v_rank.steps > 0 and v_rank.rank <= public.league_movers(v_rank.players, true) then
        v_tier := least(4, v_tier + 1);
      elsif v_rank.steps = 0
        or v_rank.rank > v_rank.players - public.league_movers(v_rank.players, false) then
        v_tier := greatest(0, v_tier - 1);
      end if;
    end if;
  end if;

  select m.group_no into v_group
  from public.league_members m
  where m.week = v_week and m.tier = v_tier
  group by m.group_no
  having count(*) < 30
  order by m.group_no
  limit 1;

  if v_group is null then
    select coalesce(max(m.group_no), 0) + 1 into v_group
    from public.league_members m
    where m.week = v_week and m.tier = v_tier;
  end if;

  insert into public.league_members (week, user_id, tier, group_no)
  values (v_week, v_user, v_tier, v_group);
end;
$$;

revoke all on function public.join_league() from public, anon;
grant execute on function public.join_league() to authenticated;

-- Ligue de la semaine : le groupe classé, et le niveau de la semaine passée pour annoncer
-- une montée ou une descente.
create function public.my_league()
returns table (
  user_id uuid,
  username text,
  steps integer,
  rank integer,
  is_me boolean,
  tier smallint,
  players integer,
  promote integer,
  demote integer,
  week_start date,
  previous_tier smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_week date := public.league_week_start();
  v_me record;
  v_previous smallint;
begin
  perform public.join_league();
  select m.tier, m.group_no into v_me
  from public.league_members m
  where m.week = v_week and m.user_id = v_user;

  select m.tier into v_previous
  from public.league_members m
  where m.week = v_week - 7 and m.user_id = v_user;

  return query
  select
    r.user_id,
    p.username,
    r.steps,
    r.rank,
    r.user_id = v_user,
    v_me.tier,
    r.players,
    public.league_movers(r.players, true),
    public.league_movers(r.players, false),
    v_week,
    v_previous
  from public.league_group_ranking(v_week, v_me.tier, v_me.group_no) r
  join public.profiles p on p.id = r.user_id
  order by r.rank;
end;
$$;

revoke all on function public.my_league() from public, anon;
grant execute on function public.my_league() to authenticated;
