import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { onboardedKey, useLocalFlag } from '@/hooks/use-local-flag';
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

  if (isLoading) return null;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={session !== null && onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="trajet"
            options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
          />
          <Stack.Screen name="profil" options={{ presentation: 'modal' }} />
          <Stack.Screen name="ami" options={{ presentation: 'modal' }} />
        </Stack.Protected>
        <Stack.Protected guard={session !== null && !onboarded}>
          <Stack.Screen name="bienvenue" />
        </Stack.Protected>
        <Stack.Protected guard={session === null}>
          <Stack.Screen name="connexion" />
        </Stack.Protected>
      </Stack>
      {/* Le trajet en cours continue pendant qu'on consulte le reste de l'app. */}
      {session !== null && onboarded ? <WalkHost /> : null}
    </>
  );
}
