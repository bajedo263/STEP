/** Saisons de Conquête : une par mois civil, toutes les cases repartent de zéro le 1er. */

import type { FriendRow } from './friends.ts';

/** Ma saison, telle que renvoyée par la fonction my_conquest_season. */
export type SeasonRow = {
  season_start: string;
  season_end: string;
  cells: number;
  /** Mon rang parmi tous les conquérants, null tant que je n'ai pas de case. */
  rank: number | null;
  players: number;
  last_season_start: string;
  last_cells: number | null;
  last_rank: number | null;
  last_players: number | null;
};

const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'Europe/Paris' });
const MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

/** « Saison d'octobre », « Saison d'août », « Saison de mars ». */
export function seasonName(start: Date, withYear = false): string {
  const month = (withYear ? MONTH_YEAR : MONTH).format(start);
  return /^[aeiouéè]/i.test(month) ? `Saison d’${month}` : `Saison de ${month}`;
}

const DAY = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Paris',
});

/** « jusqu'au 31 octobre », ou « dernier jour aujourd'hui ». */
export function seasonEndLabel(end: Date, now: Date): string {
  const lastDay = DAY.format(new Date(end.getTime() - 1));
  return lastDay === DAY.format(now) ? 'dernier jour aujourd’hui' : `jusqu’au ${lastDay}`;
}

/** « 1er », « 2e ». */
export const ordinal = (rank: number) => (rank === 1 ? '1er' : `${rank}e`);

/** Résumé de mon rang : « 2e sur 15 conquérants ». */
export function rankLabel(rank: number | null, players: number): string {
  if (!rank)
    return players > 0
      ? `${players} conquérant${players > 1 ? 's' : ''} en lice`
      : 'Personne n’a encore de case';
  return `${ordinal(rank)} sur ${players} conquérant${players > 1 ? 's' : ''}`;
}

export type SeasonEntry = { id: string; name: string; cells: number; isMe: boolean; rank: number };

/** Classement de la saison entre amis : les cases détenues en ce moment. */
export function seasonRanking(
  friends: FriendRow[],
  me: { id: string; name: string; cells: number }
): SeasonEntry[] {
  const entries = [
    { ...me, isMe: true },
    ...friends
      .filter((friend) => friend.status === 'friend')
      .map((friend) => ({
        id: friend.friend_id,
        name: friend.username ?? 'Marcheur',
        cells: friend.cells ?? 0,
        isMe: false,
      })),
  ].sort(
    (a, b) => b.cells - a.cells || Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name)
  );
  return entries.map((entry) => ({
    ...entry,
    rank: entries.findIndex((other) => other.cells === entry.cells) + 1,
  }));
}
