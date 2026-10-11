import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Celebration } from '@/components/celebration';
import { HeadingCone } from '@/components/heading-cone';
import { PoiClusterMarker, PoiMarker, RouteLine } from '@/components/map-route';
import { PoiBanner } from '@/components/poi-banner';
import { PoiSheet } from '@/components/poi-sheet';
import { PhotoZoomOverlay } from '@/components/zoomable-photo';
import { TerritoryShape, territoryKey } from '@/components/territory-shape';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { BottomTabInset, ConquestMineColor, MaxContentWidth, Spacing } from '@/constants/theme';
import { useCollapsiblePanel } from '@/hooks/use-collapsible-panel';
import { useTheme } from '@/hooks/use-theme';
import { useHeading } from '@/hooks/use-heading';
import { localFlag, setLocalFlag } from '@/hooks/use-local-flag';
import { useElapsedSeconds } from '@/hooks/use-walk-tracker';
import { cellsAlongTrack, territories } from '@/lib/conquest';
import { formatDistance } from '@/lib/daily-progress';
import { regionForCoordinates } from '@/lib/loop';
import { clusterByRegion, FAN_OUT_DELTA, fanOut } from '@/lib/map-declutter';
import { distanceM, nearestPois } from '@/lib/pois';
import {
  formatElapsed,
  orientedPath,
  pathLength,
  progressAlongPath,
  upcomingAlongPath,
} from '@/lib/track';
import { endWalk, type ActiveWalk as Walk } from '@/providers/walk-provider';

/** Demande confirmation avant de terminer le trajet ; `then` s'exécute une fois terminé. */
export function confirmFinish(walk: Walk, then?: () => void) {
  Alert.alert('Terminer le trajet ?', undefined, [
    { text: 'Continuer', style: 'cancel' },
    {
      text: 'Terminer',
      style: 'destructive',
      onPress: () => {
        walk.finish();
        then?.();
      },
    },
  ]);
}

export const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');

const AWAKE_HINT_KEY = 'step.awake-hint-seen';
/** Hauteur réservée aux boutons du haut (marge comprise). */
const TOP_BUTTONS_HEIGHT = 64;

/**
 * Conquête déjà active au début de chaque trajet (par heure de départ) : survit à la réduction
 * de l'écran, pour ne fêter les 10 000 pas que s'ils sont franchis en marchant.
 */
const conquestAtStart = new Map<number, boolean>();

/**
 * Trajet en cours : la carte qui suit la position, les lieux à venir et le panneau des stats.
 * Affiché dans l'onglet Carte tant que le trajet dure, au-dessus de la barre d'onglets.
 */
export function ActiveWalkView({ walk, onFinish }: { walk: Walk; onFinish: () => void }) {
  const { tracker, planned, plannedPois: pois, discovery, estimatedSteps, conquering } = walk;
  const theme = useTheme();
  const elapsed = useElapsedSeconds(tracker.startedAt, true);
  const plannedRoute = planned.mode === 'free' ? null : planned.route;
  // Le rappel « écran allumé » ne s'affiche qu'au premier trajet sur ce téléphone.
  const [showAwakeHint] = useState(() => localFlag(AWAKE_HINT_KEY) === null);
  useEffect(() => setLocalFlag(AWAKE_HINT_KEY, '1'), []);
  // Le prochain lieu du trajet, annoncé dans le panneau ; en marche libre, le plus proche.
  const lastPoint = tracker.track.points.at(-1);
  // Une boucle peut se faire dans l'autre sens : on suit alors le tracé à rebours.
  const route = plannedRoute ? orientedPath(plannedRoute.coordinates, tracker.track) : null;
  const progressM = route ? progressAlongPath(route, tracker.track) : 0;
  const next = route
    ? upcomingAlongPath(
        pois.filter((poi) => !discovery.isVisited(poi)),
        route,
        progressM
      )
    : nearestPois(
        discovery.all.filter((poi) => !discovery.isVisited(poi)),
        lastPoint
      );
  // Sur la carte, tous les lieux du trajet (ou des environs en marche libre), regroupés en
  // pastilles numérotées quand ils se chevauchent, comme dans la préparation.
  const basePois = route ? pois : discovery.all;
  const mapPois = [
    ...basePois,
    ...discovery.discovered.filter((d) => !basePois.some((p) => p.id === d.id)),
  ];
  const [region, setRegion] = useState<Region | null>(null);
  const poiClusters = clusterByRegion(mapPois, region);
  const { width: windowWidth } = useWindowDimensions();
  const start = plannedRoute ? plannedRoute.coordinates[0] : tracker.track.points[0];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Fiche du lieu fermée d'un geste : elle ne revient qu'au lieu suivant.
  const [closedPoiId, setClosedPoiId] = useState<string | null>(null);
  // Un lieu déjà ouvert en haut de l'écran ne s'affiche pas une seconde fois en bas.
  const banner =
    discovery.here && discovery.here.id !== closedPoiId && discovery.here.id !== selectedId
      ? discovery.here
      : null;
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  // Boussole : la carte pivote avec le téléphone pour montrer droit devant ce qui est en face.
  const heading = useHeading();
  // Suivi de la carte : avec le cap, nord en haut, ou libre quand on l'a déplacée au doigt.
  const [follow, setFollow] = useState<'heading' | 'north' | 'free'>('heading');
  // Mode de suivi à retrouver en appuyant sur « Me recentrer ».
  const resumeFollow = useRef<'heading' | 'north'>('heading');
  const followHeading = follow === 'heading';
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  // Orientation actuelle de la carte : le cône tourne de l'écart entre le téléphone et la carte.
  const [mapHeading, setMapHeading] = useState(0);
  // Le point bleu et le cône sont dessinés ensemble, à la position GPS brute : la trace lissée
  // est posée sur l'itinéraire, et le point natif de la carte ne s'aligne pas avec un marqueur.
  const position = tracker.position ?? tracker.track.points.at(-1) ?? null;
  const panel = useCollapsiblePanel();
  // Ce qu'il reste à marcher (trajet prévu) ou ce qu'on a marché (marche libre).
  const mainDistance = route
    ? formatDistance(Math.max(0, pathLength(route) - progressM))
    : formatDistance(tracker.track.distanceM);
  const latitude = position?.latitude;
  const longitude = position?.longitude;

  // La carte suit la position ; en suivi du cap, elle tourne aussi avec le téléphone.
  // Déplacée à la main, elle reste où on l'a mise jusqu'à « Me recentrer ».
  useEffect(() => {
    if (follow === 'free' || latitude === undefined || longitude === undefined) return;
    mapRef.current?.animateCamera(
      followHeading
        ? { center: { latitude, longitude }, heading: heading ?? 0 }
        : { center: { latitude, longitude } },
      { duration: 400 }
    );
  }, [follow, followHeading, heading, latitude, longitude]);

  // En suivi du cap, la carte est tournée comme le téléphone : le cône pointe vers le haut.
  const shownMapHeading = followHeading ? (heading ?? 0) : mapHeading;

  const toggleFollow = () => {
    if (follow === 'free') {
      setFollow(resumeFollow.current);
      return;
    }
    if (followHeading) {
      // Retour au nord en haut.
      mapRef.current?.animateCamera({ heading: 0 }, { duration: 400 });
      setMapHeading(0);
    }
    setFollow(followHeading ? 'north' : 'heading');
  };

  // Un glissé ou un pincement libère la carte ; un simple appui (sur un lieu) ne compte pas.
  // Les gestes sont lus sur la vue qui entoure la carte : sur iPhone, onPanDrag ne se déclenche
  // que si le défilement de la carte est désactivé.
  const releaseMap = () => {
    if (follow === 'free') return;
    resumeFollow.current = follow;
    setFollow('free');
  };
  const onMapTouchMove = (event: GestureResponderEvent) => {
    const { touches, pageX, pageY } = event.nativeEvent;
    const from = touchStart.current;
    const moved = from ? Math.hypot(pageX - from.x, pageY - from.y) > 12 : false;
    if (touches.length > 1 || moved) releaseMap();
  };
  const selected = mapPois.find((poi) => poi.id === selectedId) ?? null;
  // Cases prises en marchant (le départ ne compte pas, pour ne pas montrer l'adresse).
  const cells = useMemo(
    () => (conquering ? cellsAlongTrack(tracker.track.points) : []),
    [conquering, tracker.track.points]
  );

  // Les 10 000 pas franchis pendant ce trajet se fêtent, une seule fois.
  const startedTime = tracker.startedAt.getTime();
  if (!conquestAtStart.has(startedTime)) conquestAtStart.set(startedTime, conquering);
  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    if (!conquering || conquestAtStart.get(startedTime) !== false) return;
    conquestAtStart.set(startedTime, true);
    const timer = setTimeout(() => setCelebrating(true), 0);
    return () => clearTimeout(timer);
  }, [conquering, startedTime]);

  const failed = tracker.status === 'denied' || tracker.status === 'error';

  if (failed) {
    return (
      <ThemedView style={[styles.container, styles.centeredScreen]}>
        <ThemedText style={styles.centered}>
          {tracker.status === 'denied'
            ? 'STEP a besoin de votre position pour suivre le trajet.'
            : 'Le suivi de position n’a pas pu démarrer.'}
        </ThemedText>
        <Button title="Retour" onPress={endWalk} />
      </ThemedView>
    );
  }

  return (
    <View style={styles.container}>
      {start ? (
        <View
          style={StyleSheet.absoluteFill}
          onTouchStart={(event) => {
            touchStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
          }}
          onTouchMove={onMapTouchMove}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={{ ...start, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
            showsCompass={false}
            showsPointsOfInterests={false}
            onRegionChangeComplete={(next) => {
              setRegion(next);
              if (followHeading) return;
              // La carte a pu être tournée au doigt : on relit son orientation.
              mapRef.current
                ?.getCamera()
                .then((camera) => setMapHeading(camera.heading ?? 0))
                .catch(() => {});
            }}
            onPress={(event) => {
              if (event.nativeEvent.action === 'marker-press') return;
              setSelectedId(null);
              // Toucher la carte à côté de la fiche du lieu la ferme.
              if (banner) setClosedPoiId(banner.id);
            }}>
            {plannedRoute ? <RouteLine coordinates={plannedRoute.coordinates} faded /> : null}
            {planned.mode === 'destination' ? (
              <Marker
                coordinate={planned.route.coordinates.at(-1)!}
                title={planned.label}
                pinColor={theme.tint}
              />
            ) : null}
            {poiClusters.flatMap((cluster) => {
              if (cluster.items.length === 1) {
                const poi = cluster.items[0];
                const visited = discovery.isVisited(poi);
                return (
                  <PoiMarker
                    key={`${poi.id}-${visited}`}
                    poi={poi}
                    visited={visited}
                    onPress={() => setSelectedId(poi.id)}
                  />
                );
              }
              // Vue rapprochée : le groupe s'ouvre en éventail autour de son point réel.
              if (region && region.longitudeDelta <= FAN_OUT_DELTA) {
                return fanOut(cluster.items, cluster.coords, region, windowWidth).map(
                  ({ item, coords }) => {
                    const visited = discovery.isVisited(item);
                    return (
                      <PoiMarker
                        key={`${item.id}-${visited}`}
                        poi={{ ...item, coords }}
                        visited={visited}
                        onPress={() => setSelectedId(item.id)}
                      />
                    );
                  }
                );
              }
              return (
                <PoiClusterMarker
                  key={`groupe-${cluster.key}-${cluster.items.length}`}
                  coords={cluster.coords}
                  count={cluster.items.length}
                  onPress={() => {
                    // On rapproche la carte : elle cesse de suivre la position jusqu'à « Me recentrer ».
                    const zoomed = regionForCoordinates(
                      cluster.items.map((item) => item.coords),
                      2
                    );
                    if (!zoomed) return;
                    releaseMap();
                    mapRef.current?.animateToRegion(
                      zoomed.longitudeDelta > FAN_OUT_DELTA
                        ? zoomed
                        : {
                            ...cluster.coords,
                            latitudeDelta: FAN_OUT_DELTA * 0.6,
                            longitudeDelta: FAN_OUT_DELTA * 0.6,
                          },
                      400
                    );
                  }}
                />
              );
            })}
            {territories(cells).map((territory) => (
              <TerritoryShape
                key={territoryKey('mine', territory)}
                territory={territory}
                color={ConquestMineColor}
                fill={0.3}
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
        </View>
      ) : (
        <ThemedView style={[StyleSheet.absoluteFill, styles.centeredScreen]}>
          <ThemedText themeColor="textSecondary">Recherche du signal GPS…</ThemedText>
        </ThemedView>
      )}

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
            {follow === 'free' ? 'Me recentrer' : followHeading ? 'Nord en haut' : 'Suivre mon cap'}
          </ThemedText>
        </Pressable>
      ) : null}

      <SafeAreaView
        edges={['left', 'right']}
        // Dans l'onglet Carte, le panneau se pose au-dessus de la barre d'onglets.
        style={[styles.overlay, { paddingBottom: insets.bottom + BottomTabInset + Spacing.two }]}>
        {banner ? (
          <PoiBanner
            key={banner.id}
            poi={banner}
            status={discovery.hereIsNew ? 'new' : discovery.isVisited(banner) ? 'visited' : 'here'}
            onClose={() => setClosedPoiId(banner.id)}
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
          // Sous le bouton « Suivre mon cap ».
          topOffset={TOP_BUTTONS_HEIGHT}
        />
      ) : null}
      <PhotoZoomOverlay />
      <Celebration
        visible={celebrating}
        title="10 000 pas !"
        message="La Conquête est active : les rues que vous traversez se colorent maintenant à votre nom."
        onClose={() => setCelebrating(false)}
      />
    </View>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
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
  pressed: {
    opacity: 0.6,
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
