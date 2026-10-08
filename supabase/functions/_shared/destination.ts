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
  | { action: 'route'; start: LatLng; end: LatLng };

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
  const { action, query, near, start, end } = body as Record<string, unknown>;

  if (action === 'search') {
    const text = typeof query === 'string' ? query.trim().slice(0, 100) : '';
    if (text.length < 3) return { ok: false, error: 'Tapez au moins 3 lettres.' };
    return { ok: true, value: { action, query: text, near: parsePoint(near) } };
  }

  if (action === 'route') {
    const from = parsePoint(start);
    const to = parsePoint(end);
    if (!from || !to) return { ok: false, error: 'Départ ou arrivée invalide.' };
    return { ok: true, value: { action, start: from, end: to } };
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

/** Corps de la requête OpenRouteService `foot-walking/geojson` de A vers B. */
export function orsDirectionsBody(start: LatLng, end: LatLng) {
  return {
    coordinates: [
      [start.longitude, start.latitude],
      [end.longitude, end.latitude],
    ],
    instructions: false,
  };
}
