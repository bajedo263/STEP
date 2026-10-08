import { distanceM, POI_KIND_LABELS, type Poi } from '../../supabase/functions/_shared/pois.ts';
import type { LatLng } from './loop.ts';

export { POI_KIND_LABELS, type Poi };

/** Distance à laquelle on signale un lieu pendant la marche. */
export const POI_NEARBY_M = 40;

/** Lieu le plus proche de la position, s'il est à portée de vue. */
export function nearbyPoi(pois: Poi[], position: LatLng | null | undefined): Poi | null {
  if (!position) return null;
  let best: { poi: Poi; distance: number } | null = null;
  for (const poi of pois) {
    const distance = distanceM(poi.coords, position);
    if (distance <= POI_NEARBY_M && (!best || distance < best.distance)) best = { poi, distance };
  }
  return best?.poi ?? null;
}
