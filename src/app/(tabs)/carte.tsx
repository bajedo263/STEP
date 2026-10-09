import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import MapView, { Marker, Polygon, Polyline, type LatLng, type Region } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PoiClusterMarker, PoiMarker, RouteLine } from '@/components/map-route';
import { PoiSheet } from '@/components/poi-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { TextField } from '@/components/ui/text-field';
import {
  BottomTabInset,
  ConquestFriendColor,
  ConquestMineColor,
  ConquestOtherColor,
  MaxContentWidth,
  PoiColor,
  Radius,
  Spacing,
} from '@/constants/theme';
import {
  useConquestCells,
  useConquestSeason,
  useMyConquestCount,
  useTerritoryAlerts,
  type TerritoryAlerts,
} from '@/hooks/use-conquest';
import { fetchMissingPlaces } from '@/hooks/use-collection';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useDestinationRoute, usePlaceSearch, type Place } from '@/hooks/use-destination';
import { useLoopRoute } from '@/hooks/use-loop-route';
import type { PlannedWalk } from '@/hooks/use-planned-walk';
import { useProfile } from '@/hooks/use-profile';
import { useRoutePois } from '@/hooks/use-route-pois';
import { useTheme } from '@/hooks/use-theme';
import { useTodaySteps } from '@/hooks/use-today-steps';
import {
  CONQUEST_UNLOCK_STEPS,
  cellKey,
  cellPolygon,
  cellRangeOf,
  conquestUnlocked,
  defensePoints,
  territoryAlertLabel,
  type Cell,
} from '@/lib/conquest';
import { missingPlacesPoints } from '@/lib/collection';
import { loopHandles, moveHandle } from '@/lib/loop-handles';
import { dailyProgress, formatDistance } from '@/lib/daily-progress';
import {
  formatDuration,
  loopTargetDistance,
  regionForCoordinates,
  type LoopRoute,
} from '@/lib/loop';
import { clusterByRegion, FAN_OUT_DELTA, fanOut } from '@/lib/map-declutter';
import { type Poi } from '@/lib/pois';
import { rankLabel, seasonEndLabel, seasonName } from '@/lib/season';
import { strideLengthMeters } from '@/lib/steps';
import { startWalk, walkInProgress } from '@/providers/walk-provider';

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');

type MapMode = 'loop' | 'destination';

const MODE_OPTIONS: { value: MapMode; label: string }[] = [
  { value: 'loop', label: 'Boucle' },
  { value: 'destination', label: 'Destination' },
];

/** Glissé vertical à partir duquel le panneau se replie ou se déplie. */
const SWIPE_THRESHOLD = 40;

export default function MapScreen() {
  const theme = useTheme();
  const location = useCurrentLocation();
  const loop = useLoopRoute();
  const destination = useDestinationRoute();
  const today = useTodaySteps();
  const profile = useProfile();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const mapRef = useRef<MapView>(null);
  const [mode, setMode] = useState<MapMode>('loop');
  const [query, setQuery] = useState('');
  const search = usePlaceSearch(query, location.status === 'ready' ? location.coords : null);

  const progress = useMemo(
    () =>
      today.status === 'ready'
        ? dailyProgress({
            steps: today.steps,
            goal: profile?.daily_goal,
            heightCm: profile?.height_cm,
            weightKg: profile?.weight_kg,
            sex: profile?.sex,
          })
        : null,
    [today, profile]
  );
  const goalReached = progress?.goalReached ?? false;
  const targetM = loopTargetDistance(progress?.remainingDistanceM);
  const strideM = strideLengthMeters(profile?.height_cm ?? 170, profile?.sex ?? 'unspecified');

  const loopRoute = loop.status === 'ready' ? loop.route : null;
  // Poignées pour redessiner la boucle ; celles qu'on vient de lâcher restent en place pendant le calcul.
  const [droppedHandles, setDroppedHandles] = useState<LatLng[] | null>(null);
  const handles = useMemo(
    () =>
      droppedHandles ??
      (loopRoute ? (loopRoute.through ?? loopHandles(loopRoute.coordinates)) : null),
    [droppedHandles, loopRoute]
  );
  // Le glisser natif d'un marqueur est capricieux (appui long, conflit avec l'appui long de la
  // carte) : on peut aussi toucher une poignée, puis l'endroit où la boucle doit passer.
  const [movingHandle, setMovingHandle] = useState<number | null>(null);
  const destinationRoute = destination.status === 'ready' ? destination.route : null;
  const route = mode === 'loop' ? loopRoute : destinationRoute;
  const [region, setRegion] = useState<Region | null>(null);
  // La Conquête n'est pas un mode : elle s'active seule à 10 000 pas dans la journée.
  const conquestActive = conquestUnlocked(today.status === 'ready' ? today.steps : null);
  const cells = useConquestCells(conquestActive && region ? cellRangeOf(region) : null);
  const [pin, setPin] = useState<LatLng | null>(null);
  const panel = useCollapsiblePanel();
  const pois = useRoutePois(route?.coordinates ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = pois.find((poi) => poi.id === selectedId) ?? null;
  const alerts = useTerritoryAlerts();
  const [defenseNote, setDefenseNote] = useState<string | null>(null);
  const alertCells = useMemo(
    () => visibleAlerts(alerts, region ? cellRangeOf(region) : null),
    [alerts, region]
  );

  // Boucle qui passe par les cases menacées les plus proches.
  const defend = useCallback(
    (from: LatLng) => {
      const points = alerts ? defensePoints([...alerts.lost, ...alerts.expiring], from) : [];
      setMode('loop');
      setPin(null);
      if (points.length === 0) {
        setDefenseNote('Aucune case à défendre à moins de 2,5 km d’ici.');
        return;
      }
      setDefenseNote(null);
      loop.generateThrough(from, points);
    },
    [alerts, loop]
  );

  // Depuis l'accueil, « Défendre » ouvre la carte avec une boucle de défense, une seule fois.
  const {
    defend: defendRequest,
    boucle: loopRequest,
    quartier: zoneRequest,
  } = useLocalSearchParams<{
    defend?: string;
    boucle?: string;
    quartier?: string;
  }>();
  const handledDefend = useRef<string | undefined>(undefined);
  const here = location.status === 'ready' ? location.coords : null;
  useEffect(() => {
    if (!defendRequest || !here || !alerts || handledDefend.current === defendRequest) return;
    handledDefend.current = defendRequest;
    defend(here);
  }, [defendRequest, here, alerts, defend]);

  // Depuis un rappel, la carte s'ouvre avec une boucle à la longueur qu'il reste à marcher.
  const handledLoop = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!loopRequest || !here || handledLoop.current === loopRequest) return;
    handledLoop.current = loopRequest;
    setMode('loop');
    setPin(null);
    loop.generate(here, targetM);
  }, [loopRequest, here, loop, targetM]);

  // Depuis la collection, une boucle vers les lieux pas encore découverts d'un quartier.
  const [collectionNote, setCollectionNote] = useState<string | null>(null);
  const handledZone = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!zoneRequest || !here || handledZone.current === zoneRequest) return;
    handledZone.current = zoneRequest;
    const [x, y] = zoneRequest.split('/').map(Number);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return;
    setTimeout(() => {
      setMode('loop');
      setPin(null);
      setCollectionNote('Recherche des lieux qui vous manquent…');
    }, 0);
    fetchMissingPlaces(x, y).then((missing) => {
      if (!missing) {
        setCollectionNote('Impossible de charger les lieux du quartier. Réessayez.');
        return;
      }
      const points = missingPlacesPoints(missing, here);
      if (points.length === 0) {
        setCollectionNote(
          missing.length === 0
            ? 'Tous les lieux de ce quartier sont déjà découverts.'
            : 'Les lieux qui vous manquent sont à plus de 2,5 km d’ici.'
        );
        return;
      }
      setCollectionNote(
        points.length === missing.length
          ? `Boucle par ${points.length > 1 ? `les ${points.length} lieux` : 'le dernier lieu'} qui vous manque${points.length > 1 ? 'nt' : ''} dans ce quartier.`
          : `Boucle par ${points.length} des ${missing.length} lieux qui vous manquent, les plus proches.`
      );
      loop.generateThrough(here, points);
    });
  }, [zoneRequest, here, loop]);

  // Au dézoom, les lieux voisins se regroupent en une pastille numérotée.
  const poiClusters = useMemo(() => clusterByRegion(pois, region), [pois, region]);

  // Recadre la carte sur le tracé affiché.
  useEffect(() => {
    const region = route ? regionForCoordinates(route.coordinates) : null;
    if (region) mapRef.current?.animateToRegion(region, 400);
  }, [route]);

  if (location.status !== 'ready') {
    return <LocationUnavailable location={location} />;
  }

  const start = location.coords;
  const moveHandleTo = async (index: number, point: LatLng) => {
    setMovingHandle(null);
    if (!handles) return;
    const next = moveHandle(handles, index, point);
    setDroppedHandles(next);
    await loop.refine(start, next);
    setDroppedHandles(null);
  };
  const go = (walk: PlannedWalk) => {
    // Un seul trajet à la fois : celui qui est en cours continue en fond de l'app.
    if (walkInProgress()) {
      Alert.alert('Un trajet est déjà en cours', 'Terminez-le avant d’en commencer un autre.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Reprendre le trajet', onPress: () => router.push('/trajet') },
      ]);
      return;
    }
    startWalk(walk);
    router.push('/trajet');
  };
  const goToPin = (coords: LatLng) => {
    const place: Place = {
      id: `pin/${coords.latitude.toFixed(5)},${coords.longitude.toFixed(5)}`,
      label: 'Point choisi sur la carte',
      coords,
    };
    setPin(null);
    setMode('destination');
    destination.choose(start, place, goalReached ? null : targetM);
  };
  const collapsedLabel = pin
    ? 'Point choisi sur la carte'
    : mode === 'loop'
      ? route
        ? `Boucle de ${formatDistance(route.distanceM)}`
        : 'Boucle'
      : destination.status === 'idle'
        ? 'Destination'
        : destination.place.label;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...start, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        showsUserLocation
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
        onPress={(event) => {
          if (event.nativeEvent.action === 'marker-press') return;
          if (movingHandle !== null && handles && !loop.refining) {
            void moveHandleTo(movingHandle, event.nativeEvent.coordinate);
            return;
          }
          setSelectedId(null);
        }}
        onLongPress={(event) => {
          if (movingHandle !== null && handles) {
            if (!loop.refining) void moveHandleTo(movingHandle, event.nativeEvent.coordinate);
            return;
          }
          setPin(event.nativeEvent.coordinate);
          setSelectedId(null);
          panel.expand();
        }}
        onRegionChangeComplete={setRegion}>
        {conquestActive
          ? cells.map((cell) => (
              <Polygon
                key={cellKey(cell)}
                coordinates={cellPolygon(cell)}
                fillColor={`${cell.mine ? ConquestMineColor : cell.friend ? ConquestFriendColor : ConquestOtherColor}55`}
                // Les cases rivales ont un contour pointillé : lisibles sans distinguer les couleurs.
                strokeColor={cell.mine || cell.friend ? undefined : ConquestOtherColor}
                strokeWidth={cell.mine || cell.friend ? 0 : 1}
                lineDashPattern={cell.mine || cell.friend ? undefined : [3, 3]}
              />
            ))
          : null}
        {alertCells.map(({ cell, lost }) => (
          <Polygon
            key={`alerte-${cellKey(cell)}`}
            coordinates={cellPolygon(cell)}
            fillColor={`${lost ? ConquestOtherColor : ConquestMineColor}22`}
            strokeColor={lost ? ConquestOtherColor : ConquestMineColor}
            strokeWidth={2}
            lineDashPattern={lost ? undefined : [4, 4]}
          />
        ))}
        {route ? (
          <RouteLine coordinates={route.coordinates} />
        ) : null}
        {poiClusters.flatMap((cluster) => {
          if (cluster.items.length === 1) {
            const poi = cluster.items[0];
            return (
              <PoiMarker
                key={`${poi.id}-${poi.visited}`}
                poi={poi}
                visited={poi.visited}
                onPress={() => setSelectedId(poi.id)}
              />
            );
          }
          // Vue rapprochée : le groupe s'ouvre en éventail, relié à son point réel par de fins rayons.
          if (region && region.longitudeDelta <= FAN_OUT_DELTA) {
            return fanOut(cluster.items, cluster.coords, region, windowWidth).flatMap(({ item, coords }) => [
              <Polyline
                key={`rayon-${item.id}`}
                coordinates={[cluster.coords, coords]}
                strokeColor={`${PoiColor}AA`}
                strokeWidth={1.5}
              />,
              <PoiMarker
                key={`${item.id}-${item.visited}`}
                poi={{ ...item, coords }}
                visited={item.visited}
                onPress={() => setSelectedId(item.id)}
              />,
            ]);
          }
          return (
            <PoiClusterMarker
              key={`groupe-${cluster.key}-${cluster.items.length}`}
              coords={cluster.coords}
              count={cluster.items.length}
              onPress={() => {
                // Assez près pour séparer les lieux, ou pour ouvrir l'éventail s'ils se superposent.
                const zoomed = regionForCoordinates(cluster.items.map((item) => item.coords), 2);
                if (!zoomed) return;
                mapRef.current?.animateToRegion(
                  zoomed.longitudeDelta > FAN_OUT_DELTA
                    ? zoomed
                    : { ...cluster.coords, latitudeDelta: FAN_OUT_DELTA * 0.6, longitudeDelta: FAN_OUT_DELTA * 0.6 },
                  400
                );
              }}
            />
          );
        })}
        {mode === 'loop' && loopRoute && handles
          ? handles.map((handle, index) =>
              index === movingHandle ? null : (
                <Marker
                  key={`poignee-${index}-${handle.latitude}-${handle.longitude}`}
                  coordinate={handle}
                  anchor={{ x: 0.5, y: 0.5 }}
                  draggable={!loop.refining}
                  tracksViewChanges={false}
                  onPress={() => {
                    if (loop.refining) return;
                    // Viseur : la carte se centre sur le point, qu'on déplace en faisant glisser la carte.
                    setMovingHandle(index);
                    panel.collapse();
                    mapRef.current?.animateCamera({ center: handle }, { duration: 300 });
                  }}
                  onDragEnd={(event) => {
                    void moveHandleTo(index, event.nativeEvent.coordinate);
                  }}>
                  <View
                    style={[styles.handle, { borderColor: theme.tint }]}
                    accessible
                    accessibilityLabel="Point de passage : touchez-le pour le déplacer"
                  />
                </Marker>
              )
            )
          : null}
        {mode === 'loop' && loopRoute ? (
          <Marker
            coordinate={loopRoute.coordinates[0]}
            title="Départ et arrivée"
            pinColor={theme.tint}
          />
        ) : null}
        {pin ? <Marker coordinate={pin} title="Point choisi" pinColor={theme.tint} /> : null}
        {mode === 'destination' && destination.status !== 'idle' ? (
          <Marker
            coordinate={destination.place.coords}
            title={destination.place.label}
            pinColor={theme.tint}
          />
        ) : null}
      </MapView>

      {movingHandle !== null && handles ? (
        <>
          {/* Le viseur reste au centre ; on fait glisser la carte en dessous. */}
          <View pointerEvents="none" style={styles.crosshairLayer}>
            <View style={[styles.handle, styles.handleMoving, { backgroundColor: theme.tint }]} />
          </View>
          <View
            pointerEvents="box-none"
            style={[styles.crosshairBar, { top: insets.top + Spacing.three }]}>
            <ThemedView style={styles.crosshairCard}>
              <ThemedText type="small" style={styles.centeredText}>
                Faites glisser la carte pour placer le point sur la rue voulue.
              </ThemedText>
              <View style={styles.crosshairButtons}>
                <Button title="Annuler" variant="secondary" onPress={() => setMovingHandle(null)} />
                <Button
                  title="Passer par ici"
                  disabled={!region || loop.refining}
                  onPress={() => {
                    if (!region) return;
                    void moveHandleTo(movingHandle, {
                      latitude: region.latitude,
                      longitude: region.longitude,
                    });
                    panel.expand();
                  }}
                />
              </View>
            </ThemedView>
          </View>
        </>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}>
        <SafeAreaView
          edges={['left', 'right']}
          style={[
            styles.overlayInner,
            // Sur iPhone, la barre d'onglets flotte au-dessus de la carte : on remonte le panneau.
            Platform.OS === 'ios' && {
              paddingBottom: insets.bottom + BottomTabInset + Spacing.two,
            },
          ]}>
          <Animated.View
            {...panel.panHandlers}
            style={[styles.cardWrapper, { transform: [{ translateY: panel.translateY }] }]}>
            <ThemedView style={[styles.card, { borderColor: theme.backgroundSelected }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={panel.collapsed ? 'Déplier le panneau' : 'Replier le panneau'}
                hitSlop={Spacing.three}
                onPress={panel.toggle}
                style={styles.grabberArea}>
                <View style={[styles.grabber, { backgroundColor: theme.backgroundSelected }]} />
              </Pressable>

              {panel.collapsed ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={panel.expand}
                  style={styles.collapsedRow}>
                  <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
                    {collapsedLabel}
                  </ThemedText>
                  {conquestActive ? (
                    <View style={[styles.swatch, { backgroundColor: ConquestMineColor }]} />
                  ) : null}
                </Pressable>
              ) : pin ? (
                <>
                  <ThemedText type="smallBold">Point choisi sur la carte</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Passer en mode Destination pour y aller à pied ?
                  </ThemedText>
                  <Button title="Itinéraire jusqu’ici" onPress={() => goToPin(pin)} />
                  <Button title="Annuler" variant="secondary" onPress={() => setPin(null)} />
                </>
              ) : (
                <>
                  <SegmentedChoice options={MODE_OPTIONS} value={mode} onChange={setMode} />
                  <ConquestStatus
                    active={conquestActive}
                    steps={today.status === 'ready' ? today.steps : null}
                    zoomedOut={region !== null && cellRangeOf(region) === null}
                  />
                  {alerts && alerts.lost.length + alerts.expiring.length > 0 ? (
                    <TerritoryAlert
                      alerts={alerts}
                      active={conquestActive}
                      note={defenseNote}
                      loading={loop.status === 'loading'}
                      onDefend={() => defend(start)}
                    />
                  ) : null}

                  {mode === 'loop' && collectionNote ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {collectionNote}
                    </ThemedText>
                  ) : null}
                  {mode === 'loop' ? (
                    route ? (
                      <>
                        <RouteStats route={route} strideM={strideM} />
                        <ThemedText type="small" themeColor="textSecondary">
                          {loop.refining
                            ? 'Recalcul de la boucle par ce point…'
                            : 'Touchez un point rond du tracé pour le déplacer vers une autre rue.'}
                        </ThemedText>
                        {loop.refineError ? <ErrorText message={loop.refineError} /> : null}
                        <PoiSummary pois={pois} via={loopRoute?.via ?? []} />
                        <Button title="Partir" onPress={() => go({ mode: 'loop', route, pois })} />
                        <Button
                          title="Autre boucle"
                          variant="secondary"
                          onPress={() => {
                            setDefenseNote(null);
                            setCollectionNote(null);
                            loop.generate(start, targetM);
                          }}
                        />
                      </>
                    ) : (
                      <>
                        <ThemedText themeColor="textSecondary">
                          {loop.status === 'loading'
                            ? `Calcul d’une boucle d’environ ${formatDistance(targetM)} autour de vous…`
                            : goalReached
                              ? `Objectif atteint ! Une boucle bonus de ${formatDistance(targetM)} ?`
                              : `Une boucle d’environ ${formatDistance(targetM)} depuis votre position pour finir votre objectif.`}
                        </ThemedText>
                        {loop.status === 'error' ? <ErrorText message={loop.message} /> : null}
                        <Button
                          title="Proposer une boucle"
                          loading={loop.status === 'loading'}
                          onPress={() => {
                            setCollectionNote(null);
                            loop.generate(start, targetM);
                          }}
                        />
                        <Button
                          title="Marcher librement"
                          variant="secondary"
                          onPress={() => go({ mode: 'free' })}
                        />
                      </>
                    )
                  ) : destination.status === 'ready' ? (
                    <>
                      <ThemedText type="smallBold" numberOfLines={2}>
                        {destination.place.label}
                      </ThemedText>
                      <RouteStats route={destination.route} strideM={strideM} />
                      {destination.route.lengthened && !destination.route.via ? (
                        <ThemedText type="small" themeColor="textSecondary">
                          Itinéraire rallongé par un détour pour finir votre objectif en chemin.
                        </ThemedText>
                      ) : null}
                      <PoiSummary
                        pois={pois}
                        via={destination.route.via ? [destination.route.via] : []}
                      />
                      <Button
                        title="Partir"
                        onPress={() =>
                          go({
                            mode: 'destination',
                            route: destination.route,
                            label: destination.place.label,
                            pois,
                          })
                        }
                      />
                      {destination.route.lengthened ? (
                        <View style={styles.row}>
                          <Button
                            title="Autre détour"
                            variant="secondary"
                            style={styles.flex}
                            onPress={() =>
                              destination.choose(
                                start,
                                destination.place,
                                goalReached ? null : targetM
                              )
                            }
                          />
                          <Button
                            title="Chemin direct"
                            variant="secondary"
                            style={styles.flex}
                            onPress={() => destination.choose(start, destination.place, null)}
                          />
                        </View>
                      ) : null}
                      <Button
                        title="Changer de destination"
                        variant="secondary"
                        onPress={destination.clear}
                      />
                    </>
                  ) : destination.status === 'loading' ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator />
                      <ThemedText themeColor="textSecondary" numberOfLines={1} style={styles.flex}>
                        Itinéraire vers {destination.place.label}…
                      </ThemedText>
                    </View>
                  ) : (
                    <>
                      <TextField
                        label="Où allez-vous ?"
                        placeholder="Une adresse, un lieu, un parc…"
                        value={query}
                        onChangeText={setQuery}
                        autoCorrect={false}
                        returnKeyType="search"
                      />
                      {goalReached ? null : (
                        <ThemedText type="small" themeColor="textSecondary">
                          {`Si le lieu est proche, l’itinéraire fera un détour pour atteindre environ ${formatDistance(targetM)}, ce qu’il vous reste pour l’objectif.`}
                        </ThemedText>
                      )}
                      {destination.status === 'error' ? (
                        <ErrorText message={destination.message} />
                      ) : null}
                      {search.status === 'loading' ? <ActivityIndicator /> : null}
                      {search.status === 'error' ? <ErrorText message={search.message} /> : null}
                      {search.status === 'ready' && search.places.length === 0 ? (
                        <ThemedText type="small" themeColor="textSecondary">
                          Aucun lieu trouvé.
                        </ThemedText>
                      ) : null}
                      {search.status === 'ready'
                        ? search.places.slice(0, 5).map((place) => (
                            <Pressable
                              key={place.id}
                              accessibilityRole="button"
                              onPress={() => {
                                Keyboard.dismiss();
                                destination.choose(start, place, goalReached ? null : targetM);
                              }}
                              style={({ pressed }) => [
                                styles.place,
                                { backgroundColor: theme.backgroundElement },
                                pressed && styles.pressed,
                              ]}>
                              <ThemedText type="small" numberOfLines={2}>
                                {place.label}
                              </ThemedText>
                            </Pressable>
                          ))
                        : null}
                    </>
                  )}
                </>
              )}
            </ThemedView>
          </Animated.View>
        </SafeAreaView>
      </KeyboardAvoidingView>

      {selected ? (
        <PoiSheet poi={selected} visited={selected.visited} onClose={() => setSelectedId(null)} />
      ) : null}
    </View>
  );
}

/**
 * Panneau du bas repliable : glisser vers le bas le réduit pour mieux voir la carte,
 * glisser vers le haut (ou toucher la poignée) le rouvre.
 */
function useCollapsiblePanel() {
  const [collapsed, setCollapsed] = useState(false);
  const [translateY] = useState(() => new Animated.Value(0));

  const change = useCallback(
    (next: boolean) => {
      if (next === collapsed) return;
      if (next) Keyboard.dismiss();
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setCollapsed(next);
    },
    [collapsed]
  );

  // Recréé seulement quand le panneau change d'état, jamais pendant un glissé.
  const panHandlers = useMemo(() => {
    const settle = () => Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
    return PanResponder.create({
      // On ne prend la main que sur un geste nettement vertical : les boutons restent utilisables.
      onMoveShouldSetPanResponderCapture: (_, { dx, dy }) =>
        Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.5,
      onPanResponderMove: (_, { dy }) => {
        // Le panneau suit le doigt vers le bas quand il est ouvert, un peu vers le haut sinon.
        translateY.setValue(
          collapsed ? Math.max(-SWIPE_THRESHOLD, Math.min(0, dy)) : Math.max(0, dy)
        );
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > SWIPE_THRESHOLD || vy > 0.8) change(true);
        else if (dy < -SWIPE_THRESHOLD / 2 || vy < -0.8) change(false);
        settle();
      },
      onPanResponderTerminate: settle,
    }).panHandlers;
  }, [collapsed, change, translateY]);

  return {
    collapsed,
    translateY,
    panHandlers,
    expand: () => change(false),
    collapse: () => change(true),
    toggle: () => change(!collapsed),
  };
}

/** Cases menacées dans la zone affichée (rien si la carte est trop dézoomée). */
function visibleAlerts(
  alerts: TerritoryAlerts | null,
  range: ReturnType<typeof cellRangeOf>
): { cell: Cell; lost: boolean }[] {
  if (!alerts || !range) return [];
  const inside = (cell: Cell) =>
    cell.x >= range.minX && cell.x <= range.maxX && cell.y >= range.minY && cell.y <= range.maxY;
  return [
    ...alerts.lost.filter(inside).map((cell) => ({ cell, lost: true })),
    ...alerts.expiring.filter(inside).map((cell) => ({ cell, lost: false })),
  ];
}

/** Cases reprises ou bientôt libérées, et le bouton qui trace une boucle pour les défendre. */
function TerritoryAlert({
  alerts,
  active,
  note,
  loading,
  onDefend,
}: {
  alerts: TerritoryAlerts;
  active: boolean;
  note: string | null;
  loading: boolean;
  onDefend: () => void;
}) {
  return (
    <View style={styles.conquest}>
      <ThemedText type="small">{territoryAlertLabel(alerts)}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {active
          ? 'Contour plein : reprises par d’autres. Pointillés : à vous, bientôt libérées.'
          : `La boucle les reprendra si vous avez fait ${formatNumber(CONQUEST_UNLOCK_STEPS)} pas à l’arrivée.`}
      </ThemedText>
      {note ? <ErrorText message={note} /> : null}
      <Button
        title="Défendre mon territoire"
        variant="secondary"
        loading={loading}
        onPress={onDefend}
      />
    </View>
  );
}

/** Conquête : active à 10 000 pas, sinon ce qu'il reste à faire pour la débloquer. */
function ConquestStatus({
  active,
  steps,
  zoomedOut,
}: {
  active: boolean;
  steps: number | null;
  zoomedOut: boolean;
}) {
  const count = useMyConquestCount();
  const season = useConquestSeason();
  // « Saison d'octobre, jusqu'au 31 octobre : 2e sur 15 conquérants. »
  const seasonLine = season
    ? `${seasonName(new Date(season.season_start))}, ${seasonEndLabel(new Date(season.season_end), new Date())} : ${rankLabel(season.rank, season.players)}.`
    : null;
  if (!active) {
    return (
      <View style={styles.conquest}>
        <ThemedText type="small" themeColor="textSecondary">
          {steps === null
            ? `Conquête : se débloque à ${formatNumber(CONQUEST_UNLOCK_STEPS)} pas dans la journée.`
            : `Conquête : encore ${formatNumber(CONQUEST_UNLOCK_STEPS - steps)} pas pour colorer la carte à votre nom.`}
        </ThemedText>
        {seasonLine ? (
          <ThemedText type="small" themeColor="textSecondary">
            {seasonLine}
          </ThemedText>
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.conquest}>
      <View style={styles.legend}>
        <View style={[styles.swatch, { backgroundColor: ConquestMineColor }]} />
        <ThemedText type="small" style={styles.flex}>
          {count === null || count === 0
            ? 'Conquête active'
            : `Conquête active : ${formatNumber(count)} case${count > 1 ? 's' : ''} à vous`}
        </ThemedText>
        <View style={[styles.swatch, { backgroundColor: ConquestFriendColor }]} />
        <ThemedText type="small">Amis</ThemedText>
        <View style={[styles.swatch, { backgroundColor: ConquestOtherColor }]} />
        <ThemedText type="small">Autres</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {zoomedOut
          ? 'Rapprochez la carte pour voir les cases.'
          : 'Vos trajets du jour colorent les cases traversées pendant 7 jours, sauf le début et la fin.'}
      </ThemedText>
      {seasonLine ? (
        <ThemedText type="small" themeColor="textSecondary">
          {`${seasonLine} Toutes les cases repartent de zéro à la fin du mois.`}
        </ThemedText>
      ) : null}
    </View>
  );
}

function RouteStats({ route, strideM }: { route: LoopRoute; strideM: number }) {
  return (
    <View style={styles.stats}>
      <Stat value={formatDistance(route.distanceM)} label="distance" />
      <Stat value={formatNumber(route.distanceM / strideM)} label="pas environ" />
      <Stat value={formatDuration(route.durationS)} label="de marche" />
    </View>
  );
}

/** « 1 lieu remarquable », « 3 autres lieux remarquables »… */
function poiCountLabel(count: number, others: boolean): string {
  if (count === 1) return others ? '1 autre lieu remarquable' : '1 lieu remarquable';
  return others ? `${count} autres lieux remarquables` : `${count} lieux remarquables`;
}

/** Ce qu'il y a à voir en chemin, et pourquoi le tracé passe par là. */
function PoiSummary({ pois, via }: { pois: Poi[]; via: Poi[] }) {
  if (via.length === 0 && pois.length === 0) return null;
  const viaIds = new Set(via.map((poi) => poi.id));
  const others = pois.filter((poi) => !viaIds.has(poi.id)).length;
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {via.length > 0 ? `Passe par : ${via.map((poi) => poi.title).join(' et ')}. ` : ''}
      {others > 0 ? `${poiCountLabel(others, via.length > 0)} en chemin (repères orange).` : ''}
    </ThemedText>
  );
}

function ErrorText({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <ThemedText type="small" style={{ color: theme.danger }}>
      {message}
    </ThemedText>
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

function LocationUnavailable({ location }: { location: ReturnType<typeof useCurrentLocation> }) {
  if (location.status === 'loading') {
    return (
      <ThemedView style={[styles.container, styles.centeredScreen]}>
        <ActivityIndicator />
        <ThemedText themeColor="textSecondary">Recherche de votre position…</ThemedText>
      </ThemedView>
    );
  }

  const denied = location.status === 'denied';
  return (
    <ThemedView style={[styles.container, styles.centeredScreen]}>
      <ThemedText type="subtitle" style={styles.centered}>
        Position introuvable
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.centered}>
        {denied
          ? 'STEP a besoin de votre position pour tracer une boucle autour de vous.'
          : 'Activez la localisation du téléphone, puis réessayez.'}
      </ThemedText>
      {denied && !location.canAskAgain ? (
        <Button title="Ouvrir les réglages" onPress={() => Linking.openSettings()} />
      ) : (
        <Button title="Réessayer" onPress={location.retry} />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  handle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 4,
    backgroundColor: '#FFFFFF',
  },
  crosshairLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairBar: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    alignItems: 'center',
  },
  crosshairCard: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.four,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  crosshairButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
  },
  centeredText: {
    textAlign: 'center',
  },
  handleMoving: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderColor: '#FFFFFF',
  },
  container: {
    flex: 1,
  },
  centeredScreen: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  overlay: {
    flex: 1,
    pointerEvents: 'box-none',
  },
  overlayInner: {
    flex: 1,
    pointerEvents: 'box-none',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  place: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.6,
  },
  cardWrapper: {
    alignSelf: 'stretch',
    alignItems: 'center',
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
    gap: Spacing.two,
  },
  conquest: {
    gap: Spacing.one,
  },
  card: {
    alignSelf: 'stretch',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.two,
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
