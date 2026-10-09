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

/** Centre d'une case. */
export function cellCenter(cell: Cell): LatLng {
  const { south, west, north, east } = zoneBbox(cell, CONQUEST_ZOOM);
  return { latitude: (south + north) / 2, longitude: (west + east) / 2 };
}

/** Distance maximale entre le départ et une case à défendre. */
export const DEFENSE_RADIUS_M = 2_500;
/** Points de passage d'une boucle de défense (le serveur en accepte 4). */
export const DEFENSE_MAX_POINTS = 3;
/** Une case est couverte par un point de passage si elle est à moins de cette distance. */
const DEFENSE_COVER_M = 150;

/**
 * Points de passage d'une boucle qui reprend le plus de cases menacées près du départ :
 * on choisit d'abord les endroits où elles sont les plus nombreuses, puis on les ordonne
 * autour du départ pour que la boucle ne se croise pas.
 */
export function defensePoints(cells: Cell[], start: LatLng): LatLng[] {
  let left = cells.map(cellCenter).filter((center) => distanceM(start, center) <= DEFENSE_RADIUS_M);
  const chosen: LatLng[] = [];
  while (left.length > 0 && chosen.length < DEFENSE_MAX_POINTS) {
    let best = left[0];
    let bestCover = -1;
    for (const candidate of left) {
      const cover = left.filter((other) => distanceM(candidate, other) <= DEFENSE_COVER_M).length;
      // À égalité, le plus proche du départ.
      if (
        cover > bestCover ||
        (cover === bestCover && distanceM(start, candidate) < distanceM(start, best))
      ) {
        best = candidate;
        bestCover = cover;
      }
    }
    chosen.push(best);
    left = left.filter((other) => distanceM(best, other) > DEFENSE_COVER_M);
  }
  const bearing = (point: LatLng) =>
    Math.atan2(
      (point.longitude - start.longitude) * Math.cos((start.latitude * Math.PI) / 180),
      point.latitude - start.latitude
    );
  return chosen.sort((a, b) => bearing(a) - bearing(b));
}

const cases = (count: number) => `${count} case${count > 1 ? 's' : ''}`;

/** « 3 cases reprises par d'autres marcheurs, 1 case bientôt libérée ». */
export function territoryAlertLabel({
  lost,
  expiring,
}: {
  lost: Cell[];
  expiring: Cell[];
}): string {
  const parts = [];
  if (lost.length > 0) {
    parts.push(
      `${cases(lost.length)} ${lost.length > 1 ? 'reprises' : 'reprise'} par d’autres marcheurs`
    );
  }
  if (expiring.length > 0) {
    parts.push(
      `${cases(expiring.length)} à vous ${expiring.length > 1 ? 'libérées' : 'libérée'} d’ici 2 jours`
    );
  }
  return parts.length > 0 ? `${parts.join(', ')}.` : 'Votre territoire est en sécurité.';
}
