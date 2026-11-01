// Itinéraires à pied et recherche de lieux : OpenRouteService d'abord, puis les services de secours
// d'OpenStreetMap s'il ne répond pas. Utilisé seulement par les fonctions Edge.
import {
  cityMissingDistrict,
  districtFromInseeCode,
  labelMissingStreet,
  labelWithAddress,
  labelWithDistrict,
  parseReverseAddress,
  type Address,
  ignSearchUrl,
  looksLikeAddress,
  mergePlaces,
  orsAutocompleteParams,
  parseIgnPlaces,
  parseOrsPlaces,
  type Place,
} from './destination.ts';
import {
  orsPathBody,
  orsRoundTripBody,
  parseOrsResponse,
  type LatLng,
  type LoopRoute,
} from './loop.ts';
import { osrmRouteUrl, parseOsrmResponse, parsePhotonPlaces, photonUrl } from './osrm.ts';

const ORS = 'https://api.openrouteservice.org';
const USER_AGENT = 'STEP/1.0 (https://github.com/bajedo263/step)';
const TIMEOUT_MS = 10_000;

// Après une panne d'OpenRouteService, on ne le réessaie pas pendant une minute : chaque essai
// coûterait jusqu'au délai d'attente avant de passer au secours.
let orsDownUntil = 0;

/** Réponse JSON d'OpenRouteService, ou null s'il est en panne ou refuse la requête. */
async function ors(path: string, init: RequestInit, apiKey: string): Promise<unknown | null> {
  if (Date.now() < orsDownUntil) return null;
  try {
    const response = await fetch(`${ORS}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error('OpenRouteService', path, response.status, await response.text());
      if (response.status >= 500 || response.status === 429) orsDownUntil = Date.now() + 60_000;
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('OpenRouteService', path, String(error));
    orsDownUntil = Date.now() + 60_000;
    return null;
  }
}

/** L'IGN répond vite ; s'il traîne, on ne fait pas attendre les autres résultats. */
const IGN_TIMEOUT_MS = 4_000;

async function getJson(url: string, timeoutMs = TIMEOUT_MS): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      console.error('Secours', url, response.status);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('Secours', url, String(error));
    return null;
  }
}

const postJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** Itinéraire à pied passant par ces points, dans l'ordre. */
export async function routeThrough(points: LatLng[], apiKey: string): Promise<LoopRoute | null> {
  const fromOrs = await ors('/v2/directions/foot-walking/geojson', postJson(orsPathBody(points)), apiKey);
  const route = fromOrs ? parseOrsResponse(fromOrs) : null;
  if (route) return route;
  return parseOsrmResponse(await getJson(osrmRouteUrl(points)));
}

/**
 * Boucle libre d'OpenRouteService, ou null s'il ne répond pas : l'appelant se rabat alors sur
 * un triangle tracé avec routeThrough.
 */
export async function orsRoundTrip(
  start: LatLng,
  lengthM: number,
  seed: number,
  apiKey: string
): Promise<LoopRoute | null> {
  const json = await ors(
    '/v2/directions/foot-walking/geojson',
    postJson(orsRoundTripBody(start, lengthM, seed)),
    apiKey
  );
  return json ? parseOrsResponse(json) : null;
}

/**
 * Lieux correspondant à la saisie, ou null si aucun service n'a répondu. Les adresses viennent de
 * l'IGN (Base adresse nationale, qui comprend les codes postaux), les lieux nommés
 * d'OpenRouteService puis de Photon ; une saisie qui ressemble à une adresse met l'IGN en tête.
 */
export async function searchPlaces(query: string, near: LatLng | null, apiKey: string): Promise<Place[] | null> {
  const [fromIgn, fromOrs] = await Promise.all([
    getJson(ignSearchUrl(query, near), IGN_TIMEOUT_MS),
    ors(`/geocode/autocomplete?${orsAutocompleteParams(query, near)}`, {}, apiKey),
  ]);
  const fromPhoton = fromOrs ? null : await getJson(photonUrl(query, near));
  if (!fromIgn && !fromOrs && !fromPhoton) return null;
  const addresses = fromIgn ? parseIgnPlaces(fromIgn) : [];
  const named = fromOrs ? parseOrsPlaces(fromOrs) : fromPhoton ? parsePhotonPlaces(fromPhoton) : [];
  const places = mergePlaces(looksLikeAddress(query) ? [addresses, named] : [named, addresses], near);
  return withDistricts(places);
}

/**
 * Complète les libellés sans adresse : les services de recherche ne donnent souvent ni rue ni
 * code postal pour un magasin. La rue et l'arrondissement viennent du géocodage inverse de
 * l'IGN ; à défaut, l'arrondissement seul vient de l'API Découpage administratif de l'État.
 * En cas d'échec, le libellé reste tel quel.
 */
async function withDistricts(places: Place[]): Promise<Place[]> {
  return await Promise.all(
    places.map(async (place) => {
      // Les adresses de l'IGN sont déjà complètes (rue, code postal, arrondissement).
      if (place.id.startsWith('ign:')) return place;
      // Comme sur un plan, la rue avant le quartier : « Monoprix, 12 Rue X, Paris 15e ».
      if (labelMissingStreet(place.label)) {
        const address = await addressAt(place.coords);
        if (address) return { ...place, label: labelWithAddress(place.label, address) };
      }
      if (!cityMissingDistrict(place.label)) return place;
      const district = await districtAt(place.coords);
      return district ? { ...place, label: labelWithDistrict(place.label, district) } : place;
    })
  );
}

/** Adresse la plus proche, par le géocodage inverse de la Géoplateforme (IGN), en France. */
async function addressAt({ latitude, longitude }: LatLng): Promise<Address | null> {
  const params = new URLSearchParams({
    lon: String(longitude),
    lat: String(latitude),
    index: 'address',
    limit: '1',
  });
  try {
    const response = await fetch(`https://data.geopf.fr/geocodage/reverse?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(3000),
    });
    return response.ok ? parseReverseAddress(await response.json()) : null;
  } catch {
    return null;
  }
}

async function districtAt({ latitude, longitude }: LatLng): Promise<number | null> {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    type: 'arrondissement-municipal',
    fields: 'code',
    format: 'json',
  });
  try {
    const response = await fetch(`https://geo.api.gouv.fr/communes?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const communes = (await response.json()) as { code?: unknown }[] | null;
    return Array.isArray(communes) ? districtFromInseeCode(communes[0]?.code) : null;
  } catch {
    return null;
  }
}
