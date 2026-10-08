import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, BackHandler, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { usePlannedWalk } from '@/hooks/use-planned-walk';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { useElapsedSeconds, useWalkTracker } from '@/hooks/use-walk-tracker';
import { formatDistance } from '@/lib/daily-progress';
import { formatDuration } from '@/lib/loop';
import { strideLengthMeters } from '@/lib/steps';
import { supabase } from '@/lib/supabase';
import { formatElapsed } from '@/lib/track';
import { MIN_WALK_M, summarizeWalk, walkRow, type WalkSummary } from '@/lib/walk-summary';
import { useAuth } from '@/providers/auth-provider';

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');

type SaveState = 'saving' | 'saved' | 'error' | 'too-short';

export default function WalkScreen() {
  const [summary, setSummary] = useState<WalkSummary | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saving');
  const { session } = useAuth();
  const profile = useProfile();
  const planned = usePlannedWalk();
  const tracker = useWalkTracker();

  const strideM = strideLengthMeters(profile?.height_cm ?? 170, profile?.sex ?? 'unspecified');

  const save = async (walk: WalkSummary) => {
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
    const { error } = await supabase.from('walks').insert(walkRow(userId, walk));
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
    save(walk);
  };

  if (summary) {
    return <WalkDone summary={summary} saveState={saveState} onRetry={() => save(summary)} />;
  }

  return (
    <ActiveWalk
      tracker={tracker}
      planned={planned}
      estimatedSteps={tracker.steps ?? tracker.track.distanceM / strideM}
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
  estimatedSteps,
  onFinish,
}: {
  tracker: ReturnType<typeof useWalkTracker>;
  planned: ReturnType<typeof usePlannedWalk>;
  estimatedSteps: number;
  onFinish: () => void;
}) {
  useKeepAwake();
  const theme = useTheme();
  const elapsed = useElapsedSeconds(tracker.startedAt, true);
  const plannedRoute = planned.mode === 'free' ? null : planned.route;
  const start = plannedRoute ? plannedRoute.coordinates[0] : tracker.track.points[0];

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
          style={StyleSheet.absoluteFill}
          initialRegion={{ ...start, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
          showsUserLocation
          followsUserLocation
          showsPointsOfInterests={false}>
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

      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.overlay}>
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
    </View>
  );
}

function WalkDone({
  summary,
  saveState,
  onRetry,
}: {
  summary: WalkSummary;
  saveState: SaveState;
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
      <ThemedText type="smallBold">{value}</ThemedText>
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
