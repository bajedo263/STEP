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

/** Villes découpées en arrondissements, reconnus au code postal. */
const DISTRICT_CITIES: { city: string; prefix: string; max: number }[] = [
  { city: 'Paris', prefix: '750', max: 20 },
  { city: 'Lyon', prefix: '6900', max: 9 },
  { city: 'Marseille', prefix: '130', max: 16 },
];

const districtLabel = (city: string, district: number) =>
  `${city} ${district === 1 ? '1er' : `${district}e`}`;

/**
 * Ville suivie de son arrondissement quand on peut le lire au code postal : « Paris 15e »,
 * « Lyon 1er », « Marseille 8e ». Ailleurs, la ville seule.
 */
export function cityWithDistrict(city: string | null, postcode: string | null): string | null {
  if (!city) return null;
  const district = districtNumber(city, postcode?.trim() ?? '');
  if (district === null) return city;
  return districtLabel(city, district);
}

function districtNumber(city: string, code: string): number | null {
  // Le 16e arrondissement de Paris a aussi le code 75116.
  if (city === 'Paris' && code === '75116') return 16;
  const match = DISTRICT_CITIES.find((d) => d.city === city && code.startsWith(d.prefix));
  if (!match || code.length !== 5) return null;
  const value = Number(code.slice(match.prefix.length));
  return value >= 1 && value <= match.max ? value : null;
}

/** Numéro d'arrondissement lu dans un code INSEE d'arrondissement municipal (75115 → 15). */
export function districtFromInseeCode(code: unknown): number | null {
  if (typeof code !== 'string') return null;
  const ranges: [string, number][] = [
    ['751', 20],
    ['6938', 9],
    ['132', 16],
  ];
  for (const [prefix, max] of ranges) {
    if (code.length !== 5 || !code.startsWith(prefix)) continue;
    const value = Number(code.slice(prefix.length));
    return value >= 1 && value <= max ? value : null;
  }
  return null;
}

/** Ville à arrondissements qui termine le libellé sans son arrondissement (« Lidl, Paris »). */
export function cityMissingDistrict(label: string): string | null {
  const last = label.replace(/, France$/, '').split(', ').at(-1) ?? '';
  return DISTRICT_CITIES.some((d) => d.city === last) ? last : null;
}

/** Libellé complété de l'arrondissement : « Lidl, Paris » → « Lidl, Paris 15e ». */
export function labelWithDistrict(label: string, district: number): string {
  const city = cityMissingDistrict(label);
  if (!city) return label;
  const base = label.replace(/, France$/, '');
  return `${base.slice(0, base.length - city.length)}${districtLabel(city, district)}`;
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * Libellé d'un lieu : « Nom, numéro rue, Ville arrondissement ». Deux magasins d'une même
 * enseigne se distinguent ainsi par leur rue et leur quartier. Null sans nom ni rue.
 */
export function placeLabel(parts: {
  name?: unknown;
  housenumber?: unknown;
  street?: unknown;
  postcode?: unknown;
  city?: unknown;
}): string | null {
  const name = text(parts.name);
  const street = [text(parts.housenumber), text(parts.street)].filter(Boolean).join(' ') || null;
  const city = cityWithDistrict(text(parts.city), text(parts.postcode));
  const pieces = [name, street && !name?.includes(street) ? street : null, city].filter(
    (piece, index, all): piece is string => piece !== null && all.indexOf(piece) === index
  );
  return name || street ? pieces.join(', ') : null;
}

/** Lieux lus dans une réponse GeoJSON de l'autocomplétion. */
export function parseOrsPlaces(json: unknown): Place[] {
  const features = (json as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(features)) return [];

  const places: Place[] = [];
  for (const feature of features) {
    const { geometry, properties } = (feature ?? {}) as {
      geometry?: { coordinates?: unknown };
      properties?: {
        id?: unknown;
        gid?: unknown;
        label?: unknown;
        name?: unknown;
        housenumber?: unknown;
        street?: unknown;
        postalcode?: unknown;
        locality?: unknown;
      };
    };
    const coordinates = geometry?.coordinates;
    const label =
      placeLabel({
        name: properties?.name,
        housenumber: properties?.housenumber,
        street: properties?.street,
        postcode: properties?.postalcode,
        city: properties?.locality,
      }) ?? properties?.label;
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
