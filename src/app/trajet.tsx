import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Linking, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polygon, Polyline } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PoiSheet, PoiStory } from '@/components/poi-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { ConquestMineColor, MaxContentWidth, PoiColor, Spacing, VisitedPoiColor } from '@/constants/theme';
import { usePlannedWalk } from '@/hooks/use-planned-walk';
import { usePoiDiscovery } from '@/hooks/use-poi-discovery';
import { useProfile } from '@/hooks/use-profile';
import { useRoutePois } from '@/hooks/use-route-pois';
import { useTheme } from '@/hooks/use-theme';
import { useTodaySteps } from '@/hooks/use-today-steps';
import { useHeading } from '@/hooks/use-heading';
import { useElapsedSeconds, useWalkTracker } from '@/hooks/use-walk-tracker';
import { capturedCells, cellKey, cellPolygon, cellsAlongTrack, conquestUnlocked } from '@/lib/conquest';
import { formatDistance } from '@/lib/daily-progress';
import { formatDuration } from '@/lib/loop';
import { mergePois, POI_KIND_LABELS, type RoutePoi } from '@/lib/pois';
import { strideLengthMeters } from '@/lib/steps';
import { supabase } from '@/lib/supabase';
import { formatElapsed } from '@/lib/track';
import { MIN_WALK_M, summarizeWalk, walkRow, type WalkSummary } from '@/lib/walk-summary';
import { useAuth } from '@/providers/auth-provider';

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');

type SaveState = 'saving' | 'saved' | 'error' | 'too-short';

const NO_POIS: RoutePoi[] = [];

export default function WalkScreen() {
  const [summary, setSummary] = useState<WalkSummary | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saving');
  // La Conquête s'active dès 10 000 pas dans la journée, y compris en cours de trajet.
  const today = useTodaySteps();
  const conquering = conquestUnlocked(today.status === 'ready' ? today.steps : null);
  const [conquered, setConquered] = useState(false);
  const { session } = useAuth();
  const profile = useProfile();
  const planned = usePlannedWalk();
  const tracker = useWalkTracker();
  // Si l'on est parti avant que les lieux du trajet soient arrivés sur la carte, on les charge ici.
  const routePois = useRoutePois(planned.mode === 'free' ? null : planned.route.coordinates);
  const plannedPois = useMemo(
    () => (planned.mode === 'free' ? NO_POIS : mergePois(routePois, planned.pois)),
    [planned, routePois]
  );
  const discovery = usePoiDiscovery(plannedPois, summary ? null : tracker.track.points.at(-1));

  const strideM = strideLengthMeters(profile?.height_cm ?? 170, profile?.sex ?? 'unspecified');

  const save = async (walk: WalkSummary, conquers: boolean) => {
    if (walk.distanceM < MIN_WALK_M) {
      setSaveState('too-short');
      return;
    }
    const userId = session?.user.id;
    if (!supabase || !userId) {
      setSaveState('error');
      return;
    }
    setSaveState('saving');
    const row = walkRow(userId, walk, conquers);
    let { error } = await supabase.from('walks').insert(row);
    if (error?.code === 'PGRST204') {
      // Base pas encore migrée (colonne conquers absente) : on enregistre sans.
      const { conquers: _ignored, ...legacyRow } = row;
      ({ error } = await supabase.from('walks').insert(legacyRow));
    }
    setSaveState(error ? 'error' : 'saved');
  };

  const finish = () => {
    tracker.stop();
    const walk = summarizeWalk({
      mode: planned.mode,
      track: tracker.track,
      pedometerSteps: tracker.steps,
      strideM,
      weightKg: profile?.weight_kg ?? 70,
      startedAt: tracker.startedAt,
      endedAt: new Date(),
    });
    setSummary(walk);
    setConquered(conquering);
    save(walk, conquering);
  };

  if (summary) {
    return (
      <WalkDone
        summary={summary}
        saveState={saveState}
        discovered={discovery.discovered}
        cellCount={conquered ? capturedCells(tracker.track.points).length : 0}
        onRetry={() => save(summary, conquered)}
      />
    );
  }

  return (
    <ActiveWalk
      tracker={tracker}
      planned={planned}
      plannedPois={plannedPois}
      discovery={discovery}
      estimatedSteps={tracker.steps ?? tracker.track.distanceM / strideM}
      conquering={conquering}
      onFinish={() =>
        Alert.alert('Terminer le trajet ?', undefined, [
          { text: 'Continuer', style: 'cancel' },
          { text: 'Terminer', style: 'destructive', onPress: finish },
        ])
      }
    />
  );
}

function ActiveWalk({
  tracker,
  planned,
  plannedPois: pois,
  discovery,
  estimatedSteps,
  conquering,
  onFinish,
}: {
  tracker: ReturnType<typeof useWalkTracker>;
  planned: ReturnType<typeof usePlannedWalk>;
  plannedPois: RoutePoi[];
  discovery: ReturnType<typeof usePoiDiscovery>;
  estimatedSteps: number;
  conquering: boolean;
  onFinish: () => void;
}) {
  useKeepAwake();
  const theme = useTheme();
  const elapsed = useElapsedSeconds(tracker.startedAt, true);
  const plannedRoute = planned.mode === 'free' ? null : planned.route;
  // Lieux du trajet prévu, plus ceux découverts en chemin hors du trajet.
  const shown = [...pois, ...discovery.discovered.filter((d) => !pois.some((p) => p.id === d.id))];
  const start = plannedRoute ? plannedRoute.coordinates[0] : tracker.track.points[0];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  // Boussole : la carte pivote avec le téléphone pour montrer droit devant ce qui est en face.
  const heading = useHeading();
  const [followHeading, setFollowHeading] = useState(true);
  // Orientation actuelle de la carte : le cône tourne de l'écart entre le téléphone et la carte.
  const [mapHeading, setMapHeading] = useState(0);
  const position = tracker.track.points.at(-1) ?? null;
  const latitude = position?.latitude;
  const longitude = position?.longitude;

  useEffect(() => {
    if (!followHeading || latitude === undefined || longitude === undefined) return;
    mapRef.current?.animateCamera(
      { center: { latitude, longitude }, heading: heading ?? 0 },
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

  // Bouton retour d'Android : on propose de terminer plutôt que de perdre le trajet.
  const failed = tracker.status === 'denied' || tracker.status === 'error';
  useEffect(() => {
    if (failed) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onFinish();
      return true;
    });
    return () => subscription.remove();
  }, [failed, onFinish]);

  if (failed) {
    return (
      <ThemedView style={[styles.container, styles.centeredScreen]}>
        <ThemedText style={styles.centered}>
          {tracker.status === 'denied'
            ? 'STEP a besoin de votre position pour suivre le trajet.'
            : 'Le suivi de position n’a pas pu démarrer.'}
        </ThemedText>
        <Button title="Retour" onPress={() => router.back()} />
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
          showsUserLocation
          followsUserLocation={!followHeading}
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
          {plannedRoute ? (
            <Polyline
              coordinates={plannedRoute.coordinates}
              strokeColor={theme.textSecondary}
              strokeWidth={4}
              lineDashPattern={[8, 8]}
            />
          ) : null}
          {planned.mode === 'destination' ? (
            <Marker coordinate={planned.route.coordinates.at(-1)!} title={planned.label} pinColor={theme.tint} />
          ) : null}
          {shown.map((poi) => (
            <Marker
              key={poi.id}
              coordinate={poi.coords}
              pinColor={discovery.isVisited(poi) ? VisitedPoiColor : PoiColor}
              onPress={() => setSelectedId(poi.id)}
            />
          ))}
          {cells.map((cell) => (
            <Polygon
              key={cellKey(cell)}
              coordinates={cellPolygon(cell)}
              fillColor={`${ConquestMineColor}40`}
              strokeWidth={0}
            />
          ))}
          {position && heading !== null ? (
            // Le cône est dessiné centré sur la position et tourné dans la vue elle-même :
            // la rotation des marqueurs n'est pas prise en charge partout (Apple Plans).
            <Marker coordinate={position} anchor={{ x: 0.5, y: 0.5 }} zIndex={10}>
              <View
                style={[
                  styles.headingBox,
                  { transform: [{ rotate: `${heading - shownMapHeading}deg` }] },
                ]}>
                <View style={[styles.headingCone, { borderBottomColor: `${theme.tint}AA` }]} />
              </View>
            </Marker>
          ) : null}
          {tracker.track.points.length > 1 ? (
            <Polyline
              coordinates={tracker.track.points}
              strokeColor={theme.tint}
              strokeWidth={6}
              lineJoin="round"
              lineCap="round"
            />
          ) : null}
        </MapView>
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
        <ThemedView style={styles.card}>
          <ThemedText type="title" style={styles.centered}>
            {formatElapsed(elapsed)}
          </ThemedText>
          <View style={styles.stats}>
            <Stat value={formatDistance(tracker.track.distanceM)} label="parcourus" />
            <Stat value={formatNumber(estimatedSteps)} label="pas" />
            {plannedRoute ? (
              <Stat
                value={formatDistance(Math.max(0, plannedRoute.distanceM - tracker.track.distanceM))}
                label="restants"
              />
            ) : null}
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            Gardez STEP ouvert pendant la marche : l’écran reste allumé.
          </ThemedText>
          <Button title="Terminer" onPress={onFinish} />
        </ThemedView>
      </SafeAreaView>

      {selected ? (
        <PoiSheet
          poi={selected}
          visited={discovery.isVisited(selected)}
          onClose={() => setSelectedId(null)}
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
  onRetry,
}: {
  summary: WalkSummary;
  saveState: SaveState;
  discovered: RoutePoi[];
  cellCount: number;
  onRetry: () => void;
}) {
  const theme = useTheme();
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
        <ThemedText type="subtitle">Bravo !</ThemedText>
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
        <Button
          title="Fermer"
          disabled={saveState === 'saving'}
          onPress={() => router.dismissTo('/')}
        />
      </SafeAreaView>
    </ThemedView>
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
  headingBox: {
    width: 64,
    height: 64,
    alignItems: 'center',
  },
  // Cône de direction : un triangle qui part du point bleu vers l'avant du téléphone.
  headingCone: {
    width: 0,
    height: 0,
    borderLeftWidth: 14,
    borderRightWidth: 14,
    borderBottomWidth: 30,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: Spacing.three,
    pointerEvents: 'box-none',
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
