// Itinéraires et recherche de lieux de secours, quand OpenRouteService ne répond pas :
// OSRM piéton de l'association FOSSGIS (OpenStreetMap) et Photon (Komoot).
// Logique pure, partagée entre les fonctions Edge (Deno) et les tests (Node).
import type { Place } from './destination.ts';
import type { LatLng, LoopRoute } from './loop.ts';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Itinéraire à pied passant par ces points, dans l'ordre. */
export function osrmRouteUrl(points: LatLng[]): string {
  const path = points.map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`).join(';');
  return `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${path}?overview=full&geometries=geojson`;
}

/** Extrait l'itinéraire d'une réponse OSRM. */
export function parseOsrmResponse(json: unknown): LoopRoute | null {
  const body = json as { code?: unknown; routes?: unknown[] } | null;
  if (body?.code !== 'Ok') return null;
  const route = body.routes?.[0] as
    | { distance?: unknown; duration?: unknown; geometry?: { coordinates?: unknown } }
    | undefined;
  const coordinates = route?.geometry?.coordinates;
  if (!route || !isFiniteNumber(route.distance) || !Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const points: LatLng[] = [];
  for (const point of coordinates) {
    if (!Array.isArray(point) || !isFiniteNumber(point[0]) || !isFiniteNumber(point[1])) return null;
    points.push({ latitude: point[1], longitude: point[0] });
  }
  return {
    coordinates: points,
    distanceM: Math.round(route.distance),
    durationS: isFiniteNumber(route.duration) ? Math.round(route.duration) : 0,
  };
}

/** Recherche de lieux Photon, centrée sur l'utilisateur. */
export function photonUrl(query: string, near: LatLng | null): string {
  const params = new URLSearchParams({ q: query, lang: 'fr', limit: '6' });
  if (near) {
    params.set('lat', String(near.latitude));
    params.set('lon', String(near.longitude));
  }
  return `https://photon.komoot.io/api/?${params}`;
}

type PhotonProperties = {
  osm_type?: unknown;
  osm_id?: unknown;
  name?: unknown;
  housenumber?: unknown;
  street?: unknown;
  postcode?: unknown;
  city?: unknown;
};

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Lieux lus dans une réponse Photon, avec un libellé « Nom, numéro rue, ville ». */
export function parsePhotonPlaces(json: unknown): Place[] {
  const features = (json as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(features)) return [];

  const places: Place[] = [];
  for (const feature of features) {
    const { geometry, properties = {} } = (feature ?? {}) as {
      geometry?: { coordinates?: unknown };
      properties?: PhotonProperties;
    };
    const coordinates = geometry?.coordinates;
    if (!Array.isArray(coordinates)) continue;
    const [longitude, latitude] = coordinates;
    if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) continue;

    const street = [text(properties.housenumber), text(properties.street)].filter(Boolean).join(' ');
    const city = text(properties.city);
    const parts = [text(properties.name), street || null, city].filter(
      (part, index, all): part is string => part !== null && all.indexOf(part) === index
    );
    if (parts.length === 0) continue;
    places.push({
      id: `photon/${String(properties.osm_type ?? '')}${String(properties.osm_id ?? `${latitude},${longitude}`)}`,
      label: parts.join(', '),
      coords: { latitude, longitude },
    });
  }
  return places;
}
