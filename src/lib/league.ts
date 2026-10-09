/** Ligues hebdomadaires : niveaux, zones de montée et de descente, messages. */

export type LeagueRow = {
  user_id: string;
  username: string | null;
  steps: number;
  rank: number;
  is_me: boolean;
  tier: number;
  players: number;
  promote: number;
  demote: number;
  week_start: string;
  previous_tier: number | null;
};

export const LEAGUE_TIERS = [
  { name: 'Bronze', emoji: '🥉' },
  { name: 'Argent', emoji: '🥈' },
  { name: 'Or', emoji: '🥇' },
  { name: 'Platine', emoji: '💠' },
  { name: 'Diamant', emoji: '💎' },
] as const;

export const TOP_TIER = LEAGUE_TIERS.length - 1;

export type LeagueZone = 'promote' | 'safe' | 'demote';

export function tierName(tier: number): string {
  const { name, emoji } = LEAGUE_TIERS[Math.min(TOP_TIER, Math.max(0, tier))];
  return `${emoji} Ligue ${name}`;
}

/** Zone d'une place : montée (sauf au Diamant), descente (sauf au Bronze), ou maintien. */
export function leagueZone(
  row: Pick<LeagueRow, 'rank' | 'players' | 'promote' | 'demote' | 'tier' | 'steps'>
): LeagueZone {
  if (row.tier < TOP_TIER && row.steps > 0 && row.rank <= row.promote) return 'promote';
  if (row.tier > 0 && (row.steps === 0 || row.rank > row.players - row.demote)) return 'demote';
  return 'safe';
}

/** Ce que la place actuelle donnerait si la semaine finissait maintenant. */
export function leagueStatusLabel(me: LeagueRow): string {
  const zone = leagueZone(me);
  const next = LEAGUE_TIERS[Math.min(TOP_TIER, me.tier + 1)].name;
  const previous = LEAGUE_TIERS[Math.max(0, me.tier - 1)].name;
  if (me.players === 1) {
    return me.steps > 0
      ? `Personne d’autre dans votre groupe pour l’instant : vous montez en ${next} dimanche soir.`
      : 'Personne d’autre dans votre groupe pour l’instant. Marchez pour monter de ligue dimanche soir.';
  }
  if (zone === 'promote') return `Zone de montée : vous passeriez en ${next} dimanche soir.`;
  if (zone === 'demote') {
    return me.steps === 0
      ? `Sans un pas cette semaine, vous redescendez en ${previous}.`
      : `Zone de descente : vous redescendriez en ${previous}. Encore un effort !`;
  }
  if (me.tier === TOP_TIER) return 'Vous êtes dans la meilleure ligue. Tenez votre rang !';
  return `Les ${me.promote} premiers montent en ${next} dimanche soir.`;
}

/** Annonce du changement de ligue depuis la semaine passée, null s'il n'y en a pas. */
export function leagueChangeLabel(me: LeagueRow): string | null {
  if (me.previous_tier === null || me.previous_tier === me.tier) return null;
  const name = LEAGUE_TIERS[me.tier].name;
  return me.tier > me.previous_tier
    ? `Bravo, vous passez en ${name} !`
    : `Retour en ${name} cette semaine. Remontez dès dimanche !`;
}

/** Pas qu'il manque pour doubler le marcheur juste devant, null en tête. */
export function stepsToOvertake(rows: LeagueRow[]): number | null {
  const me = rows.find((row) => row.is_me);
  if (!me || me.rank === 1) return null;
  const ahead = rows.find((row) => row.rank === me.rank - 1);
  return ahead ? ahead.steps - me.steps + 1 : null;
}
