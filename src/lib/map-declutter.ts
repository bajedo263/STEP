import type { LatLng } from './loop.ts';
import { haversineMeters } from './track.ts';

type Located = { coords: LatLng };

export type PoiCluster<T extends Located> = { key: string; coords: LatLng; items: T[] };

type Region = LatLng & { latitudeDelta: number; longitudeDelta: number };

/**
 * Regroupe les lieux trop proches à l'échelle affichée : la vue est découpée en une grille
 * d'environ `columns` cases de large, et les lieux d'une même case forment un groupe.
 */
export function clusterByRegion<T extends Located>(
  items: T[],
  region: Region | null,
  columns = 8
): PoiCluster<T>[] {
  if (!region) return items.map((item, index) => single(item, index));
  const cellLon = region.longitudeDelta / columns;
  const cellLat = cellLon * Math.cos((region.latitude * Math.PI) / 180);
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = `${Math.floor(item.coords.latitude / cellLat)}:${Math.floor(item.coords.longitude / cellLon)}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups].map(([key, group]) => ({
    key,
    coords: {
      latitude: group.reduce((sum, item) => sum + item.coords.latitude, 0) / group.length,
      longitude: group.reduce((sum, item) => sum + item.coords.longitude, 0) / group.length,
    },
    items: group,
  }));
}

/** En deçà de cette largeur de vue (en degrés, ~500 m), les groupes s'ouvrent en éventail. */
export const FAN_OUT_DELTA = 0.006;

const METERS_PER_DEGREE = 111_320;

/**
 * Lieux superposés (même adresse, même bâtiment) : aucun zoom ne les sépare. Une fois la carte
 * assez rapprochée, on les dispose en cercle autour de leur point commun, espacés d'au moins
 * `gapPoints` à l'écran pour rester touchables. Rend la position affichée de chaque lieu.
 */
export function fanOut<T extends Located>(
  items: T[],
  center: LatLng,
  region: Region,
  widthPoints: number,
  gapPoints = 34
): { item: T; coords: LatLng }[] {
  if (items.length < 2) return items.map((item) => ({ item, coords: item.coords }));
  const cosLat = Math.cos((center.latitude * Math.PI) / 180);
  const metersPerPoint = (region.longitudeDelta * METERS_PER_DEGREE * cosLat) / widthPoints;
  const radiusPoints = Math.max(gapPoints, (items.length * gapPoints) / (2 * Math.PI));
  const radius = radiusPoints * metersPerPoint;
  return items.map((item, index) => {
    // Premier lieu en haut, puis dans le sens des aiguilles d'une montre.
    const angle = (2 * Math.PI * index) / items.length;
    const north = radius * Math.cos(angle);
    const east = radius * Math.sin(angle);
    return {
      item,
      coords: {
        latitude: center.latitude + north / METERS_PER_DEGREE,
        longitude: center.longitude + east / (METERS_PER_DEGREE * cosLat),
      },
    };
  });
}

function single<T extends Located>(item: T, index: number): PoiCluster<T> {
  return { key: `seul-${index}`, coords: item.coords, items: [item] };
}

/** Indice du point du tracé le plus proche. */
function nearestIndex(route: LatLng[], point: LatLng): number {
  let best = 0;
  let bestDistance = Infinity;
  route.forEach((vertex, index) => {
    const distance = haversineMeters(vertex, point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

/**
 * Pendant la marche : les `count` prochains lieux non découverts, dans l'ordre du tracé,
 * à partir de la position actuelle. Avant le premier point GPS, on part du début du tracé.
 */
export function upcomingPois<T extends Located & { visited: boolean }>(
  pois: T[],
  route: LatLng[],
  position: LatLng | null | undefined,
  count = 3
): T[] {
  if (route.length === 0) return pois.filter((poi) => !poi.visited).slice(0, count);
  const here = position ? nearestIndex(route, position) : 0;
  return pois
    .filter((poi) => !poi.visited)
    .map((poi) => ({ poi, index: nearestIndex(route, poi.coords) }))
    .filter(({ index }) => index >= here)
    .sort((a, b) => a.index - b.index)
    .slice(0, count)
    .map(({ poi }) => poi);
}
