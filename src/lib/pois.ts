import {
  distanceM,
  POI_KIND_LABELS,
  zoneKey,
  zoneOf,
  type Poi,
} from '../../supabase/functions/_shared/pois.ts';
import type { LatLng } from './loop.ts';

export { POI_KIND_LABELS, type Poi };

/** Lieu renvoyé par le serveur : identifiant en base (null si la base n'est pas prête) et visite. */
export type RoutePoi = Poi & { dbId: number | null; visited: boolean };

/** Distance à laquelle on signale un lieu pendant la marche. */
export const POI_NEARBY_M = 50;

/** Lieu le plus proche de la position, s'il est à portée de vue. */
export function nearbyPoi<T extends Poi>(pois: T[], position: LatLng | null | undefined): T | null {
  if (!position) return null;
  let best: { poi: T; distance: number } | null = null;
  for (const poi of pois) {
    const distance = distanceM(poi.coords, position);
    if (distance <= POI_NEARBY_M && (!best || distance < best.distance)) best = { poi, distance };
  }
  return best?.poi ?? null;
}

/** Clé du quartier d'une position, pour recharger les lieux quand on en change. */
export const zoneKeyOf = (position: LatLng) => zoneKey(zoneOf(position));

/** Fusionne des listes de lieux sans doublon, la première occurrence l'emportant. */
export function mergePois<T extends Poi>(...lists: T[][]): T[] {
  const byId = new Map<string, T>();
  for (const list of lists) for (const poi of list) if (!byId.has(poi.id)) byId.set(poi.id, poi);
  return [...byId.values()];
}
