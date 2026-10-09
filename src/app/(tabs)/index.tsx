import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressRing } from '@/components/progress-ring';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useSyncDailySteps } from '@/hooks/use-sync-daily-steps';
import { useTodaySteps } from '@/hooks/use-today-steps';
import { CONQUEST_UNLOCK_STEPS, conquestUnlocked } from '@/lib/conquest';
import { dailyProgress, formatDistance } from '@/lib/daily-progress';

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');

export default function HomeScreen() {
  const today = useTodaySteps();
  const profile = useProfile();

  const steps = today.status === 'ready' ? today.steps : null;
  const progress = useMemo(
    () =>
      steps === null
        ? null
        : dailyProgress({
            steps,
            goal: profile?.daily_goal,
            heightCm: profile?.height_cm,
            weightKg: profile?.weight_kg,
            sex: profile?.sex,
          }),
    [steps, profile]
  );

  // Sur Android, le compte repart de zéro à chaque ouverture : on ne l'enregistre pas
  // pour ne pas écraser un total plus élevé déjà enregistré. On attend aussi le profil,
  // sans quoi distance et calories seraient calculées avec les valeurs par défaut.
  const isPartial = today.status === 'ready' && today.partial;
  useSyncDailySteps(isPartial || !profile ? null : progress);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </ThemedText>

          {progress ? (
            <>
              <ProgressRing progress={progress.ratio}>
                <ThemedText type="title">{formatNumber(progress.steps)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  sur {formatNumber(progress.goal)} pas
                </ThemedText>
              </ProgressRing>

              <ThemedText style={styles.centered}>
                {conquestUnlocked(progress.steps)
                  ? 'Conquête active, bravo ! Vos trajets du jour colorent la carte à votre nom.'
                  : progress.goalReached
                    ? `Objectif atteint, bravo ! La Conquête s’active à ${formatNumber(CONQUEST_UNLOCK_STEPS)} pas.`
                    : `Encore ${formatNumber(progress.remainingSteps)} pas, soit environ ${formatDistance(progress.remainingDistanceM)}.`}
              </ThemedText>

              <View style={styles.stats}>
                <Stat value={formatDistance(progress.distanceM)} label="parcourus" />
                <Stat value={`${formatNumber(progress.calories)} kcal`} label="dépensées" />
                <Stat value={`${Math.round(progress.ratio * 100)} %`} label="de l’objectif" />
              </View>

              {isPartial ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                  Sur Android, seuls les pas faits pendant que l’app est ouverte sont comptés pour
                  l’instant. L’historique complet arrivera avec Health Connect.
                </ThemedText>
              ) : null}
            </>
          ) : (
            <StepsUnavailable status={today.status} />
          )}

          <Button title="Partir en boucle" onPress={() => router.navigate('/carte')} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText type="stat">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

function StepsUnavailable({ status }: { status: 'loading' | 'unavailable' | 'denied' | 'ready' }) {
  if (status === 'loading') return <ActivityIndicator style={styles.loader} />;

  const message =
    status === 'denied'
      ? 'STEP n’a pas accès à vos pas. Autorisez « Mouvements et forme » (iPhone) ou « Activité physique » (Android) dans les réglages du téléphone.'
      : Platform.OS === 'web'
        ? 'Le compteur de pas n’est disponible que sur téléphone.'
        : 'Ce téléphone ne fournit pas de compteur de pas.';

  return (
    <ThemedView type="backgroundElement" style={styles.notice}>
      <ThemedText style={styles.centered}>{message}</ThemedText>
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
  content: {
    alignItems: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
    paddingTop: Platform.select({ web: Spacing.six + Spacing.four, default: Spacing.four }),
    paddingBottom: BottomTabInset + Spacing.four,
  },
  centered: {
    textAlign: 'center',
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignSelf: 'stretch',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  notice: {
    alignSelf: 'stretch',
    padding: Spacing.four,
    borderRadius: Spacing.three,
  },
  loader: {
    marginVertical: Spacing.six,
  },
});
