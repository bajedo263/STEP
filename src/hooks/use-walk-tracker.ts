import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { useCallback, useEffect, useRef, useState } from 'react';

import { addPoint, emptyTrack, type Track } from '@/lib/track';

export type WalkTracker = {
  status: 'starting' | 'tracking' | 'denied' | 'error';
  track: Track;
  /** Pas comptés par le podomètre depuis le départ, ou null s'il n'est pas disponible. */
  steps: number | null;
  startedAt: Date;
};

/**
 * Suit la marche pendant que l'écran est ouvert : positions GPS filtrées et pas du podomètre.
 * Expo Go ne permet pas le suivi en arrière-plan ; il viendra avec la version de test dédiée.
 */
export function useWalkTracker() {
  const [startedAt] = useState(() => new Date());
  const [status, setStatus] = useState<WalkTracker['status']>('starting');
  const [track, setTrack] = useState<Track>(emptyTrack);
  const [steps, setSteps] = useState<number | null>(null);
  const subscriptions = useRef<{ remove: () => void }[]>([]);

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

      keep(
        await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 3000 },
          ({ coords, timestamp }) =>
            setTrack((current) =>
              addPoint(current, {
                latitude: coords.latitude,
                longitude: coords.longitude,
                accuracy: coords.accuracy,
                timestamp,
              })
            )
        )
      );
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

  return { status, track, steps, startedAt, stop };
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
