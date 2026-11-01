import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatNumber, Stat } from '@/components/active-walk';
import { RouteLine } from '@/components/map-route';
import { ShareSheet } from '@/components/share-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { feedback } from '@/lib/feedback';
import { formatDistance } from '@/lib/daily-progress';
import { formatDuration, regionForCoordinates } from '@/lib/loop';
import { type RoutePoi } from '@/lib/pois';
import { dayLine } from '@/lib/walk-guidance';
import { MIN_WALK_M, type WalkSummary } from '@/lib/walk-summary';
import { type SaveState } from '@/providers/walk-provider';

/** Bilan d'un trajet terminé, dans l'onglet Carte jusqu'à ce qu'on le ferme. */
export function WalkDone({
  summary,
  saveState,
  discovered,
  cellCount,
  points,
  day,
  onRetry,
  onClose,
}: {
  summary: WalkSummary;
  saveState: SaveState;
  discovered: RoutePoi[];
  cellCount: number;
  points: { latitude: number; longitude: number }[];
  day: { steps: number | null; goal: number; streak: number | null };
  onRetry: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const region = points.length > 1 ? regionForCoordinates(points) : null;
  const saved = saveState === 'saved';
  useEffect(() => {
    if (saved) feedback.success();
  }, [saved]);
  const [sharing, setSharing] = useState(false);
  const today = dayLine(day);
  const goalDone = day.steps !== null && day.steps >= day.goal;
  const seconds = (summary.endedAt.getTime() - summary.startedAt.getTime()) / 1000;
  const message = {
    saving: 'Enregistrement… Vous pouvez fermer, il continue.',
    saved: 'Trajet enregistré dans vos statistiques.',
    error: 'Le trajet n’a pas pu être enregistré.',
    'too-short': `Trajet trop court pour être enregistré (moins de ${MIN_WALK_M} m).`,
  }[saveState];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView
        edges={['top', 'left', 'right']}
        // La barre d'onglets flotte au-dessus de l'écran : on remonte les boutons.
        style={[
          styles.centeredScreen,
          styles.done,
          { paddingBottom: insets.bottom + BottomTabInset + Spacing.three },
        ]}>
        <ThemedText type="subtitle">
          {saveState === 'too-short' ? 'Trajet terminé' : 'Bravo !'}
        </ThemedText>
        {today ? (
          // Le moment le plus gratifiant : on y rappelle l'objectif du jour et la série.
          <ThemedText
            type="smallBold"
            themeColor={goalDone ? 'success' : 'textSecondary'}
            style={styles.centered}>
            {today}
          </ThemedText>
        ) : null}
        {region ? (
          // Aperçu fixe du chemin parcouru. Les gestes sont bloqués par la vue qui l'entoure : iOS
          // réutilise la vue native de cette carte pour la suivante (celle de l'onglet Carte), et un
          // pointerEvents="none" posé sur la carte y restait, la rendant impossible à déplacer.
          <View style={styles.recap} pointerEvents="none">
            <MapView
              style={StyleSheet.absoluteFill}
              initialRegion={region}
              showsPointsOfInterests={false}>
              <RouteLine coordinates={points} width={5} />
            </MapView>
          </View>
        ) : null}
        <View style={styles.stats}>
          <Stat value={formatDistance(summary.distanceM)} label="parcourus" />
          <Stat value={formatNumber(summary.steps)} label="pas" />
        </View>
        <View style={styles.stats}>
          <Stat value={formatDuration(seconds)} label="de marche" />
          <Stat value={`${formatNumber(summary.calories)} kcal`} label="dépensées" />
        </View>
        {discovered.length > 0 ? (
          <ThemedText style={styles.centered}>
            {discovered.length === 1
              ? `1 lieu découvert : ${discovered[0].title}`
              : `${discovered.length} lieux découverts : ${discovered.map((poi) => poi.title).join(', ')}`}
          </ThemedText>
        ) : null}
        {saveState === 'saved' && cellCount > 0 ? (
          <ThemedText style={styles.centered}>
            {`${formatNumber(cellCount)} case${cellCount > 1 ? 's' : ''} conquise${cellCount > 1 ? 's' : ''} pour 7 jours`}
          </ThemedText>
        ) : null}
        <ThemedText
          type="small"
          style={[styles.centered, saveState === 'error' && { color: theme.danger }]}
          themeColor="textSecondary">
          {message}
        </ThemedText>
        {saveState === 'error' ? (
          <Button title="Réessayer" variant="secondary" onPress={onRetry} />
        ) : null}
        {saveState === 'saved' && points.length > 1 ? (
          <Button title="Partager l’image" onPress={() => setSharing(true)} />
        ) : null}
        {/* L'enregistrement continue une fois l'écran fermé : un réseau lent ne bloque personne. */}
        <Button
          title="Fermer"
          variant={saveState === 'saved' && points.length > 1 ? 'secondary' : 'primary'}
          onPress={onClose}
        />
      </SafeAreaView>
      <ShareSheet
        visible={sharing}
        onClose={() => setSharing(false)}
        paths={[points]}
        title={summary.mode === 'loop' ? 'Ma boucle' : 'Ma marche'}
        subtitle={
          today ?? summary.startedAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
        }
        stats={shareStats(summary, seconds, discovered.length, cellCount)}
      />
    </ThemedView>
  );
}

/** Chiffres de l'image partagée : les trois classiques, puis ce qui rend ce trajet unique. */
function shareStats(summary: WalkSummary, seconds: number, places: number, cells: number) {
  const stats = [
    { value: formatDistance(summary.distanceM), label: 'parcourus' },
    { value: formatNumber(summary.steps), label: 'pas' },
    { value: formatDuration(seconds), label: 'de marche' },
  ];
  if (places > 0) stats.push({ value: String(places), label: places > 1 ? 'lieux' : 'lieu' });
  else if (cells > 0)
    stats.push({ value: formatNumber(cells), label: cells > 1 ? 'cases' : 'case' });
  return stats;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centeredScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  done: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  recap: {
    alignSelf: 'stretch',
    height: 200,
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignSelf: 'stretch',
  },
  centered: {
    textAlign: 'center',
  },
});
