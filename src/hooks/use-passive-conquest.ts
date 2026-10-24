import * as Location from 'expo-location';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { notifyConquestChanged } from '@/hooks/use-conquest';
import { useTodaySteps } from '@/hooks/use-today-steps';
import {
  CONQUEST_MAX_SPEED_MS,
  CONQUEST_SKIP_M,
  cellKey,
  cellOf,
  conquestUnlocked,
} from '@/lib/conquest';
import type { LatLng } from '@/lib/loop';
import { localDay } from '@/lib/daily-progress';
import { supabase } from '@/lib/supabase';
import { haversineMeters } from '@/lib/track';
import { useActiveWalk } from '@/providers/walk-provider';

/** Position trop imprécise pour savoir dans quelle case on est (m). */
const MAX_ACCURACY_M = 35;
/** Délai entre deux envois des cases traversées (ms). */
const FLUSH_INTERVAL_MS = 30_000;

/**
 * Premier point suivi du jour : la zone de 150 m autour reste neutre. On le garde tant que l'app
 * tourne, pour ne pas neutraliser une nouvelle zone à chaque retour dans l'app.
 */
let dayOrigin: { day: string; point: LatLng } | null = null;

const subscribeAppState = (listener: () => void) => {
  const subscription = AppState.addEventListener('change', listener);
  return () => subscription.remove();
};

/**
 * Conquête sans trajet : une fois les 10 000 pas du jour atteints, on est en marche libre par
 * défaut et les cases où l'on passe se colorent à son nom (y compris celles des autres), sans
 * lancer de trajet. La position n'est suivie que pendant que
 * l'app est ouverte (Expo Go ne la suit pas en arrière-plan) et hors trajet, qui prend lui-même
 * ses cases. Comme pour un trajet, rien n'est pris à moins de 150 m du premier point suivi dans
 * la journée : l'adresse de départ, souvent son domicile, n'apparaît pas sur la carte. Les
 * positions prises à plus de 15 km/h (vélo, voiture, transports) ne comptent pas.
 */
export function usePassiveConquest() {
  const today = useTodaySteps();
  const walk = useActiveWalk();
  const active = useSyncExternalStore(
    subscribeAppState,
    () => AppState.currentState === 'active',
    () => false
  );
  const unlocked = conquestUnlocked(today.status === 'ready' ? today.steps : null);
  const enabled = unlocked && !walk && active;

  useEffect(() => {
    if (!enabled || !supabase) return;
    const client = supabase;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let previous: { point: LatLng; timestamp: number } | null = null;
    let pending: LatLng[] = [];
    const sent = new Set<string>();

    const flush = () => {
      if (pending.length === 0) return;
      const points = pending;
      pending = [];
      client.rpc('capture_free_cells', { p_points: points }).then(({ data, error }) => {
        if (!error && typeof data === 'number' && data > 0) notifyConquestChanged();
      });
    };

    (async () => {
      // On ne redemande pas l'autorisation ici : la carte et les trajets s'en chargent.
      const permission = await Location.getForegroundPermissionsAsync();
      if (cancelled || !permission.granted) return;
      const watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 15 },
        ({ coords, timestamp }) => {
          if (coords.accuracy !== null && coords.accuracy > MAX_ACCURACY_M) return;
          const point = { latitude: coords.latitude, longitude: coords.longitude };
          // Vitesse donnée par le GPS, sinon calculée depuis la position précédente.
          const last = previous;
          previous = { point, timestamp };
          const seconds = last ? (timestamp - last.timestamp) / 1000 : 0;
          const speed =
            coords.speed !== null && coords.speed >= 0
              ? coords.speed
              : last && seconds > 0
                ? haversineMeters(last.point, point) / seconds
                : 0;
          if (speed > CONQUEST_MAX_SPEED_MS) return;
          const day = localDay(new Date(timestamp));
          if (dayOrigin?.day !== day) dayOrigin = { day, point };
          if (haversineMeters(dayOrigin.point, point) < CONQUEST_SKIP_M) return;
          const key = cellKey(cellOf(point));
          if (sent.has(key)) return;
          sent.add(key);
          pending.push(point);
          if (pending.length >= 5) flush();
        }
      ).catch(() => null);
      if (cancelled) watch?.remove();
      else subscription = watch;
    })();

    const timer = setInterval(flush, FLUSH_INTERVAL_MS);
    return () => {
      cancelled = true;
      subscription?.remove();
      clearInterval(timer);
      flush();
    };
  }, [enabled]);
}
