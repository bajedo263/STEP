// Appel à l'API de Wikipédia en français. Utilisé seulement par les fonctions Edge.
import type { LatLng } from './loop.ts';
import { parseWikipediaPois, wikipediaNearParams, type Poi } from './pois.ts';

const WIKIPEDIA_API_URL = 'https://fr.wikipedia.org/w/api.php';

/**
 * Lieux remarquables renvoyés par une recherche Wikipédia, ou null si l'API n'a pas répondu
 * (à distinguer d'un quartier vraiment vide).
 */
export async function fetchWikipediaPoisOrNull(
  params: Record<string, string>,
  timeoutMs = 10_000
): Promise<Poi[] | null> {
  try {
    const response = await fetch(`${WIKIPEDIA_API_URL}?${new URLSearchParams(params)}`, {
      headers: { 'User-Agent': 'STEP/1.0 (https://github.com/bajedo263/step)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      console.error('Wikipédia', response.status);
      return null;
    }
    const json = await response.json();
    if (json?.error) {
      console.error('Wikipédia', json.error.code, json.error.info);
      return null;
    }
    return parseWikipediaPois(json);
  } catch (error) {
    console.error('Wikipédia', String(error));
    return null;
  }
}

/** Lieux à moins de `radiusM` de chaque point, sans doublon ; liste vide en cas d'échec. */
export async function fetchWikipediaPoisNear(points: LatLng[], radiusM: number): Promise<Poi[]> {
  const results = await Promise.all(
    points.map((point) => fetchWikipediaPoisOrNull(wikipediaNearParams(point, radiusM)))
  );
  const byId = new Map<string, Poi>();
  for (const poi of results.flatMap((pois) => pois ?? [])) byId.set(poi.id, poi);
  return [...byId.values()];
}
