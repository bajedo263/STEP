// Logique pure du mode Boucle, partagée entre la fonction Edge (Deno) et les tests (Node).
// Aucun import ici : le fichier doit tourner tel quel dans les deux environnements.

export type LatLng = { latitude: number; longitude: number };

export type LoopRequest = {
  start: LatLng;
  distanceM: number;
  seed: number;
};

export type LoopRoute = {
  coordinates: LatLng[];
  distanceM: number;
  durationS: number;
};

export const MIN_LOOP_M = 1_000;
export const MAX_LOOP_M = 15_000;
/** Écart accepté entre la distance demandée et celle de la boucle obtenue. */
export const LOOP_TOLERANCE = 0.1;
export const MAX_LOOP_ATTEMPTS = 3;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Valide le corps de la requête envoyée par l'app. */
export function parseLoopRequest(
  body: unknown
): { ok: true; value: LoopRequest } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Requête invalide.' };
  const { start, distanceM, seed } = body as Record<string, unknown>;
  const { latitude, longitude } = (start ?? {}) as Record<string, unknown>;

  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
    return { ok: false, error: 'Point de départ manquant.' };
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return { ok: false, error: 'Point de départ invalide.' };
  }
  if (!isFiniteNumber(distanceM)) return { ok: false, error: 'Distance manquante.' };

  return {
    ok: true,
    value: {
      start: { latitude, longitude },
      distanceM: Math.round(clamp(distanceM, MIN_LOOP_M, MAX_LOOP_M)),
      seed: isFiniteNumber(seed) ? Math.abs(Math.trunc(seed)) % 1_000_000 : 0,
    },
  };
}

/** Corps de la requête OpenRouteService `foot-walking/geojson` en aller-retour. */
export function orsRoundTripBody(start: LatLng, lengthM: number, seed: number) {
  return {
    coordinates: [[start.longitude, start.latitude]],
    options: { round_trip: { length: Math.round(lengthM), points: 3, seed } },
    instructions: false,
  };
}

/** Extrait la boucle d'une réponse GeoJSON d'OpenRouteService. */
export function parseOrsResponse(json: unknown): LoopRoute | null {
  const feature = (json as { features?: unknown[] } | null)?.features?.[0] as
    | { geometry?: { coordinates?: unknown }; properties?: { summary?: Record<string, unknown> } }
    | undefined;
  const coordinates = feature?.geometry?.coordinates;
  const summary = feature?.properties?.summary;
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !summary) return null;
  if (!isFiniteNumber(summary.distance)) return null;

  const points: LatLng[] = [];
  for (const point of coordinates) {
    if (!Array.isArray(point) || !isFiniteNumber(point[0]) || !isFiniteNumber(point[1])) return null;
    points.push({ latitude: point[1], longitude: point[0] });
  }

  return {
    coordinates: points,
    distanceM: Math.round(summary.distance),
    durationS: isFiniteNumber(summary.duration) ? Math.round(summary.duration) : 0,
  };
}

export function isCloseEnough(targetM: number, actualM: number): boolean {
  return Math.abs(actualM - targetM) <= targetM * LOOP_TOLERANCE;
}

/**
 * OpenRouteService ne respecte la longueur demandée qu'approximativement (souvent +20 à 40 %).
 * On corrige la demande suivante proportionnellement à l'écart observé.
 */
export function nextRequestedLength(targetM: number, requestedM: number, actualM: number): number {
  if (actualM <= 0) return requestedM;
  return Math.round(clamp((requestedM * targetM) / actualM, MIN_LOOP_M / 2, MAX_LOOP_M * 1.5));
}

/** Boucle la plus proche de la distance visée. */
export function closestRoute<T extends LoopRoute>(targetM: number, routes: T[]): T | null {
  let best: T | null = null;
  for (const route of routes) {
    if (!best || Math.abs(route.distanceM - targetM) < Math.abs(best.distanceM - targetM)) {
      best = route;
    }
  }
  return best;
}

const EARTH_RADIUS_M = 6_371_008.8;

/** Point situé à `distanceM` de `from`, dans la direction `bearingDeg` (0 = nord, 90 = est). */
export function offsetPoint(from: LatLng, distanceM: number, bearingDeg: number): LatLng {
  const bearing = (bearingDeg * Math.PI) / 180;
  const dLat = (distanceM * Math.cos(bearing)) / EARTH_RADIUS_M;
  const dLng =
    (distanceM * Math.sin(bearing)) / (EARTH_RADIUS_M * Math.cos((from.latitude * Math.PI) / 180));
  return {
    latitude: from.latitude + (dLat * 180) / Math.PI,
    longitude: from.longitude + (dLng * 180) / Math.PI,
  };
}

/** Direction de départ tirée de la graine : l'angle d'or donne des boucles bien différentes. */
export const seedBearing = (seed: number) => (seed * 137.508) % 360;

/**
 * Les deux sommets d'une boucle triangulaire départ → A → B → départ, équilatérale,
 * dont le périmètre à vol d'oiseau vaut `lengthM`.
 */
export function triangleWaypoints(start: LatLng, lengthM: number, bearingDeg: number): [LatLng, LatLng] {
  const side = lengthM / 3;
  return [offsetPoint(start, side, bearingDeg - 30), offsetPoint(start, side, bearingDeg + 30)];
}

/** Corps de la requête OpenRouteService `foot-walking/geojson` passant par ces points, dans l'ordre. */
export function orsPathBody(points: LatLng[]) {
  return {
    coordinates: points.map((p) => [p.longitude, p.latitude]),
    instructions: false,
  };
}
