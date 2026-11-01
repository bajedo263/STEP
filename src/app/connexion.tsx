import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SocialSignIn } from '@/components/social-sign-in';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { authErrorMessage } from '@/lib/auth-errors';
import { requestPasswordReset } from '@/lib/password-reset';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type Mode = 'signIn' | 'signUp';

export default function SignInScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const isSignUp = mode === 'signUp';

  async function submit() {
    setError(null);
    setNotice(null);

    if (!supabase) {
      setError('Le serveur n’est pas encore configuré.');
      return;
    }
    if (!email.includes('@')) {
      setError('Entrez une adresse email valide.');
      return;
    }
    if (isSignUp && password.length < 8) {
      setError('Mot de passe trop court : 8 caractères minimum.');
      return;
    }

    setLoading(true);
    const credentials = { email: email.trim(), password };
    const { data, error: authError } = isSignUp
      ? await supabase.auth.signUp(credentials)
      : await supabase.auth.signInWithPassword(credentials);
    setLoading(false);

    if (authError) {
      setError(authErrorMessage(authError));
    } else if (isSignUp && !data.session) {
      setNotice('Compte créé. Confirmez votre adresse avec le lien reçu par email, puis connectez-vous.');
      setMode('signIn');
    }
    // Sinon la session change et la navigation bascule d'elle-même vers les onglets.
  }

  async function forgotPassword() {
    setError(null);
    setNotice(null);
    if (!email.includes('@')) {
      setError('Entrez votre adresse email ci-dessus, puis touchez à nouveau « Mot de passe oublié ».');
      return;
    }
    setResetting(true);
    const sent = await requestPasswordReset(email);
    setResetting(false);
    if (sent) {
      setNotice('Si un compte existe pour cette adresse, un email vient de partir. Ouvrez son lien sur ce téléphone pour choisir un nouveau mot de passe.');
    } else {
      setError('L’email n’a pas pu être envoyé. Réessayez dans un instant.');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="title" style={{ color: theme.tint }}>
              STEP
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.centered}>
              {isSignUp
                ? 'Créez votre compte pour suivre vos pas et vos trajets.'
                : 'Connectez-vous pour retrouver vos pas et vos trajets.'}
            </ThemedText>

            {!isSupabaseConfigured ? (
              <ThemedView type="backgroundElement" style={styles.banner}>
                <ThemedText type="small" style={{ color: theme.danger }}>
                  {__DEV__
                    ? 'Serveur non configuré : renseignez EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans .env.'
                    : 'Le service est momentanément indisponible. Réessayez plus tard.'}
                </ThemedText>
              </ThemedView>
            ) : null}

            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="vous@exemple.fr"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <TextField
              label="Mot de passe"
              value={password}
              onChangeText={setPassword}
              placeholder={isSignUp ? '8 caractères minimum' : undefined}
              secureTextEntry
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              textContentType={isSignUp ? 'newPassword' : 'password'}
              onSubmitEditing={submit}
            />
            {!isSignUp ? (
              <Pressable
                accessibilityRole="button"
                disabled={resetting}
                hitSlop={12}
                onPress={forgotPassword}
                style={styles.forgot}>
                <ThemedText type="small" style={{ color: theme.tint, opacity: resetting ? 0.5 : 1 }}>
                  Mot de passe oublié ?
                </ThemedText>
              </Pressable>
            ) : null}

            {error ? (
              <ThemedText type="small" style={{ color: theme.danger }} accessibilityLiveRegion="polite">
                {error}
              </ThemedText>
            ) : null}
            {notice ? (
              <ThemedText type="small" accessibilityLiveRegion="polite">
                {notice}
              </ThemedText>
            ) : null}

            <Button
              title={isSignUp ? 'Créer mon compte' : 'Se connecter'}
              onPress={submit}
              loading={loading}
            />
            <Button
              variant="secondary"
              title={isSignUp ? 'J’ai déjà un compte' : 'Créer un compte'}
              onPress={() => {
                setMode(isSignUp ? 'signIn' : 'signUp');
                setError(null);
              }}
            />
            <SocialSignIn onError={setError} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  centered: {
    textAlign: 'center',
  },
  forgot: {
    alignSelf: 'flex-end',
    paddingVertical: Spacing.one,
  },
  banner: {
    alignSelf: 'stretch',
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
});
