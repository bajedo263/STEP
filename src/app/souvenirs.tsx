import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ShareSheet } from '@/components/share-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { CardLink } from '@/components/ui/card-link';
import { WalkPathsMap } from '@/components/walk-paths-map';
import { MaxContentWidth, Radius, Spacing, VisitedPoiColor } from '@/constants/theme';
import { useMemoryState } from '@/hooks/use-memories';
import { useWalkPathsState } from '@/hooks/use-walk-paths';
import { formatDistance } from '@/lib/daily-progress';
import { memoriesFor, placesByMonth } from '@/lib/memories';
import { useAuth } from '@/providers/auth-provider';

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');

/** Souvenirs : la carte de tous ses trajets, les anniversaires du jour et les lieux par mois. */
export default function SouvenirsScreen() {
  const { session } = useAuth();
  const memory = useMemoryState();
  const data = memory.data;
  const walkPaths = useWalkPathsState(null);
  const paths = walkPaths.paths;
  const failed = (memory.failed && !data) || paths === 'error';
  const retry = () => {
    if (memory.failed) memory.retry();
    if (paths === 'error') walkPaths.retry();
  };
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

          {failed ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="small">
                Vos souvenirs n’ont pas pu être chargés. Vérifiez votre connexion.
              </ThemedText>
              <Button title="Réessayer" variant="secondary" style={styles.inCard} onPress={retry} />
            </ThemedView>
          ) : null}
          {paths === null || (!data && !memory.failed) ? (
            <ActivityIndicator style={styles.loader} />
          ) : null}
          {paths === 'unavailable' ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="small" themeColor="textSecondary">
                La carte de vos trajets arrive bientôt.
              </ThemedText>
            </ThemedView>
          ) : null}
          {Array.isArray(paths) && paths.length > 0 ? <WalkPathsMap paths={paths} /> : null}

          {totals && totals.walks === 0 ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">Pas encore de trajet</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Chaque marche enregistrée se dessinera ici, avec les lieux découverts en chemin.
              </ThemedText>
              <Button
                title="Lancer une boucle"
                style={styles.inCard}
                onPress={() => {
                  router.back();
                  router.navigate(`/carte?boucle=${Date.now()}`);
                }}
              />
            </ThemedView>
          ) : null}

          {totals && totals.walks > 0 ? (
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
                <MonthPlaces key={month.month} month={month.month} names={month.names} />
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

/** Lieux montrés d'emblée pour chaque mois. */
const PLACES_SHOWN = 5;

/** Les lieux d'un mois en liste, un par ligne, les plus récents d'abord. */
function MonthPlaces({ month, names }: { month: string; names: string[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? names : names.slice(0, PLACES_SHOWN);
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">
        {`${month.charAt(0).toUpperCase()}${month.slice(1)} · ${names.length} lieu${names.length > 1 ? 'x' : ''}`}
      </ThemedText>
      {shown.map((name, index) => (
        <View key={`${name}-${index}`} style={styles.place}>
          <View style={[styles.dot, { backgroundColor: VisitedPoiColor }]} />
          <ThemedText type="small" style={styles.flex}>
            {name}
          </ThemedText>
        </View>
      ))}
      {names.length > PLACES_SHOWN ? (
        <CardLink
          title={showAll ? 'Voir moins' : `Voir les ${names.length - PLACES_SHOWN} autres`}
          onPress={() => setShowAll((value) => !value)}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  flex: {
    flex: 1,
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
  content: {
    gap: Spacing.three,
    padding: Spacing.four,
    paddingTop: Platform.select({ web: Spacing.six + Spacing.four, default: Spacing.four }),
    paddingBottom: Spacing.six,
  },
  loader: {
    marginVertical: Spacing.five,
  },
  inCard: {
    marginTop: Spacing.two,
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
