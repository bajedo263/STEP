import { useSyncExternalStore } from 'react';

// Petits drapeaux propres à ce téléphone (premier lancement vu, objectif déjà fêté…),
// gardés dans le localStorage fourni par expo-sqlite.
const listeners = new Set<() => void>();
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setLocalFlag(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sans stockage, le drapeau vaut pour cette session seulement.
    memory.set(key, value);
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Valeur d'un drapeau local, mise à jour dès qu'un écran la change. */
export function useLocalFlag(key: string | null): string | null {
  return useSyncExternalStore(subscribe, () => (key ? (memory.get(key) ?? read(key)) : null));
}


/** Drapeau « premier lancement vu », propre à chaque compte sur ce téléphone. */
export const onboardedKey = (userId: string) => `step.onboarded.${userId}`;

/** Jour où l'objectif a déjà été fêté, pour ne le fêter qu'une fois. */
export const celebratedKey = (userId: string) => `step.goal-celebrated.${userId}`;
