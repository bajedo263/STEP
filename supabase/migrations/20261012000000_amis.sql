-- Amis : on s'ajoute par pseudo, l'autre accepte. Entre amis, on voit les pas du jour,
-- le nombre de cases conquises, et leurs cases ressortent dans une couleur à part sur la carte.

create table public.friend_requests (
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (from_id, to_id),
  check (from_id <> to_id)
);

create index friend_requests_to_idx on public.friend_requests (to_id);

alter table public.friend_requests enable row level security;

-- Lecture seule de ses demandes ; tout changement passe par les fonctions ci-dessous.
create policy "Ses demandes d'amis" on public.friend_requests
  for select to authenticated
  using ((select auth.uid()) in (from_id, to_id));

-- Demande d'ami par pseudo (sans tenir compte des majuscules).
-- Renvoie 'sent', 'accepted' (l'autre nous avait déjà demandé), 'already', 'self' ou 'not_found'.
create function public.send_friend_request(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
begin
  if v_me is null then
    raise exception 'Non connecté';
  end if;

  select p.id into v_other
  from public.profiles p
  where lower(p.username) = lower(trim(p_username));

  if v_other is null then
    return 'not_found';
  end if;
  if v_other = v_me then
    return 'self';
  end if;

  -- L'autre nous avait déjà fait une demande : on l'accepte.
  update public.friend_requests
  set accepted_at = now()
  where from_id = v_other and to_id = v_me and accepted_at is null;
  if found then
    return 'accepted';
  end if;

  if exists (
    select 1 from public.friend_requests r
    where (r.from_id = v_me and r.to_id = v_other) or (r.from_id = v_other and r.to_id = v_me)
  ) then
    return 'already';
  end if;

  insert into public.friend_requests (from_id, to_id) values (v_me, v_other);
  return 'sent';
end;
$$;

-- Accepter ou refuser une demande reçue.
create function public.respond_friend_request(p_from uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_accept then
    update public.friend_requests
    set accepted_at = now()
    where from_id = p_from and to_id = auth.uid() and accepted_at is null;
  else
    delete from public.friend_requests
    where from_id = p_from and to_id = auth.uid() and accepted_at is null;
  end if;
end;
$$;

-- Retirer un ami, ou annuler une demande envoyée.
create function public.remove_friend(p_friend uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.friend_requests
  where (from_id = auth.uid() and to_id = p_friend)
     or (from_id = p_friend and to_id = auth.uid());
$$;

-- Mes amis et demandes en cours, avec les pas du jour (dans le fuseau de chacun)
-- et les cases conquises des amis confirmés.
create function public.my_friends()
returns table (
  friend_id uuid,
  username text,
  status text,
  steps_today integer,
  cells integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select
      case when r.from_id = auth.uid() then r.to_id else r.from_id end as friend_id,
      case
        when r.accepted_at is not null then 'friend'
        when r.from_id = auth.uid() then 'outgoing'
        else 'incoming'
      end as status
    from public.friend_requests r
    where auth.uid() in (r.from_id, r.to_id)
  )
  select
    m.friend_id,
    p.username,
    m.status,
    case when m.status = 'friend' then coalesce((
      select d.steps from public.daily_steps d
      where d.user_id = m.friend_id
        and d.day = (now() at time zone p.timezone)::date
    ), 0) end,
    case when m.status = 'friend' then (
      select count(*)::integer from public.conquest_cells c
      where c.owner_id = m.friend_id and c.captured_at > public.conquest_since()
    ) end
  from mine m
  join public.profiles p on p.id = m.friend_id;
$$;

revoke all on function public.send_friend_request(text) from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.my_friends() from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.my_friends() to authenticated;

-- Cases de la carte : on distingue désormais celles des amis.
drop function public.conquest_cells_in_box(integer, integer, integer, integer);

create function public.conquest_cells_in_box(
  p_min_x integer,
  p_min_y integer,
  p_max_x integer,
  p_max_y integer
)
returns table (x integer, y integer, mine boolean, friend boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with friends as (
    select case when r.from_id = auth.uid() then r.to_id else r.from_id end as id
    from public.friend_requests r
    where r.accepted_at is not null and auth.uid() in (r.from_id, r.to_id)
  )
  select
    c.x,
    c.y,
    c.owner_id = (select auth.uid()),
    c.owner_id in (select f.id from friends f)
  from public.conquest_cells c
  where c.x between p_min_x and p_max_x
    and c.y between p_min_y and p_max_y
    and p_max_x - p_min_x <= 400
    and p_max_y - p_min_y <= 400
    and c.captured_at > public.conquest_since()
  limit 5000;
$$;

revoke all on function public.conquest_cells_in_box(integer, integer, integer, integer) from public, anon;
grant execute on function public.conquest_cells_in_box(integer, integer, integer, integer) to authenticated;
