import { router } from 'expo-router';
import { useEffect } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import MapView from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActiveWalkView, confirmFinish, formatNumber, Stat } from '@/components/active-walk';
import { RouteLine } from '@/components/map-route';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { feedback } from '@/lib/feedback';
import { formatDistance } from '@/lib/daily-progress';
import { formatDuration, regionForCoordinates } from '@/lib/loop';
import { type RoutePoi } from '@/lib/pois';
import { type WalkSummary } from '@/lib/walk-summary';
import { endWalk, type SaveState, useActiveWalk, useWalkStarting } from '@/providers/walk-provider';

/**
 * Écran du trajet en cours. Le suivi tourne en fond de l'app (walk-provider) : on peut réduire
 * cet écran : le trajet continue alors dans l'onglet Carte (voir carte.tsx).
 */
export default function WalkScreen() {
  const walk = useActiveWalk();
  const starting = useWalkStarting();

  if (!walk) {
    if (starting) {
      return (
        <ThemedView style={[styles.container, styles.centeredScreen]}>
          <ThemedText themeColor="textSecondary">Démarrage du trajet…</ThemedText>
        </ThemedView>
      );
    }
    return (
      <ThemedView style={[styles.container, styles.centeredScreen]}>
        <ThemedText style={styles.centered}>Aucun trajet en cours.</ThemedText>
        <Button title="Retour" onPress={() => router.back()} />
      </ThemedView>
    );
  }

  if (walk.summary) {
    return (
      <WalkDone
        summary={walk.summary}
        saveState={walk.saveState}
        discovered={walk.discovery.discovered}
        cellCount={walk.cellCount}
        points={walk.tracker.track.points}
        onRetry={walk.retrySave}
      />
    );
  }

  return <ActiveWalkView walk={walk} onFinish={() => confirmFinish(walk)} />;
}

function WalkDone({
  summary,
  saveState,
  discovered,
  cellCount,
  points,
  onRetry,
}: {
  summary: WalkSummary;
  saveState: SaveState;
  discovered: RoutePoi[];
  cellCount: number;
  points: { latitude: number; longitude: number }[];
  onRetry: () => void;
}) {
  const theme = useTheme();
  const region = points.length > 1 ? regionForCoordinates(points) : null;
  const saved = saveState === 'saved';
  useEffect(() => {
    if (saved) feedback.success();
  }, [saved]);
  const seconds = (summary.endedAt.getTime() - summary.startedAt.getTime()) / 1000;
  const message = {
    saving: 'Enregistrement…',
    saved: 'Trajet enregistré dans vos statistiques.',
    error: 'Le trajet n’a pas pu être enregistré.',
    'too-short': 'Trajet trop court pour être enregistré.',
  }[saveState];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={[styles.centeredScreen, styles.done]}>
        <ThemedText type="subtitle">
          {saveState === 'too-short' ? 'Trajet terminé' : 'Bravo !'}
        </ThemedText>
        {region ? (
          // Aperçu fixe du chemin parcouru.
          <View style={styles.recap}>
            <MapView
              style={StyleSheet.absoluteFill}
              initialRegion={region}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              showsPointsOfInterests={false}
              pointerEvents="none">
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
        {saveState === 'saved' ? (
          <Button
            title="Partager"
            variant="secondary"
            onPress={() =>
              Share.share({
                message: shareMessage(summary, seconds, discovered.length, cellCount),
              }).catch(() => {})
            }
          />
        ) : null}
        <Button
          title="Fermer"
          disabled={saveState === 'saving'}
          onPress={() => {
            router.dismissTo('/');
            // Après la fermeture, pour ne pas faire clignoter l'écran pendant l'animation.
            setTimeout(endWalk, 600);
          }}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

/** Texte partagé à la fin d'un trajet : les chiffres, puis ce qui le rend unique. */
function shareMessage(
  summary: WalkSummary,
  seconds: number,
  places: number,
  cells: number
): string {
  const parts = [
    `${formatDistance(summary.distanceM)} et ${formatNumber(summary.steps)} pas en ${formatDuration(seconds)} avec STEP`,
  ];
  if (places > 0)
    parts.push(`${places} lieu${places > 1 ? 'x' : ''} découvert${places > 1 ? 's' : ''}`);
  if (cells > 0)
    parts.push(
      `${formatNumber(cells)} case${cells > 1 ? 's' : ''} conquise${cells > 1 ? 's' : ''}`
    );
  return `${parts.join(', ')} !`;
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
