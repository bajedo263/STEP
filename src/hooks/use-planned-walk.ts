import type { LoopRoute } from '@/lib/loop';
import type { RoutePoi } from '@/lib/pois';

/** Trajet préparé sur la carte, transmis au suivi de marche. */
export type PlannedWalk =
  | { mode: 'loop'; route: LoopRoute; pois: RoutePoi[] }
  | { mode: 'destination'; route: LoopRoute; label: string; pois: RoutePoi[] }
  | { mode: 'free' };
