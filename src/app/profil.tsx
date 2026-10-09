import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { TextField } from '@/components/ui/text-field';
import { Avatar } from '@/components/avatar';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useBadges } from '@/hooks/use-badges';
import { setReminderHour, useReminderHour } from '@/hooks/use-daily-reminders';
import { useProfile } from '@/hooks/use-profile';
import { useStepHistory } from '@/hooks/use-step-history';
import { useTodaySteps } from '@/hooks/use-today-steps';
import { useTheme } from '@/hooks/use-theme';
import {
  profileToForm,
  validateProfileForm,
  type Profile,
  type ProfileErrors,
  type ProfileForm,
} from '@/lib/profile';
import { DEFAULT_DAILY_GOAL, type Sex } from '@/lib/steps';
import { protectedStreak } from '@/lib/streak';
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
      {/* Sur iPhone, la feuille modale laisse déjà la place de la barre d'état. */}
      <SafeAreaView
        style={styles.safeArea}
        edges={Platform.OS === 'ios' ? ['left', 'right'] : ['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <Avatar name={form.username || session?.user.email || '?'} size={72} />
              <View style={styles.flex}>
                <ThemedText type="subtitle" numberOfLines={1}>
                  {form.username || 'Marcheur'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {session?.user.email}
                </ThemedText>
              </View>
            </View>

            <Highlights />

            <ThemedText type="smallBold" style={styles.section}>
              Réglages
            </ThemedText>
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
                <ThemedText type="small" themeColor="textSecondary">
                  Taille, poids et sexe servent seulement à estimer la longueur de vos pas et les
                  calories. Ils ne sont jamais montrés à vos amis.
                </ThemedText>

                {message ? (
                  <ThemedText type="small" style={message.isError ? { color: theme.danger } : undefined}>
                    {message.text}
                  </ThemedText>
                ) : null}

                <Button title="Enregistrer" onPress={save} loading={saving} />
              </>
            )}

            {Platform.OS !== 'web' ? <ReminderSettings /> : null}

            <Button variant="secondary" title="Se déconnecter" onPress={() => supabase?.auth.signOut()} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const REMINDER_OPTIONS = [
  { value: 'off', label: 'Aucun' },
  { value: '12', label: '12 h' },
  { value: '18', label: '18 h' },
  { value: '20', label: '20 h' },
] as const;

/** Heure du rappel du jour, ou aucun rappel. Réglage propre à ce téléphone. */
function ReminderSettings() {
  const hour = useReminderHour();
  return (
    <View style={[styles.section, { gap: Spacing.two }]}>
      <SegmentedChoice
        label="Rappel du jour"
        options={[...REMINDER_OPTIONS]}
        value={hour === null ? 'off' : (REMINDER_OPTIONS.find((o) => o.value === String(hour))?.value ?? '18')}
        onChange={(value) => setReminderHour(value === 'off' ? null : Number(value))}
      />
      <ThemedText type="small" themeColor="textSecondary">
        Un rappel par jour au plus, avec les pas qu’il vous reste et une boucle à la bonne longueur,
        plus un rappel à 21 h si votre série est en danger. Rien quand l’objectif est atteint.
      </ThemedText>
    </View>
  );
}

/** Ce dont on peut être fier : badges, meilleure série, pas du jour. */
function Highlights() {
  const profile = useProfile();
  const today = useTodaySteps();
  const steps = today.status === 'ready' ? today.steps : null;
  const goal = profile?.daily_goal ?? DEFAULT_DAILY_GOAL;
  const badges = useBadges(steps, goal);
  const history = useStepHistory();
  const streak = useMemo(
    () => (history ? protectedStreak(history, new Date(), steps, goal) : null),
    [history, steps, goal]
  );
  const unlocked = badges?.filter((badge) => badge.unlocked) ?? [];

  return (
    <ThemedView type="backgroundElement" style={styles.highlights}>
      <Highlight
        value={badges ? `${unlocked.length} / ${badges.length}` : '…'}
        label="badges"
      />
      <Highlight value={streak ? String(streak.best) : '…'} label="meilleure série" />
      <Highlight
        value={steps === null ? '…' : Math.round(steps).toLocaleString('fr-FR')}
        label="pas aujourd’hui"
      />
    </ThemedView>
  );
}

function Highlight({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.highlight} accessible accessibilityLabel={`${value} ${label}`}>
      <ThemedText type="stat">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  highlights: {
    flexDirection: 'row',
    paddingVertical: Spacing.three,
    borderRadius: Radius.tile,
  },
  highlight: {
    flex: 1,
    alignItems: 'center',
  },
  section: {
    marginTop: Spacing.two,
  },
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
    paddingBottom: Spacing.six,
  },
  loader: {
    marginVertical: Spacing.five,
  },
});
