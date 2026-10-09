// Points d'intérêt issus des articles Wikipédia géolocalisés, partagés entre les fonctions
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
  /** Identifiant de la page Wikipédia, ex. « wiki/123 ». */
  id: string;
  kind: PoiKind;
  title: string;
  /** Texte affiché sous le titre : courte description de l'article. */
  description: string | null;
  coords: LatLng;
  /** Lien vers l'article Wikipédia en français. */
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

/**
 * Distance maximale au tracé : le lieu doit être visible depuis le chemin. La position d'un
 * article Wikipédia est souvent le centre du bâtiment, d'où un peu de marge.
 */
export const ROUTE_CORRIDOR_M = 50;
export const MAX_ROUTE_POIS = 25;

const EARTH_RADIUS_M = 6_371_008.8;

export function distanceM(a: LatLng, b: LatLng): number {
  const cosLat = Math.cos((((a.latitude + b.latitude) / 2) * Math.PI) / 180);
  const dx = ((b.longitude - a.longitude) * Math.PI * EARTH_RADIUS_M * cosLat) / 180;
  const dy = ((b.latitude - a.latitude) * Math.PI * EARTH_RADIUS_M) / 180;
  return Math.hypot(dx, dy);
}

/**
 * Allège un tracé : un point tous les `spacingM` mètres au moins,
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

type WikipediaPage = {
  pageid?: unknown;
  title?: unknown;
  description?: unknown;
  fullurl?: unknown;
  coordinates?: { lat?: unknown; lon?: unknown }[];
};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

// Articles géolocalisés qui ne sont pas des lieux à voir en passant : découpages administratifs,
// rues (le point est au milieu de la rue), organismes logés dans un bâtiment quelconque, métro.
const SKIPPED_DESCRIPTION =
  /^(ancienne )?(arrondissement|région|département|commune|quartier|circonscription|canton|ville|capitale|pays|rue|avenue|boulevard|voie|impasse|passage|allée|villa|cité|quai|chemin|route|agence|autorité|institution|organisme|organisation|entreprise|société|association|parti|syndicat|fondation|ministère|commission|commissariat|établissement|administration|station)\b|station (du|de) métro/i;

const KIND_RULES: [RegExp, PoiKind][] = [
  [/musée|galerie|muséum/i, 'museum'],
  [/mémorial|monument aux morts|plaque/i, 'memorial'],
  [/statue|sculpture|fresque|œuvre|oeuvre/i, 'artwork'],
  [/château|palais|hôtel particulier|manoir/i, 'castle'],
  [/monument|tour |arc de triomphe|obélisque|colonne|fontaine/i, 'monument'],
  [/belvédère|point de vue|panorama/i, 'viewpoint'],
  [/église|cathédrale|basilique|chapelle|temple|synagogue|mosquée|abbaye|couvent|historique|siècle|patrimoine/i, 'heritage'],
];

const KIND_SCORES: Record<PoiKind, number> = {
  plaque: 3,
  monument: 3,
  museum: 3,
  castle: 3,
  memorial: 2,
  artwork: 2,
  viewpoint: 2,
  heritage: 2,
  attraction: 1,
};

function kindOf(description: string | null, title: string): PoiKind {
  const subject = `${description ?? ''} ${title}`;
  return KIND_RULES.find(([pattern]) => pattern.test(subject))?.[1] ?? 'attraction';
}

const truncate = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;

const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('fr-FR') + value.slice(1);

/** Paramètres de recherche Wikipédia des articles situés dans un rectangle. */
export function wikipediaBboxParams({ south, west, north, east }: Bbox): Record<string, string> {
  const box = [north, west, south, east].map((value) => value.toFixed(6)).join('|');
  return { ...WIKIPEDIA_BASE_PARAMS, ggsbbox: box };
}

/** Paramètres de recherche Wikipédia des articles dans un cercle (rayon plafonné à 10 km). */
export function wikipediaNearParams(point: LatLng, radiusM: number): Record<string, string> {
  return {
    ...WIKIPEDIA_BASE_PARAMS,
    ggscoord: `${point.latitude.toFixed(6)}|${point.longitude.toFixed(6)}`,
    ggsradius: String(Math.round(Math.min(10_000, Math.max(10, radiusM)))),
  };
}

const WIKIPEDIA_BASE_PARAMS = {
  action: 'query',
  format: 'json',
  formatversion: '2',
  generator: 'geosearch',
  ggslimit: '500',
  prop: 'coordinates|description|info',
  inprop: 'url',
  colimit: 'max',
};

/** Lieux lus dans une réponse de l'API Wikipédia ; les articles qui ne se visitent pas sont ignorés. */
export function parseWikipediaPois(json: unknown): Poi[] {
  const query = (json as { query?: { pages?: unknown } } | null)?.query;
  const pages = Array.isArray(query?.pages) ? query.pages : Object.values(query?.pages ?? {});

  const pois: Poi[] = [];
  for (const raw of pages) {
    const page = (raw ?? {}) as WikipediaPage;
    const coords = page.coordinates?.[0];
    const title = text(page.title);
    if (typeof page.pageid !== 'number' || !title) continue;
    if (typeof coords?.lat !== 'number' || typeof coords?.lon !== 'number') continue;
    const description = text(page.description);
    if (description && SKIPPED_DESCRIPTION.test(description)) continue;
    if (/^\d+(e|er) arrondissement/i.test(title)) continue;

    const kind = kindOf(description, title);
    pois.push({
      id: `wiki/${page.pageid}`,
      kind,
      // « Musée Rodin (Paris) » : la précision entre parenthèses n'apporte rien sur place.
      title: title.replace(/\s*\([^)]*\)$/, ''),
      description: description ? truncate(capitalize(description), 280) : null,
      coords: { latitude: coords.lat, longitude: coords.lon },
      wikipediaUrl: text(page.fullurl),
      score: KIND_SCORES[kind] + (description ? 1 : 0),
    });
  }
  return pois;
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
