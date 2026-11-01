import * as Linking from 'expo-linking';

import { setLocalFlag } from '@/hooks/use-local-flag';
import { redirectParams } from '@/lib/social-auth';
import { supabase } from '@/lib/supabase';

/** Pendant une réinitialisation, l'app demande le nouveau mot de passe avant tout le reste. */
export const RECOVERY_KEY = 'step.password-recovery';

/**
 * Envoie le lien de réinitialisation. Il revient sur l'écran de connexion, comme la connexion
 * Google, dont l'adresse est déjà autorisée dans Supabase.
 */
export async function requestPasswordReset(email: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: Linking.createURL('connexion'),
  });
  return !error;
}

/**
 * Lien de réinitialisation ouvert : ouvre la session qu'il porte. Renvoie vrai seulement pour un
 * lien de récupération, pour ne pas confondre avec le retour de la connexion Google.
 */
export async function sessionFromRecoveryLink(url: string): Promise<boolean> {
  if (!supabase) return false;
  const params = redirectParams(url);
  if (params.type !== 'recovery' || !params.access_token || !params.refresh_token) return false;
  // Le drapeau d'abord : l'app ne doit pas passer par l'accueil avant le nouveau mot de passe.
  setLocalFlag(RECOVERY_KEY, '1');
  const { error } = await supabase.auth.setSession({
    access_token: params.access_token,
    refresh_token: params.refresh_token,
  });
  if (error) setLocalFlag(RECOVERY_KEY, '0');
  return !error;
}
