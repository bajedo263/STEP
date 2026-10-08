import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import type { LatLng } from '@/lib/loop';

export type CurrentLocation =
  | { status: 'loading' }
  | { status: 'denied'; canAskAgain: boolean }
  | { status: 'unavailable' }
  | { status: 'ready'; coords: LatLng };

/**
 * Position de l'utilisateur, demandée au premier affichage.
 * La dernière position connue s'affiche tout de suite, puis est remplacée par une position fraîche.
 */
export function useCurrentLocation(): CurrentLocation & { retry: () => void } {
  const [state, setState] = useState<CurrentLocation>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
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
    })().catch(() => {
      if (!cancelled) setState({ status: 'unavailable' });
    });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  return { ...state, retry };
}
