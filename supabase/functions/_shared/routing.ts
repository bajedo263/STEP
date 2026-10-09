// Itinéraires à pied et recherche de lieux : OpenRouteService d'abord, puis les services de secours
// d'OpenStreetMap s'il ne répond pas. Utilisé seulement par les fonctions Edge.
import { orsAutocompleteParams, parseOrsPlaces, type Place } from './destination.ts';
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

async function getJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
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

/** Lieux correspondant à la saisie, ou null si aucun service n'a répondu. */
export async function searchPlaces(query: string, near: LatLng | null, apiKey: string): Promise<Place[] | null> {
  const fromOrs = await ors(`/geocode/autocomplete?${orsAutocompleteParams(query, near)}`, {}, apiKey);
  if (fromOrs) return parseOrsPlaces(fromOrs);
  const fromPhoton = await getJson(photonUrl(query, near));
  return fromPhoton ? parsePhotonPlaces(fromPhoton) : null;
}
