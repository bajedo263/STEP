import { haversineMeters, pathLength } from './track.ts';

type LatLng = { latitude: number; longitude: number };

/** Poignées posées sur une boucle pour la redessiner en les faisant glisser. */
export const HANDLE_COUNT = 3;

/** Point situé à `distanceM` mètres du départ, le long du tracé. */
export function pointAlong(path: LatLng[], distanceM: number): LatLng {
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const segment = haversineMeters(path[i - 1], path[i]);
    if (walked + segment >= distanceM && segment > 0) {
      const t = (distanceM - walked) / segment;
      return {
        latitude: path[i - 1].latitude + (path[i].latitude - path[i - 1].latitude) * t,
        longitude: path[i - 1].longitude + (path[i].longitude - path[i - 1].longitude) * t,
      };
    }
    walked += segment;
  }
  return path[path.length - 1];
}

/** Poignées réparties à intervalles réguliers le long de la boucle (au quart, à la moitié…). */
export function loopHandles(path: LatLng[], count = HANDLE_COUNT): LatLng[] {
  if (path.length < 2) return [];
  const length = pathLength(path);
  return Array.from({ length: count }, (_, index) =>
    pointAlong(path, (length * (index + 1)) / (count + 1))
  );
}

/** Les poignées après en avoir déplacé une. */
export function moveHandle(handles: LatLng[], index: number, point: LatLng): LatLng[] {
  return handles.map((handle, i) => (i === index ? point : handle));
}
