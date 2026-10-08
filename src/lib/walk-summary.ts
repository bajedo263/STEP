import { walkingCalories } from './steps.ts';
import { toLineStringWkt, type Track } from './track.ts';

export type WalkMode = 'loop' | 'destination' | 'free';

export type WalkSummary = {
  mode: WalkMode;
  startedAt: Date;
  endedAt: Date;
  distanceM: number;
  steps: number;
  calories: number;
  path: string | null;
};

/** Trajet trop court pour mériter d'être enregistré. */
export const MIN_WALK_M = 50;

/**
 * Bilan d'un trajet terminé. Les pas viennent du podomètre quand il en a compté,
 * sinon ils sont estimés à partir de la distance et de la foulée.
 */
export function summarizeWalk(input: {
  mode: WalkMode;
  track: Track;
  pedometerSteps: number | null;
  strideM: number;
  weightKg: number;
  startedAt: Date;
  endedAt: Date;
}): WalkSummary {
  const distanceM = Math.round(input.track.distanceM);
  const minutes = (input.endedAt.getTime() - input.startedAt.getTime()) / 60_000;
  const steps =
    input.pedometerSteps && input.pedometerSteps > 0
      ? input.pedometerSteps
      : Math.round(distanceM / input.strideM);

  return {
    mode: input.mode,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    distanceM,
    steps,
    calories: Math.round(walkingCalories(input.weightKg, Math.max(0, minutes))),
    path: toLineStringWkt(input.track.points),
  };
}

/** Ligne à insérer dans la table `walks`. */
export function walkRow(userId: string, summary: WalkSummary) {
  return {
    user_id: userId,
    mode: summary.mode,
    path: summary.path,
    started_at: summary.startedAt.toISOString(),
    ended_at: summary.endedAt.toISOString(),
    steps: summary.steps,
    distance_m: summary.distanceM,
    calories_kcal: summary.calories,
  };
}
