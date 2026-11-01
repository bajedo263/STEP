import * as Linking from 'expo-linking';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { onboardedKey, setLocalFlag, useLocalFlag } from '@/hooks/use-local-flag';
import { RECOVERY_KEY, sessionFromRecoveryLink } from '@/lib/password-reset';
// Déclare la tâche de suivi GPS dès le chargement, comme l'exige expo-task-manager.
import '@/lib/walk-location-task';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { WalkHost } from '@/providers/walk-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <AnimatedSplashOverlay />
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { session, isLoading } = useAuth();
  const onboarded = useLocalFlag(session ? onboardedKey(session.user.id) : null) !== null;
  // Lien « mot de passe oublié » ouvert : la session s'ouvre, puis on demande le nouveau mot de passe.
  const recovering = useLocalFlag(RECOVERY_KEY) === '1';
  const url = Linking.useURL();
  useEffect(() => {
    if (url) sessionFromRecoveryLink(url);
  }, [url]);
  // Déconnexion pendant la réinitialisation : on oublie la demande en cours.
  const signedIn = useRef(false);
  useEffect(() => {
    if (session) signedIn.current = true;
    else if (signedIn.current) {
      signedIn.current = false;
      setLocalFlag(RECOVERY_KEY, '0');
    }
  }, [session]);
  const ready = session !== null && !recovering;

  if (isLoading) return null;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={session !== null && recovering}>
          <Stack.Screen name="nouveau-mot-de-passe" />
        </Stack.Protected>
        <Stack.Protected guard={ready && onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="profil" options={{ presentation: 'modal' }} />
          <Stack.Screen name="ami" options={{ presentation: 'modal' }} />
          <Stack.Screen name="souvenirs" options={{ presentation: 'modal' }} />
        </Stack.Protected>
        <Stack.Protected guard={ready && !onboarded}>
          <Stack.Screen name="bienvenue" />
        </Stack.Protected>
        <Stack.Protected guard={session === null}>
          <Stack.Screen name="connexion" />
        </Stack.Protected>
      </Stack>
      {/* Le trajet en cours continue pendant qu'on consulte le reste de l'app. */}
      {ready && onboarded ? <WalkHost /> : null}
    </>
  );
}
