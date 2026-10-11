import * as Location from 'expo-location';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import type { LatLng } from '@/lib/loop';

export type CurrentLocation =
  | { status: 'loading' }
  | { status: 'denied'; canAskAgain: boolean }
  | { status: 'unavailable' }
  | { status: 'ready'; coords: LatLng };

/** Déplacement (m) à partir duquel la position est mise à jour. */
const UPDATE_DISTANCE_M = 15;

/**
 * Position de l'utilisateur, suivie tant que l'écran est affiché. La dernière position connue
 * s'affiche tout de suite, puis est remplacée par une position fraîche à chaque déplacement :
 * l'onglet reste monté, et un itinéraire calculé plus tard doit partir d'où l'on est vraiment.
 */
export function useCurrentLocation(): CurrentLocation & { retry: () => void } {
  const [state, setState] = useState<CurrentLocation>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Hors de l'écran (autre onglet), on ne suit plus la position ; elle se rafraîchit au retour.
  const focused = useIsFocused();

  useEffect(() => {
    if (!focused) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    const toCoords = ({ coords }: Location.LocationObject): LatLng => ({
      latitude: coords.latitude,
      longitude: coords.longitude,
    });

    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (!permission.granted) {
        setState({ status: 'denied', canAskAgain: permission.canAskAgain });
        return;
      }

      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (!cancelled && last) setState({ status: 'ready', coords: toCoords(last) });

      try {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) setState({ status: 'ready', coords: toCoords(current) });
      } catch {
        if (!cancelled && !last) setState({ status: 'unavailable' });
      }

      if (cancelled) return;
      const watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: UPDATE_DISTANCE_M },
        (position) => setState({ status: 'ready', coords: toCoords(position) })
      ).catch(() => null);
      if (cancelled) watch?.remove();
      else subscription = watch;
    })().catch(() => {
      if (!cancelled) setState({ status: 'unavailable' });
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [attempt, focused]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  return { ...state, retry };
}
