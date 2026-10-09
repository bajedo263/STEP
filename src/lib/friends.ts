/** Un ami ou une demande en cours, tel que renvoyé par la fonction my_friends. */
export type FriendRow = {
  friend_id: string;
  username: string | null;
  status: 'friend' | 'incoming' | 'outgoing';
  /** Pas du jour, pour les amis confirmés seulement. */
  steps_today: number | null;
  /** Cases conquises en ce moment, pour les amis confirmés seulement. */
  cells: number | null;
};

export type RankingEntry = {
  id: string;
  name: string;
  steps: number;
  cells: number | null;
  isMe: boolean;
  rank: number;
};

export type FriendRequestResult = 'sent' | 'accepted' | 'already' | 'self' | 'not_found';

/** Classement du jour : moi et mes amis confirmés, du plus grand nombre de pas au plus petit. */
export function dailyRanking(
  friends: FriendRow[],
  me: { id: string; name: string; steps: number; cells: number | null }
): RankingEntry[] {
  const entries = [
    { ...me, isMe: true },
    ...friends
      .filter((friend) => friend.status === 'friend')
      .map((friend) => ({
        id: friend.friend_id,
        name: friend.username ?? 'Marcheur',
        steps: friend.steps_today ?? 0,
        cells: friend.cells,
        isMe: false,
      })),
  ].sort(
    (a, b) => b.steps - a.steps || Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name)
  );

  // Ex æquo : même rang.
  return entries.map((entry) => ({
    ...entry,
    rank: entries.findIndex((other) => other.steps === entry.steps) + 1,
  }));
}

/** Message affiché après une demande d'ami. */
export function friendRequestMessage(result: FriendRequestResult, username: string): string {
  switch (result) {
    case 'sent':
      return `Demande envoyée à ${username}. Vous serez amis dès qu’il ou elle l’acceptera.`;
    case 'accepted':
      return `${username} vous avait déjà invité : vous êtes maintenant amis !`;
    case 'already':
      return `Vous êtes déjà amis avec ${username}, ou une demande est en cours.`;
    case 'self':
      return 'C’est votre propre pseudo.';
    case 'not_found':
      return `Aucun marcheur avec le pseudo « ${username} ».`;
  }
}
