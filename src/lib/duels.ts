/** Duels entre amis et encouragements : états, messages et invitation. */

export type DuelRow = {
  id: string;
  other_id: string;
  other_name: string | null;
  /** Vrai si c'est l'ami qui a lancé le défi. */
  incoming: boolean;
  status: 'pending' | 'active';
  days: number;
  /** Premier jour du duel (AAAA-MM-JJ), une fois accepté. */
  start_day: string | null;
  my_steps: number;
  their_steps: number;
};

export type DuelPhase = 'pending' | 'running' | 'won' | 'lost' | 'tie';

/** Durées proposées pour un duel, en jours. */
export const DUEL_DAYS = [3, 7] as const;

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(year, month - 1, date + days);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

/** Dernier jour du duel (AAAA-MM-JJ). */
export function duelLastDay(duel: DuelRow): string | null {
  return duel.start_day ? addDays(duel.start_day, duel.days - 1) : null;
}

export function duelPhase(duel: DuelRow, today: string): DuelPhase {
  const last = duelLastDay(duel);
  if (duel.status === 'pending' || !last) return 'pending';
  if (today <= last) return 'running';
  if (duel.my_steps === duel.their_steps) return 'tie';
  return duel.my_steps > duel.their_steps ? 'won' : 'lost';
}

/** Jours restants, aujourd'hui compris. */
export function duelDaysLeft(duel: DuelRow, today: string): number {
  const last = duelLastDay(duel);
  if (!last) return duel.days;
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = last.split('-').map(Number);
  return Math.max(
    0,
    Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000) + 1
  );
}

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');
const daysLabel = (count: number) => `${count} jour${count > 1 ? 's' : ''}`;

/** Une ligne qui résume le duel du point de vue de l'utilisateur. */
export function duelLabel(duel: DuelRow, today: string): string {
  const name = duel.other_name ?? 'Votre ami';
  switch (duelPhase(duel, today)) {
    case 'pending':
      return duel.incoming
        ? `${name} vous défie : le plus de pas en ${daysLabel(duel.days)}.`
        : `Défi envoyé à ${name}, en attente de sa réponse.`;
    case 'running': {
      const gap = duel.my_steps - duel.their_steps;
      const left = duelDaysLeft(duel, today);
      const lead =
        gap > 0
          ? `vous menez de ${formatNumber(gap)} pas`
          : gap < 0
            ? `${name} mène de ${formatNumber(-gap)} pas`
            : 'égalité parfaite';
      return `${left > 1 ? `Encore ${daysLabel(left)}` : 'Dernier jour'} : ${lead}.`;
    }
    case 'won':
      return `Victoire contre ${name}, ${formatNumber(duel.my_steps)} pas à ${formatNumber(duel.their_steps)} !`;
    case 'lost':
      return `${name} l’emporte, ${formatNumber(duel.their_steps)} pas à ${formatNumber(duel.my_steps)}. Revanche ?`;
    case 'tie':
      return `Égalité avec ${name} : ${formatNumber(duel.my_steps)} pas chacun.`;
  }
}

/** « Paul vous encourage », « Paul et Marie vous encouragent », « Paul, Marie et 2 autres… ». */
export function cheersLabel(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} vous encourage 👏`;
  if (names.length === 2) return `${names[0]} et ${names[1]} vous encouragent 👏`;
  const others = names.length - 2;
  return `${names[0]}, ${names[1]} et ${others} autre${others > 1 ? 's' : ''} vous encouragent 👏`;
}

/** Message d'invitation, avec le lien d'ajout quand l'app en a un stable. */
export function inviteMessage(username: string, link: string | null): string {
  const base = `Marche avec moi sur STEP ! Ajoute-moi en ami avec mon pseudo : ${username}`;
  return link ? `${base}\n${link}` : base;
}
