import { localDay, startOfDay } from './daily-progress.ts';
import type { DailyStepsRow } from './stats.ts';
import { goalOn, type GoalRule } from './steps.ts';
import type { Reminder } from './reminders.ts';

/** Heure du rappel du lundi qui annonce le bilan. */
export const WEEKLY_REMINDER_HOUR = 9;

/** Lundi de la semaine qui contient ce jour, à minuit. */
export function mondayOf(date: Date): Date {
  const monday = startOfDay(date);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export type WeeklyReview = {
  /** Lundi de la semaine passée (AAAA-MM-JJ), qui identifie le bilan. */
  week: string;
  steps: number;
  average: number;
  daysAtGoal: number;
  /** Meilleur jour de la semaine, null si aucun pas enregistré. */
  bestDay: { day: string; steps: number } | null;
  /** Pas de la semaine d'avant, pour comparer. */
  previousSteps: number;
};

/** Bilan de la semaine passée (lundi à dimanche), null si elle n'a aucun pas enregistré. */
export function weeklyReview(
  rows: DailyStepsRow[],
  today: Date,
  goal: GoalRule
): WeeklyReview | null {
  const byDay = new Map(rows.map((row) => [row.day, row.steps]));
  const monday = addDays(mondayOf(today), -7);
  const sum = (from: Date) => {
    let steps = 0;
    for (let index = 0; index < 7; index += 1)
      steps += byDay.get(localDay(addDays(from, index))) ?? 0;
    return steps;
  };

  let daysAtGoal = 0;
  let bestDay: WeeklyReview['bestDay'] = null;
  for (let index = 0; index < 7; index += 1) {
    const day = localDay(addDays(monday, index));
    const steps = byDay.get(day) ?? 0;
    if (steps > 0 && steps >= goalOn(goal, day)) daysAtGoal += 1;
    if (steps > 0 && (!bestDay || steps > bestDay.steps)) bestDay = { day, steps };
  }
  const steps = sum(monday);
  if (steps === 0) return null;

  return {
    week: localDay(monday),
    steps,
    average: Math.round(steps / 7),
    daysAtGoal,
    bestDay,
    previousSteps: sum(addDays(monday, -7)),
  };
}

/** « du 5 au 11 octobre » ou « du 29 septembre au 5 octobre ». */
export function weekRangeLabel(week: string): string {
  const [year, month, date] = week.split('-').map(Number);
  const start = new Date(year, month - 1, date);
  const end = addDays(start, 6);
  const day = (value: Date) => (value.getDate() === 1 ? '1er' : String(value.getDate()));
  const monthName = (value: Date) => value.toLocaleDateString('fr-FR', { month: 'long' });
  return start.getMonth() === end.getMonth()
    ? `du ${day(start)} au ${day(end)} ${monthName(end)}`
    : `du ${day(start)} ${monthName(start)} au ${day(end)} ${monthName(end)}`;
}

/** Comparaison avec la semaine d'avant : « +12 % par rapport à la semaine d'avant ». */
export function weekTrendLabel({ steps, previousSteps }: WeeklyReview): string | null {
  if (previousSteps === 0) return null;
  const change = Math.round(((steps - previousSteps) / previousSteps) * 100);
  if (change === 0) return 'Autant que la semaine d’avant.';
  return `${change > 0 ? '+' : '−'}${Math.abs(change)} % par rapport à la semaine d’avant.`;
}

/** Une phrase d'encouragement qui tient compte de la semaine. */
export function weekCheer(review: WeeklyReview): string {
  if (review.daysAtGoal === 7) return 'Objectif atteint tous les jours. Semaine parfaite !';
  if (review.daysAtGoal >= 5) return 'Une très bonne semaine, continuez comme ça.';
  if (review.previousSteps > 0 && review.steps > review.previousSteps) {
    return 'Vous avez plus marché que la semaine d’avant, bravo.';
  }
  return 'Une nouvelle semaine commence : chaque boucle compte.';
}

/** Rappel du lundi matin qui annonce le bilan de la semaine passée. */
export function weeklyReviewReminder(now: Date): Reminder {
  let date = mondayOf(now);
  date.setHours(WEEKLY_REMINDER_HOUR, 0, 0, 0);
  if (date <= now) {
    date = addDays(date, 7);
  }
  return {
    id: 'step-weekly',
    date,
    title: 'Votre bilan de la semaine est prêt',
    body: 'Pas, jours à l’objectif, lieux découverts : voyez comment s’est passée votre semaine.',
    url: '/',
  };
}
