import { useSyncExternalStore } from 'react';

import type { LoopRoute } from '@/lib/loop';

/** Trajet préparé sur la carte, transmis à l'écran de suivi. */
export type PlannedWalk = { mode: 'loop'; route: LoopRoute } | { mode: 'free' };

let planned: PlannedWalk = { mode: 'free' };
const listeners = new Set<() => void>();

export function setPlannedWalk(walk: PlannedWalk) {
  planned = walk;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function usePlannedWalk(): PlannedWalk {
  return useSyncExternalStore(subscribe, () => planned);
}
