import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BadgesCard } from '@/components/badges-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, VisitedPoiColor } from '@/constants/theme';
import { useBadges } from '@/hooks/use-badges';
import { useDailyGoal } from '@/hooks/use-daily-goal';
import { useProfile } from '@/hooks/use-profile';
import { useStats, type PoiZoneStats, type WalkRow } from '@/hooks/use-stats';
import { useTheme } from '@/hooks/use-theme';
import { useTodaySteps } from '@/hooks/use-today-steps';
import { collectionCounts, zoneLevel, zoneNextStep } from '@/lib/collection';
import { formatDistance } from '@/lib/daily-progress';
import { formatDuration } from '@/lib/loop';
import {
  bestDay,
  buildWeek,
  historyTotals,
  monthTotals,
  weekTotals,
  type HistoryRow,
  type PeriodTotals,
  type WeekDay,
} from '@/lib/stats';
import { goalOn, type GoalRule } from '@/lib/steps';
import { protectedStreak } from '@/lib/streak';

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');

const MODE_LABELS: Record<WalkRow['mode'], string> = {
  loop: 'Boucle',
  destination: 'Destination',
  free: 'Marche libre',
};

export default function StatsScreen() {
  const stats = useStats();
  const profile = useProfile();
  const today = useTodaySteps();
  const todaySteps = today.status === 'ready' ? today.steps : null;
  const { goal, rule } = useDailyGoal(
    profile,
    stats.status === 'ready' ? stats.days : null,
    todaySteps
  );
  const badges = useBadges(todaySteps, rule);

  const week = useMemo(
    () => (stats.status === 'ready' ? buildWeek(stats.days, new Date(), todaySteps) : null),
    [stats, todaySteps]
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Statistiques</ThemedText>

          {stats.status === 'loading' ? <ActivityIndicator style={styles.loader} /> : null}
          {stats.status === 'error' ? (
            <ThemedView type="backgroundElement" style={styles.notice}>
              <ThemedText style={styles.centered}>
                Impossible de charger vos statistiques. Vérifiez votre connexion.
              </ThemedText>
            </ThemedView>
          ) : null}

          {stats.status === 'ready' && week ? (
            <>
              <StreakCard days={stats.days} todaySteps={todaySteps} goal={goal} rule={rule} />
              <WeekSummary week={week} goal={goal} rule={rule} />
              <MonthCard days={stats.days} todaySteps={todaySteps} goal={rule} />
              <RecordsCard days={stats.days} todaySteps={todaySteps} longestWalk={stats.longestWalk} />
              <PoiProgress zones={stats.poiZones} />
              {badges ? <BadgesCard badges={badges} /> : null}
              <ThemedText type="smallBold">Derniers trajets</ThemedText>
              {stats.walks.length === 0 ? (
                <ThemedText themeColor="textSecondary">
                  Aucun trajet pour l’instant. Lancez une boucle depuis la carte !
                </ThemedText>
              ) : (
                stats.walks.map((walk) => <WalkItem key={walk.id} walk={walk} />)
              )}
              {Platform.OS === 'android' ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Sur Android, seuls les pas d’aujourd’hui sont affichés tant que Health Connect
                  n’est pas branché.
                </ThemedText>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function WeekSummary({ week, goal, rule }: { week: WeekDay[]; goal: number; rule: GoalRule }) {
  const theme = useTheme();
  const totals = weekTotals(week, rule);
  const max = Math.max(goal, ...week.map((day) => day.steps));

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">7 derniers jours</ThemedText>
      <View style={styles.chart}>
        {/* Ligne de l'objectif */}
        <View
          style={[
            styles.goalLine,
            { bottom: `${(goal / max) * 100}%`, borderColor: theme.textSecondary },
          ]}
        />
        {week.map((day) => (
          <View key={day.day} style={styles.barTrack}>
            <View
              style={[
                styles.bar,
                {
                  height: `${Math.max(2, (day.steps / max) * 100)}%`,
                  backgroundColor:
                    day.steps >= goalOn(rule, day.day) ? theme.success : theme.backgroundSelected,
                },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={styles.labels}>
        {week.map((day) => (
          <ThemedText
            key={day.day}
            type="small"
            themeColor={day.isToday ? 'text' : 'textSecondary'}
            style={[styles.label, day.isToday && styles.today]}>
            {day.label}
          </ThemedText>
        ))}
      </View>
      <View style={styles.stats}>
        <Stat value={formatNumber(totals.average)} label="pas par jour" />
        <Stat value={`${totals.daysAtGoal} / 7`} label="jours à l’objectif" />
        <Stat value={formatNumber(totals.steps)} label="pas au total" />
      </View>
    </ThemedView>
  );
}

type HistoryProps = { days: HistoryRow[]; todaySteps: number | null };

/** Série de jours consécutifs à l'objectif, la meilleure et ce qu'il reste pour la garder. */
function StreakCard({
  days,
  todaySteps,
  goal,
  rule,
}: HistoryProps & { goal: number; rule: GoalRule }) {
  const theme = useTheme();
  // Même série protégée que sur l'accueil : un gel sauve un jour raté.
  const streak = protectedStreak(days, new Date(), todaySteps, rule);
  const message = [
    streak.current === 0
      ? `Atteignez ${formatNumber(goal)} pas aujourd’hui pour lancer une série.`
      : streak.todayDone
        ? 'Objectif du jour atteint, la série continue demain.'
        : `Atteignez l’objectif aujourd’hui pour passer à ${streak.current + 1} jours.`,
    `${streak.freezes} gel${streak.freezes > 1 ? 's' : ''} en réserve.`,
    streak.frozenDays.length > 0
      ? `${streak.frozenDays.length} jour${streak.frozenDays.length > 1 ? 's' : ''} sauvé${streak.frozenDays.length > 1 ? 's' : ''} par un gel.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.streakHeader}>
        <View style={styles.flex}>
          <ThemedText type="smallBold">Série en cours</ThemedText>
          <ThemedText>
            <ThemedText
              type="subtitle"
              style={{ color: streak.current > 0 ? theme.success : theme.text }}>
              {streak.current}
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              {streak.current > 1 ? ' jours d’affilée' : ' jour'}
            </ThemedText>
          </ThemedText>
        </View>
        <View style={styles.streakBest}>
          <ThemedText type="stat">{streak.best}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            meilleure série
          </ThemedText>
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {message}
      </ThemedText>
    </ThemedView>
  );
}

/** Mois en cours : totaux et comparaison au mois précédent à la même date. */
function MonthCard({ days, todaySteps, goal }: HistoryProps & { goal: GoalRule }) {
  const today = new Date();
  const { current, previous } = monthTotals(days, today, todaySteps, goal);
  const month = today.toLocaleDateString('fr-FR', { month: 'long' });

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{`En ${month}`}</ThemedText>
      <View style={styles.stats}>
        <Stat value={formatNumber(current.steps)} label="pas" />
        <Stat value={formatDistance(current.distanceM)} label="parcourus" />
        <Stat value={`${formatNumber(current.calories)}`} label="kcal" />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {`${current.daysAtGoal} jour${current.daysAtGoal > 1 ? 's' : ''} à l’objectif sur ${current.days}. `}
        {comparison(current, previous)}
      </ThemedText>
    </ThemedView>
  );
}

function comparison(current: PeriodTotals, previous: PeriodTotals): string {
  if (previous.steps === 0) return '';
  const change = Math.round(((current.steps - previous.steps) / previous.steps) * 100);
  if (change === 0) return 'Autant de pas que le mois dernier à la même date.';
  return `${change > 0 ? '+' : ''}${change} % de pas par rapport au mois dernier à la même date.`;
}

/** Records personnels et cumul sur les 12 derniers mois. */
function RecordsCard({
  days,
  todaySteps,
  longestWalk,
}: HistoryProps & { longestWalk: WalkRow | null }) {
  const best = bestDay(days, new Date(), todaySteps);
  const totals = historyTotals(days);
  const formatDay = (day: string) => {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(year, month - 1, date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
    });
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Records</ThemedText>
      <RecordRow
        label="Meilleure journée"
        value={best ? `${formatNumber(best.steps)} pas` : '–'}
        detail={best ? formatDay(best.day) : null}
      />
      <RecordRow
        label="Plus long trajet"
        value={longestWalk?.distance_m ? formatDistance(longestWalk.distance_m) : '–'}
        detail={
          longestWalk
            ? `${MODE_LABELS[longestWalk.mode]}, ${new Date(longestWalk.started_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
            : null
        }
      />
      <RecordRow
        label="Distance sur 12 mois"
        value={formatDistance(totals.distanceM)}
        detail={`${formatNumber(totals.steps)} pas, ${formatNumber(totals.calories)} kcal`}
      />
    </ThemedView>
  );
}

function RecordRow({ label, value, detail }: { label: string; value: string; detail: string | null }) {
  return (
    <View style={styles.record}>
      <View style={styles.flex}>
        <ThemedText type="small">{label}</ThemedText>
        {detail ? (
          <ThemedText type="small" themeColor="textSecondary">
            {detail}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

/** Lieux découverts sur le total disponible, au global et par quartier. */
function PoiProgress({ zones }: { zones: PoiZoneStats[] }) {
  const theme = useTheme();
  const [showAll, setShowAll] = useState(false);
  const visited = zones.reduce((sum, zone) => sum + zone.visited, 0);
  const total = zones.reduce((sum, zone) => sum + zone.total, 0);
  const { explored, complete } = collectionCounts(zones);
  const shown = showAll ? zones : zones.slice(0, 5);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Collection de lieux</ThemedText>
      {zones.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Marchez près des repères orange de la carte : chaque lieu devant lequel vous passez est
          ajouté à votre collection.
        </ThemedText>
      ) : (
        <>
          <ThemedText>
            <ThemedText type="subtitle">{formatNumber(visited)}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {` sur ${formatNumber(total)} dans les quartiers où vous avez marché`}
            </ThemedText>
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {`${explored} quartier${explored > 1 ? 's' : ''} exploré${explored > 1 ? 's' : ''} à moitié, ${complete} complet${complete > 1 ? 's' : ''}.`}
          </ThemedText>
          {shown.map((zone) => {
            const level = zoneLevel(zone);
            const next = zoneNextStep(zone);
            return (
              <View key={`${zone.zone_x}/${zone.zone_y}`} style={styles.zone}>
                <View style={styles.zoneHeader}>
                  <ThemedText type="small" numberOfLines={1} style={styles.flex}>
                    {`${level === 'complete' ? '🏅 ' : level === 'explored' ? '🧭 ' : ''}${
                      zone.label ? `Autour de : ${zone.label}` : 'Quartier'
                    }`}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {`${zone.visited} / ${zone.total}`}
                  </ThemedText>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(100, (zone.visited / zone.total) * 100)}%`,
                        backgroundColor: VisitedPoiColor,
                      },
                    ]}
                  />
                </View>
                {next ? (
                  <View style={styles.zoneHeader}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                      {next}
                    </ThemedText>
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={Spacing.two}
                      // Un identifiant à chaque appui : la carte trace une nouvelle boucle même déjà ouverte.
                      onPress={() =>
                        router.navigate({
                          pathname: '/carte',
                          params: { quartier: `${zone.zone_x}/${zone.zone_y}/${Date.now()}` },
                        })
                      }>
                      <ThemedText type="smallBold" themeColor="tint">
                        Boucle vers les lieux manquants
                      </ThemedText>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
          {zones.length > 5 ? (
            <Pressable accessibilityRole="button" onPress={() => setShowAll((value) => !value)}>
              <ThemedText type="smallBold" themeColor="tint">
                {showAll ? 'Voir moins' : `Voir les ${zones.length} quartiers`}
              </ThemedText>
            </Pressable>
          ) : null}
        </>
      )}
    </ThemedView>
  );
}

function WalkItem({ walk }: { walk: WalkRow }) {
  const started = new Date(walk.started_at);
  const seconds = walk.ended_at ? (new Date(walk.ended_at).getTime() - started.getTime()) / 1000 : 0;
  const details = [
    formatDistance(walk.distance_m ?? 0),
    `${formatNumber(walk.steps ?? 0)} pas`,
    seconds > 0 ? formatDuration(seconds) : null,
  ].filter(Boolean);

  return (
    <ThemedView type="backgroundElement" style={styles.walk}>
      <View style={styles.walkHeader}>
        <ThemedText type="smallBold">{MODE_LABELS[walk.mode]}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {started.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
          {' · '}
          {started.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {details.join(' · ')}
      </ThemedText>
    </ThemedView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="stat">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
        {label}
      </ThemedText>
    </View>
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
    gap: Spacing.three,
    padding: Spacing.four,
    paddingTop: Platform.select({ web: Spacing.six + Spacing.four, default: Spacing.four }),
    paddingBottom: BottomTabInset + Spacing.four,
  },
  loader: {
    marginVertical: Spacing.six,
  },
  notice: {
    padding: Spacing.four,
    borderRadius: Spacing.three,
  },
  centered: {
    textAlign: 'center',
  },
  card: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
  chart: {
    flexDirection: 'row',
    height: 120,
    gap: Spacing.two,
  },
  labels: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: -Spacing.two,
  },
  label: {
    flex: 1,
    textAlign: 'center',
  },
  goalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.5,
  },
  barTrack: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: Spacing.two,
  },
  today: {
    fontWeight: '700',
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  zone: {
    gap: Spacing.one,
  },
  zoneHeader: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
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
  streakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  streakBest: {
    alignItems: 'center',
  },
  record: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  walk: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  walkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
