import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { setLocalFlag } from '@/hooks/use-local-flag';
import { useTheme } from '@/hooks/use-theme';
import { authErrorMessage } from '@/lib/auth-errors';
import { RECOVERY_KEY } from '@/lib/password-reset';
import { supabase } from '@/lib/supabase';

/** Ouvert par le lien de réinitialisation reçu par email : choisir le nouveau mot de passe. */
export default function NewPasswordScreen() {
  const theme = useTheme();
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (password.length < 8) {
      setError('Mot de passe trop court : 8 caractères minimum.');
      return;
    }
    if (!supabase) return;
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(authErrorMessage(updateError));
      return;
    }
    setLocalFlag(RECOVERY_KEY, '0');
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="subtitle">Nouveau mot de passe</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.centered}>
              Choisissez le mot de passe que vous utiliserez désormais pour vous connecter.
            </ThemedText>
            <TextField
              label="Nouveau mot de passe"
              accessibilityLabel="Nouveau mot de passe"
              value={password}
              onChangeText={setPassword}
              placeholder="8 caractères minimum"
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={save}
            />
            {error ? (
              <ThemedText type="small" style={{ color: theme.danger }} accessibilityLiveRegion="polite">
                {error}
              </ThemedText>
            ) : null}
            <Button title="Enregistrer" loading={saving} onPress={save} />
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
});
