import {
  MAX_LOOP_M,
  MIN_LOOP_M,
  type LatLng,
  type LoopRoute,
} from '../../supabase/functions/_shared/loop.ts';

export type { LatLng, LoopRoute };

/** Distance proposée quand l'objectif du jour est déjà atteint. */
export const BONUS_LOOP_M = 3_000;

/**
 * Distance de la boucle à proposer : ce qui reste pour atteindre l'objectif,
 * arrondi à 100 m et borné à ce que le serveur accepte.
 */
export function loopTargetDistance(remainingDistanceM: number | null | undefined): number {
  if (remainingDistanceM == null || remainingDistanceM <= 0) return BONUS_LOOP_M;
  const rounded = Math.ceil(remainingDistanceM / 100) * 100;
  return Math.min(MAX_LOOP_M, Math.max(MIN_LOOP_M, rounded));
}

/** Région de carte qui englobe toute la boucle, avec une marge. */
export function regionForCoordinates(points: LatLng[], padding = 1.3) {
  if (points.length === 0) return null;
  let minLat = points[0].latitude;
  let maxLat = minLat;
  let minLng = points[0].longitude;
  let maxLng = minLng;
  for (const { latitude, longitude } of points) {
    minLat = Math.min(minLat, latitude);
    maxLat = Math.max(maxLat, latitude);
    minLng = Math.min(minLng, longitude);
    maxLng = Math.max(maxLng, longitude);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * padding, 0.005),
    longitudeDelta: Math.max((maxLng - minLng) * padding, 0.005),
  };
}

/** Durée lisible : « 45 min », « 1 h 05 ». */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
}
