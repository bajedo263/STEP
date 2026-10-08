// Appel à l'API Overpass (OpenStreetMap). Utilisé seulement par les fonctions Edge.
import { parseOverpassPois, type Poi } from './pois.ts';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/** Lieux remarquables renvoyés par une requête Overpass ; liste vide en cas d'erreur. */
export async function fetchOverpassPois(query: string): Promise<Poi[]> {
  try {
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'STEP (https://github.com/bajedo263/step)',
      },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      console.error('Overpass', response.status, await response.text());
      return [];
    }
    return parseOverpassPois(await response.json());
  } catch (error) {
    console.error('Overpass', error);
    return [];
  }
}
