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

/** Au-delà de cette vitesse (vélo, voiture, transports), on ne conquiert rien ; la course passe. */
export const CONQUEST_MAX_SPEED_MS = 15 / 3.6;

/** Cases qu'un trajet terminé prend à son enregistrement (même règle que la base). */
export function capturedCells(points: (LatLng & { timestamp?: number })[]): Cell[] {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceM(points[i - 1], points[i]);
  if (total < CONQUEST_MIN_WALK_M) return [];
  // Trop rapide en moyenne : la base ne prend aucune case non plus.
  const seconds = ((points.at(-1)?.timestamp ?? 0) - (points[0]?.timestamp ?? 0)) / 1000;
  if (seconds > 0 && total / seconds > CONQUEST_MAX_SPEED_MS) return [];
  return cellsAlongTrack(points, CONQUEST_SKIP_M, CONQUEST_SKIP_M);
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

/** Coin de la grille des cases (coordonnées de tuile entières, y vers le sud). */
type Corner = { x: number; y: number };

/** Un bloc de cases voisines dessiné d'un seul tenant : son contour et ses trous éventuels. */
export type Territory = { outline: LatLng[]; holes: LatLng[][]; cellCount: number };

/**
 * Fusionne les cases voisines (par un côté) en blocs : on garde les côtés qu'aucune case du
 * bloc ne partage, puis on les enchaîne en anneaux. Le plus grand anneau d'un bloc est son
 * contour, les autres sont ses trous. Plus de damier ni de joints entre les cases.
 */
export function territories(cells: Cell[]): Territory[] {
  const keys = new Set(cells.map(cellKey));
  const seen = new Set<string>();
  const result: Territory[] = [];
  for (const start of cells) {
    if (seen.has(cellKey(start))) continue;
    // Le bloc : les cases reliées par un côté.
    const block: Cell[] = [];
    const queue = [start];
    seen.add(cellKey(start));
    while (queue.length > 0) {
      const cell = queue.pop()!;
      block.push(cell);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = { x: cell.x + dx, y: cell.y + dy };
        const key = cellKey(next);
        if (keys.has(key) && !seen.has(key)) {
          seen.add(key);
          queue.push(next);
        }
      }
    }
    const rings = blockRings(block, keys).sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
    if (rings.length === 0) continue;
    result.push({
      outline: rings[0].map(cornerToLatLng),
      holes: rings.slice(1).map((ring) => ring.map(cornerToLatLng)),
      cellCount: block.length,
    });
  }
  return result;
}

/** Anneaux du bord d'un bloc, côtés orientés dans le sens des aiguilles d'une montre. */
function blockRings(block: Cell[], keys: Set<string>): Corner[][] {
  const edges = new Map<string, Corner[]>();
  const add = (from: Corner, to: Corner) => {
    const key = cellKey(from);
    edges.set(key, [...(edges.get(key) ?? []), to]);
  };
  for (const { x, y } of block) {
    if (!keys.has(cellKey({ x, y: y - 1 }))) add({ x, y }, { x: x + 1, y });
    if (!keys.has(cellKey({ x: x + 1, y }))) add({ x: x + 1, y }, { x: x + 1, y: y + 1 });
    if (!keys.has(cellKey({ x, y: y + 1 }))) add({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
    if (!keys.has(cellKey({ x: x - 1, y }))) add({ x, y: y + 1 }, { x, y });
  }
  const rings: Corner[][] = [];
  for (const [startKey, targets] of edges) {
    while (targets.length > 0) {
      const [sx, sy] = startKey.split('/').map(Number);
      const ring: Corner[] = [{ x: sx, y: sy }];
      let previous: Corner = { x: sx, y: sy };
      let current = targets.shift()!;
      while (cellKey(current) !== startKey) {
        ring.push(current);
        const options = edges.get(cellKey(current)) ?? [];
        if (options.length === 0) break;
        // Deux côtés partent d'un même coin (trou touché en diagonale) : on tourne à droite.
        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        const right = options.findIndex((o) => o.x - current.x === -dy && o.y - current.y === dx);
        const index = options.length > 1 && right >= 0 ? right : 0;
        const next = options.splice(index, 1)[0];
        previous = current;
        current = next;
      }
      rings.push(withoutStraightCorners(ring));
    }
  }
  return rings;
}

/** Retire les coins au milieu d'un côté droit : un bloc de 3 cases alignées garde 4 coins. */
function withoutStraightCorners(ring: Corner[]): Corner[] {
  return ring.filter((corner, i) => {
    const before = ring[(i - 1 + ring.length) % ring.length];
    const after = ring[(i + 1) % ring.length];
    return (corner.x - before.x) * (after.y - corner.y) !== (corner.y - before.y) * (after.x - corner.x);
  });
}

function ringArea(ring: Corner[]): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function cornerToLatLng({ x, y }: Corner): LatLng {
  const { north, west } = zoneBbox({ x, y }, CONQUEST_ZOOM);
  return { latitude: north, longitude: west };
}
