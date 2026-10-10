import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ShareSheet } from '@/components/share-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { WalkPathsMap } from '@/components/walk-paths-map';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useMemoryData } from '@/hooks/use-memories';
import { useWalkPaths } from '@/hooks/use-walk-paths';
import { formatDistance } from '@/lib/daily-progress';
import { memoriesFor, placesByMonth } from '@/lib/memories';
import { useAuth } from '@/providers/auth-provider';

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');

/** Souvenirs : la carte de tous ses trajets, les anniversaires du jour et les lieux par mois. */
export default function SouvenirsScreen() {
  const { session } = useAuth();
  const data = useMemoryData();
  const paths = useWalkPaths(null);
  const [sharing, setSharing] = useState(false);

  const memories = useMemo(
    () => (data ? memoriesFor(new Date(), data.visits, data.walks) : []),
    [data]
  );
  const months = useMemo(() => (data ? placesByMonth(data.visits) : []), [data]);
  const totals = useMemo(
    () =>
      data
        ? {
            walks: data.walks.length,
            distanceM: data.walks.reduce((sum, walk) => sum + (walk.distance_m ?? 0), 0),
            places: data.visits.length,
          }
        : null,
    [data]
  );
  const createdAt = session?.user.created_at;
  const since = createdAt
    ? new Date(createdAt).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const shareStats = totals
    ? [
        { value: formatNumber(totals.walks), label: totals.walks > 1 ? 'trajets' : 'trajet' },
        { value: formatDistance(totals.distanceM), label: 'parcourus' },
        { value: formatNumber(totals.places), label: totals.places > 1 ? 'lieux' : 'lieu' },
      ]
    : [];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView
        style={styles.safeArea}
        edges={Platform.OS === 'ios' ? ['left', 'right'] : ['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Souvenirs</ThemedText>
          {since ? (
            <ThemedText themeColor="textSecondary">{`Tout ce que vous avez parcouru depuis le ${since}.`}</ThemedText>
          ) : null}

          {paths === null ? <ActivityIndicator style={styles.loader} /> : null}
          {paths === 'unavailable' ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="small" themeColor="textSecondary">
                La carte de vos trajets arrive bientôt.
              </ThemedText>
            </ThemedView>
          ) : null}
          {Array.isArray(paths) && paths.length > 0 ? <WalkPathsMap paths={paths} /> : null}
          {Array.isArray(paths) && paths.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="small" themeColor="textSecondary">
                Vos trajets se dessineront ici, marche après marche.
              </ThemedText>
            </ThemedView>
          ) : null}

          {totals ? (
            <ThemedView type="backgroundElement" style={styles.totals}>
              {shareStats.map((stat) => (
                <View key={stat.label} style={styles.total}>
                  <ThemedText type="subtitle">{stat.value}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {stat.label}
                  </ThemedText>
                </View>
              ))}
            </ThemedView>
          ) : null}
          {totals && totals.walks > 0 ? (
            <Button title="Partager ma carte" onPress={() => setSharing(true)} />
          ) : null}

          {memories.length > 0 ? (
            <>
              <ThemedText type="smallBold" style={styles.section}>
                Ce jour-là
              </ThemedText>
              {memories.map((memory) => (
                <ThemedView key={memory.when} type="backgroundElement" style={styles.card}>
                  <ThemedText type="smallBold">{memory.when}</ThemedText>
                  <ThemedText type="small">{memory.text}</ThemedText>
                </ThemedView>
              ))}
            </>
          ) : null}

          {months.length > 0 ? (
            <>
              <ThemedText type="smallBold" style={styles.section}>
                Lieux découverts
              </ThemedText>
              {months.map((month) => (
                <ThemedView key={month.month} type="backgroundElement" style={styles.card}>
                  <ThemedText type="smallBold">
                    {`${month.month.charAt(0).toUpperCase()}${month.month.slice(1)} · ${month.names.length} lieu${month.names.length > 1 ? 'x' : ''}`}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {month.names.join(', ')}
                  </ThemedText>
                </ThemedView>
              ))}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
      <ShareSheet
        visible={sharing}
        onClose={() => setSharing(false)}
        since={null}
        title="Mes trajets"
        subtitle={since ? `depuis le ${since}` : 'depuis le début'}
        stats={shareStats}
      />
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
    gap: Spacing.three,
    padding: Spacing.four,
    paddingTop: Platform.select({ web: Spacing.six + Spacing.four, default: Spacing.four }),
    paddingBottom: Spacing.six,
  },
  loader: {
    marginVertical: Spacing.five,
  },
  card: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.tile,
  },
  totals: {
    flexDirection: 'row',
    paddingVertical: Spacing.three,
    borderRadius: Radius.tile,
  },
  total: {
    flex: 1,
    alignItems: 'center',
  },
  section: {
    marginTop: Spacing.two,
  },
});
