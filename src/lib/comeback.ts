import type { Reminder } from './reminders.ts';

/**
 * Vague 1 de la rétention : la première marche guidée et la reconquête des inactifs.
 * Les rappels de retour partent 3 puis 7 jours après la dernière ouverture de l'app, avec des
 * faits concrets (série, cases) ; ils sont reprogrammés à chaque ouverture, donc ne sonnent
 * que si l'on ne revient pas.
 */

/** Longueur de la première marche guidée, en pas. */
export const FIRST_WALK_STEPS = 2_500;
/** Absence (en jours) à partir de laquelle un gel de série est offert au retour. */
export const COMEBACK_GAP_DAYS = 3;
/** Jours d'absence après lesquels part un rappel de retour. */
export const COMEBACK_DAYS = [3, 7] as const;

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');
const plural = (count: number, word: string) =>
  `${formatNumber(count)} ${word}${count > 1 ? 's' : ''}`;

/** Jours entiers entre deux dates AAAA-MM-JJ (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** Vrai si l'on revient après une absence qui mérite un gel offert. */
export function isComeback(lastOpenDay: string | null, today: string): boolean {
  return lastOpenDay !== null && daysBetween(lastOpenDay, today) >= COMEBACK_GAP_DAYS;
}

/** Distance de la première marche guidée, selon la longueur de pas. */
export function firstWalkDistance(strideM: number): number {
  return Math.round((FIRST_WALK_STEPS * strideM) / 100) * 100;
}

/**
 * Rappels de retour à J+3 et J+7, à l'heure des rappels. `cells` : cases à moi aujourd'hui ;
 * elles auront toutes expiré à J+7 (une case est gardée 7 jours), sauf si l'on revient marcher.
 */
export function comebackReminders({
  now,
  hour,
  streak,
  best,
  cells,
}: {
  now: Date;
  hour: number;
  streak: number;
  best: number;
  cells: number | null;
}): Reminder[] {
  const at = (days: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    date.setHours(hour, 0, 0, 0);
    return date;
  };
  const url = (date: Date) => `/carte?boucle=${date.getTime()}`;
  const owned = cells ?? 0;

  const three = at(3);
  const seven = at(7);
  return [
    {
      id: 'step-comeback-3',
      date: three,
      title:
        streak > 0 ? `Votre série de ${plural(streak, 'jour')} vous attend` : 'Une petite boucle ?',
      body:
        owned > 0
          ? `Vos ${plural(owned, 'case')} commencent à expirer. Revenez marcher : un gel de série vous est offert.`
          : 'Une boucle de 20 minutes suffit pour repartir. Un gel de série vous est offert à votre retour.',
      url: url(three),
    },
    {
      id: 'step-comeback-7',
      date: seven,
      title: owned > 0 ? `Vos ${plural(owned, 'case')} ont expiré` : 'Une semaine sans STEP',
      body:
        owned > 0
          ? 'Une boucle suffit pour reprendre votre territoire. Un gel de série vous attend.'
          : best > 1
            ? `Votre record est de ${plural(best, 'jour')} à l’objectif. Un gel de série vous attend pour repartir.`
            : 'Une boucle près de chez vous pour reprendre ? Un gel de série vous attend.',
      url: url(seven),
    },
  ];
}
