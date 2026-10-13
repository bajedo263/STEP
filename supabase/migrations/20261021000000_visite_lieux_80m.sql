-- Lieux visités de plus loin : de l'autre côté d'une avenue, le GPS place souvent le marcheur
-- à plus de 60 m du point Wikipédia. L'app vise 50 m plus la marge d'erreur du GPS (jusqu'à
-- 70 m) ; le serveur accepte jusqu'à 80 m.
create or replace function public.record_poi_visit(p_poi_id bigint, p_latitude double precision, p_longitude double precision)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_inserted integer;
begin
  if v_user is null then
    raise exception 'Connexion requise';
  end if;

  if not exists (
    select 1 from public.pois p
    where p.id = p_poi_id
      and extensions.st_dwithin(
        p.location,
        extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
        80
      )
  ) then
    return false;
  end if;

  insert into public.poi_visits (user_id, poi_id) values (v_user, p_poi_id)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

revoke all on function public.record_poi_visit(bigint, double precision, double precision) from public, anon;
grant execute on function public.record_poi_visit(bigint, double precision, double precision) to authenticated;
