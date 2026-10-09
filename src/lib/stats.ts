import { localDay, startOfDay } from './daily-progress.ts';

export type DailyStepsRow = { day: string; steps: number };

export type WeekDay = {
  day: string;
  /** Initiale du jour : « L », « M »… */
  label: string;
  steps: number;
  isToday: boolean;
};

const DAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/** Premier jour (inclus) de la fenêtre des 7 derniers jours. */
export function weekStart(today: Date): Date {
  const start = startOfDay(today);
  start.setDate(start.getDate() - 6);
  return start;
}

/**
 * Les 7 derniers jours, du plus ancien à aujourd'hui, jours sans données à zéro.
 * Pour aujourd'hui, on garde le plus grand des deux : base ou compteur du téléphone.
 */
export function buildWeek(rows: DailyStepsRow[], today: Date, todaySteps: number | null): WeekDay[] {
  const byDay = new Map(rows.map((row) => [row.day, row.steps]));
  const start = weekStart(today);
  const todayKey = localDay(today);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const day = localDay(date);
    const stored = byDay.get(day) ?? 0;
    const isToday = day === todayKey;
    return {
      day,
      label: DAY_LABELS[date.getDay()],
      steps: isToday ? Math.max(stored, todaySteps ?? 0) : stored,
      isToday,
    };
  });
}

export function weekTotals(week: WeekDay[], goal: number) {
  const steps = week.reduce((sum, day) => sum + day.steps, 0);
  return {
    steps,
    average: Math.round(steps / week.length),
    daysAtGoal: week.filter((day) => day.steps >= goal).length,
  };
}

/** Une journée de l'historique, telle qu'enregistrée dans daily_steps. */
export type HistoryRow = DailyStepsRow & { distance_m: number | null; calories_kcal: number | null };

/** Nombre de jours d'historique relus pour les séries, le mois et les records. */
export const HISTORY_DAYS = 365;

/** Premier jour (inclus) de l'historique relu. */
export function historyStart(today: Date): Date {
  const start = startOfDay(today);
  start.setDate(start.getDate() - (HISTORY_DAYS - 1));
  return start;
}

/** Pas enregistrés par jour, en tenant compte du compteur du téléphone pour aujourd'hui. */
function stepsByDay(rows: DailyStepsRow[], today: Date, todaySteps: number | null) {
  const byDay = new Map(rows.map((row) => [row.day, row.steps]));
  const todayKey = localDay(today);
  byDay.set(todayKey, Math.max(byDay.get(todayKey) ?? 0, todaySteps ?? 0));
  return byDay;
}

/**
 * Séries de jours consécutifs à l'objectif.
 * La série en cours compte jusqu'à aujourd'hui si l'objectif est atteint, sinon jusqu'à hier :
 * elle n'est perdue qu'une fois la journée terminée sans l'avoir atteint.
 */
export function goalStreaks(
  rows: DailyStepsRow[],
  today: Date,
  todaySteps: number | null,
  goal: number
): { current: number; best: number; todayDone: boolean } {
  const byDay = stepsByDay(rows, today, todaySteps);
  const atGoal = (date: Date) => (byDay.get(localDay(date)) ?? 0) >= goal;

  const todayDone = atGoal(today);
  const cursor = startOfDay(today);
  if (!todayDone) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  while (current < HISTORY_DAYS && atGoal(cursor)) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const days = [...byDay.entries()]
    .filter(([, steps]) => steps >= goal)
    .map(([day]) => day)
    .sort();
  let best = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const day of days) {
    const [year, month, date] = day.split('-').map(Number);
    const value = new Date(year, month - 1, date);
    const expected = previous ? new Date(previous) : null;
    expected?.setDate(expected.getDate() + 1);
    run = expected && localDay(expected) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = value;
  }

  return { current, best: Math.max(best, current), todayDone };
}

export type PeriodTotals = {
  steps: number;
  distanceM: number;
  calories: number;
  daysAtGoal: number;
  /** Jours écoulés dans la période, aujourd'hui compris. */
  days: number;
};

/** Totaux du mois en cours et du mois précédent à la même date, pour comparer. */
export function monthTotals(
  rows: HistoryRow[],
  today: Date,
  todaySteps: number | null,
  goal: number
): { current: PeriodTotals; previous: PeriodTotals } {
  const byDay = stepsByDay(rows, today, todaySteps);
  const extras = new Map(rows.map((row) => [row.day, row]));

  const sum = (from: Date, days: number): PeriodTotals => {
    const totals: PeriodTotals = { steps: 0, distanceM: 0, calories: 0, daysAtGoal: 0, days };
    for (let index = 0; index < days; index += 1) {
      const date = new Date(from);
      date.setDate(from.getDate() + index);
      const key = localDay(date);
      const steps = byDay.get(key) ?? 0;
      const row = extras.get(key);
      totals.steps += steps;
      totals.distanceM += row?.distance_m ?? 0;
      totals.calories += row?.calories_kcal ?? 0;
      if (steps >= goal) totals.daysAtGoal += 1;
    }
    return totals;
  };

  const elapsed = today.getDate();
  const previousStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const previousLength = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
  return {
    current: sum(new Date(today.getFullYear(), today.getMonth(), 1), elapsed),
    previous: sum(previousStart, Math.min(elapsed, previousLength)),
  };
}

/** Meilleure journée de l'historique, ou null s'il est vide. */
export function bestDay(
  rows: DailyStepsRow[],
  today: Date,
  todaySteps: number | null
): { day: string; steps: number } | null {
  let best: { day: string; steps: number } | null = null;
  for (const [day, steps] of stepsByDay(rows, today, todaySteps)) {
    if (steps > 0 && (!best || steps > best.steps)) best = { day, steps };
  }
  return best;
}

/** Totaux de tout l'historique relu. */
export function historyTotals(rows: HistoryRow[]) {
  return rows.reduce(
    (totals, row) => ({
      steps: totals.steps + row.steps,
      distanceM: totals.distanceM + (row.distance_m ?? 0),
      calories: totals.calories + (row.calories_kcal ?? 0),
    }),
    { steps: 0, distanceM: 0, calories: 0 }
  );
}
