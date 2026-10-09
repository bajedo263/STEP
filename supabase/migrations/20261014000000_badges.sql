-- Badges : les défis du jour réussis sont enregistrés (un par jour au plus), et un résumé
-- de l'activité de toujours sert à débloquer les badges.

create table public.challenge_completions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  kind text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.challenge_completions enable row level security;

create policy "Lecture de ses défis réussis" on public.challenge_completions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Enregistrement de ses défis réussis" on public.challenge_completions
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- Mon activité de toujours : de quoi savoir quels badges sont débloqués.
create function public.my_badge_stats()
returns table (walks integer, walked_m double precision, places integer, challenges integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*)::integer from public.walks w where w.user_id = (select auth.uid())),
    (select coalesce(sum(w.distance_m), 0)::double precision
       from public.walks w where w.user_id = (select auth.uid())),
    (select count(*)::integer from public.poi_visits v where v.user_id = (select auth.uid())),
    (select count(*)::integer from public.challenge_completions c
       where c.user_id = (select auth.uid()));
$$;

grant execute on function public.my_badge_stats() to authenticated;
