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
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { TextField } from '@/components/ui/text-field';
import { BottomTabInset, MaxContentWidth, PoiColor, Spacing } from '@/constants/theme';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useDestinationRoute, usePlaceSearch } from '@/hooks/use-destination';
import { useLoopRoute } from '@/hooks/use-loop-route';
import { setPlannedWalk } from '@/hooks/use-planned-walk';
import { useProfile } from '@/hooks/use-profile';
import { useRoutePois } from '@/hooks/use-route-pois';
import { useTheme } from '@/hooks/use-theme';
import { useTodaySteps } from '@/hooks/use-today-steps';
import { dailyProgress, formatDistance } from '@/lib/daily-progress';
import { formatDuration, loopTargetDistance, regionForCoordinates, type LoopRoute } from '@/lib/loop';
import { POI_KIND_LABELS, type Poi } from '@/lib/pois';
import { strideLengthMeters } from '@/lib/steps';

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');

type MapMode = 'loop' | 'destination';

const MODE_OPTIONS: { value: MapMode; label: string }[] = [
  { value: 'loop', label: 'Boucle' },
  { value: 'destination', label: 'Destination' },
];

export default function MapScreen() {
  const theme = useTheme();
  const location = useCurrentLocation();
  const loop = useLoopRoute();
  const destination = useDestinationRoute();
  const today = useTodaySteps();
  const profile = useProfile();
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
  const route = mode === 'loop' ? loopRoute : destinationRoute;
  const pois = useRoutePois(route?.coordinates ?? null);

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
        showsPointsOfInterests={false}>
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
            title={poi.title}
            description={poi.description ?? POI_KIND_LABELS[poi.kind]}
            pinColor={PoiColor}
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
        <SafeAreaView edges={['left', 'right']} style={styles.overlayInner}>
          <ThemedView style={styles.card}>
            <SegmentedChoice options={MODE_OPTIONS} value={mode} onChange={setMode} />

            {mode === 'loop' ? (
              route ? (
                <>
                  <RouteStats route={route} strideM={strideM} />
                  <PoiSummary pois={pois} via={null} />
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
                <PoiSummary pois={pois} via={destination.route.via} />
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

/** Ce qu'il y a à voir en chemin, et pourquoi le détour passe par là. */
function PoiSummary({ pois, via }: { pois: Poi[]; via: Poi | null }) {
  if (!via && pois.length === 0) return null;
  const others = pois.filter((poi) => poi.id !== via?.id).length;
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {via ? `Détour par : ${via.title}. ` : ''}
      {others > 0
        ? `${others} ${others > 1 ? 'lieux remarquables' : 'lieu remarquable'} sur le trajet (repères orange).`
        : ''}
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
      <ThemedText type="smallBold">{value}</ThemedText>
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
