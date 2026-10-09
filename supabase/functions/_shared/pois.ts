// Points d'intérêt issus d'OpenStreetMap (via l'API Overpass), partagés entre les fonctions
// Edge (Deno) et les tests (Node). Aucun import extérieur.
import type { LatLng } from './loop.ts';

export type PoiKind =
  | 'plaque'
  | 'memorial'
  | 'monument'
  | 'artwork'
  | 'museum'
  | 'viewpoint'
  | 'castle'
  | 'heritage'
  | 'attraction';

export type Poi = {
  /** Identifiant OSM, ex. « node/123 ». */
  id: string;
  kind: PoiKind;
  title: string;
  /** Texte affiché sous le titre : inscription de la plaque, description… */
  description: string | null;
  coords: LatLng;
  /** Lien Wikipédia en français quand OSM en donne un. */
  wikipediaUrl: string | null;
  /** Plus c'est haut, plus le lieu vaut le détour. */
  score: number;
};

export const POI_KIND_LABELS: Record<PoiKind, string> = {
  plaque: 'Plaque commémorative',
  memorial: 'Mémorial',
  monument: 'Monument',
  artwork: 'Œuvre d’art',
  museum: 'Musée',
  viewpoint: 'Point de vue',
  castle: 'Château',
  heritage: 'Patrimoine',
  attraction: 'À voir',
};

/** Distance maximale au tracé : le lieu doit être visible depuis le chemin. */
export const ROUTE_CORRIDOR_M = 35;
export const MAX_ROUTE_POIS = 25;

const EARTH_RADIUS_M = 6_371_008.8;
const OVERPASS_SELECTORS = [
  'nwr["historic"="memorial"]',
  'nwr["memorial"="plaque"]',
  'nwr["historic"]["name"]',
  'nwr["tourism"~"^(artwork|attraction|museum|viewpoint)$"]["name"]',
];

export function distanceM(a: LatLng, b: LatLng): number {
  const cosLat = Math.cos((((a.latitude + b.latitude) / 2) * Math.PI) / 180);
  const dx = ((b.longitude - a.longitude) * Math.PI * EARTH_RADIUS_M * cosLat) / 180;
  const dy = ((b.latitude - a.latitude) * Math.PI * EARTH_RADIUS_M) / 180;
  return Math.hypot(dx, dy);
}

/**
 * Allège un tracé pour la requête Overpass : un point tous les `spacingM` mètres au moins,
 * en gardant toujours le premier et le dernier.
 */
export function samplePath(points: LatLng[], spacingM = 20, maxPoints = 400): LatLng[] {
  if (points.length <= 2) return points;
  let spacing = spacingM;
  for (;;) {
    const kept = [points[0]];
    for (const point of points.slice(1, -1)) {
      if (distanceM(kept[kept.length - 1], point) >= spacing) kept.push(point);
    }
    kept.push(points[points.length - 1]);
    if (kept.length <= maxPoints) return kept;
    spacing *= 2;
  }
}

const coordList = (points: LatLng[]) =>
  points.map((p) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`).join(',');

/** Requête Overpass des lieux remarquables à moins de `radiusM` d'un tracé ou d'un point. */
export function overpassQuery(points: LatLng[], radiusM: number): string {
  const around = `(around:${Math.round(radiusM)},${coordList(points)})`;
  const selectors = OVERPASS_SELECTORS.map((selector) => `  ${selector}${around};`).join('\n');
  return `[out:json][timeout:20];\n(\n${selectors}\n);\nout center tags 300;`;
}

/** Requête Overpass des lieux remarquables dans un cercle de `radiusM` autour de chaque point. */
export function overpassQueryNear(points: LatLng[], radiusM: number): string {
  const statements = points.flatMap((point) =>
    OVERPASS_SELECTORS.map((selector) => `  ${selector}(around:${Math.round(radiusM)},${coordList([point])});`)
  );
  return `[out:json][timeout:20];\n(\n${statements.join('\n')}\n);\nout center tags 300;`;
}

type OverpassElement = {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: { lat?: unknown; lon?: unknown };
  tags?: Record<string, unknown>;
};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

function kindOf(tags: Record<string, unknown>): PoiKind {
  const historic = text(tags.historic);
  const tourism = text(tags.tourism);
  if (tags.memorial === 'plaque' || tags['memorial:type'] === 'plaque') return 'plaque';
  if (historic === 'memorial') return 'memorial';
  if (historic === 'monument') return 'monument';
  if (historic === 'castle' || historic === 'manor' || historic === 'fort') return 'castle';
  if (tourism === 'museum') return 'museum';
  if (tourism === 'artwork') return 'artwork';
  if (tourism === 'viewpoint') return 'viewpoint';
  if (historic) return 'heritage';
  return 'attraction';
}

const KIND_SCORES: Record<PoiKind, number> = {
  plaque: 3,
  monument: 3,
  museum: 3,
  castle: 3,
  memorial: 2,
  artwork: 2,
  viewpoint: 2,
  heritage: 1,
  attraction: 1,
};

function wikipediaUrl(tags: Record<string, unknown>): string | null {
  const value = text(tags.wikipedia);
  const match = value?.match(/^fr:(.+)$/);
  if (!match) return null;
  return `https://fr.wikipedia.org/wiki/${encodeURIComponent(match[1].replace(/ /g, '_'))}`;
}

const truncate = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;

/** Lieux lus dans une réponse Overpass ; ceux sans nom ni inscription sont ignorés. */
export function parseOverpassPois(json: unknown): Poi[] {
  const elements = (json as { elements?: unknown[] } | null)?.elements;
  if (!Array.isArray(elements)) return [];

  const pois = new Map<string, Poi>();
  for (const raw of elements) {
    const element = (raw ?? {}) as OverpassElement;
    const tags = element.tags ?? {};
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') continue;
    if (typeof element.type !== 'string' || typeof element.id !== 'number') continue;

    const name = text(tags['name:fr']) ?? text(tags.name);
    const inscription = text(tags['inscription:fr']) ?? text(tags.inscription);
    const description = inscription ?? text(tags['description:fr']) ?? text(tags.description);
    if (!name && !inscription) continue;

    const kind = kindOf(tags);
    const link = wikipediaUrl(tags);
    const id = `${element.type}/${element.id}`;
    // Une plaque sans nom prend son inscription pour titre : pas besoin de la répéter.
    const title = name ?? truncate(inscription!, 70);
    pois.set(id, {
      id,
      kind,
      title,
      description: description && description !== title ? truncate(description, 280) : null,
      coords: { latitude, longitude },
      wikipediaUrl: link,
      score: KIND_SCORES[kind] + (inscription ? 1 : 0) + (link || tags.wikidata ? 1 : 0),
    });
  }
  return [...pois.values()];
}

/** Distance d'un point au segment [a, b], en projection locale. */
function distanceToSegmentM(p: LatLng, a: LatLng, b: LatLng): number {
  const cosLat = Math.cos((p.latitude * Math.PI) / 180);
  const toXY = (q: LatLng) => [q.longitude * cosLat, q.latitude];
  const [px, py] = toXY(p);
  const [ax, ay] = toXY(a);
  const [bx, by] = toXY(b);
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const closest = { longitude: (ax + t * dx) / cosLat, latitude: ay + t * dy };
  return distanceM(p, closest);
}

/**
 * Garde les lieux à moins de `corridorM` du tracé, dans l'ordre où on les croise,
 * en limitant leur nombre aux plus intéressants.
 */
export function poisAlongPath<T extends Poi>(
  pois: T[],
  path: LatLng[],
  corridorM = ROUTE_CORRIDOR_M,
  max = MAX_ROUTE_POIS
): T[] {
  if (path.length === 0) return [];
  const located: { poi: T; along: number }[] = [];
  for (const poi of pois) {
    let best = Infinity;
    let along = 0;
    for (let i = 0; i < path.length; i++) {
      const next = path[Math.min(i + 1, path.length - 1)];
      const d = distanceToSegmentM(poi.coords, path[i], next);
      if (d < best) {
        best = d;
        along = i;
      }
    }
    if (best <= corridorM) located.push({ poi, along });
  }
  const kept = located.sort((a, b) => b.poi.score - a.poi.score).slice(0, max);
  return kept.sort((a, b) => a.along - b.along).map(({ poi }) => poi);
}

/**
 * Lieu le plus intéressant près du point de passage visé, pour que le détour ait une raison
 * d'être. À intérêt égal, le plus proche du point visé.
 */
export function bestPoiNear(pois: Poi[], target: LatLng, radiusM: number): Poi | null {
  let best: { poi: Poi; distance: number } | null = null;
  for (const poi of pois) {
    const distance = distanceM(poi.coords, target);
    if (distance > radiusM) continue;
    if (
      !best ||
      poi.score > best.poi.score ||
      (poi.score === best.poi.score && distance < best.distance)
    ) {
      best = { poi, distance };
    }
  }
  return best?.poi ?? null;
}

// Quartiers : tuiles cartographiques au zoom 15 (environ 800 m de côté à Paris).
// Le nombre de lieux d'un quartier est fixé une fois pour toutes quand on le charge.
export const ZONE_ZOOM = 15;

export type Zone = { x: number; y: number };

export function zoneOf(point: LatLng): Zone {
  const n = 2 ** ZONE_ZOOM;
  const lat = (point.latitude * Math.PI) / 180;
  return {
    x: Math.floor(((point.longitude + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n),
  };
}

export type Bbox = { south: number; west: number; north: number; east: number };

export function zoneBbox({ x, y }: Zone): Bbox {
  const n = 2 ** ZONE_ZOOM;
  const lng = (tx: number) => (tx / n) * 360 - 180;
  const lat = (ty: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI;
  return { south: lat(y + 1), west: lng(x), north: lat(y), east: lng(x + 1) };
}

export const zoneKey = ({ x, y }: Zone) => `${x}/${y}`;

/** Quartiers traversés par un tracé (et ceux qui touchent son couloir). */
export function zonesAlongPath(path: LatLng[]): Zone[] {
  const zones = new Map<string, Zone>();
  for (const point of samplePath(path, 50, 5_000)) {
    for (const dLat of [-0.0003, 0, 0.0003]) {
      for (const dLng of [-0.0005, 0, 0.0005]) {
        const zone = zoneOf({ latitude: point.latitude + dLat, longitude: point.longitude + dLng });
        zones.set(zoneKey(zone), zone);
      }
    }
  }
  return [...zones.values()];
}

/** Le quartier du point et ses 8 voisins. */
export function zonesAround(point: LatLng): Zone[] {
  const { x, y } = zoneOf(point);
  const zones: Zone[] = [];
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) zones.push({ x: x + dx, y: y + dy });
  return zones;
}

/** Requête Overpass de tous les lieux remarquables d'un rectangle (pour remplir un quartier). */
export function overpassQueryBbox({ south, west, north, east }: Bbox): string {
  const box = `(${south.toFixed(6)},${west.toFixed(6)},${north.toFixed(6)},${east.toFixed(6)})`;
  const selectors = OVERPASS_SELECTORS.map((selector) => `  ${selector}${box};`).join('\n');
  return `[out:json][timeout:25];\n(\n${selectors}\n);\nout center tags 3000;`;
}

/** Rectangle englobant des quartiers. */
export function zonesBbox(zones: Zone[]): Bbox {
  const boxes = zones.map(zoneBbox);
  return {
    south: Math.min(...boxes.map((b) => b.south)),
    west: Math.min(...boxes.map((b) => b.west)),
    north: Math.max(...boxes.map((b) => b.north)),
    east: Math.max(...boxes.map((b) => b.east)),
  };
}
