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
