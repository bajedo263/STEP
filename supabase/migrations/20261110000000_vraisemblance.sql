-- Contrôles de vraisemblance côté serveur (audit du 2026-11-09).
-- Les pas, trajets et défis sont déclarés par l'app : quelqu'un qui appelle l'API lui-même pouvait
-- écrire n'importe quoi (un million de pas, des jours futurs, réécrire ses semaines passées,
-- retoucher un trajet après coup) et fausser ligues, duels, séries et records.
-- Ces garde-fous ne gênent pas l'app, qui n'écrit que la journée en cours et des trajets qu'on
-- vient de finir. Ils ne remplacent pas une vraie vérification (Santé), prévue avec le build natif.

-- Au-delà, ce n'est plus de la marche : le record du monde sur 24 h tourne autour de 300 km.
create function public.max_daily_steps()
returns integer
language sql
immutable
set search_path = ''
as $$ select 120000 $$;

-- 1. Pas quotidiens ---------------------------------------------------------
-- Jours acceptés : d'il y a 7 jours à demain (UTC, pour couvrir tous les fuseaux). Le passé plus
-- ancien est figé : on ne se refabrique pas une série ou une semaine de ligue.
create function public.check_daily_steps()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  if new.day > v_today + 1 then
    raise exception 'Jour dans le futur' using errcode = 'check_violation';
  end if;
  if new.day < v_today - 7 then
    raise exception 'Jour trop ancien pour être modifié' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.day <> old.day then
    raise exception 'Le jour d''une ligne ne se change pas' using errcode = 'check_violation';
  end if;
  -- Un total invraisemblable est plafonné plutôt que refusé : la synchronisation continue.
  new.steps := least(new.steps, public.max_daily_steps());
  return new;
end;
$$;

create trigger daily_steps_check
  before insert or update on public.daily_steps
  for each row execute function public.check_daily_steps();

-- 2. Trajets ----------------------------------------------------------------
-- Un trajet s'enregistre quand on le termine : ni dans le futur, ni des semaines plus tard.
create function public.check_walk()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ended_at is not null and new.ended_at < new.started_at then
    raise exception 'Trajet terminé avant d''avoir commencé' using errcode = 'check_violation';
  end if;
  -- Une heure de marge pour une horloge de téléphone mal réglée.
  if new.started_at > now() + interval '1 hour'
    or coalesce(new.ended_at, new.started_at) > now() + interval '1 hour' then
    raise exception 'Trajet dans le futur' using errcode = 'check_violation';
  end if;
  if coalesce(new.ended_at, new.started_at) < now() - interval '7 days' then
    raise exception 'Trajet trop ancien pour être enregistré' using errcode = 'check_violation';
  end if;
  -- (least ignore les valeurs nulles : un trajet sans pas doit le rester.)
  if new.steps is not null then
    new.steps := least(new.steps, public.max_daily_steps());
  end if;
  return new;
end;
$$;

create trigger walks_check
  before insert on public.walks
  for each row execute function public.check_walk();

-- L'app n'a jamais modifié un trajet enregistré : on retire ce droit, pour qu'un trajet ne puisse
-- pas être rallongé après coup. (La suppression reste possible, comme celle du compte.)
revoke update on public.walks from anon, authenticated;

-- 3. Défis du jour ----------------------------------------------------------
-- Un défi se valide le jour même (à un jour près, selon le fuseau).
create function public.check_challenge_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  if new.day > v_today + 1 or new.day < v_today - 1 then
    raise exception 'Un défi se valide le jour même' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger challenge_completions_check
  before insert on public.challenge_completions
  for each row execute function public.check_challenge_completion();

-- Fonctions internes : appelées par les déclencheurs seulement.
revoke all on function public.check_daily_steps() from public, anon, authenticated;
revoke all on function public.check_walk() from public, anon, authenticated;
revoke all on function public.check_challenge_completion() from public, anon, authenticated;
