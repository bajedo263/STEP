import * as Linking from 'expo-linking';

import { localFlag, setLocalFlag } from '@/hooks/use-local-flag';
import { decodeResetRequest, encodeResetRequest, recoveryLinkAllowed } from '@/lib/recovery-guard';
import { redirectParams } from '@/lib/social-auth';
import { supabase } from '@/lib/supabase';

/** Pendant une réinitialisation, l'app demande le nouveau mot de passe avant tout le reste. */
export const RECOVERY_KEY = 'step.password-recovery';

/** Dernière demande de lien faite depuis ce téléphone (adresse et heure). */
const RESET_REQUEST_KEY = 'step.password-reset-request';

/**
 * Envoie le lien de réinitialisation. Il revient sur l'écran de connexion, comme la connexion
 * Google, dont l'adresse est déjà autorisée dans Supabase.
 */
export async function requestPasswordReset(email: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: Linking.createURL('connexion'),
  });
  if (!error) setLocalFlag(RESET_REQUEST_KEY, encodeResetRequest(email, Date.now()));
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
  // Seul un lien demandé depuis ce téléphone, pour cette adresse, ouvre une session.
  const request = decodeResetRequest(localFlag(RESET_REQUEST_KEY));
  if (!recoveryLinkAllowed(request, params.access_token, Date.now())) return false;
  setLocalFlag(RESET_REQUEST_KEY, '');
  // Le drapeau d'abord : l'app ne doit pas passer par l'accueil avant le nouveau mot de passe.
  setLocalFlag(RECOVERY_KEY, '1');
  const { error } = await supabase.auth.setSession({
    access_token: params.access_token,
    refresh_token: params.refresh_token,
  });
  if (error) setLocalFlag(RECOVERY_KEY, '0');
  return !error;
}
