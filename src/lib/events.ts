/**
 * Événements à durée limitée : un calendrier fixe, calculé sur le téléphone, qui renouvelle les
 * objectifs sans nouvelle fonction (week-end explorateur chaque mois, défi de saison, Journées
 * du patrimoine, Semaine de la mobilité).
 */

import type { Reminder } from './reminders.ts';

export type EventMetric = 'steps' | 'places' | 'walks';

export type StepEvent = {
  /** Unique par édition : « explorateur-2026-10 ». */
  id: string;
  title: string;
  description: string;
  emoji: string;
  /** Premier et dernier jour, inclus. */
  start: string;
  end: string;
  metric: EventMetric;
  target: number;
};

/** Ce qu'on a fait pendant l'événement. */
export type EventActivity = Record<EventMetric, number>;

const pad = (value: number) => String(value).padStart(2, '0');
const dayKey = (date: Date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const utc = (year: number, month: number, date: number) => new Date(Date.UTC(year, month, date));
const addDays = (date: Date, days: number) =>
  utc(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days);
const parse = (day: string) => {
  const [year, month, date] = day.split('-').map(Number);
  return utc(year, month - 1, date);
};

/** N-ième samedi du mois (1 pour le premier). */
function nthSaturday(year: number, month: number, n: number): Date {
  const first = utc(year, month, 1);
  const offset = (6 - first.getUTCDay() + 7) % 7;
  return utc(year, month, 1 + offset + (n - 1) * 7);
}

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** Saisons astronomiques, à un jour près : printemps, été, automne, hiver. */
const SEASONS = [
  { name: 'du printemps', emoji: '🌸', month: 2, date: 20 },
  { name: 'de l’été', emoji: '☀️', month: 5, date: 21 },
  { name: 'de l’automne', emoji: '🍂', month: 8, date: 22 },
  { name: 'de l’hiver', emoji: '❄️', month: 11, date: 21 },
];
/** Pas par jour demandés par le défi de saison. */
const SEASON_DAILY_STEPS = 6000;

/** Événements d'une année : un week-end explorateur par mois, les saisons et les rendez-vous. */
function eventsOfYear(year: number): StepEvent[] {
  const events: StepEvent[] = [];
  const heritage = nthSaturday(year, 8, 3);

  for (let month = 0; month < 12; month += 1) {
    const saturday = nthSaturday(year, month, 2);
    // En septembre, les Journées du patrimoine prennent le relais le week-end suivant.
    if (month === 8) continue;
    events.push({
      id: `explorateur-${year}-${pad(month + 1)}`,
      title: 'Week-end explorateur',
      description:
        'Découvrez 3 lieux remarquables que vous n’avez jamais vus, d’ici dimanche soir.',
      emoji: '🧭',
      start: dayKey(saturday),
      end: dayKey(addDays(saturday, 1)),
      metric: 'places',
      target: 3,
    });
  }

  events.push({
    id: `patrimoine-${year}`,
    title: 'Journées du patrimoine',
    description: 'Monuments ouverts partout : découvrez 5 lieux remarquables pendant le week-end.',
    emoji: '🏛️',
    start: dayKey(heritage),
    end: dayKey(addDays(heritage, 1)),
    metric: 'places',
    target: 5,
  });

  events.push({
    id: `mobilite-${year}`,
    title: 'Semaine de la mobilité',
    description: 'Laissez la voiture : faites 5 trajets à pied avec STEP cette semaine.',
    emoji: '🚶',
    start: `${year}-09-16`,
    end: `${year}-09-22`,
    metric: 'walks',
    target: 5,
  });

  SEASONS.forEach((season, index) => {
    const start = utc(year, season.month, season.date);
    const next = SEASONS[index + 1];
    const end = next
      ? addDays(utc(year, next.month, next.date), -1)
      : addDays(utc(year + 1, SEASONS[0].month, SEASONS[0].date), -1);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const target = Math.round((days * SEASON_DAILY_STEPS) / 10_000) * 10_000;
    events.push({
      id: `saison-${dayKey(start)}`,
      title: `Défi ${season.name}`,
      description: `${target.toLocaleString('fr-FR')} pas d’ici le ${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}, environ ${SEASON_DAILY_STEPS.toLocaleString('fr-FR')} par jour.`,
      emoji: season.emoji,
      start: dayKey(start),
      end: dayKey(end),
      metric: 'steps',
      target,
    });
  });

  return events;
}

/** Événements en cours ce jour-là, les plus courts d'abord (le défi de saison en dernier). */
export function activeEvents(today: string): StepEvent[] {
  const year = Number(today.slice(0, 4));
  // L'hiver commencé l'an dernier court encore en début d'année.
  return [...eventsOfYear(year - 1), ...eventsOfYear(year)]
    .filter((event) => event.start <= today && today <= event.end)
    .sort((a, b) => eventLength(a) - eventLength(b));
}

/** Événement court qui commence dans les `withinDays` prochains jours, à annoncer. */
export function upcomingEvent(today: string, withinDays = 2): StepEvent | null {
  const year = Number(today.slice(0, 4));
  const limit = dayKey(addDays(parse(today), withinDays));
  return (
    [...eventsOfYear(year), ...eventsOfYear(year + 1)]
      .filter((event) => event.metric !== 'steps' && today < event.start && event.start <= limit)
      .sort((a, b) => a.start.localeCompare(b.start))[0] ?? null
  );
}

function eventLength(event: StepEvent): number {
  return parse(event.end).getTime() - parse(event.start).getTime();
}

/** Jours restants, aujourd'hui compris. */
export function daysLeft(event: StepEvent, today: string): number {
  return Math.round((parse(event.end).getTime() - parse(today).getTime()) / 86_400_000) + 1;
}

export type EventProgress = { progress: number; done: boolean; label: string };

export function eventProgress(event: StepEvent, activity: EventActivity): EventProgress {
  const value = activity[event.metric];
  const shown = Math.min(value, event.target);
  const unit = event.metric === 'steps' ? 'pas' : event.metric === 'places' ? 'lieux' : 'trajets';
  return {
    progress: shown / event.target,
    done: value >= event.target,
    label: `${shown.toLocaleString('fr-FR')} / ${event.target.toLocaleString('fr-FR')} ${unit}`,
  };
}

/** « Plus que 2 jours », « Dernier jour ». */
export function daysLeftLabel(event: StepEvent, today: string): string {
  const left = daysLeft(event, today);
  return left <= 1 ? 'Dernier jour' : `Plus que ${left} jours`;
}

/** Heure de l'annonce d'un événement, le matin de son premier jour. */
export const EVENT_REMINDER_HOUR = 10;

/**
 * Annonce du prochain événement court, à 10 h son premier jour, s'il commence dans les deux
 * jours ; null sinon. `today` est le jour local de `now`.
 */
export function eventReminder(now: Date, today: string): Reminder | null {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const event = upcomingEvent(
    `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`,
    3
  );
  if (!event || event.start < today) return null;
  const [year, month, date] = event.start.split('-').map(Number);
  const at = new Date(year, month - 1, date, EVENT_REMINDER_HOUR);
  if (at <= now) return null;
  return {
    id: 'step-event',
    date: at,
    title: `${event.emoji} ${event.title}`,
    body: event.description,
    url: `/carte?boucle=${at.getTime()}`,
  };
}
