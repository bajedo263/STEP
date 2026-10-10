import type { LocationObject } from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { isExpoGo } from '@/lib/native-build';

/** Tâche de suivi GPS d'un trajet, qui continue écran éteint dans la version installée. */
export const WALK_LOCATION_TASK = 'step-walk-location';

type Listener = (locations: LocationObject[]) => void;
const listeners = new Set<Listener>();

/** Reçoit les positions envoyées par la tâche, app ouverte ou en arrière-plan. */
export function onWalkLocations(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Doit être défini au chargement du bundle, hors de tout composant (voir src/app/_layout.tsx).
if (!isExpoGo) {
  TaskManager.defineTask<{ locations: LocationObject[] }>(
    WALK_LOCATION_TASK,
    async ({ data, error }) => {
      if (error || !data?.locations?.length) return;
      listeners.forEach((listener) => listener(data.locations));
    }
  );
}
