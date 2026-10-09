/**
 * Rappels intelligents : au plus un rappel par jour à l'heure choisie, utile et chiffré
 * (« encore 2 300 pas, une boucle de 20 min suffit »), plus un rappel du soir si la série est
 * en danger. Ils sont reprogrammés à chaque ouverture de l'app : sans ouverture, ils s'arrêtent
 * d'eux-mêmes au bout de quelques jours.
 */

export type Reminder = {
  id: string;
  date: Date;
  title: string;
  body: string;
  /** Écran ouvert par un appui sur la notification. */
  url: string;
};

/** Heures proposées pour le rappel du jour. */
export const REMINDER_HOURS = [12, 18, 20] as const;
export const DEFAULT_REMINDER_HOUR = 18;
/** Rappel du soir quand la série est en danger. */
export const STREAK_REMINDER_HOUR = 21;
/** Jours suivants déjà programmés, au cas où l'app ne serait pas rouverte. */
export const DAYS_AHEAD = 2;
/** Vitesse de marche pour estimer la durée d'une boucle. */
const WALK_M_PER_MIN = 80;

/** Ouvre la carte et propose une boucle ; la valeur change à chaque rappel pour être traitée une fois. */
const loopUrl = (date: Date) => `/carte?boucle=${date.getTime()}`;

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');

function at(day: Date, hour: number, offsetDays = 0): Date {
  const date = new Date(day);
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, 0, 0, 0);
  return date;
}

/** Durée de marche arrondie à 5 minutes, au moins 5 minutes. */
export function walkMinutes(remainingSteps: number, strideM: number): number {
  return Math.max(5, Math.round((remainingSteps * strideM) / WALK_M_PER_MIN / 5) * 5);
}

export function planReminders({
  now,
  hour,
  todaySteps,
  goal,
  streak,
  strideM,
  reliable = true,
}: {
  now: Date;
  /** Faux quand le décompte du jour est incomplet (Android sans Health Connect) : pas de chiffres. */
  reliable?: boolean;
  /** Heure du rappel du jour, ou null si l'utilisateur les a coupés. */
  hour: number | null;
  todaySteps: number;
  goal: number;
  /** Série en cours (jours d'affilée à l'objectif, sans aujourd'hui s'il n'est pas atteint). */
  streak: number;
  strideM: number;
}): Reminder[] {
  if (hour === null) return [];
  const reminders: Reminder[] = [];
  const remaining = Math.max(0, goal - todaySteps);

  if (remaining > 0) {
    const today = at(now, hour);
    if (today > now) {
      reminders.push({
        id: 'step-today',
        date: today,
        title: reliable
          ? `Encore ${formatNumber(remaining)} pas aujourd’hui`
          : `Objectif du jour : ${formatNumber(goal)} pas`,
        body: reliable
          ? `Une boucle d’environ ${walkMinutes(remaining, strideM)} min depuis chez vous suffit. On vous la prépare ?`
          : 'Une boucle depuis chez vous, ça vous dit ?',
        url: loopUrl(today),
      });
    }
    const evening = at(now, STREAK_REMINDER_HOUR);
    if (streak > 0 && evening > now) {
      reminders.push({
        id: 'step-streak',
        date: evening,
        title: `🔥 Votre série de ${streak} jour${streak > 1 ? 's' : ''} est en danger`,
        body: reliable
          ? `Il vous manque ${formatNumber(remaining)} pas avant minuit pour la garder.`
          : 'Atteignez l’objectif avant minuit pour la garder.',
        url: loopUrl(evening),
      });
    }
  }

  for (let offset = 1; offset <= DAYS_AHEAD; offset += 1) {
    reminders.push({
      id: `step-day-${offset}`,
      date: at(now, hour, offset),
      title: `Objectif du jour : ${formatNumber(goal)} pas`,
      body:
        streak > 0 || remaining === 0
          ? 'Votre série continue si vous l’atteignez. Une boucle depuis chez vous ?'
          : 'Une boucle depuis chez vous, ça vous dit ?',
      url: loopUrl(at(now, hour, offset)),
    });
  }
  return reminders;
}

/** Clé qui ne change que si les rappels doivent être reprogrammés (pas à chaque pas). */
export function reminderKey(reminders: Reminder[]): string {
  return reminders.map((r) => `${r.id}@${r.date.getTime()}:${r.title}`).join('|');
}
