import type { Session } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  isLoading: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, isLoading: true });

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ session: null, isLoading: supabase !== null });

  useEffect(() => {
    if (!supabase) return;

    // onAuthStateChange émet INITIAL_SESSION au démarrage avec la session enregistrée.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ session, isLoading: false });
      // Les rappels programmés (objectif, série, retour) sont ceux du compte : ils ne doivent pas
      // continuer à sonner une fois déconnecté ou le compte supprimé.
      if (event === 'SIGNED_OUT' && Platform.OS !== 'web') {
        Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
      }
    });

    // Sur mobile, le rafraîchissement du jeton ne tourne que quand l'app est au premier plan
    // (recommandation Supabase pour React Native) : au retour, la session est remise à jour
    // tout de suite au lieu d'échouer sur un jeton expiré.
    const client = supabase;
    const onAppState = (next: string) => {
      if (next === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    };
    const appState = Platform.OS === 'web' ? null : AppState.addEventListener('change', onAppState);
    if (Platform.OS !== 'web' && AppState.currentState === 'active') client.auth.startAutoRefresh();

    return () => {
      data.subscription.unsubscribe();
      appState?.remove();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
