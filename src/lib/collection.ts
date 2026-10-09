/** Collection de lieux par quartier : paliers à 50 % et 100 %, et boucle vers les lieux manquants. */

type LatLng = { latitude: number; longitude: number };

export type ZoneProgress = { total: number; visited: number };

export type ZoneLevel = 'none' | 'explored' | 'complete';

/** Part des lieux d'un quartier à découvrir pour l'avoir exploré. */
export const EXPLORED_RATIO = 0.5;
/** Distance maximale entre le départ et un lieu manquant visé par la boucle. */
export const MISSING_RADIUS_M = 2_500;
/** Lieux visés par une boucle (le serveur accepte 4 points de passage). */
export const MISSING_MAX_POINTS = 4;

/** Palier atteint dans un quartier : exploré à moitié, ou complet. */
export function zoneLevel({ total, visited }: ZoneProgress): ZoneLevel {
  if (total <= 0) return 'none';
  if (visited >= total) return 'complete';
  return visited >= total * EXPLORED_RATIO ? 'explored' : 'none';
}

/** Quartiers explorés (50 % ou plus, complets compris) et complets. */
export function collectionCounts(zones: ZoneProgress[]): { explored: number; complete: number } {
  let explored = 0;
  let complete = 0;
  for (const zone of zones) {
    const level = zoneLevel(zone);
    if (level !== 'none') explored += 1;
    if (level === 'complete') complete += 1;
  }
  return { explored, complete };
}

/** Ce qu'il reste pour le palier suivant : « Encore 2 lieux pour l'explorer ». */
export function zoneNextStep({ total, visited }: ZoneProgress): string | null {
  const level = zoneLevel({ total, visited });
  if (level === 'complete') return null;
  const target = level === 'explored' ? total : Math.ceil(total * EXPLORED_RATIO);
  const missing = target - visited;
  const places = `${missing} lieu${missing > 1 ? 'x' : ''}`;
  return level === 'explored'
    ? `Encore ${places} pour le compléter`
    : `Encore ${places} pour l’explorer`;
}

function distanceM(a: LatLng, b: LatLng): number {
  const dy = (b.latitude - a.latitude) * 111_320;
  const dx = (b.longitude - a.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/**
 * Points de passage d'une boucle vers les lieux manquants : les plus proches du départ,
 * ordonnés autour de lui pour que la boucle ne se croise pas.
 */
export function missingPlacesPoints<T extends LatLng>(places: T[], start: LatLng): T[] {
  const bearing = (point: LatLng) =>
    Math.atan2(
      (point.longitude - start.longitude) * Math.cos((start.latitude * Math.PI) / 180),
      point.latitude - start.latitude
    );
  return places
    .map((place) => ({ place, distance: distanceM(start, place) }))
    .filter(({ distance }) => distance <= MISSING_RADIUS_M)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MISSING_MAX_POINTS)
    .map(({ place }) => place)
    .sort((a, b) => bearing(a) - bearing(b));
}
