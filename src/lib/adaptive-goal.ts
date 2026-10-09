import { localDay, startOfDay } from './daily-progress.ts';
import type { DailyStepsRow } from './stats.ts';

/** Bornes de l'objectif adaptatif : il ne descend pas sous 3 000 pas et s'arrête à 10 000. */
export const ADAPTIVE_MIN = 3_000;
export const ADAPTIVE_MAX = 10_000;
/** Pas d'évolution, à la hausse comme à la baisse. */
export const ADAPTIVE_STEP = 500;
/** Jours à l'objectif sur 7 pour monter d'un cran la semaine suivante. */
export const WEEK_HITS_UP = 5;
/** À ce nombre de jours à l'objectif ou moins, l'objectif redescend d'un cran. */
export const WEEK_HITS_DOWN = 1;
/** Objectif provisoire quand aucun pas n'est encore enregistré. */
const FALLBACK_GOAL = 6_000;
/** Jours enregistrés sur la semaine précédant l'activation pour se passer d'une semaine d'essai. */
const CALIBRATION_MIN_DAYS = 4;

export type AdaptivePlan = {
  /** Semaine d'essai : l'objectif de départ se fixe sur la moyenne des 7 premiers jours. */
  phase: 'calibrating' | 'active';
  /** Objectif du jour. */
  goal: number;
  /** Jours restants dans la semaine en cours (essai ou palier), aujourd'hui compris. */
  daysLeft: number;
  /** Jours à l'objectif dans le palier en cours, aujourd'hui compris s'il est atteint. */
  weekHits: number;
  /** Objectif de la semaine suivante si le palier est réussi. */
  nextGoal: number;
  /** Objectif du jour donné (AAAA-MM-JJ), pour juger les jours passés à leur propre objectif. */
  goalFor: (day: string) => number;
};

function parseDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Moyenne des pas + 10 %, arrondie au cran supérieur et bornée. */
export function startingGoal(average: number | null): number {
  if (average === null) return FALLBACK_GOAL;
  const raised = Math.ceil((average * 1.1) / ADAPTIVE_STEP) * ADAPTIVE_STEP;
  return Math.min(ADAPTIVE_MAX, Math.max(ADAPTIVE_MIN, raised));
}

/**
 * Objectif adaptatif, recalculé à partir de l'historique depuis son activation (`since`).
 *
 * L'objectif de départ vaut la moyenne de la semaine précédant l'activation, plus 10 %. Sans
 * assez de jours enregistrés, une semaine d'essai le fixe. Ensuite, par périodes de 7 jours :
 * 5 jours à l'objectif ou plus, il monte de 500 pas (jusqu'à 10 000) ; 1 jour ou moins, il
 * redescend de 500 pas (pas sous 3 000) ; sinon il ne bouge pas.
 */
export function adaptivePlan(
  rows: DailyStepsRow[],
  since: string,
  today: Date,
  todaySteps: number | null
): AdaptivePlan {
  const todayKey = localDay(today);
  const byDay = new Map(rows.map((row) => [row.day, row.steps]));
  byDay.set(todayKey, Math.max(byDay.get(todayKey) ?? 0, todaySteps ?? 0));
  const end = startOfDay(today);
  const start = parseDay(since);

  // Moyenne des jours enregistrés d'une fenêtre, aujourd'hui exclu car pas encore terminé.
  const average = (from: Date, days: number): { value: number | null; count: number } => {
    const values: number[] = [];
    for (let index = 0; index < days; index += 1) {
      const date = addDays(from, index);
      if (date >= end) break;
      const steps = byDay.get(localDay(date)) ?? 0;
      if (steps > 0) values.push(steps);
    }
    const value = values.length
      ? values.reduce((sum, steps) => sum + steps, 0) / values.length
      : null;
    return { value, count: values.length };
  };

  const before = average(addDays(start, -7), 7);
  const calibrated = before.count >= CALIBRATION_MIN_DAYS;
  const firstWeek = calibrated ? start : addDays(start, 7);
  const baseline = startingGoal(calibrated ? before.value : average(start, 7).value);

  if (end < firstWeek) {
    const goal = baseline;
    return {
      phase: 'calibrating',
      goal,
      daysLeft: Math.round((firstWeek.getTime() - end.getTime()) / 86_400_000),
      weekHits: 0,
      nextGoal: goal,
      goalFor: () => goal,
    };
  }

  // Paliers successifs : premier jour et objectif de chacun.
  const levels: { from: string; goal: number }[] = [];
  let goal = baseline;
  let weekStart = firstWeek;
  for (;;) {
    levels.push({ from: localDay(weekStart), goal });
    const next = addDays(weekStart, 7);
    if (next > end) break;
    let hits = 0;
    for (let index = 0; index < 7; index += 1) {
      if ((byDay.get(localDay(addDays(weekStart, index))) ?? 0) >= goal) hits += 1;
    }
    if (hits >= WEEK_HITS_UP) goal = Math.min(ADAPTIVE_MAX, goal + ADAPTIVE_STEP);
    else if (hits <= WEEK_HITS_DOWN) goal = Math.max(ADAPTIVE_MIN, goal - ADAPTIVE_STEP);
    weekStart = next;
  }

  let weekHits = 0;
  for (let date = weekStart; date <= end; date = addDays(date, 1)) {
    if ((byDay.get(localDay(date)) ?? 0) >= goal) weekHits += 1;
  }

  return {
    phase: 'active',
    goal,
    daysLeft: 7 - Math.round((end.getTime() - weekStart.getTime()) / 86_400_000),
    weekHits,
    nextGoal: Math.min(ADAPTIVE_MAX, goal + ADAPTIVE_STEP),
    goalFor: (day) => {
      // Avant l'activation, les jours se jugent à l'objectif de départ.
      let found = levels[0].goal;
      for (const level of levels) {
        if (level.from > day) break;
        found = level.goal;
      }
      return found;
    },
  };
}

/** Ligne d'avancement affichée sous l'objectif du jour. */
export function adaptiveLabel(plan: AdaptivePlan): string {
  const format = (value: number) => value.toLocaleString('fr-FR');
  const days = (count: number) => `${count} jour${count > 1 ? 's' : ''}`;
  if (plan.phase === 'calibrating') {
    return `Semaine d’essai : encore ${days(plan.daysLeft)} pour fixer votre objectif de départ.`;
  }
  if (plan.goal >= ADAPTIVE_MAX) {
    return `Objectif adaptatif au maximum : ${format(ADAPTIVE_MAX)} pas par jour.`;
  }
  const missing = WEEK_HITS_UP - plan.weekHits;
  if (missing <= 0) {
    const when = plan.daysLeft === 1 ? 'demain' : `dans ${days(plan.daysLeft)}`;
    return `Palier réussi : ${format(plan.nextGoal)} pas par jour ${when}.`;
  }
  return `${plan.weekHits} jour${plan.weekHits > 1 ? 's' : ''} sur ${WEEK_HITS_UP} cette semaine pour passer à ${format(plan.nextGoal)} pas.`;
}

/**
 * Faut-il proposer l'objectif adaptatif ? Quand l'objectif fixe n'a été atteint que 2 jours
 * ou moins sur les 14 derniers, avec au moins 7 jours enregistrés.
 */
export function suggestAdaptive(rows: DailyStepsRow[], today: Date, goal: number): boolean {
  const end = startOfDay(today);
  const byDay = new Map(rows.map((row) => [row.day, row.steps]));
  let recorded = 0;
  let hits = 0;
  for (let index = 1; index <= 14; index += 1) {
    const steps = byDay.get(localDay(addDays(end, -index))) ?? 0;
    if (steps > 0) recorded += 1;
    if (steps >= goal) hits += 1;
  }
  return recorded >= 7 && hits <= 2;
}
