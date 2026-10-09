// Appel à l'API Overpass (OpenStreetMap). Utilisé seulement par les fonctions Edge.
import { parseOverpassPois, type Poi } from './pois.ts';

// Le serveur principal est souvent saturé (erreurs 504) : on essaie les miroirs à la suite.
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

/**
 * Lieux remarquables renvoyés par une requête Overpass, ou null si aucun serveur n'a répondu
 * (à distinguer d'un quartier vraiment vide).
 */
export async function fetchOverpassPoisOrNull(query: string, timeoutMs = 15_000): Promise<Poi[] | null> {
  for (const url of OVERPASS_URLS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'STEP (https://github.com/bajedo263/step)',
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) {
        const json = await response.json();
        // Overpass signale ses propres dépassements de temps dans « remark », avec un statut 200.
        if (typeof json?.remark === 'string' && /runtime error|timed out/i.test(json.remark)) {
          console.error('Overpass', url, json.remark);
          continue;
        }
        return parseOverpassPois(json);
      }
      console.error('Overpass', url, response.status);
    } catch (error) {
      console.error('Overpass', url, String(error));
    }
  }
  return null;
}

/** Comme fetchOverpassPoisOrNull, mais une liste vide en cas d'échec. */
export async function fetchOverpassPois(query: string): Promise<Poi[]> {
  return (await fetchOverpassPoisOrNull(query)) ?? [];
}
