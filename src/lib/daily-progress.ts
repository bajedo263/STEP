import {
  DEFAULT_DAILY_GOAL,
  remainingSteps,
  strideLengthMeters,
  walkingCalories,
  type Sex,
} from './steps.ts';

/** Allure de marche moyenne retenue pour estimer la durée, en km/h. */
const WALKING_SPEED_KMH = 5;
/** Valeurs par défaut quand le profil n'est pas rempli. */
const DEFAULT_HEIGHT_CM = 170;
const DEFAULT_WEIGHT_KG = 70;

export type ProgressInput = {
  steps: number;
  goal?: number;
  heightCm?: number | null;
  weightKg?: number | null;
  sex?: Sex;
};

export type DailyProgress = {
  steps: number;
  goal: number;
  /** Part de l'objectif atteinte, entre 0 et 1. */
  ratio: number;
  remainingSteps: number;
  distanceM: number;
  remainingDistanceM: number;
  calories: number;
  goalReached: boolean;
};

/** Résume la journée : progression, distance parcourue et restante, calories estimées. */
export function dailyProgress({
  steps,
  goal = DEFAULT_DAILY_GOAL,
  heightCm,
  weightKg,
  sex = 'unspecified',
}: ProgressInput): DailyProgress {
  const stride = strideLengthMeters(heightCm ?? DEFAULT_HEIGHT_CM, sex);
  const distanceM = steps * stride;
  const hours = distanceM / 1000 / WALKING_SPEED_KMH;
  const remaining = remainingSteps(steps, goal);

  return {
    steps,
    goal,
    ratio: goal > 0 ? Math.min(1, steps / goal) : 1,
    remainingSteps: remaining,
    distanceM,
    remainingDistanceM: remaining * stride,
    calories: walkingCalories(weightKg ?? DEFAULT_WEIGHT_KG, hours * 60),
    goalReached: remaining === 0,
  };
}

/** Date locale au format AAAA-MM-JJ (clé de la table daily_steps). */
export function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Minuit local du jour donné. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Distance lisible : « 850 m » ou « 4,2 km ». */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
}
