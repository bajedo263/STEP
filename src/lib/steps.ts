/** Objectif quotidien par défaut. */
export const DEFAULT_DAILY_GOAL = 10_000;

/** MET de la marche à allure normale (environ 5 km/h). */
const WALKING_MET = 3.5;

export type Sex = 'female' | 'male' | 'unspecified';

/**
 * Longueur de foulée estimée à partir de la taille : 0,413 × taille pour une femme,
 * 0,415 × taille pour un homme. On prend la moyenne quand le sexe n'est pas renseigné.
 */
export function strideLengthMeters(heightCm: number, sex: Sex = 'unspecified'): number {
  const ratio = sex === 'female' ? 0.413 : sex === 'male' ? 0.415 : 0.414;
  return (heightCm / 100) * ratio;
}

/** Pas restants pour atteindre l'objectif du jour (jamais négatif). */
export function remainingSteps(stepsToday: number, goal = DEFAULT_DAILY_GOAL): number {
  return Math.max(0, goal - stepsToday);
}

/** Distance en mètres correspondant à un nombre de pas. */
export function stepsToMeters(steps: number, strideMeters: number): number {
  return steps * strideMeters;
}

/** Distance cible en mètres d'un trajet qui complète l'objectif du jour. */
export function targetDistanceMeters(
  stepsToday: number,
  strideMeters: number,
  goal = DEFAULT_DAILY_GOAL
): number {
  return stepsToMeters(remainingSteps(stepsToday, goal), strideMeters);
}

/** Calories dépensées : MET × poids (kg) × durée (h). */
export function walkingCalories(weightKg: number, durationMinutes: number): number {
  return WALKING_MET * weightKg * (durationMinutes / 60);
}
