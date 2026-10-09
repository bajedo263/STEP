-- Amis, la suite : encourager un ami (une fois par jour) et le défier en duel sur quelques
-- jours, le plus de pas gagne. Les invitations par lien réutilisent send_friend_request.

-- Jour en cours à l'heure de Paris.
create function public.paris_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Paris')::date;
$$;

create function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friend_requests r
    where r.accepted_at is not null
      and ((r.from_id = p_a and r.to_id = p_b) or (r.from_id = p_b and r.to_id = p_a))
  );
$$;

revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;

-- Encouragements ---------------------------------------------------------

create table public.cheers (
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (from_id, to_id, day)
);

create index cheers_to_idx on public.cheers (to_id, day);

alter table public.cheers enable row level security;

create policy "Ses encouragements" on public.cheers
  for select to authenticated
  using ((select auth.uid()) in (from_id, to_id));

-- Encourage un ami : 'sent', 'already' (déjà fait aujourd'hui) ou 'not_friend'.
create function public.send_cheer(p_friend uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Connexion requise';
  end if;
  if not public.are_friends(v_me, p_friend) then
    return 'not_friend';
  end if;
  insert into public.cheers (from_id, to_id, day)
  values (v_me, p_friend, public.paris_today())
  on conflict do nothing;
  return case when found then 'sent' else 'already' end;
end;
$$;

-- Encouragements reçus pas encore vus (des deux derniers jours), avec le pseudo de l'ami.
create function public.my_cheers()
returns table (from_id uuid, username text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.from_id, p.username, c.created_at
  from public.cheers c
  join public.profiles p on p.id = c.from_id
  where c.to_id = (select auth.uid())
    and c.seen_at is null
    and c.day >= public.paris_today() - 1
  order by c.created_at desc;
$$;

create function public.mark_cheers_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.cheers set seen_at = now()
  where to_id = (select auth.uid()) and seen_at is null;
$$;

-- Duels ------------------------------------------------------------------

create table public.duels (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  days smallint not null check (days between 1 and 7),
  status text not null default 'pending' check (status in ('pending', 'active', 'declined')),
  created_at timestamptz not null default now(),
  start_day date,
  check (from_id <> to_id)
);

create index duels_from_idx on public.duels (from_id);
create index duels_to_idx on public.duels (to_id);

alter table public.duels enable row level security;

create policy "Ses duels" on public.duels
  for select to authenticated
  using ((select auth.uid()) in (from_id, to_id));

-- Un duel en attente ne vaut que 2 jours.
create function public.duel_open(p_duel public.duels)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (p_duel.status = 'pending' and p_duel.created_at > now() - interval '2 days')
      or (p_duel.status = 'active' and p_duel.start_day + p_duel.days > public.paris_today());
$$;

-- Défie un ami : 'sent', 'not_friend' ou 'already' (un duel est déjà en cours entre vous).
create function public.create_duel(p_friend uuid, p_days integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Connexion requise';
  end if;
  if p_days not between 1 and 7 then
    raise exception 'Durée invalide';
  end if;
  if not public.are_friends(v_me, p_friend) then
    return 'not_friend';
  end if;
  if exists (
    select 1 from public.duels d
    where ((d.from_id = v_me and d.to_id = p_friend) or (d.from_id = p_friend and d.to_id = v_me))
      and public.duel_open(d)
  ) then
    return 'already';
  end if;
  insert into public.duels (from_id, to_id, days) values (v_me, p_friend, p_days);
  return 'sent';
end;
$$;

-- Accepter (le duel commence aujourd'hui) ou refuser un défi reçu.
create function public.respond_duel(p_duel uuid, p_accept boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.duels d
  set status = case when p_accept then 'active' else 'declined' end,
      start_day = case when p_accept then public.paris_today() end
  where d.id = p_duel
    and d.to_id = (select auth.uid())
    and public.duel_open(d)
    and d.status = 'pending';
$$;

-- Duels en attente, en cours, et terminés depuis moins de 3 jours, avec les pas de chacun.
create function public.my_duels()
returns table (
  id uuid,
  other_id uuid,
  other_name text,
  incoming boolean,
  status text,
  days smallint,
  start_day date,
  my_steps integer,
  their_steps integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select
      d.*,
      case when d.from_id = (select auth.uid()) then d.to_id else d.from_id end as other
    from public.duels d
    where (select auth.uid()) in (d.from_id, d.to_id)
      and (
        (d.status = 'pending' and d.created_at > now() - interval '2 days')
        or (d.status = 'active' and d.start_day + d.days + 3 > public.paris_today())
      )
  )
  select
    m.id,
    m.other,
    p.username,
    m.to_id = (select auth.uid()),
    m.status,
    m.days,
    m.start_day,
    coalesce((
      select sum(s.steps) from public.daily_steps s
      where s.user_id = (select auth.uid())
        and s.day >= m.start_day and s.day < m.start_day + m.days
    ), 0)::integer,
    coalesce((
      select sum(s.steps) from public.daily_steps s
      where s.user_id = m.other
        and s.day >= m.start_day and s.day < m.start_day + m.days
    ), 0)::integer
  from mine m
  join public.profiles p on p.id = m.other
  order by m.created_at desc;
$$;

revoke all on function public.send_cheer(uuid) from public, anon;
revoke all on function public.my_cheers() from public, anon;
revoke all on function public.mark_cheers_seen() from public, anon;
revoke all on function public.create_duel(uuid, integer) from public, anon;
revoke all on function public.respond_duel(uuid, boolean) from public, anon;
revoke all on function public.my_duels() from public, anon;
grant execute on function public.send_cheer(uuid) to authenticated;
grant execute on function public.my_cheers() to authenticated;
grant execute on function public.mark_cheers_seen() to authenticated;
grant execute on function public.create_duel(uuid, integer) to authenticated;
grant execute on function public.respond_duel(uuid, boolean) to authenticated;
grant execute on function public.my_duels() to authenticated;
