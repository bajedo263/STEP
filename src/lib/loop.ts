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

/** Boucle la plus courte proposée par défaut : en dessous, la sortie ne vaut pas le détour. */
export const MIN_DEFAULT_LOOP_M = 2_000;

/**
 * Boucle proposée par défaut : la distance qui manque pour l'objectif,
 * sans descendre sous {@link MIN_DEFAULT_LOOP_M} quand il ne reste presque rien.
 */
export function defaultLoopDistance(remainingDistanceM: number | null | undefined): number {
  return Math.max(MIN_DEFAULT_LOOP_M, loopTargetDistance(remainingDistanceM));
}

/** Pas les plus proches d'une distance, arrondis à la centaine. */
export function stepsForDistance(distanceM: number, strideM: number): number {
  return Math.max(100, Math.round(distanceM / strideM / 100) * 100);
}

/**
 * Ce que le trajet fera de l'objectif du jour, à afficher sous ses chiffres. Null quand il n'y a
 * plus d'objectif à atteindre aujourd'hui.
 */
export function goalAtArrival(
  routeSteps: number,
  remainingSteps: number | null
): { reached: boolean; text: string } | null {
  if (remainingSteps == null || remainingSteps <= 0) return null;
  // 2 % d'écart ne se voient pas sur le compteur : on ne promet pas un manque de 80 pas.
  if (routeSteps >= remainingSteps * 0.98) return { reached: true, text: 'Objectif atteint à l’arrivée.' };
  const missing = Math.max(100, Math.round((remainingSteps - routeSteps) / 100) * 100);
  return {
    reached: false,
    text: `Il manquera environ ${missing.toLocaleString('fr-FR')} pas pour l’objectif.`,
  };
}

/** Bornes, en pas, de ce qu'on peut demander pour une boucle. */
export function loopStepsRange(strideM: number) {
  return {
    min: Math.ceil(MIN_LOOP_M / strideM / 100) * 100,
    max: Math.floor(MAX_LOOP_M / strideM / 100) * 100,
  };
}

/**
 * Distance de boucle pour un nombre de pas saisi par l'utilisateur,
 * bornée à ce que le serveur accepte. `null` si la saisie n'est pas un nombre.
 */
export function loopDistanceForSteps(steps: number | null, strideM: number): number | null {
  if (steps == null || !Number.isFinite(steps) || steps <= 0) return null;
  const { min, max } = loopStepsRange(strideM);
  const clamped = Math.min(max, Math.max(min, steps));
  return Math.round((clamped * strideM) / 100) * 100;
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

/** Allure de marche retenue partout dans l'app (4,8 km/h), pour que les durées concordent. */
export const WALK_M_PER_MIN = 80;

/** Durée de marche estimée pour une distance, en secondes, à l'allure de l'app. */
export function walkingSeconds(distanceM: number): number {
  return Math.round((distanceM / WALK_M_PER_MIN) * 60);
}

/** Durée lisible : « 45 min », « 1 h 05 ». */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
}
