/**
 * Dessin de tous ses trajets : les tracés GeoJSON renvoyés par `my_walk_paths`, projetés dans
 * un cadre pour l'image de partage et la carte des souvenirs.
 */

import type { LatLng } from './loop.ts';

/** Tracé d'un trajet, depuis un `LineString` GeoJSON ; null s'il est illisible. */
export function lineCoordinates(geojson: unknown): LatLng[] | null {
  const value = typeof geojson === 'string' ? safeParse(geojson) : geojson;
  const line = value as { type?: string; coordinates?: unknown } | null;
  if (line?.type !== 'LineString' || !Array.isArray(line.coordinates)) return null;
  const points = line.coordinates.flatMap((pair) =>
    Array.isArray(pair) && typeof pair[0] === 'number' && typeof pair[1] === 'number'
      ? [{ latitude: pair[1], longitude: pair[0] }]
      : []
  );
  return points.length >= 2 ? points : null;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Points SVG (« x,y x,y… ») de chaque tracé, à la même échelle, centrés dans un cadre de
 * `width` × `height` avec une marge. Projection équirectangulaire corrigée de la latitude,
 * fidèle à l'échelle d'une ville.
 */
export function projectPaths(
  paths: LatLng[][],
  width: number,
  height: number,
  margin = 0
): string[] {
  const points = paths.flat();
  if (points.length === 0) return [];
  const latitudes = points.map((p) => p.latitude);
  const longitudes = points.map((p) => p.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);

  const spanX = Math.max((maxLng - minLng) * cos, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((width - 2 * margin) / spanX, (height - 2 * margin) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;

  const round = (value: number) => Math.round(value * 10) / 10;
  return paths.map((path) =>
    path
      .map(
        (p) =>
          `${round(offsetX + (p.longitude - minLng) * cos * scale)},${round(offsetY + (maxLat - p.latitude) * scale)}`
      )
      .join(' ')
  );
}

/** Rayon autour du cœur de ses trajets au-delà duquel un trajet est mis de côté pour le cadrage. */
export const FOCUS_RADIUS_M = 20_000;

/**
 * Trajets autour de chez soi : ceux dont le centre est à moins de `FOCUS_RADIUS_M` du centre
 * médian. Un trajet de vacances ou un saut du GPS ne fait plus dézoomer la carte ni rétrécir
 * le dessin en un point.
 */
export function focusPaths<T extends LatLng[]>(paths: T[]): T[] {
  if (paths.length <= 1) return paths;
  const centers = paths.map(center);
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const core = {
    latitude: median(centers.map((c) => c.latitude)),
    longitude: median(centers.map((c) => c.longitude)),
  };
  const kept = paths.filter((_, index) => distanceM(centers[index], core) <= FOCUS_RADIUS_M);
  return kept.length > 0 ? kept : paths;
}

function center(path: LatLng[]): LatLng {
  const sum = path.reduce(
    (acc, p) => ({ latitude: acc.latitude + p.latitude, longitude: acc.longitude + p.longitude }),
    { latitude: 0, longitude: 0 }
  );
  return { latitude: sum.latitude / path.length, longitude: sum.longitude / path.length };
}

function distanceM(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const x = (b.longitude - a.longitude) * rad * Math.cos(((a.latitude + b.latitude) / 2) * rad);
  const y = (b.latitude - a.latitude) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}
