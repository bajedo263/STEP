import { localDay, startOfDay } from './daily-progress.ts';
import type { DailyStepsRow } from './stats.ts';
import { goalOn, type GoalRule } from './steps.ts';

/** Un gel gagné tous les 7 jours d'affilée à l'objectif. */
export const FREEZE_EVERY_DAYS = 7;
/** Stock maximum de gels. */
export const MAX_FREEZES = 2;
/** Paliers de série célébrés. */
export const STREAK_MILESTONES = [7, 30, 100, 365];

export type ProtectedStreak = {
  /** Jours à l'objectif dans la série en cours (les jours sauvés par un gel ne comptent pas). */
  current: number;
  best: number;
  /** Gels en stock, prêts à sauver le prochain jour raté. */
  freezes: number;
  /** Jours ratés sauvés par un gel, au format AAAA-MM-JJ. */
  frozenDays: string[];
  todayDone: boolean;
};

/**
 * Série protégée, recalculée à partir de l'historique des pas : chaque jour à l'objectif
 * la prolonge, et tous les 7 jours d'affilée elle rapporte un gel (2 au plus). Un jour raté
 * consomme un gel s'il en reste, sinon la série repart de zéro. Aujourd'hui ne compte comme
 * raté qu'une fois terminé.
 */
export function protectedStreak(
  rows: DailyStepsRow[],
  today: Date,
  todaySteps: number | null,
  goal: GoalRule
): ProtectedStreak {
  const todayKey = localDay(today);
  const byDay = new Map(rows.map((row) => [row.day, row.steps]));
  byDay.set(todayKey, Math.max(byDay.get(todayKey) ?? 0, todaySteps ?? 0));

  const days = [...byDay.keys()].filter((day) => day <= todayKey).sort();
  const result: ProtectedStreak = {
    current: 0,
    best: 0,
    freezes: 0,
    frozenDays: [],
    todayDone: false,
  };
  if (days.length === 0) return result;

  const [year, month, date] = days[0].split('-').map(Number);
  const cursor = new Date(year, month - 1, date);
  const end = startOfDay(today);
  while (cursor <= end) {
    const day = localDay(cursor);
    const atGoal = (byDay.get(day) ?? 0) >= goalOn(goal, day);
    if (atGoal) {
      result.current += 1;
      result.best = Math.max(result.best, result.current);
      if (result.current % FREEZE_EVERY_DAYS === 0) {
        result.freezes = Math.min(MAX_FREEZES, result.freezes + 1);
      }
      if (day === todayKey) result.todayDone = true;
    } else if (day !== todayKey) {
      if (result.current > 0 && result.freezes > 0) {
        result.freezes -= 1;
        result.frozenDays.push(day);
      } else {
        result.current = 0;
        result.freezes = 0;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

/** Palier atteint aujourd'hui (7, 30, 100, 365 jours), ou null. */
export function milestoneToday(streak: ProtectedStreak): number | null {
  return streak.todayDone && STREAK_MILESTONES.includes(streak.current) ? streak.current : null;
}
