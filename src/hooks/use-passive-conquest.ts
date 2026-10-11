import * as Location from 'expo-location';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { notifyConquestChanged } from '@/hooks/use-conquest';
import { useTodaySteps } from '@/hooks/use-today-steps';
import { CONQUEST_SKIP_M, cellKey, cellOf, conquestUnlocked } from '@/lib/conquest';
import type { LatLng } from '@/lib/loop';
import { supabase } from '@/lib/supabase';
import { haversineMeters } from '@/lib/track';
import { useActiveWalk } from '@/providers/walk-provider';

/** Position trop imprécise pour savoir dans quelle case on est (m). */
const MAX_ACCURACY_M = 35;
/** Délai entre deux envois des cases traversées (ms). */
const FLUSH_INTERVAL_MS = 30_000;

const subscribeAppState = (listener: () => void) => {
  const subscription = AppState.addEventListener('change', listener);
  return () => subscription.remove();
};

/**
 * Conquête sans trajet : une fois les 10 000 pas du jour atteints, les cases libres où l'on
 * passe se colorent à son nom, sans lancer de trajet. La position n'est suivie que pendant que
 * l'app est ouverte (Expo Go ne la suit pas en arrière-plan) et hors trajet, qui prend lui-même
 * ses cases. Comme pour un trajet, rien n'est pris à moins de 150 m de l'endroit où le suivi a
 * commencé : l'adresse de départ, souvent son domicile, n'apparaît pas sur la carte.
 */
export function usePassiveConquest() {
  const today = useTodaySteps();
  const walk = useActiveWalk();
  const active = useSyncExternalStore(subscribeAppState, () => AppState.currentState === 'active');
  const unlocked = conquestUnlocked(today.status === 'ready' ? today.steps : null);
  const enabled = unlocked && !walk && active;

  useEffect(() => {
    if (!enabled || !supabase) return;
    const client = supabase;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let origin: LatLng | null = null;
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
        ({ coords }) => {
          if (coords.accuracy !== null && coords.accuracy > MAX_ACCURACY_M) return;
          const point = { latitude: coords.latitude, longitude: coords.longitude };
          if (!origin) origin = point;
          if (haversineMeters(origin, point) < CONQUEST_SKIP_M) return;
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
