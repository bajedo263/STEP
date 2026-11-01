-- Audit UX n° 2, lot D : une ligue sans adversaires ne fait plus monter ni descendre.
-- Seul dans son groupe, on était « 1er sur 1 » et promu chaque dimanche sans rien gagner contre
-- personne. Désormais, en dessous de 3 marcheurs dans un groupe, personne ne monte ni ne descend
-- (et l'app affiche « Votre groupe se remplit »). Rien n'est effacé : les niveaux déjà atteints
-- restent acquis.

-- Places qui montent (et qui descendent) : aucune sous 3 marcheurs, sinon comme avant (5 au plus,
-- un tiers du groupe au plus, au moins une qui monte).
create or replace function public.league_movers(p_players integer, p_up boolean)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_players < 3 then 0
    when p_up then greatest(1, least(5, p_players / 3))
    else least(5, p_players / 3)
  end;
$$;

create or replace function public.join_league()
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
      -- Un groupe de moins de 3 marcheurs n'a pas de vrai classement : on y garde son niveau.
      if v_rank.players < 3 then
        null;
      elsif v_rank.steps > 0 and v_rank.rank <= public.league_movers(v_rank.players, true) then
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

