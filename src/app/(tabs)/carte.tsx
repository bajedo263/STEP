import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import MapView, { Marker, Polygon, Polyline, type LatLng, type Region } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  LoopHandlesOverlay,
  type LoopHandlesOverlayHandle,
} from '@/components/loop-handles-overlay';
import { PoiClusterMarker, PoiMarker, RouteLine } from '@/components/map-route';
import { ActiveWalkView, confirmFinish } from '@/components/active-walk';
import {
  initialCustomSteps,
  LoopStepsPicker,
  type LoopStepsChoice,
} from '@/components/loop-steps-picker';
import { PoiSheet } from '@/components/poi-sheet';
import { WalkDone } from '@/components/walk-done';
import { PhotoZoomOverlay } from '@/components/zoomable-photo';
import { TerritoryShape, territoryKey } from '@/components/territory-shape';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { SlowHint } from '@/components/ui/slow-hint';
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
  withAlpha,
} from '@/constants/theme';
import {
  useConquestCells,
  useMyConquestCount,
  useTerritoryAlerts,
  type TerritoryAlerts,
} from '@/hooks/use-conquest';
import { fetchMissingPlaces } from '@/hooks/use-collection';
import { useCollapsiblePanel } from '@/hooks/use-collapsible-panel';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useDestinationRoute, usePlaceSearch, type Place } from '@/hooks/use-destination';
import { useLoopRoute } from '@/hooks/use-loop-route';
import type { PlannedWalk } from '@/hooks/use-planned-walk';
import { useProfile } from '@/hooks/use-profile';
import { useDailyGoal } from '@/hooks/use-daily-goal';
import { useRoutePois } from '@/hooks/use-route-pois';
import { setLocalFlag, useLocalFlag } from '@/hooks/use-local-flag';
import { useTheme } from '@/hooks/use-theme';
import { useTodaySteps } from '@/hooks/use-today-steps';
import { useStepHistory } from '@/hooks/use-step-history';
import {
  CONQUEST_UNLOCK_STEPS,
  cellKey,
  cellPolygon,
  cellRangeOf,
  conquestUnlocked,
  defensePoints,
  territories,
  territoryAlertLabel,
  type Cell,
  type Territory,
} from '@/lib/conquest';
import { missingPlacesPoints } from '@/lib/collection';
import { FIRST_WALK_STEPS, firstWalkDistance } from '@/lib/comeback';
import { loopHandles, moveHandle } from '@/lib/loop-handles';
import { dailyProgress, formatDistance } from '@/lib/daily-progress';
import {
  defaultLoopDistance,
  formatDuration,
  goalAtArrival,
  loopDistanceForSteps,
  loopTargetDistance,
  stepsForDistance,
  walkingSeconds,
  regionForCoordinates,
  type LoopRoute,
} from '@/lib/loop';
import { clusterByRegion, FAN_OUT_DELTA, fanOut } from '@/lib/map-declutter';
import { type Poi } from '@/lib/pois';
import { strideLengthMeters } from '@/lib/steps';
import { haversineMeters } from '@/lib/track';
import {
  endWalk,
  startWalk,
  useActiveWalk,
  useWalkStarting,
  walkInProgress,
} from '@/providers/walk-provider';

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');

type MapMode = 'loop' | 'destination';

/** Rendu des blocs de cases : à moi, d'amis (même trait), rivaux (plus pâles, en pointillés). */
const TERRITORY_STYLES = [
  { owner: 'other', color: ConquestOtherColor, fill: 0.2, dashed: true },
  { owner: 'friend', color: ConquestFriendColor, fill: 0.3, dashed: false },
  { owner: 'mine', color: ConquestMineColor, fill: 0.3, dashed: false },
] as const;


const MODE_OPTIONS: { value: MapMode; label: string }[] = [
  { value: 'loop', label: 'Boucle' },
  { value: 'destination', label: 'Destination' },
];

/** Glissé vertical à partir duquel le panneau se replie ou se déplie. */

/**
 * Onglet Carte : on y prépare un trajet, on le suit une fois lancé, puis on y lit son bilan
 * jusqu'à le fermer.
 */
export default function MapScreen() {
  const walk = useActiveWalk();
  const starting = useWalkStarting();
  const focused = useIsFocused();
  if (walk?.summary) {
    return (
      <WalkDone
        summary={walk.summary}
        saveState={walk.saveState}
        discovered={walk.discovery.discovered}
        cellCount={walk.cellCount}
        points={walk.tracker.track.points}
        day={walk.day}
        onRetry={walk.retrySave}
        onClose={endWalk}
      />
    );
  }
  if (walk) {
    // Depuis un autre onglet, inutile de dessiner une carte qui suit la marche.
    if (!focused) return <View style={styles.container} />;
    return <ActiveWalkView walk={walk} onFinish={() => confirmFinish(walk)} />;
  }
  if (starting) {
    return (
      <ThemedView style={[styles.container, styles.centeredScreen]}>
        <ActivityIndicator />
        <ThemedText themeColor="textSecondary">Démarrage du trajet…</ThemedText>
        <SlowHint text="Le téléphone cherche votre position. Mettez-vous près d’une fenêtre ou dehors, loin des grands immeubles." />
      </ThemedView>
    );
  }
  return <PlanMap />;
}

/** Astuce de l'appui long, affichée jusqu'au premier essai. */
const LONG_PRESS_TIP_KEY = 'step.long-press-tip-seen';
/** Délai après le dernier cran avant de recalculer la boucle. */
const STEPS_SETTLE_MS = 700;

/** Préparation d'un trajet : boucle ou destination, lieux à voir, Conquête. */
function PlanMap() {
  const theme = useTheme();
  const longPressTipSeen = useLocalFlag(LONG_PRESS_TIP_KEY) !== null;
  const location = useCurrentLocation();
  const loop = useLoopRoute();
  const destination = useDestinationRoute();
  const today = useTodaySteps();
  const profile = useProfile();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const mapRef = useRef<MapView>(null);
  const handlesOverlay = useRef<LoopHandlesOverlayHandle>(null);
  const [mode, setMode] = useState<MapMode>('loop');
  const [query, setQuery] = useState('');
  const search = usePlaceSearch(query, location.status === 'ready' ? location.coords : null);

  // Le même objectif que l'accueil (adaptatif, réduit les jours de pluie), sinon la boucle proposée
  // ne correspond pas à ce qu'annonce le bouton « Partir ».
  const history = useStepHistory();
  const { goal } = useDailyGoal(profile, history, today.status === 'ready' ? today.steps : null);
  const progress = useMemo(
    () =>
      today.status === 'ready'
        ? dailyProgress({
            steps: today.steps,
            goal,
            heightCm: profile?.height_cm,
            weightKg: profile?.weight_kg,
            sex: profile?.sex,
          })
        : null,
    [today, profile, goal]
  );
  const goalReached = progress?.goalReached ?? false;
  const remainingGoalSteps = progress && !goalReached ? progress.remainingSteps : null;
  const targetM = loopTargetDistance(progress?.remainingDistanceM);
  const strideM = strideLengthMeters(profile?.height_cm ?? 170, profile?.sex ?? 'unspecified');
  // Boucle : par défaut ce qui manque pour l'objectif (jamais minuscule), ou un nombre de pas saisi.
  const [stepsChoice, setStepsChoice] = useState<LoopStepsChoice>('goal');
  const [customSteps, setCustomSteps] = useState<number | null>(null);
  const defaultLoopM = defaultLoopDistance(progress?.remainingDistanceM);
  const defaultLoopSteps = stepsForDistance(defaultLoopM, strideM);
  const customLoopM =
    stepsChoice === 'custom' ? loopDistanceForSteps(customSteps, strideM) : null;
  const loopM = customLoopM ?? defaultLoopM;

  const loopRoute = loop.status === 'ready' ? loop.route : null;
  // Poignées pour redessiner la boucle ; celles qu'on vient de lâcher restent en place pendant le calcul.
  const [droppedHandles, setDroppedHandles] = useState<LatLng[] | null>(null);
  const handles = useMemo(
    () =>
      droppedHandles ??
      (loopRoute ? (loopRoute.through ?? loopHandles(loopRoute.coordinates)) : null),
    [droppedHandles, loopRoute]
  );
  const destinationRoute = destination.status === 'ready' ? destination.route : null;
  const route = mode === 'loop' ? loopRoute : destinationRoute;
  const [region, setRegion] = useState<Region | null>(null);
  // La Conquête n'est pas un mode : elle s'active seule à 10 000 pas dans la journée.
  const conquestActive = conquestUnlocked(today.status === 'ready' ? today.steps : null);
  const cells = useConquestCells(conquestActive && region ? cellRangeOf(region) : null);
  const [pin, setPin] = useState<LatLng | null>(null);
  const panel = useCollapsiblePanel();
  const [panelOverflow, setPanelOverflow] = useState(false);
  const pois = useRoutePois(route?.coordinates ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = pois.find((poi) => poi.id === selectedId) ?? null;
  const alerts = useTerritoryAlerts();
  const [defenseNote, setDefenseNote] = useState<string | null>(null);
  // Les cases d'un même propriétaire forment des blocs : un territoire, pas un damier.
  const territoryShapes = useMemo(
    () =>
      conquestActive
        ? {
            mine: territories(cells.filter((cell) => cell.mine)),
            friend: territories(cells.filter((cell) => !cell.mine && cell.friend)),
            other: territories(cells.filter((cell) => !cell.mine && !cell.friend)),
          }
        : null,
    [conquestActive, cells]
  );
  const myCellCount = useMyConquestCount();
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
    premiere: firstRequest,
  } = useLocalSearchParams<{
    defend?: string;
    boucle?: string;
    quartier?: string;
    premiere?: string;
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
    loop.generate(here, loopM);
  }, [loopRequest, here, loop, loopM]);

  // Sans demande particulière, la boucle de l'objectif est prête dès l'ouverture : « Partir » suffit.
  const autoLoop = useRef(false);
  const pendingRequest = Boolean(defendRequest || loopRequest || zoneRequest || firstRequest);
  useEffect(() => {
    if (autoLoop.current || pendingRequest || !here || mode !== 'loop') return;
    if (loop.status !== 'idle') return;
    autoLoop.current = true;
    loop.generate(here, loopM);
  }, [pendingRequest, here, mode, loop, loopM]);


  // Depuis la collection, une boucle vers les lieux pas encore découverts d'un quartier.
  const [collectionNote, setCollectionNote] = useState<string | null>(null);

  // Une nouvelle longueur choisie redessine la boucle d'elle-même, une fois les crans enchaînés.
  // (Un changement venu d'ailleurs, comme les pas du jour qui montent, ne touche pas au tracé.)
  const [stepsRequest, setStepsRequest] = useState(0);
  useEffect(() => {
    if (stepsRequest === 0 || !here || mode !== 'loop') return;
    const timer = setTimeout(() => {
      setDefenseNote(null);
      setCollectionNote(null);
      loop.generate(here, loopM);
    }, STEPS_SETTLE_MS);
    return () => clearTimeout(timer);
    // Seul un réglage de la longueur déclenche le recalcul, pas chaque nouvelle position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsRequest]);

  // Depuis l'accueil, la première marche guidée : une boucle courte qui passe par un lieu.
  const handledFirst = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!firstRequest || !here || handledFirst.current === firstRequest) return;
    handledFirst.current = firstRequest;
    setTimeout(() => {
      setMode('loop');
      setPin(null);
      setCollectionNote(
        `Votre première marche : environ ${FIRST_WALK_STEPS.toLocaleString('fr-FR')} pas. Elle vous rapporte vos premières cases de Conquête.`
      );
    }, 0);
    loop.generate(here, firstWalkDistance(strideM));
  }, [firstRequest, here, loop, strideM]);
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

  // En Destination, les résultats de la recherche sont aussi posés sur la carte.
  const placesOnMap = useMemo(
    () =>
      mode === 'destination' && destination.status === 'idle' && search.status === 'ready'
        ? search.places.slice(0, 5)
        : [],
    [mode, destination.status, search]
  );
  // Cadre une fois chaque nouvelle liste de résultats, avec la position, au-dessus du panneau.
  const framedPlaces = useRef('');
  useEffect(() => {
    const key = placesOnMap.map((place) => place.id).join('|');
    if (!key || key === framedPlaces.current) return;
    framedPlaces.current = key;
    const coords = placesOnMap.map((place) => place.coords);
    mapRef.current?.fitToCoordinates(here ? [here, ...coords] : coords, {
      edgePadding: {
        top: 120,
        right: 60,
        bottom: panel.collapsed ? 220 : windowHeight * 0.55,
        left: 60,
      },
      animated: true,
    });
  }, [placesOnMap, here, panel.collapsed, windowHeight]);

  if (location.status !== 'ready') {
    return <LocationUnavailable location={location} />;
  }

  const start = location.coords;
  const moveHandleTo = async (index: number, point: LatLng) => {
    if (!handles) return;
    const next = moveHandle(handles, index, point);
    setDroppedHandles(next);
    await loop.refine(start, next);
    setDroppedHandles(null);
  };
  const go = (walk: PlannedWalk) => {
    // Un seul trajet à la fois : celui qui est en cours continue en fond de l'app.
    if (walkInProgress()) {
      Alert.alert('Un trajet est déjà en cours', 'Terminez-le avant d’en commencer un autre.');
      return;
    }
    // Le trajet s'affiche aussitôt à la place de la préparation, dans ce même onglet.
    startWalk(walk);
  };
  // Sur le plus grand bloc à moi dans la zone chargée ; sinon autour de soi, assez près pour
  // voir les cases (seules celles de la zone affichée sont chargées).
  const showMyTerritory = () => {
    const largest = territoryShapes?.mine.reduce<Territory | null>(
      (best, territory) => (!best || territory.cellCount > best.cellCount ? territory : best),
      null
    );
    if (largest) {
      mapRef.current?.fitToCoordinates(largest.outline, {
        edgePadding: { top: 140, right: 60, bottom: windowHeight * 0.35, left: 60 },
        animated: true,
      });
    } else {
      mapRef.current?.animateToRegion({ ...start, latitudeDelta: 0.008, longitudeDelta: 0.008 }, 400);
    }
  };
  // Panneau plus haut que la place disponible : il défile, et seule la poignée le replie.
  const panelMaxHeight = windowHeight * 0.55;
  const bodyScrolls = !panel.collapsed && panelOverflow;
  const recenter = () =>
    mapRef.current?.animateToRegion({ ...start, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
  const choosePlace = (place: Place) => {
    Keyboard.dismiss();
    destination.choose(start, place, goalReached ? null : targetM);
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
  const stepsPicker = (
    <LoopStepsPicker
      choice={stepsChoice}
      onChoiceChange={(choice) => {
        setStepsRequest((count) => count + 1);
        if (choice === 'custom' && customSteps === null)
          setCustomSteps(initialCustomSteps(defaultLoopSteps, strideM));
        setStepsChoice(choice);
      }}
      defaultSteps={defaultLoopSteps}
      goalReached={goalReached}
      customSteps={customSteps ?? initialCustomSteps(defaultLoopSteps, strideM)}
      onCustomStepsChange={(steps) => {
        setStepsRequest((count) => count + 1);
        setCustomSteps(steps);
      }}
      strideM={strideM}
    />
  );
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
          setSelectedId(null);
        }}
        onLongPress={(event) => {
          setLocalFlag(LONG_PRESS_TIP_KEY, '1');
          setPin(event.nativeEvent.coordinate);
          setSelectedId(null);
          panel.expand();
        }}
        onRegionChange={() => handlesOverlay.current?.update()}
        onRegionChangeComplete={(next) => {
          setRegion(next);
          handlesOverlay.current?.update();
        }}>
        {territoryShapes
          ? TERRITORY_STYLES.flatMap(({ owner, color, fill, dashed }) =>
              territoryShapes[owner].map((territory) => (
                <TerritoryShape
                  key={territoryKey(owner, territory)}
                  territory={territory}
                  color={color}
                  fill={fill}
                  dashed={dashed}
                />
              ))
            )
          : null}
        {/* Case reprise : un simple contour rouge, sans remplissage par-dessus le territoire. */}
        {alertCells
          .filter(({ lost }) => lost)
          .map(({ cell }) => (
            <Polygon
              key={`alerte-${cellKey(cell)}`}
              coordinates={cellPolygon(cell)}
              fillColor="rgba(0, 0, 0, 0)"
              strokeColor={withAlpha(ConquestOtherColor, 1)}
              strokeWidth={2}
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
        {mode === 'loop' && loopRoute ? (
          <Marker
            coordinate={loopRoute.coordinates[0]}
            title="Départ et arrivée"
            pinColor={theme.tint}
          />
        ) : null}
        {pin ? <Marker coordinate={pin} title="Point choisi" pinColor={theme.tint} /> : null}
        {placesOnMap.map((place) => (
          // Toucher l'épingle affiche le lieu ; toucher sa bulle lance l'itinéraire.
          <Marker
            key={place.id}
            coordinate={place.coords}
            title={place.label}
            description={`À ${formatDistance(haversineMeters(start, place.coords))}`}
            pinColor={theme.tint}
            // Un seul toucher sur l'épingle lance l'itinéraire, comme dans la liste.
            onPress={() => choosePlace(place)}
          />
        ))}
        {mode === 'destination' && destination.status !== 'idle' ? (
          <Marker
            coordinate={destination.place.coords}
            title={destination.place.label}
            pinColor={theme.tint}
          />
        ) : null}
      </MapView>
      {conquestActive && myCellCount ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Recentre la carte sur votre plus grand bloc de cases"
          onPress={showMyTerritory}
          style={({ pressed }) => [
            styles.territoryPill,
            { top: insets.top + Spacing.two, backgroundColor: theme.background },
            pressed && styles.pressed,
          ]}>
          <View style={[styles.swatch, { backgroundColor: ConquestMineColor }]} />
          <ThemedText type="smallBold">
            {`Mon territoire · ${formatNumber(myCellCount)} case${myCellCount > 1 ? 's' : ''}`}
          </ThemedText>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Recentrer sur ma position"
        onPress={recenter}
        style={({ pressed }) => [
          styles.locateButton,
          { top: insets.top + Spacing.two, backgroundColor: theme.background },
          pressed && styles.pressed,
        ]}>
        <Icon ios="location.fill" fallback="◎" color={theme.tint} />
      </Pressable>
      {mode === 'loop' && loopRoute && handles ? (
        <LoopHandlesOverlay
          ref={handlesOverlay}
          mapRef={mapRef}
          handles={handles}
          disabled={loop.refining}
          color={theme.tint}
          onDrop={(index, coordinate) => void moveHandleTo(index, coordinate)}
        />
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
            {...(bodyScrolls ? {} : panel.panHandlers)}
            style={[styles.cardWrapper, { transform: [{ translateY: panel.translateY }] }]}>
            <ThemedView style={[styles.card, { borderColor: theme.backgroundSelected }]}>
              <View {...(bodyScrolls ? panel.panHandlers : {})} style={styles.grabberZone}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={panel.collapsed ? 'Déplier le panneau' : 'Replier le panneau'}
                  onPress={panel.toggle}
                  style={styles.grabberArea}>
                  <View style={[styles.grabber, { backgroundColor: theme.backgroundSelected }]} />
                </Pressable>
              </View>

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
                <ScrollView
                  style={{ maxHeight: panelMaxHeight }}
                  scrollEnabled={panelOverflow}
                  onContentSizeChange={(_, height) => setPanelOverflow(height > panelMaxHeight)}
                  contentContainerStyle={styles.panelBody}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}>
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
                        <RouteStats route={route} strideM={strideM} remainingSteps={remainingGoalSteps} />
                        <PoiSummary pois={pois} via={loopRoute?.via ?? []} />
                        {loop.refineError ? <ErrorText message={loop.refineError} /> : null}
                        <Button title="Partir" onPress={() => go({ mode: 'loop', route, pois })} />
                        <View style={styles.buttonRow}>
                          <Button
                            title="Autre boucle"
                            variant="secondary"
                            style={styles.flex}
                            onPress={() => {
                              setDefenseNote(null);
                              setCollectionNote(null);
                              Keyboard.dismiss();
                              loop.generate(start, loopM);
                            }}
                          />
                          <Button
                            title="Marcher librement"
                            variant="secondary"
                            style={styles.flex}
                            onPress={() => go({ mode: 'free' })}
                          />
                        </View>
                        {stepsPicker}
                        <ThemedText type="small" themeColor="textSecondary">
                          {loop.refining
                            ? 'Recalcul de la boucle par ce point…'
                            : 'Faites glisser un point rond du tracé vers la rue où vous voulez passer.'}
                        </ThemedText>
                      </>
                    ) : (
                      <>
                        {loop.status === 'loading' ? (
                          // Pendant le calcul, un simple indicateur à la place du bouton.
                          <View style={styles.loadingRow}>
                            <ActivityIndicator color={theme.tint} />
                            <ThemedText themeColor="textSecondary" style={styles.flex}>
                              {`Calcul d’une boucle d’environ ${formatDistance(loopM)} autour de vous…`}
                            </ThemedText>
                          </View>
                        ) : (
                          <>
                            <ThemedText themeColor="textSecondary">
                              {customLoopM != null
                                ? `Une boucle d’environ ${formatDistance(customLoopM)} depuis votre position.`
                                : goalReached
                                  ? `Objectif atteint ! Une boucle bonus de ${formatDistance(loopM)} ?`
                                  : `Une boucle d’environ ${formatDistance(loopM)} depuis votre position pour finir votre objectif.`}
                            </ThemedText>
                            {stepsPicker}
                            {loop.status === 'error' ? <ErrorText message={loop.message} /> : null}
                            <Button
                              title="Proposer une boucle"
                              onPress={() => {
                                setCollectionNote(null);
                                Keyboard.dismiss();
                                loop.generate(start, loopM);
                              }}
                            />
                          </>
                        )}
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
                      <RouteStats
                        route={destination.route}
                        strideM={strideM}
                        remainingSteps={remainingGoalSteps}
                      />
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
                      ) : destination.direct && !goalReached ? (
                        // Après « Chemin direct », on peut revenir au détour proposé avant.
                        <Button
                          title="Avec détour"
                          variant="secondary"
                          onPress={() =>
                            destination.detour
                              ? destination.restoreDetour()
                              : destination.choose(start, destination.place, targetM)
                          }
                        />
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
                      {longPressTipSeen ? null : (
                        <ThemedText type="small" themeColor="textSecondary">
                          Astuce : un appui long sur la carte choisit n’importe quel point
                          d’arrivée.
                        </ThemedText>
                      )}
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
                                choosePlace(place);
                              }}
                              style={({ pressed }) => [
                                styles.place,
                                { backgroundColor: theme.backgroundElement },
                                pressed && styles.pressed,
                              ]}>
                              <ThemedText type="small" numberOfLines={2} style={styles.flex}>
                                {place.label}
                              </ThemedText>
                              {/* À vol d'oiseau depuis la position actuelle. */}
                              <ThemedText type="small" themeColor="textSecondary">
                                {formatDistance(haversineMeters(start, place.coords))}
                              </ThemedText>
                            </Pressable>
                          ))
                        : null}
                    </>
                  )}
                </ScrollView>
              )}
            </ThemedView>
          </Animated.View>
        </SafeAreaView>
      </KeyboardAvoidingView>

      {selected ? (
        <PoiSheet poi={selected} visited={selected.visited} onClose={() => setSelectedId(null)} />
      ) : null}
      <PhotoZoomOverlay />
    </View>
  );
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
  const theme = useTheme();
  return (
    <View style={styles.conquest}>
      <ThemedText type="small">{territoryAlertLabel(alerts)}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {active
          ? alerts.lost.length > 0
            ? 'Encadrées de rouge sur la carte : les cases qu’on vous a reprises. Repassez-y pour les récupérer.'
            : 'Repassez-y avant pour les garder.'
          : `La boucle les reprendra si vous avez fait ${formatNumber(CONQUEST_UNLOCK_STEPS)} pas à l’arrivée.`}
      </ThemedText>
      {note ? <ErrorText message={note} /> : null}
      {/* Un lien plutôt qu'un bouton : « Partir » reste la seule action principale du panneau. */}
      <Pressable
        accessibilityRole="button"
        disabled={loading}
        hitSlop={Spacing.two}
        onPress={onDefend}
        style={styles.link}>
        {loading ? (
          <ActivityIndicator color={theme.tint} />
        ) : (
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            Tracer une boucle pour les défendre
          </ThemedText>
        )}
      </Pressable>
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
  if (!active) {
    return (
      <View style={styles.conquest}>
        <ThemedText type="small" themeColor="textSecondary">
          {steps === null
            ? `Conquête : se débloque à ${formatNumber(CONQUEST_UNLOCK_STEPS)} pas dans la journée.`
            : `Conquête : encore ${formatNumber(CONQUEST_UNLOCK_STEPS - steps)} pas pour colorer la carte à votre nom.`}
        </ThemedText>
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
      {zoomedOut ? (
        <ThemedText type="small" themeColor="textSecondary">
          Rapprochez la carte pour voir les cases.
        </ThemedText>
      ) : null}
    </View>
  );
}

function RouteStats({
  route,
  strideM,
  remainingSteps,
}: {
  route: LoopRoute;
  strideM: number;
  /** Pas qui manquent pour l'objectif du jour ; null s'il est atteint. */
  remainingSteps: number | null;
}) {
  const theme = useTheme();
  const steps = stepsForDistance(route.distanceM, strideM);
  const goal = goalAtArrival(steps, remainingSteps);
  return (
    <>
      <View style={styles.stats}>
        <Stat value={formatDistance(route.distanceM)} label="distance" />
        <Stat value={formatNumber(steps)} label="pas environ" />
        {/* Même allure que l'accueil : la durée annoncée ne change pas d'un écran à l'autre. */}
        <Stat value={formatDuration(walkingSeconds(route.distanceM))} label="de marche" />
      </View>
      {goal ? (
        <ThemedText
          type="small"
          themeColor={goal.reached ? undefined : 'textSecondary'}
          style={goal.reached ? { color: theme.success } : undefined}>
          {goal.text}
        </ThemedText>
      ) : null}
    </>
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
  territoryPill: {
    position: 'absolute',
    left: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
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
  grabberZone: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: -Spacing.four,
    marginBottom: -Spacing.three,
  },
  grabberArea: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  panelBody: {
    gap: Spacing.three,
  },
  link: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  locateButton: {
    position: 'absolute',
    right: Spacing.three,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
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
