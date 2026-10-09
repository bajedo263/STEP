import { distanceM, zoneBbox, zoneKey, zoneOf, type Zone } from '../../supabase/functions/_shared/pois.ts';
import type { LatLng } from './loop.ts';

/** Cases d'environ 50 m : tuiles cartographiques au zoom 19, comme côté base. */
export const CONQUEST_ZOOM = 19;
/** Les premiers mètres d'un trajet ne comptent pas, pour ne pas dessiner l'adresse de départ. */
export const CONQUEST_SKIP_M = 150;
/** En dessous de cette longueur, un trajet ne prend aucune case (comme côté base). */
export const CONQUEST_MIN_WALK_M = 400;
/** Au-delà de cette largeur (en cases), la carte est trop dézoomée pour afficher les cases. */
export const MAX_VISIBLE_SPAN = 60;

export type Cell = Zone;
/** `friend` : case d'un ami (absent tant que la migration Amis n'est pas appliquée). */
export type ConquestCell = Cell & { mine: boolean; friend?: boolean };

export const cellOf = (point: LatLng): Cell => zoneOf(point, CONQUEST_ZOOM);
export const cellKey = zoneKey;

/** Les quatre coins d'une case, pour la dessiner. */
export function cellPolygon(cell: Cell): LatLng[] {
  const { south, west, north, east } = zoneBbox(cell, CONQUEST_ZOOM);
  return [
    { latitude: north, longitude: west },
    { latitude: north, longitude: east },
    { latitude: south, longitude: east },
    { latitude: south, longitude: west },
  ];
}

/**
 * Cases traversées par un tracé, sans ses `skipM` premiers mètres ni ses `skipEndM` derniers.
 * Chaque segment est découpé tous les 10 m pour ne pas sauter de case.
 */
export function cellsAlongTrack(points: LatLng[], skipM = CONQUEST_SKIP_M, skipEndM = 0): Cell[] {
  const cells = new Map<string, Cell>();
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceM(points[i - 1], points[i]);
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = distanceM(a, b);
    const steps = Math.max(1, Math.ceil(length / 10));
    for (let s = 0; s <= steps; s++) {
      const at = walked + (length * s) / steps;
      if (at < skipM || at > total - skipEndM) continue;
      const t = s / steps;
      const cell = cellOf({
        latitude: a.latitude + (b.latitude - a.latitude) * t,
        longitude: a.longitude + (b.longitude - a.longitude) * t,
      });
      cells.set(cellKey(cell), cell);
    }
    walked += length;
  }
  return [...cells.values()];
}

type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

/** Plage de cases couverte par la zone affichée, ou null si elle est trop grande. */
export function cellRangeOf(region: Region): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const northWest = cellOf({
    latitude: region.latitude + region.latitudeDelta / 2,
    longitude: region.longitude - region.longitudeDelta / 2,
  });
  const southEast = cellOf({
    latitude: region.latitude - region.latitudeDelta / 2,
    longitude: region.longitude + region.longitudeDelta / 2,
  });
  const range = { minX: northWest.x, minY: northWest.y, maxX: southEast.x, maxY: southEast.y };
  if (range.maxX - range.minX > MAX_VISIBLE_SPAN || range.maxY - range.minY > MAX_VISIBLE_SPAN) return null;
  return range;
}

/** Cases qu'un trajet terminé prend à son enregistrement (même règle que la base). */
export function capturedCells(points: LatLng[]): Cell[] {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceM(points[i - 1], points[i]);
  return total < CONQUEST_MIN_WALK_M ? [] : cellsAlongTrack(points, CONQUEST_SKIP_M, CONQUEST_SKIP_M);
}

/** Pas du jour à partir desquels la Conquête s'active : les trajets colorent alors la carte. */
export const CONQUEST_UNLOCK_STEPS = 10_000;

export function conquestUnlocked(todaySteps: number | null | undefined): boolean {
  return (todaySteps ?? 0) >= CONQUEST_UNLOCK_STEPS;
}
