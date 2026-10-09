import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import MapView, { Marker, Polygon, Polyline, type Region } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PoiSheet } from '@/components/poi-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { TextField } from '@/components/ui/text-field';
import {
  BottomTabInset,
  ConquestMineColor,
  ConquestOtherColor,
  MaxContentWidth,
  PoiColor,
  Radius,
  Spacing,
  VisitedPoiColor,
} from '@/constants/theme';
import { useConquestCells, useMyConquestCount } from '@/hooks/use-conquest';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useDestinationRoute, usePlaceSearch } from '@/hooks/use-destination';
import { useLoopRoute } from '@/hooks/use-loop-route';
import { setPlannedWalk } from '@/hooks/use-planned-walk';
import { useProfile } from '@/hooks/use-profile';
import { useRoutePois } from '@/hooks/use-route-pois';
import { useTheme } from '@/hooks/use-theme';
import { useTodaySteps } from '@/hooks/use-today-steps';
import { cellKey, cellPolygon, cellRangeOf } from '@/lib/conquest';
import { dailyProgress, formatDistance } from '@/lib/daily-progress';
import { formatDuration, loopTargetDistance, regionForCoordinates, type LoopRoute } from '@/lib/loop';
import { type Poi } from '@/lib/pois';
import { strideLengthMeters } from '@/lib/steps';

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');

type MapMode = 'loop' | 'destination' | 'conquest';

const MODE_OPTIONS: { value: MapMode; label: string }[] = [
  { value: 'loop', label: 'Boucle' },
  { value: 'destination', label: 'Destination' },
  { value: 'conquest', label: 'Conquête' },
];

export default function MapScreen() {
  const theme = useTheme();
  const location = useCurrentLocation();
  const loop = useLoopRoute();
  const destination = useDestinationRoute();
  const today = useTodaySteps();
  const profile = useProfile();
  const insets = useSafeAreaInsets();
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
  const destinationRoute = destination.status === 'ready' ? destination.route : null;
  const route = mode === 'loop' ? loopRoute : mode === 'destination' ? destinationRoute : null;
  const [region, setRegion] = useState<Region | null>(null);
  const cells = useConquestCells(mode === 'conquest' && region ? cellRangeOf(region) : null);
  const pois = useRoutePois(route?.coordinates ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = pois.find((poi) => poi.id === selectedId) ?? null;

  // Recadre la carte sur le tracé affiché.
  useEffect(() => {
    const region = route ? regionForCoordinates(route.coordinates) : null;
    if (region) mapRef.current?.animateToRegion(region, 400);
  }, [route]);

  if (location.status !== 'ready') {
    return <LocationUnavailable location={location} />;
  }

  const start = location.coords;
  const go = (walk: Parameters<typeof setPlannedWalk>[0]) => {
    setPlannedWalk(walk);
    router.push('/trajet');
  };

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
          if (event.nativeEvent.action !== 'marker-press') setSelectedId(null);
        }}
        onRegionChangeComplete={setRegion}>
        {mode === 'conquest'
          ? cells.map((cell) => (
              <Polygon
                key={cellKey(cell)}
                coordinates={cellPolygon(cell)}
                fillColor={`${cell.mine ? ConquestMineColor : ConquestOtherColor}55`}
                strokeWidth={0}
              />
            ))
          : null}
        {route ? (
          <Polyline
            coordinates={route.coordinates}
            strokeColor={theme.tint}
            strokeWidth={5}
            lineJoin="round"
            lineCap="round"
          />
        ) : null}
        {pois.map((poi) => (
          <Marker
            key={poi.id}
            coordinate={poi.coords}
            pinColor={poi.visited ? VisitedPoiColor : PoiColor}
            onPress={() => setSelectedId(poi.id)}
          />
        ))}
        {mode === 'loop' && loopRoute ? (
          <Marker coordinate={loopRoute.coordinates[0]} title="Départ et arrivée" pinColor={theme.tint} />
        ) : null}
        {mode === 'destination' && destination.status !== 'idle' ? (
          <Marker coordinate={destination.place.coords} title={destination.place.label} pinColor={theme.tint} />
        ) : null}
      </MapView>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}>
        <SafeAreaView
          edges={['left', 'right']}
          style={[
            styles.overlayInner,
            // Sur iPhone, la barre d'onglets flotte au-dessus de la carte : on remonte le panneau.
            Platform.OS === 'ios' && { paddingBottom: insets.bottom + BottomTabInset + Spacing.two },
          ]}>
          <ThemedView style={[styles.card, { borderColor: theme.backgroundSelected }]}>
            <SegmentedChoice options={MODE_OPTIONS} value={mode} onChange={setMode} />

            {mode === 'conquest' ? (
              <ConquestCard
                zoomedOut={region !== null && cellRangeOf(region) === null}
                onStart={() => go({ mode: 'free' })}
              />
            ) : mode === 'loop' ? (
              route ? (
                <>
                  <RouteStats route={route} strideM={strideM} />
                  <PoiSummary pois={pois} via={loopRoute?.via ?? []} />
                  <Button title="Partir" onPress={() => go({ mode: 'loop', route, pois })} />
                  <Button
                    title="Autre boucle"
                    variant="secondary"
                    onPress={() => loop.generate(start, targetM)}
                  />
                </>
              ) : (
                <>
                  <ThemedText themeColor="textSecondary">
                    {goalReached
                      ? `Objectif atteint ! Une boucle bonus de ${formatDistance(targetM)} ?`
                      : `Une boucle d’environ ${formatDistance(targetM)} depuis votre position pour finir votre objectif.`}
                  </ThemedText>
                  {loop.status === 'error' ? <ErrorText message={loop.message} /> : null}
                  <Button
                    title="Proposer une boucle"
                    loading={loop.status === 'loading'}
                    onPress={() => loop.generate(start, targetM)}
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
                      onPress={() => destination.choose(start, destination.place, goalReached ? null : targetM)}
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
                {destination.status === 'error' ? <ErrorText message={destination.message} /> : null}
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
          </ThemedView>
        </SafeAreaView>
      </KeyboardAvoidingView>

      {selected ? (
        <PoiSheet poi={selected} visited={selected.visited} onClose={() => setSelectedId(null)} />
      ) : null}
    </View>
  );
}

/** Mode Conquête : ses cases, et comment en prendre d'autres. */
function ConquestCard({ zoomedOut, onStart }: { zoomedOut: boolean; onStart: () => void }) {
  const count = useMyConquestCount();
  return (
    <>
      <View style={styles.legend}>
        <View style={[styles.swatch, { backgroundColor: ConquestMineColor }]} />
        <ThemedText type="small" style={styles.flex}>
          {count === null
            ? 'Vos cases'
            : count === 0
              ? 'Aucune case à vous pour l’instant'
              : `${formatNumber(count)} case${count > 1 ? 's' : ''} à vous`}
        </ThemedText>
        <View style={[styles.swatch, { backgroundColor: ConquestOtherColor }]} />
        <ThemedText type="small">Autres marcheurs</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {zoomedOut
          ? 'Rapprochez la carte pour voir les cases.'
          : 'Chaque trajet enregistré colore les cases traversées à votre nom pendant 7 jours. Repassez sur celles des autres pour les reprendre. Le début et la fin du trajet ne comptent pas, pour ne pas montrer votre adresse.'}
      </ThemedText>
      <Button title="Partir conquérir" onPress={onStart} />
    </>
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
