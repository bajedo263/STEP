import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Linking, Pressable, Share, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polygon } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeadingCone } from '@/components/heading-cone';
import { PoiMarker, RouteLine } from '@/components/map-route';
import { PoiSheet, PoiStory } from '@/components/poi-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { ConquestMineColor, MaxContentWidth, PoiColor, Radius, Spacing, VisitedPoiColor } from '@/constants/theme';
import { useCollapsiblePanel } from '@/hooks/use-collapsible-panel';
import { useTheme } from '@/hooks/use-theme';
import { useHeading } from '@/hooks/use-heading';
import { localFlag, setLocalFlag } from '@/hooks/use-local-flag';
import { useElapsedSeconds } from '@/hooks/use-walk-tracker';
import { feedback } from '@/lib/feedback';
import { cellKey, cellPolygon, cellsAlongTrack } from '@/lib/conquest';
import { formatDistance } from '@/lib/daily-progress';
import { formatDuration, regionForCoordinates } from '@/lib/loop';
import { upcomingPois } from '@/lib/map-declutter';
import { distanceM, nearestPois, POI_KIND_LABELS, type RoutePoi } from '@/lib/pois';
import { formatElapsed, remainingAlongPath } from '@/lib/track';
import { type WalkSummary } from '@/lib/walk-summary';
import {
  endWalk,
  type ActiveWalk as Walk,
  type SaveState,
  useActiveWalk,
  useWalkStarting,
} from '@/providers/walk-provider';

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');

const AWAKE_HINT_KEY = 'step.awake-hint-seen';
/** Hauteur réservée aux boutons du haut (marge comprise). */
const TOP_BUTTONS_HEIGHT = 64;

/**
 * Écran du trajet en cours. Le suivi tourne en fond de l'app (walk-provider) : on peut réduire
 * cet écran pour consulter les stats ou les amis, puis y revenir par le bandeau.
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

  return (
    <ActiveWalk
      walk={walk}
      onFinish={() =>
        Alert.alert('Terminer le trajet ?', undefined, [
          { text: 'Continuer', style: 'cancel' },
          { text: 'Terminer', style: 'destructive', onPress: walk.finish },
        ])
      }
    />
  );
}

function ActiveWalk({ walk, onFinish }: { walk: Walk; onFinish: () => void }) {
  const { tracker, planned, plannedPois: pois, discovery, estimatedSteps, conquering } = walk;
  const theme = useTheme();
  const elapsed = useElapsedSeconds(tracker.startedAt, true);
  const plannedRoute = planned.mode === 'free' ? null : planned.route;
  // Le rappel « écran allumé » ne s'affiche qu'au premier trajet sur ce téléphone.
  const [showAwakeHint] = useState(() => localFlag(AWAKE_HINT_KEY) === null);
  useEffect(() => setLocalFlag(AWAKE_HINT_KEY, '1'), []);
  // Pour ne pas couvrir la carte : les 3 prochains lieux du trajet, plus ceux déjà découverts.
  // En marche libre, sans trajet, ce sont les 3 lieux les plus proches.
  const lastPoint = tracker.track.points.at(-1);
  const next = plannedRoute
    ? upcomingPois(
        pois.filter((poi) => !discovery.isVisited(poi)).map((poi) => ({ ...poi, visited: false })),
        plannedRoute.coordinates,
        lastPoint
      )
    : nearestPois(discovery.all.filter((poi) => !discovery.isVisited(poi)), lastPoint);
  const shown = [
    ...next,
    ...pois.filter((poi) => discovery.isVisited(poi) && !next.some((n) => n.id === poi.id)),
    ...discovery.discovered.filter(
      (d) => !pois.some((p) => p.id === d.id) && !next.some((n) => n.id === d.id)
    ),
  ];
  const start = plannedRoute ? plannedRoute.coordinates[0] : tracker.track.points[0];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  // Boussole : la carte pivote avec le téléphone pour montrer droit devant ce qui est en face.
  const heading = useHeading();
  const [followHeading, setFollowHeading] = useState(true);
  // Orientation actuelle de la carte : le cône tourne de l'écart entre le téléphone et la carte.
  const [mapHeading, setMapHeading] = useState(0);
  // Le point bleu et le cône sont dessinés ensemble, à la position GPS brute : la trace lissée
  // est posée sur l'itinéraire, et le point natif de la carte ne s'aligne pas avec un marqueur.
  const position = tracker.position ?? tracker.track.points.at(-1) ?? null;
  const panel = useCollapsiblePanel();
  // Ce qu'il reste à marcher (trajet prévu) ou ce qu'on a marché (marche libre).
  const mainDistance = plannedRoute
    ? formatDistance(remainingAlongPath(plannedRoute.coordinates, tracker.track))
    : formatDistance(tracker.track.distanceM);
  const latitude = position?.latitude;
  const longitude = position?.longitude;

  // La carte suit la position ; en suivi du cap, elle tourne aussi avec le téléphone.
  useEffect(() => {
    if (latitude === undefined || longitude === undefined) return;
    mapRef.current?.animateCamera(
      followHeading
        ? { center: { latitude, longitude }, heading: heading ?? 0 }
        : { center: { latitude, longitude } },
      { duration: 400 }
    );
  }, [followHeading, heading, latitude, longitude]);

  // En suivi du cap, la carte est tournée comme le téléphone : le cône pointe vers le haut.
  const shownMapHeading = followHeading ? (heading ?? 0) : mapHeading;

  const toggleFollow = () => {
    if (followHeading) {
      // Retour au nord en haut.
      mapRef.current?.animateCamera({ heading: 0 }, { duration: 400 });
      setMapHeading(0);
    }
    setFollowHeading(!followHeading);
  };
  const selected = shown.find((poi) => poi.id === selectedId) ?? null;
  // Cases prises en marchant (le départ ne compte pas, pour ne pas montrer l'adresse).
  const cells = useMemo(
    () => (conquering ? cellsAlongTrack(tracker.track.points) : []),
    [conquering, tracker.track.points]
  );

  const failed = tracker.status === 'denied' || tracker.status === 'error';

  if (failed) {
    return (
      <ThemedView style={[styles.container, styles.centeredScreen]}>
        <ThemedText style={styles.centered}>
          {tracker.status === 'denied'
            ? 'STEP a besoin de votre position pour suivre le trajet.'
            : 'Le suivi de position n’a pas pu démarrer.'}
        </ThemedText>
        <Button
          title="Retour"
          onPress={() => {
            router.back();
            endWalk();
          }}
        />
      </ThemedView>
    );
  }

  return (
    <View style={styles.container}>
      {start ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{ ...start, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
          showsCompass={false}
          showsPointsOfInterests={false}
          // Déplacer la carte à la main suspend le suivi du cap.
          onPanDrag={() => setFollowHeading(false)}
          onRegionChangeComplete={() => {
            if (followHeading) return;
            // La carte a pu être tournée au doigt : on relit son orientation.
            mapRef.current
              ?.getCamera()
              .then((camera) => setMapHeading(camera.heading ?? 0))
              .catch(() => {});
          }}
          onPress={(event) => {
            if (event.nativeEvent.action !== 'marker-press') setSelectedId(null);
          }}>
          {plannedRoute ? <RouteLine coordinates={plannedRoute.coordinates} faded /> : null}
          {planned.mode === 'destination' ? (
            <Marker coordinate={planned.route.coordinates.at(-1)!} title={planned.label} pinColor={theme.tint} />
          ) : null}
          {shown.map((poi) => {
            const visited = discovery.isVisited(poi);
            return (
              <PoiMarker
                key={`${poi.id}-${visited}`}
                poi={poi}
                visited={visited}
                onPress={() => setSelectedId(poi.id)}
              />
            );
          })}
          {cells.map((cell) => (
            <Polygon
              key={cellKey(cell)}
              coordinates={cellPolygon(cell)}
              fillColor={`${ConquestMineColor}40`}
              strokeWidth={0}
            />
          ))}
          {position ? (
            // Point bleu et cône dans le même marqueur : ils ne peuvent plus se décaler.
            // Le cône est tourné dans la vue elle-même : Apple Plans ignore la rotation des marqueurs.
            <Marker coordinate={position} anchor={{ x: 0.5, y: 0.5 }} zIndex={10}>
              <View style={styles.userMarker} pointerEvents="none">
                {heading !== null ? (
                  <View style={styles.userCone}>
                    <HeadingCone color={theme.tint} rotation={heading - shownMapHeading} />
                  </View>
                ) : null}
                <View style={styles.userDot} />
              </View>
            </Marker>
          ) : null}
          {tracker.track.points.length > 1 ? (
            <RouteLine coordinates={tracker.track.points} width={7} />
          ) : null}
        </MapView>
      ) : (
        <ThemedView style={[StyleSheet.absoluteFill, styles.centeredScreen]}>
          <ThemedText themeColor="textSecondary">Recherche du signal GPS…</ThemedText>
        </ThemedView>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityHint="Le trajet continue pendant que vous consultez le reste de l’app"
        onPress={() => router.back()}
        style={({ pressed }) => [
          styles.compassButton,
          styles.minimizeButton,
          { top: insets.top + Spacing.three, backgroundColor: theme.background },
          pressed && styles.pressed,
        ]}>
        <ThemedText type="smallBold" style={{ color: theme.tint }}>
          Réduire
        </ThemedText>
      </Pressable>

      {start ? (
        <Pressable
          accessibilityRole="button"
          onPress={toggleFollow}
          style={({ pressed }) => [
            styles.compassButton,
            { top: insets.top + Spacing.three, backgroundColor: theme.background },
            pressed && styles.pressed,
          ]}>
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            {followHeading ? 'Nord en haut' : 'Suivre mon cap'}
          </ThemedText>
        </Pressable>
      ) : null}

      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.overlay}>
        {discovery.here ? (
          <PoiBanner
            poi={discovery.here}
            status={
              discovery.hereIsNew ? 'new' : discovery.isVisited(discovery.here) ? 'visited' : 'here'
            }
          />
        ) : null}
        {/* Glisser vers le bas condense le panneau sur une ligne pour dégager la carte. */}
        <Animated.View
          {...panel.panHandlers}
          style={[styles.cardWrapper, { transform: [{ translateY: panel.translateY }] }]}>
          <ThemedView style={[styles.card, panel.collapsed && styles.cardCollapsed]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={panel.collapsed ? 'Déplier le panneau' : 'Replier le panneau'}
              hitSlop={Spacing.three}
              onPress={panel.toggle}
              style={panel.collapsed ? styles.grabberAreaCollapsed : styles.grabberArea}>
              <View style={[styles.grabber, { backgroundColor: theme.backgroundSelected }]} />
            </Pressable>
            {panel.collapsed ? (
              <Pressable
                accessibilityRole="button"
                onPress={panel.expand}
                style={styles.collapsedRow}>
                <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
                  {`${mainDistance} ${plannedRoute ? 'restants' : 'parcourus'}`}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {`${formatElapsed(elapsed)} · ${formatNumber(estimatedSteps)} pas`}
                </ThemedText>
              </Pressable>
            ) : (
              <>
                {/* Ce qu'on cherche d'un coup d'œil : ce qu'il reste à marcher, puis le prochain lieu. */}
                <ThemedText type="title" style={styles.centered}>
                  {mainDistance}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                  {plannedRoute
                    ? next[0]
                      ? `restants · prochain lieu : ${next[0].title}`
                      : 'restants'
                    : next[0] && lastPoint
                      ? `parcourus · lieu le plus proche : ${next[0].title}, à ${formatDistance(distanceM(next[0].coords, lastPoint))}`
                      : 'parcourus'}
                </ThemedText>
                <View style={styles.stats}>
                  <Stat value={formatElapsed(elapsed)} label="de marche" />
                  <Stat value={formatNumber(estimatedSteps)} label="pas" />
                  {plannedRoute ? (
                    <Stat value={formatDistance(tracker.track.distanceM)} label="parcourus" />
                  ) : null}
                </View>
                {showAwakeHint ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                    {tracker.background
                      ? 'Rangez votre téléphone : STEP suit la marche même écran éteint.'
                      : 'Gardez STEP ouvert pendant la marche : l’écran reste allumé.'}
                  </ThemedText>
                ) : null}
                <Button title="Terminer" onPress={onFinish} />
              </>
            )}
          </ThemedView>
        </Animated.View>
      </SafeAreaView>

      {selected ? (
        <PoiSheet
          poi={selected}
          visited={discovery.isVisited(selected)}
          onClose={() => setSelectedId(null)}
          // Sous les boutons « Réduire » et « Suivre mon cap ».
          topOffset={TOP_BUTTONS_HEIGHT}
        />
      ) : null}
    </View>
  );
}

/** Le lieu devant lequel on passe : c'est pour lui que le trajet passe par là. */
function PoiBanner({ poi, status }: { poi: RoutePoi; status: 'new' | 'visited' | 'here' }) {
  const theme = useTheme();
  const color = status === 'here' ? PoiColor : VisitedPoiColor;
  const heading = {
    new: 'Nouveau lieu découvert !',
    visited: 'Déjà découvert',
    here: 'À voir ici',
  }[status];
  return (
    <ThemedView style={[styles.card, styles.banner, { borderColor: color }]}>
      <ThemedText type="small" style={{ color }}>
        {`${heading} · ${POI_KIND_LABELS[poi.kind]}`}
      </ThemedText>
      <ThemedText type="smallBold">{poi.title}</ThemedText>
      <PoiStory poi={poi} numberOfLines={4} />
      {poi.wikipediaUrl ? (
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(poi.wikipediaUrl!)}>
          <ThemedText type="small" style={{ color: theme.tint }}>
            En savoir plus sur Wikipédia
          </ThemedText>
        </Pressable>
      ) : null}
    </ThemedView>
  );
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
        <ThemedText type="subtitle">{saveState === 'too-short' ? 'Trajet terminé' : 'Bravo !'}</ThemedText>
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
        {saveState === 'error' ? <Button title="Réessayer" variant="secondary" onPress={onRetry} /> : null}
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
function shareMessage(summary: WalkSummary, seconds: number, places: number, cells: number): string {
  const parts = [
    `${formatDistance(summary.distanceM)} et ${formatNumber(summary.steps)} pas en ${formatDuration(seconds)} avec STEP`,
  ];
  if (places > 0) parts.push(`${places} lieu${places > 1 ? 'x' : ''} découvert${places > 1 ? 's' : ''}`);
  if (cells > 0) parts.push(`${formatNumber(cells)} case${cells > 1 ? 's' : ''} conquise${cells > 1 ? 's' : ''}`);
  return `${parts.join(', ')} !`;
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
  pressed: {
    opacity: 0.6,
  },
  minimizeButton: {
    right: undefined,
    left: Spacing.three,
  },
  compassButton: {
    position: 'absolute',
    right: Spacing.three,
    zIndex: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: Spacing.three,
    pointerEvents: 'box-none',
  },
  cardWrapper: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  // Replié : pas de marges négatives autour de la poignée, qui rognaient la ligne de texte.
  cardCollapsed: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  grabberAreaCollapsed: {
    alignSelf: 'center',
    paddingVertical: Spacing.one,
  },
  flex: {
    flex: 1,
  },
  userMarker: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userCone: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  userDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: '#0A84FF',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  grabberArea: {
    alignSelf: 'center',
    paddingVertical: Spacing.one,
    marginTop: -Spacing.three,
    marginBottom: -Spacing.two,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
  },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  banner: {
    gap: Spacing.one,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    borderWidth: 2,
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
  centered: {
    textAlign: 'center',
  },
});
