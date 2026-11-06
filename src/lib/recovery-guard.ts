// Garde-fou des liens « mot de passe oublié ». Un tel lien porte une session toute prête : sans
// contrôle, un lien piégé (step://connexion#type=recovery&access_token=…) ouvrirait sur le téléphone
// de la victime la session du compte de l'attaquant, et les trajets de la victime (sa position)
// partiraient dans ce compte. On n'accepte donc qu'un lien demandé depuis ce téléphone, il y a
// peu, pour l'adresse dont le lien porte la session.

/** Validité d'une demande de réinitialisation (le lien de Supabase expire au bout d'une heure). */
export const RESET_REQUEST_TTL_MS = 60 * 60 * 1000;

export type ResetRequest = { email: string; at: number };

export function encodeResetRequest(email: string, at: number): string {
  return JSON.stringify({ email: email.trim().toLowerCase(), at });
}

export function decodeResetRequest(raw: string | null): ResetRequest | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as ResetRequest).email === 'string' &&
      typeof (value as ResetRequest).at === 'number'
    ) {
      return value as ResetRequest;
    }
  } catch {
    // Drapeau illisible : aucune demande en cours.
  }
  return null;
}

/** Adresse email portée par un jeton d'accès Supabase (sans en vérifier la signature). */
export function tokenEmail(accessToken: string): string | null {
  const payload = accessToken.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = globalThis.atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const email: unknown = JSON.parse(json).email;
    return typeof email === 'string' ? email.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Vrai si le lien répond à une demande faite depuis ce téléphone, récente, pour la même adresse. */
export function recoveryLinkAllowed(
  request: ResetRequest | null,
  accessToken: string,
  now: number
): boolean {
  if (!request) return false;
  if (now < request.at || now - request.at > RESET_REQUEST_TTL_MS) return false;
  return tokenEmail(accessToken) === request.email;
}
