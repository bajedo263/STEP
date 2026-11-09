import { useSyncExternalStore } from 'react';

// Petits drapeaux propres à ce téléphone (premier lancement vu, objectif déjà fêté…),
// gardés dans le localStorage fourni par expo-sqlite.
const listeners = new Set<() => void>();
// Valeurs déjà lues : sans ce cache, chaque rendu de chaque écran relisait la base SQLite.
const memory = new Map<string, string | null>();

function read(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  let value: string | null = null;
  try {
    value = typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    value = null;
  }
  memory.set(key, value);
  return value;
}

export function setLocalFlag(key: string, value: string) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sans stockage, le drapeau vaut pour cette session seulement.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Lecture ponctuelle d'un drapeau local. */
export function localFlag(key: string): string | null {
  return read(key);
}

/** Valeur d'un drapeau local, mise à jour dès qu'un écran la change. */
export function useLocalFlag(key: string | null): string | null {
  const snapshot = () => (key ? read(key) : null);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}


/** Drapeau « premier lancement vu », propre à chaque compte sur ce téléphone. */
export const onboardedKey = (userId: string) => `step.onboarded.${userId}`;

/** Jour où l'objectif a déjà été fêté, pour ne le fêter qu'une fois. */
export const celebratedKey = (userId: string) => `step.goal-celebrated.${userId}`;

/** Proposition d'objectif adaptatif déjà vue (acceptée ou écartée). */
export const adaptiveSuggestedKey = (userId: string) => `step.adaptive-suggested.${userId}`;

/** Semaine (lundi AAAA-MM-JJ) dont le bilan a déjà été lu. */
export const weeklySeenKey = (userId: string) => `step.weekly-seen.${userId}`;
