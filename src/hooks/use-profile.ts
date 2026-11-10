import { useUserResource } from '@/hooks/use-user-resource';
import type { Profile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { createUserResource } from '@/lib/user-resource';

/** Le profil ne change que depuis l'app : entre deux modifications, on le relit rarement. */
const PROFILE_FRESH_MS = 5 * 60_000;

const profileResource = createUserResource<Profile>(async (userId) => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, height_cm, weight_kg, sex, daily_goal')
    .eq('id', userId)
    .maybeSingle<Profile>();
  return error ? null : data;
}, PROFILE_FRESH_MS);

/** Profil de l'utilisateur connecté, partagé par tous les écrans. */
export function useProfile(): Profile | null {
  return useUserResource(profileResource);
}

/** À appeler après chaque modification du profil : tous les écrans voient la nouvelle valeur. */
export function profileChanged() {
  profileResource.invalidate();
}
