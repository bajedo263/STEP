import type { LatLng } from './loop.ts';

export type TrackPoint = LatLng & {
  /** Horodatage en millisecondes. */
  timestamp: number;
  /** Précision horizontale en mètres, si connue. */
  accuracy?: number | null;
};

export type Track = {
  points: TrackPoint[];
  distanceM: number;
  /** Position lissée et sa marge d'erreur (variance en m²), avant accrochage au trajet prévu. */
  filter?: { latitude: number; longitude: number; variance: number; timestamp: number } | null;
};

/** Positions moins précises que ça : ignorées (GPS en intérieur, démarrage). */
export const MAX_ACCURACY_M = 35;
/** Déplacements plus courts : bruit du GPS à l'arrêt. */
export const MIN_STEP_M = 4;
/** Au-delà de 25 km/h, ce n'est plus de la marche (voiture, saut du GPS). */
export const MAX_SPEED_MS = 7;

/** Précision supposée quand le téléphone ne la donne pas. */
const DEFAULT_ACCURACY_M = 15;
/** Vitesse à laquelle la position réelle peut s'écarter de l'estimation (m/s) : un marcheur. */
const PROCESS_SPEED_MS = 3;
/** Un point lissé à moins de cette distance du trajet prévu est posé dessus. */
export const SNAP_M = 20;

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Distance à vol d'oiseau entre deux points (formule de haversine). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const emptyTrack = (): Track => ({ points: [], distanceM: 0 });

/**
 * Lissage des positions GPS (filtre de Kalman simple) : chaque nouvelle position déplace
 * l'estimation d'autant plus qu'elle est précise et que la précédente est ancienne. En ville,
 * les reflets sur les façades font zigzaguer le GPS d'une dizaine de mètres ; le lissage les gomme.
 */
function smooth(track: Track, point: TrackPoint): NonNullable<Track['filter']> {
  const accuracy = point.accuracy ?? DEFAULT_ACCURACY_M;
  const measured = Math.max(1, accuracy) ** 2;
  const previous = track.filter;
  if (!previous) {
    return {
      latitude: point.latitude,
      longitude: point.longitude,
      variance: measured,
      timestamp: point.timestamp,
    };
  }
  const seconds = Math.max(0, (point.timestamp - previous.timestamp) / 1000);
  const variance = previous.variance + seconds * PROCESS_SPEED_MS ** 2;
  const gain = variance / (variance + measured);
  return {
    latitude: previous.latitude + gain * (point.latitude - previous.latitude),
    longitude: previous.longitude + gain * (point.longitude - previous.longitude),
    variance: (1 - gain) * variance,
    timestamp: point.timestamp,
  };
}

/** Coordonnées en mètres autour d'un point de référence (assez juste à l'échelle d'une rue). */
function toLocal(origin: LatLng, point: LatLng): { x: number; y: number } {
  return {
    x:
      toRad(point.longitude - origin.longitude) * EARTH_RADIUS_M * Math.cos(toRad(origin.latitude)),
    y: toRad(point.latitude - origin.latitude) * EARTH_RADIUS_M,
  };
}

type PathProjection = { point: LatLng; distanceM: number; alongM: number };

/** Projection du point sur chaque segment du tracé, dans l'ordre du tracé. */
function projectOnSegments(path: LatLng[], point: LatLng): PathProjection[] {
  const projections: PathProjection[] = [];
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = toLocal(a, path[i]);
    const p = toLocal(a, point);
    const length2 = b.x * b.x + b.y * b.y;
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, (p.x * b.x + p.y * b.y) / length2));
    const dx = p.x - t * b.x;
    const dy = p.y - t * b.y;
    const segmentM = Math.sqrt(length2);
    projections.push({
      point: {
        latitude: a.latitude + t * (path[i].latitude - a.latitude),
        longitude: a.longitude + t * (path[i].longitude - a.longitude),
      },
      distanceM: Math.sqrt(dx * dx + dy * dy),
      alongM: walked + t * segmentM,
    });
    walked += segmentM;
  }
  return projections;
}

/** Point du tracé le plus proche, sa distance et la longueur du tracé jusqu'à lui. */
export function projectOnPath(path: LatLng[], point: LatLng): PathProjection | null {
  let best: PathProjection | null = null;
  for (const projection of projectOnSegments(path, point)) {
    if (!best || projection.distanceM < best.distanceM) best = projection;
  }
  return best;
}

/** Longueur d'un tracé en mètres. */
export function pathLength(path: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += haversineMeters(path[i - 1], path[i]);
  return total;
}

/**
 * Ajoute une position au tracé si elle est fiable : elle est d'abord lissée, puis posée sur le
 * trajet prévu (`path`) si elle en est proche. Renvoie le même objet si la position est rejetée.
 */
export function addPoint(track: Track, point: TrackPoint, path?: LatLng[] | null): Track {
  if (point.accuracy != null && point.accuracy > MAX_ACCURACY_M) return track;

  const filter = smooth(track, point);
  const snapped = path ? projectOnPath(path, filter) : null;
  const position = snapped && snapped.distanceM <= SNAP_M ? snapped.point : filter;
  const next: TrackPoint = {
    latitude: position.latitude,
    longitude: position.longitude,
    accuracy: point.accuracy,
    timestamp: point.timestamp,
  };

  const last = track.points.at(-1);
  if (!last) return { points: [next], distanceM: 0, filter };

  const step = haversineMeters(last, next);
  const seconds = (point.timestamp - last.timestamp) / 1000;
  if (seconds <= 0 || step / seconds > MAX_SPEED_MS) return track;
  // À l'arrêt, le GPS bouge encore un peu : on affine l'estimation sans allonger le tracé.
  if (step < MIN_STEP_M) return { ...track, filter };

  return { points: [...track.points, next], distanceM: track.distanceM + step, filter };
}

/**
 * Arrivée d'un trajet prévu : à moins de `ARRIVAL_M` de la fin, après en avoir parcouru l'essentiel
 * (une boucle repasse par son départ, il ne faut pas s'arrêter dès les premiers mètres).
 */
export const ARRIVAL_M = 25;

export function hasArrived(path: LatLng[], track: Track): boolean {
  const position = track.points.at(-1);
  if (!position || path.length < 2) return false;
  const total = pathLength(path);
  return (
    haversineMeters(position, path[path.length - 1]) <= ARRIVAL_M && track.distanceM >= total * 0.6
  );
}

/**
 * Distance déjà parcourue le long du trajet prévu, d'après la dernière position.
 *
 * Un trajet repasse souvent par la même rue (aller-retour vers un lieu, boucle qui revient à
 * son départ) : le point le plus proche peut alors être sur l'autre passage, et le chiffre
 * grimpe à mesure qu'on avance. Parmi les passages proches, on retient celui qui correspond
 * le mieux à la distance déjà marchée.
 */
export function progressAlongPath(path: LatLng[], track: Track): number {
  const total = pathLength(path);
  const position = track.points.at(-1);
  if (!position) return 0;
  let best: PathProjection | null = null;
  for (const projection of projectOnSegments(path, position)) {
    if (projection.distanceM > 2 * SNAP_M) continue;
    if (
      !best ||
      Math.abs(projection.alongM - track.distanceM) < Math.abs(best.alongM - track.distanceM)
    ) {
      best = projection;
    }
  }
  // Loin du trajet (détour), on retombe sur l'estimation par la distance parcourue.
  return Math.min(total, best ? best.alongM : track.distanceM);
}

/** Distance restant à parcourir le long du trajet prévu depuis la dernière position. */
export function remainingAlongPath(path: LatLng[], track: Track): number {
  return Math.max(0, pathLength(path) - progressAlongPath(path, track));
}

/** Une boucle revient à moins de cette distance de son départ. */
const LOOP_CLOSE_M = 60;
/** Autour du départ d'une boucle, on ne sait pas encore dans quel sens on la fait. */
const DIRECTION_MARGIN_M = 50;

/**
 * Vrai si l'on fait la boucle dans l'autre sens : le premier passage qu'on emprunte sans
 * ambiguïté est dans la seconde moitié du tracé. Faux pour un trajet qui n'est pas une boucle.
 */
export function walksLoopBackwards(path: LatLng[], track: Track): boolean {
  if (path.length < 3 || haversineMeters(path[0], path[path.length - 1]) > LOOP_CLOSE_M) {
    return false;
  }
  const total = pathLength(path);
  const half = total / 2;
  for (const point of track.points) {
    const near = projectOnSegments(path, point).filter((p) => p.distanceM <= 2 * SNAP_M);
    if (near.length === 0) continue;
    // Tout près du départ, ou sur un tronçon commun à l'aller et au retour : on attend.
    if (near.some((p) => p.alongM < DIRECTION_MARGIN_M || p.alongM > total - DIRECTION_MARGIN_M)) {
      continue;
    }
    if (near.every((p) => p.alongM < half)) return false;
    if (near.every((p) => p.alongM > half)) return true;
  }
  return false;
}

/** Le trajet prévu dans le sens où on le marche : une boucle peut se faire à l'envers. */
export function orientedPath(path: LatLng[], track: Track): LatLng[] {
  return walksLoopBackwards(path, track) ? [...path].reverse() : path;
}

/**
 * Les `count` prochains lieux le long du trajet, au-delà de `progressM` mètres parcourus. Un
 * lieu devant lequel le trajet passe deux fois compte au passage qui reste à faire.
 */
export function upcomingAlongPath<T extends { coords: LatLng }>(
  pois: T[],
  path: LatLng[],
  progressM: number,
  count = 3
): T[] {
  return pois
    .flatMap((poi) => {
      const projections = projectOnSegments(path, poi.coords);
      if (projections.length === 0) return [];
      const closest = Math.min(...projections.map((p) => p.distanceM));
      const ahead = projections
        .filter((p) => p.distanceM <= closest + SNAP_M && p.alongM >= progressM - SNAP_M)
        .map((p) => p.alongM);
      return ahead.length > 0 ? [{ poi, alongM: Math.min(...ahead) }] : [];
    })
    .sort((a, b) => a.alongM - b.alongM)
    .slice(0, count)
    .map(({ poi }) => poi);
}

/** Tracé au format attendu par PostGIS, ou null s'il a moins de deux points. */
export function toLineStringWkt(points: LatLng[]): string | null {
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.longitude.toFixed(6)} ${p.latitude.toFixed(6)}`).join(',');
  return `SRID=4326;LINESTRING(${coords})`;
}

/** Chronomètre : « 4:05 », « 1:02:09 ». */
export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
