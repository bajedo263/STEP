import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NextBadge } from '@/components/badges-card';
import { ProgressRing } from '@/components/progress-ring';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useBadges } from '@/hooks/use-badges';
import { useTerritoryAlerts, type TerritoryAlerts } from '@/hooks/use-conquest';
import { useDailyChallenge } from '@/hooks/use-daily-challenge';
import { useProfile } from '@/hooks/use-profile';
import { useStepHistory } from '@/hooks/use-step-history';
import { useSyncDailySteps } from '@/hooks/use-sync-daily-steps';
import { useTheme } from '@/hooks/use-theme';
import { useTodaySteps } from '@/hooks/use-today-steps';
import { nextBadges } from '@/lib/badges';
import type { Challenge } from '@/lib/challenge';
import { CONQUEST_UNLOCK_STEPS, conquestUnlocked, territoryAlertLabel } from '@/lib/conquest';
import { dailyProgress, formatDistance } from '@/lib/daily-progress';
import { DEFAULT_DAILY_GOAL } from '@/lib/steps';
import { milestoneToday, protectedStreak, type ProtectedStreak } from '@/lib/streak';

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

  const goal = profile?.daily_goal ?? DEFAULT_DAILY_GOAL;
  const history = useStepHistory();
  const streak = useMemo(
    () => (history ? protectedStreak(history, new Date(), steps, goal) : null),
    [history, steps, goal]
  );
  const challenge = useDailyChallenge(steps, goal);
  const territory = useTerritoryAlerts();
  const badges = useBadges(steps, goal);
  const nextBadge = useMemo(() => (badges ? (nextBadges(badges)[0] ?? null) : null), [badges]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {new Date().toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
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

              {streak ? <StreakBanner streak={streak} /> : null}
              {challenge ? <ChallengeCard challenge={challenge} /> : null}
              {nextBadge ? <NextBadge badge={nextBadge} /> : null}
              {territory && territory.lost.length + territory.expiring.length > 0 ? (
                <TerritoryCard alerts={territory} />
              ) : null}

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

/** Série protégée : jours d'affilée à l'objectif, gels en stock et paliers fêtés. */
function StreakBanner({ streak }: { streak: ProtectedStreak }) {
  const milestone = milestoneToday(streak);
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.row}>
        <ThemedText type="subtitle">{`🔥 ${streak.current}`}</ThemedText>
        <View style={styles.flex}>
          <ThemedText type="smallBold">
            {streak.current > 1 ? 'jours d’affilée à l’objectif' : 'jour à l’objectif'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {streak.todayDone
              ? 'Objectif du jour atteint, la série continue.'
              : streak.current > 0
                ? 'Atteignez l’objectif aujourd’hui pour la prolonger.'
                : 'Atteignez l’objectif aujourd’hui pour lancer une série.'}
          </ThemedText>
        </View>
        <View style={styles.freezes}>
          <ThemedText type="smallBold">{`❄️ ${streak.freezes}`}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {streak.freezes > 1 ? 'gels' : 'gel'}
          </ThemedText>
        </View>
      </View>
      {milestone ? (
        <ThemedText type="smallBold" style={styles.centered}>
          {`🎉 ${milestone} jours d’affilée, bravo !`}
        </ThemedText>
      ) : null}
      <ThemedText type="small" themeColor="textSecondary">
        Tous les 7 jours d’affilée, un gel (2 au plus) sauve automatiquement un jour raté.
      </ThemedText>
    </ThemedView>
  );
}

/** Défi du jour : une mission différente chaque jour, et son avancement. */
function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.row}>
        <ThemedText type="smallBold" style={styles.flex}>
          {`Défi du jour · ${challenge.title}`}
        </ThemedText>
        {challenge.done ? (
          <ThemedText type="smallBold" style={{ color: theme.success }}>
            Réussi !
          </ThemedText>
        ) : null}
      </View>
      <ThemedText type="small">{challenge.description}</ThemedText>
      <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.max(2, (challenge.progress / challenge.target) * 100)}%`,
              backgroundColor: challenge.done ? theme.success : theme.tint,
            },
          ]}
        />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {challenge.progressLabel}
      </ThemedText>
    </ThemedView>
  );
}

/** Territoire vivant : cases reprises ou bientôt libérées, et une boucle pour les défendre. */
function TerritoryCard({ alerts }: { alerts: TerritoryAlerts }) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold" style={alerts.lost.length > 0 && { color: theme.danger }}>
        {alerts.lost.length > 0 ? 'Votre territoire est attaqué' : 'Votre territoire s’efface'}
      </ThemedText>
      <ThemedText type="small">{territoryAlertLabel(alerts)}</ThemedText>
      <Button
        title="Défendre"
        variant="secondary"
        // Un identifiant à chaque appui : la carte trace une nouvelle boucle même si elle est déjà ouverte.
        onPress={() =>
          router.navigate({ pathname: '/carte', params: { defend: String(Date.now()) } })
        }
      />
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
  card: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  flex: {
    flex: 1,
  },
  freezes: {
    alignItems: 'center',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
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
