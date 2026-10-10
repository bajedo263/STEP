import * as AppleAuthentication from 'expo-apple-authentication';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import {
  appleSignInEnabled,
  googleSignInEnabled,
  signInWithApple,
  signInWithGoogle,
  type SocialResult,
} from '@/lib/social-auth';

/** Boutons « Continuer avec Apple / Google », masqués tant qu'aucun n'est activé. */
export function SocialSignIn({ onError }: { onError: (message: string | null) => void }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const [busy, setBusy] = useState(false);

  if (!appleSignInEnabled && !googleSignInEnabled) return null;

  const run = async (signIn: () => Promise<SocialResult>) => {
    if (busy) return;
    onError(null);
    setBusy(true);
    const result = await signIn().catch((): SocialResult => ({ ok: false, cancelled: false }));
    setBusy(false);
    // Une fois connecté, la session change et la navigation bascule d'elle-même.
    if (!result.ok && !result.cancelled) {
      onError('Connexion impossible pour le moment. Réessayez ou utilisez votre email.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.separator}>
        <View style={[styles.line, { backgroundColor: theme.backgroundElement }]} />
        <ThemedText type="small" themeColor="textSecondary">
          ou
        </ThemedText>
        <View style={[styles.line, { backgroundColor: theme.backgroundElement }]} />
      </View>
      {appleSignInEnabled ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={
            scheme === 'dark'
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={26}
          style={styles.apple}
          onPress={() => run(signInWithApple)}
        />
      ) : null}
      {googleSignInEnabled ? (
        <Button
          variant="secondary"
          title="Continuer avec Google"
          loading={busy}
          onPress={() => run(signInWithGoogle)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    gap: Spacing.three,
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth * 2,
  },
  apple: {
    alignSelf: 'stretch',
    height: 52,
  },
});
