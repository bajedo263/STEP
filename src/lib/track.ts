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
};

/** Positions moins précises que ça : ignorées (GPS en intérieur, démarrage). */
export const MAX_ACCURACY_M = 35;
/** Déplacements plus courts : bruit du GPS à l'arrêt. */
export const MIN_STEP_M = 4;
/** Au-delà de 25 km/h, ce n'est plus de la marche (voiture, saut du GPS). */
export const MAX_SPEED_MS = 7;

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

/** Ajoute une position au tracé si elle est fiable ; renvoie le même objet sinon. */
export function addPoint(track: Track, point: TrackPoint): Track {
  if (point.accuracy != null && point.accuracy > MAX_ACCURACY_M) return track;

  const last = track.points.at(-1);
  if (!last) return { points: [point], distanceM: 0 };

  const step = haversineMeters(last, point);
  if (step < MIN_STEP_M) return track;
  const seconds = (point.timestamp - last.timestamp) / 1000;
  if (seconds <= 0 || step / seconds > MAX_SPEED_MS) return track;

  return { points: [...track.points, point], distanceM: track.distanceM + step };
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
