import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { LatLng } from '@/lib/loop';
import { isExpoGo } from '@/lib/native-build';
import { addPoint, emptyTrack, type Track } from '@/lib/track';
import { onWalkLocations, WALK_LOCATION_TASK } from '@/lib/walk-location-task';

const TRACKING = {
  accuracy: Location.Accuracy.BestForNavigation,
  distanceInterval: 5,
  timeInterval: 3000,
};

export type WalkTracker = {
  status: 'starting' | 'tracking' | 'denied' | 'error';
  track: Track;
  /** Pas comptés par le podomètre depuis le départ, ou null s'il n'est pas disponible. */
  steps: number | null;
  startedAt: Date;
  /** Dernière position GPS brute (non lissée, non posée sur l'itinéraire), pour le point bleu. */
  position: LatLng | null;
  /** Vrai si le suivi continue écran éteint ; sinon l'écran doit rester allumé. */
  background: boolean;
};

/**
 * Suit la marche : positions GPS lissées et pas du podomètre.
 * Avec un trajet prévu (`path`), les positions proches sont posées dessus.
 * Dans la version installée, le suivi continue téléphone en poche (tâche de localisation, avec
 * l'indicateur bleu sur iPhone et une notification sur Android) ; Expo Go ne le permet pas et
 * suit seulement écran allumé.
 */
export function useWalkTracker(path: LatLng[] | null = null) {
  const [startedAt] = useState(() => new Date());
  const [status, setStatus] = useState<WalkTracker['status']>('starting');
  const [track, setTrack] = useState<Track>(emptyTrack);
  const [steps, setSteps] = useState<number | null>(null);
  const [position, setPosition] = useState<LatLng | null>(null);
  const [background, setBackground] = useState(false);
  const subscriptions = useRef<{ remove: () => void }[]>([]);
  const pathRef = useRef(path);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  const stop = useCallback(() => {
    subscriptions.current.forEach((subscription) => subscription.remove());
    subscriptions.current = [];
  }, []);

  useEffect(() => {
    let cancelled = false;
    const keep = (subscription: { remove: () => void }) => {
      if (cancelled) subscription.remove();
      else subscriptions.current.push(subscription);
    };

    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (!permission.granted) {
        setStatus('denied');
        return;
      }

      const onLocation = ({ coords, timestamp }: Location.LocationObject) => {
        setPosition({ latitude: coords.latitude, longitude: coords.longitude });
        setTrack((current) =>
          addPoint(
            current,
            {
              latitude: coords.latitude,
              longitude: coords.longitude,
              accuracy: coords.accuracy,
              timestamp,
            },
            pathRef.current
          )
        );
      };

      if (await startBackgroundTracking(onLocation, keep)) {
        if (!cancelled) setBackground(true);
      } else {
        keep(await Location.watchPositionAsync(TRACKING, onLocation));
      }
      if (!cancelled) setStatus('tracking');

      // Le podomètre est un plus : sans lui, les pas sont estimés à partir de la distance.
      if (await Pedometer.isAvailableAsync().catch(() => false)) {
        keep(Pedometer.watchStepCount(({ steps: counted }) => setSteps(counted)));
      }
    })().catch(() => {
      if (!cancelled) setStatus('error');
    });

    return () => {
      cancelled = true;
      stop();
    };
  }, [stop]);

  return { status, track, steps, startedAt, position, background, stop };
}

/** Dernier suivi lancé : seul lui peut arrêter la tâche, partagée par tous les trajets. */
let backgroundOwner = 0;

/**
 * Lance la tâche de localisation qui survit à l'écran éteint. Faux dans Expo Go ou en cas
 * d'échec : l'appelant suit alors la position écran allumé.
 * Pas besoin de l'autorisation « Toujours » : le suivi est lancé par l'utilisateur, app ouverte.
 */
async function startBackgroundTracking(
  onLocation: (location: Location.LocationObject) => void,
  keep: (subscription: { remove: () => void }) => void
): Promise<boolean> {
  if (isExpoGo || Platform.OS === 'web') return false;
  const owner = ++backgroundOwner;
  const unsubscribe = onWalkLocations((locations) => locations.forEach(onLocation));
  try {
    // Un trajet précédent interrompu brutalement a pu laisser la tâche tourner.
    if (await Location.hasStartedLocationUpdatesAsync(WALK_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(WALK_LOCATION_TASK);
    }
    await Location.startLocationUpdatesAsync(WALK_LOCATION_TASK, {
      ...TRACKING,
      activityType: Location.LocationActivityType.Fitness,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Marche en cours',
        notificationBody: 'STEP suit votre trajet.',
        killServiceOnDestroy: true,
      },
    });
  } catch {
    unsubscribe();
    return false;
  }
  keep({
    remove: () => {
      unsubscribe();
      if (owner === backgroundOwner) {
        Location.stopLocationUpdatesAsync(WALK_LOCATION_TASK).catch(() => {});
      }
    },
  });
  return true;
}

/** Secondes écoulées depuis `since`, rafraîchies chaque seconde. */
export function useElapsedSeconds(since: Date, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return Math.max(0, Math.floor((now - since.getTime()) / 1000));
}
