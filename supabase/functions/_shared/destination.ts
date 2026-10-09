// Logique pure du mode Destination, partagée entre la fonction Edge (Deno) et les tests (Node).
import type { LatLng } from './loop.ts';

export type Place = {
  id: string;
  label: string;
  coords: LatLng;
};

/** Au-delà, ce n'est plus une marche du quotidien. */
export const MAX_DESTINATION_M = 25_000;

export type DestinationRequest =
  | { action: 'search'; query: string; near: LatLng | null }
  | { action: 'route'; start: LatLng; end: LatLng; targetM: number | null; seed: number };

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function parsePoint(value: unknown): LatLng | null {
  const { latitude, longitude } = (value ?? {}) as Record<string, unknown>;
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/** Valide le corps de la requête envoyée par l'app. */
export function parseDestinationRequest(
  body: unknown
): { ok: true; value: DestinationRequest } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Requête invalide.' };
  const { action, query, near, start, end, targetM, seed } = body as Record<string, unknown>;

  if (action === 'search') {
    const text = typeof query === 'string' ? query.trim().slice(0, 100) : '';
    if (text.length < 3) return { ok: false, error: 'Tapez au moins 3 lettres.' };
    return { ok: true, value: { action, query: text, near: parsePoint(near) } };
  }

  if (action === 'route') {
    const from = parsePoint(start);
    const to = parsePoint(end);
    if (!from || !to) return { ok: false, error: 'Départ ou arrivée invalide.' };
    return {
      ok: true,
      value: {
        action,
        start: from,
        end: to,
        targetM: isFiniteNumber(targetM) && targetM > 0 ? Math.min(targetM, MAX_DESTINATION_M) : null,
        seed: isFiniteNumber(seed) ? Math.abs(Math.trunc(seed)) : 0,
      },
    };
  }

  return { ok: false, error: 'Action inconnue.' };
}

/** Paramètres de l'autocomplétion OpenRouteService (Pelias), centrée sur l'utilisateur. */
export function orsAutocompleteParams(query: string, near: LatLng | null): URLSearchParams {
  const params = new URLSearchParams({ text: query, size: '6', lang: 'fr' });
  if (near) {
    params.set('focus.point.lat', String(near.latitude));
    params.set('focus.point.lon', String(near.longitude));
  }
  return params;
}

/** Lieux lus dans une réponse GeoJSON de l'autocomplétion. */
export function parseOrsPlaces(json: unknown): Place[] {
  const features = (json as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(features)) return [];

  const places: Place[] = [];
  for (const feature of features) {
    const { geometry, properties } = (feature ?? {}) as {
      geometry?: { coordinates?: unknown };
      properties?: { id?: unknown; gid?: unknown; label?: unknown };
    };
    const coordinates = geometry?.coordinates;
    const label = properties?.label;
    if (!Array.isArray(coordinates) || typeof label !== 'string') continue;
    const [longitude, latitude] = coordinates;
    if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) continue;
    const id = String(properties?.gid ?? properties?.id ?? `${latitude},${longitude}`);
    places.push({ id, label, coords: { latitude, longitude } });
  }
  return places;
}

const EARTH_RADIUS_M = 6_371_008.8;
/** Un trajet à pied fait en moyenne ~1,25 fois la distance à vol d'oiseau. */
export const ROUTE_DETOUR_FACTOR = 1.25;

/** Distance à vol d'oiseau, en projection locale (suffisant à l'échelle d'une marche). */
export function straightDistanceM(a: LatLng, b: LatLng): number {
  const cosLat = Math.cos((((a.latitude + b.latitude) / 2) * Math.PI) / 180);
  const dx = ((b.longitude - a.longitude) * Math.PI * EARTH_RADIUS_M * cosLat) / 180;
  const dy = ((b.latitude - a.latitude) * Math.PI * EARTH_RADIUS_M) / 180;
  return Math.hypot(dx, dy);
}

/**
 * Point de passage qui rallonge le trajet A → B jusqu'à `lengthM` (à vol d'oiseau) :
 * on s'écarte perpendiculairement au milieu de A–B, du côté `side`.
 * Si A et B sont confondus, on part vers le nord ou le sud.
 */
export function detourWaypoint(start: LatLng, end: LatLng, lengthM: number, side: 1 | -1): LatLng {
  const cosLat = Math.cos((((start.latitude + end.latitude) / 2) * Math.PI) / 180);
  const mPerDegLat = (Math.PI * EARTH_RADIUS_M) / 180;
  const mPerDegLng = mPerDegLat * cosLat;

  const dx = (end.longitude - start.longitude) * mPerDegLng;
  const dy = (end.latitude - start.latitude) * mPerDegLat;
  const direct = Math.hypot(dx, dy);
  // Deux côtés égaux de longueur lengthM / 2 : hauteur du triangle isocèle.
  const height = Math.sqrt(Math.max(0, (lengthM / 2) ** 2 - (direct / 2) ** 2));
  // Vecteur unitaire perpendiculaire à A–B.
  const [nx, ny] = direct > 1 ? [-dy / direct, dx / direct] : [0, 1];

  return {
    latitude: (start.latitude + end.latitude) / 2 + (side * ny * height) / mPerDegLat,
    longitude: (start.longitude + end.longitude) / 2 + (side * nx * height) / mPerDegLng,
  };
}
