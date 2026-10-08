import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useLoopRoute } from '@/hooks/use-loop-route';
import { setPlannedWalk } from '@/hooks/use-planned-walk';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { useTodaySteps } from '@/hooks/use-today-steps';
import { dailyProgress, formatDistance } from '@/lib/daily-progress';
import { formatDuration, loopTargetDistance, regionForCoordinates } from '@/lib/loop';
import { strideLengthMeters } from '@/lib/steps';

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');

export default function MapScreen() {
  const theme = useTheme();
  const location = useCurrentLocation();
  const loop = useLoopRoute();
  const today = useTodaySteps();
  const profile = useProfile();
  const mapRef = useRef<MapView>(null);

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

  // Recadre la carte sur la boucle dès qu'elle arrive.
  const route = loop.status === 'ready' ? loop.route : null;
  useEffect(() => {
    const region = route ? regionForCoordinates(route.coordinates) : null;
    if (region) mapRef.current?.animateToRegion(region, 400);
  }, [route]);

  if (location.status !== 'ready') {
    return <LocationUnavailable location={location} />;
  }

  const start = location.coords;

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
          <>
            <Polyline
              coordinates={route.coordinates}
              strokeColor={theme.tint}
              strokeWidth={5}
              lineJoin="round"
              lineCap="round"
            />
            <Marker coordinate={route.coordinates[0]} title="Départ et arrivée" pinColor={theme.tint} />
          </>
        ) : null}
      </MapView>

      <SafeAreaView edges={['left', 'right']} style={styles.overlay}>
        <ThemedView style={styles.card}>
          {route ? (
            <>
              <ThemedText type="smallBold">Votre boucle</ThemedText>
              <View style={styles.stats}>
                <Stat value={formatDistance(route.distanceM)} label="distance" />
                <Stat value={`${formatNumber(route.distanceM / strideM)}`} label="pas environ" />
                <Stat value={formatDuration(route.durationS)} label="de marche" />
              </View>
              <Button
                title="Partir"
                onPress={() => {
                  setPlannedWalk({ mode: 'loop', route });
                  router.push('/trajet');
                }}
              />
              <Button
                title="Autre boucle"
                variant="secondary"
                onPress={() => loop.generate(start, targetM)}
              />
            </>
          ) : (
            <>
              <ThemedText type="smallBold">Mode Boucle</ThemedText>
              <ThemedText themeColor="textSecondary">
                {goalReached
                  ? `Objectif atteint ! Une boucle bonus de ${formatDistance(targetM)} ?`
                  : `Une boucle d’environ ${formatDistance(targetM)} depuis votre position pour finir votre objectif.`}
              </ThemedText>
              {loop.status === 'error' ? (
                <ThemedText type="small" style={{ color: theme.danger }}>
                  {loop.message}
                </ThemedText>
              ) : null}
              <Button
                title="Proposer une boucle"
                loading={loop.status === 'loading'}
                onPress={() => loop.generate(start, targetM)}
              />
              <Button
                title="Marcher librement"
                variant="secondary"
                onPress={() => {
                  setPlannedWalk({ mode: 'free' });
                  router.push('/trajet');
                }}
              />
            </>
          )}
        </ThemedView>
      </SafeAreaView>
    </View>
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
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
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
