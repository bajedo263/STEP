import type { LatLng } from './loop.ts';
import { ARRIVAL_M, projectOnPath } from './track.ts';

/** Au-delà de cette distance du tracé prévu, on prévient qu'on s'en écarte. */
export const OFF_ROUTE_M = 40;
/** En deçà, on est revenu sur le tracé (marge pour ne pas alterner au bord du seuil). */
export const BACK_ON_ROUTE_M = 25;
/** Temps passé loin du tracé avant d'alerter : un trottoir d'en face ou un saut du GPS ne compte pas. */
export const OFF_ROUTE_DELAY_MS = 10_000;
/** Position trop imprécise pour juger (m). */
const MAX_JUDGED_ACCURACY_M = 30;

export type OffRoute = {
  /** Depuis quand on est loin du tracé, null si on est dessus. */
  since: number | null;
  /** Vrai une fois l'écart confirmé : bandeau affiché, vibration donnée. */
  off: boolean;
  /** Distance au tracé à la dernière mesure fiable. */
  distanceM: number;
};

export const onRoute = (): OffRoute => ({
  since: null,
  off: false,
  distanceM: 0,
});

/**
 * Écart au tracé prévu, d'après la position lissée (avant qu'elle soit posée sur le tracé).
 * L'alerte attend `OFF_ROUTE_DELAY_MS` loin du tracé et ne s'éteint qu'une fois revenu à moins
 * de `BACK_ON_ROUTE_M`.
 */
export function nextOffRoute(
  state: OffRoute,
  path: LatLng[],
  position: (LatLng & { accuracy?: number | null }) | null | undefined,
  now: number
): OffRoute {
  if (!position || path.length < 2) return state;
  if (position.accuracy != null && position.accuracy > MAX_JUDGED_ACCURACY_M) return state;
  const projection = projectOnPath(path, position);
  if (!projection) return state;
  const distanceM = projection.distanceM;
  if (distanceM <= BACK_ON_ROUTE_M) {
    return state.since === null && !state.off && state.distanceM === distanceM
      ? state
      : { since: null, off: false, distanceM };
  }
  if (distanceM > OFF_ROUTE_M) {
    const since = state.since ?? now;
    return {
      since,
      off: state.off || now - since >= OFF_ROUTE_DELAY_MS,
      distanceM,
    };
  }
  // Entre les deux seuils : on garde l'état, avec la distance à jour.
  return { ...state, distanceM };
}

/** Distance avant l'arrivée à laquelle on prévient, sur un trajet assez long pour que ça compte. */
export const NEAR_ARRIVAL_M = 500;
const NEAR_ARRIVAL_MIN_TOTAL_M = 1_500;

export function nearArrival(totalM: number, remainingM: number): boolean {
  return (
    totalM >= NEAR_ARRIVAL_MIN_TOTAL_M && remainingM <= NEAR_ARRIVAL_M && remainingM > ARRIVAL_M
  );
}

/**
 * Objectif du jour atteint pendant ce trajet (il ne l'était pas au départ). Un bond du compteur
 * bien plus grand que les pas du trajet vient d'une source arrivée en retard (Santé), pas de la
 * marche : on ne le fête pas.
 */
export function goalReachedDuringWalk(
  stepsAtStart: number | null,
  stepsNow: number | null,
  goal: number,
  walkSteps: number
): boolean {
  if (stepsAtStart === null || stepsNow === null) return false;
  if (stepsNow - stepsAtStart > walkSteps + LATE_SOURCE_MARGIN) return false;
  return stepsAtStart < goal && stepsNow >= goal;
}
const LATE_SOURCE_MARGIN = 1_000;

const formatSteps = (value: number) => Math.round(value).toLocaleString('fr-FR');

/** La journée rappelée au bilan : « Objectif : 8 200 / 10 000 pas · série de 6 jours ». */
export function dayLine(day: {
  steps: number | null;
  goal: number;
  streak: number | null;
}): string | null {
  if (day.steps === null) return null;
  const parts = [
    day.steps >= day.goal
      ? 'Objectif du jour atteint'
      : `Objectif : ${formatSteps(day.steps)} / ${formatSteps(day.goal)} pas`,
  ];
  if (day.streak) parts.push(`série de ${day.streak} jour${day.streak > 1 ? 's' : ''}`);
  return parts.join(' · ');
}
