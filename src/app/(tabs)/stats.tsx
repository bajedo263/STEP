import { useMemo } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, VisitedPoiColor } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useStats, type PoiZoneStats, type WalkRow } from '@/hooks/use-stats';
import { useTheme } from '@/hooks/use-theme';
import { useTodaySteps } from '@/hooks/use-today-steps';
import { formatDistance } from '@/lib/daily-progress';
import { formatDuration } from '@/lib/loop';
import { buildWeek, weekTotals, type WeekDay } from '@/lib/stats';
import { DEFAULT_DAILY_GOAL } from '@/lib/steps';

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
  const goal = profile?.daily_goal ?? DEFAULT_DAILY_GOAL;
  const todaySteps = today.status === 'ready' ? today.steps : null;

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
              <WeekSummary week={week} goal={goal} />
              <PoiProgress zones={stats.poiZones} />
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

function WeekSummary({ week, goal }: { week: WeekDay[]; goal: number }) {
  const theme = useTheme();
  const totals = weekTotals(week, goal);
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
                  backgroundColor: day.steps >= goal ? theme.tint : theme.backgroundSelected,
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

/** Lieux découverts sur le total disponible, au global et par quartier. */
function PoiProgress({ zones }: { zones: PoiZoneStats[] }) {
  const theme = useTheme();
  const visited = zones.reduce((sum, zone) => sum + zone.visited, 0);
  const total = zones.reduce((sum, zone) => sum + zone.total, 0);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Lieux découverts</ThemedText>
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
          {zones.slice(0, 5).map((zone) => (
            <View key={`${zone.zone_x}/${zone.zone_y}`} style={styles.zone}>
              <View style={styles.zoneHeader}>
                <ThemedText type="small" numberOfLines={1} style={styles.flex}>
                  {zone.label ? `Autour de : ${zone.label}` : 'Quartier'}
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
            </View>
          ))}
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
      <ThemedText type="smallBold">{value}</ThemedText>
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
