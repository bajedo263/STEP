import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { TextField } from '@/components/ui/text-field';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  profileToForm,
  validateProfileForm,
  type Profile,
  type ProfileErrors,
  type ProfileForm,
} from '@/lib/profile';
import type { Sex } from '@/lib/steps';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'female', label: 'Femme' },
  { value: 'male', label: 'Homme' },
  { value: 'unspecified', label: 'Non précisé' },
];

export default function ProfileScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id;

  const [form, setForm] = useState<ProfileForm>(() => profileToForm(null));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;

    async function load(client: NonNullable<typeof supabase>, id: string) {
      try {
        const { data, error } = await client
          .from('profiles')
          .select('id, username, height_cm, weight_kg, sex, daily_goal')
          .eq('id', id)
          .maybeSingle<Profile>();
        if (cancelled) return;
        if (error) throw error;
        setForm(profileToForm(data));
      } catch {
        if (!cancelled) setMessage({ text: 'Impossible de charger votre profil.', isError: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load(supabase, userId);

    return () => {
      cancelled = true;
    };
  }, [userId]);

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setMessage(null);
  }

  async function save() {
    if (!supabase || !userId) return;

    const result = validateProfileForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('profiles').update(result.value).eq('id', userId);
    setSaving(false);

    if (error?.code === '23505') {
      setErrors({ username: 'Ce pseudo est déjà pris.' });
    } else if (error) {
      setMessage({ text: 'L’enregistrement a échoué. Réessayez.', isError: true });
    } else {
      setMessage({ text: 'Profil enregistré.', isError: false });
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="subtitle">Profil</ThemedText>
            <ThemedText themeColor="textSecondary">{session?.user.email}</ThemedText>

            {loading ? (
              <ActivityIndicator style={styles.loader} />
            ) : (
              <>
                <TextField
                  label="Pseudo"
                  value={form.username}
                  onChangeText={(value) => update('username', value)}
                  placeholder="Visible par vos amis"
                  autoCapitalize="none"
                  error={errors.username}
                />
                <TextField
                  label="Objectif quotidien (pas)"
                  value={form.dailyGoal}
                  onChangeText={(value) => update('dailyGoal', value)}
                  keyboardType="number-pad"
                  error={errors.dailyGoal}
                />
                <TextField
                  label="Taille (cm)"
                  value={form.heightCm}
                  onChangeText={(value) => update('heightCm', value)}
                  placeholder="Pour estimer la longueur de vos pas"
                  keyboardType="number-pad"
                  error={errors.heightCm}
                />
                <TextField
                  label="Poids (kg)"
                  value={form.weightKg}
                  onChangeText={(value) => update('weightKg', value)}
                  placeholder="Pour estimer les calories"
                  keyboardType="decimal-pad"
                  error={errors.weightKg}
                />
                <SegmentedChoice
                  label="Sexe"
                  options={SEX_OPTIONS}
                  value={form.sex}
                  onChange={(value) => update('sex', value)}
                />

                {message ? (
                  <ThemedText type="small" style={message.isError ? { color: theme.danger } : undefined}>
                    {message.text}
                  </ThemedText>
                ) : null}

                <Button title="Enregistrer" onPress={save} loading={saving} />
              </>
            )}

            <Button variant="secondary" title="Se déconnecter" onPress={() => supabase?.auth.signOut()} />
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
    gap: Spacing.three,
    padding: Spacing.four,
    paddingTop: Platform.select({ web: Spacing.six + Spacing.four, default: Spacing.four }),
    paddingBottom: BottomTabInset + Spacing.four,
  },
  loader: {
    marginVertical: Spacing.five,
  },
});
