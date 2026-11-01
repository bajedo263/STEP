-- Suppression de compte depuis l'app (exigée par l'App Store dès qu'on peut créer un compte).
-- Supprimer l'utilisateur d'auth efface son profil, et toutes les tables qui pointent vers
-- profiles le suivent (on delete cascade) : trajets, amis, cases, duels, ligues, souvenirs…

create function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    return false;
  end if;
  delete from auth.users where id = v_user;
  return true;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
