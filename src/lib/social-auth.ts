import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { isExpoGo } from '@/lib/native-build';
import { supabase } from '@/lib/supabase';

/**
 * Connexions Apple et Google, à activer une fois le fournisseur configuré dans Supabase
 * (voir docs/build-natif.md) : EXPO_PUBLIC_AUTH_APPLE=1 et EXPO_PUBLIC_AUTH_GOOGLE=1 dans .env.
 * Apple passe par la feuille native de l'iPhone, donc seulement dans la version installée.
 */
export const appleSignInEnabled =
  process.env.EXPO_PUBLIC_AUTH_APPLE === '1' && Platform.OS === 'ios' && !isExpoGo;
export const googleSignInEnabled =
  process.env.EXPO_PUBLIC_AUTH_GOOGLE === '1' && Platform.OS !== 'web';

/** Résultat d'une tentative : `cancelled` quand l'utilisateur a fermé la fenêtre. */
export type SocialResult = { ok: true } | { ok: false; cancelled: boolean };

export async function signInWithApple(): Promise<SocialResult> {
  if (!supabase) return { ok: false, cancelled: false };
  // Apple reçoit l'empreinte du nonce, Supabase le nonce brut : il vérifie qu'ils correspondent.
  const nonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    const cancelled = (error as { code?: string }).code === 'ERR_REQUEST_CANCELED';
    return { ok: false, cancelled };
  }
  if (!credential.identityToken) return { ok: false, cancelled: false };
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce,
  });
  return error ? { ok: false, cancelled: false } : { ok: true };
}

/**
 * Google par la page de connexion de Supabase, ouverte dans une fenêtre sécurisée : marche aussi
 * dans Expo Go, sans module natif ni identifiant Google dans l'app.
 */
export async function signInWithGoogle(): Promise<SocialResult> {
  if (!supabase) return { ok: false, cancelled: false };
  // Revient sur l'écran de connexion (step://connexion, ou exp://…/--/connexion dans Expo Go).
  const redirectTo = Linking.createURL('connexion');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) return { ok: false, cancelled: false };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return { ok: false, cancelled: true };
  return (await sessionFromRedirect(result.url)) ? { ok: true } : { ok: false, cancelled: false };
}

/** Ouvre la session à partir de l'adresse de retour (jetons dans le fragment, ou code PKCE). */
async function sessionFromRedirect(url: string): Promise<boolean> {
  if (!supabase) return false;
  const params = redirectParams(url);
  if (params.code) {
    return !(await supabase.auth.exchangeCodeForSession(params.code)).error;
  }
  if (params.access_token && params.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    return !error;
  }
  return false;
}

/** Paramètres de la requête et du fragment d'une adresse de retour. */
export function redirectParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const part of url.split(/[?#]/).slice(1)) {
    for (const pair of part.split('&')) {
      const [key, value = ''] = pair.split('=');
      if (key) params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
    }
  }
  return params;
}
