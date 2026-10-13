import {
  distanceM,
  POI_KIND_LABELS,
  zoneKey,
  zoneOf,
  type Poi,
} from '../../supabase/functions/_shared/pois.ts';
import type { LatLng } from './loop.ts';
import { MAX_ACCURACY_M } from './track.ts';

export { distanceM, POI_KIND_LABELS, type Poi };

/** Lieu renvoyé par le serveur : identifiant en base (null si la base n'est pas prête) et visite. */
export type RoutePoi = Poi & { dbId: number | null; visited: boolean };

/**
 * Pendant la marche, un lieu compte comme visité à moins de 50 m, plus la marge d'erreur du GPS
 * (jusqu'à 20 m) : de l'autre côté d'une avenue, la position peut dériver de plusieurs dizaines
 * de mètres. Le serveur accepte jusqu'à 80 m (record_poi_visit).
 */
export const POI_VISIT_M = 50;
export const POI_VISIT_ACCURACY_M = 20;

/** Position GPS avec sa précision horizontale en mètres, si connue. */
export type FixedPosition = LatLng & { accuracy?: number | null };

/**
 * Lieu le plus proche à portée de visite depuis l'une des positions (GPS brute, trace lissée),
 * avec la position qui en est la plus proche, à envoyer au serveur.
 */
export function visitablePoi<T extends Poi>(
  pois: T[],
  positions: (FixedPosition | null | undefined)[]
): { poi: T; from: LatLng } | null {
  let best: { poi: T; from: LatLng; distance: number } | null = null;
  for (const position of positions) {
    // Position trop imprécise (intérieur, démarrage) : comme la trace, on l'ignore.
    if (!position || (position.accuracy != null && position.accuracy > MAX_ACCURACY_M)) continue;
    const reach = POI_VISIT_M + Math.min(Math.max(position.accuracy ?? 0, 0), POI_VISIT_ACCURACY_M);
    for (const poi of pois) {
      const distance = distanceM(poi.coords, position);
      if (distance <= reach && (!best || distance < best.distance)) {
        best = { poi, from: { latitude: position.latitude, longitude: position.longitude }, distance };
      }
    }
  }
  return best && { poi: best.poi, from: best.from };
}

/** En marche libre, sans trajet prévu : les lieux les plus proches, du plus près au plus loin. */
export function nearestPois<T extends Poi>(
  pois: T[],
  position: LatLng | null | undefined,
  count = 3,
  maxM = 1_000
): T[] {
  if (!position) return [];
  return pois
    .map((poi) => ({ poi, distance: distanceM(poi.coords, position) }))
    .filter(({ distance }) => distance <= maxM)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count)
    .map(({ poi }) => poi);
}

/** Clé du quartier d'une position, pour recharger les lieux quand on en change. */
export const zoneKeyOf = (position: LatLng) => zoneKey(zoneOf(position));

/** Fusionne des listes de lieux sans doublon, la première occurrence l'emportant. */
export function mergePois<T extends Poi>(...lists: T[][]): T[] {
  const byId = new Map<string, T>();
  for (const list of lists) for (const poi of list) if (!byId.has(poi.id)) byId.set(poi.id, poi);
  return [...byId.values()];
}
