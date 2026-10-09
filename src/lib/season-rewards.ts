import { LEAGUE_TIERS } from './league.ts';
import { ordinal, seasonName } from './season.ts';

/** Récompenses cosmétiques gagnées en fin de saison de Conquête et en ligue. */

export type SeasonResult = {
  season_start: string;
  cells: number;
  rank: number;
  players: number;
};

export type TrophyLevel = 'gold' | 'silver' | 'bronze' | 'elite' | 'finisher';

export type Trophy = {
  id: string;
  level: TrophyLevel;
  emoji: string;
  title: string;
  description: string;
};

/** Couleur du cadre d'avatar pour chaque niveau. */
export const TROPHY_COLORS: Record<TrophyLevel, string> = {
  gold: '#E2B007',
  silver: '#9AA4AF',
  bronze: '#C0703A',
  elite: '#7C5CFF',
  finisher: '#2E9E6A',
};

const LEVEL_ORDER: TrophyLevel[] = ['gold', 'silver', 'bronze', 'elite', 'finisher'];

/** Niveau d'un classement de saison : podium, 10 % de tête, ou saison terminée avec des cases. */
export function trophyLevel(rank: number, players: number): TrophyLevel {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  if (rank <= Math.ceil(players * 0.1)) return 'elite';
  return 'finisher';
}

const LEVEL_LABEL: Record<TrophyLevel, { emoji: string; title: string }> = {
  gold: { emoji: '🥇', title: 'Champion' },
  silver: { emoji: '🥈', title: 'Vice-champion' },
  bronze: { emoji: '🥉', title: 'Sur le podium' },
  elite: { emoji: '🎖️', title: 'Élite' },
  finisher: { emoji: '🚩', title: 'Conquérant' },
};

/** Trophées des saisons terminées, de la plus récente à la plus ancienne. */
export function seasonTrophies(results: SeasonResult[]): Trophy[] {
  return [...results]
    .filter((result) => result.cells > 0)
    .sort((a, b) => b.season_start.localeCompare(a.season_start))
    .map((result) => {
      const level = trophyLevel(result.rank, result.players);
      const { emoji, title } = LEVEL_LABEL[level];
      return {
        id: `saison-${result.season_start}`,
        level,
        emoji,
        title: `${title} · ${seasonName(new Date(result.season_start), true)}`,
        description: `${ordinal(result.rank)} sur ${result.players}, avec ${result.cells} case${result.cells > 1 ? 's' : ''}.`,
      };
    });
}

/** Trophée de la meilleure ligue atteinte, dès l'Argent. */
export function leagueTrophy(bestTier: number | null): Trophy | null {
  if (bestTier === null || bestTier < 1) return null;
  const tier = LEAGUE_TIERS[Math.min(LEAGUE_TIERS.length - 1, bestTier)];
  return {
    id: `ligue-${bestTier}`,
    level: bestTier >= 3 ? 'elite' : 'finisher',
    emoji: tier.emoji,
    title: `Ligue ${tier.name}`,
    description: 'Meilleure ligue atteinte.',
  };
}

/**
 * Cadre d'avatar : le meilleur trophée de saison des trois dernières saisons terminées, pour
 * qu'il faille le défendre.
 */
export function avatarFrame(results: SeasonResult[]): TrophyLevel | null {
  const recent = [...results]
    .filter((result) => result.cells > 0)
    .sort((a, b) => b.season_start.localeCompare(a.season_start))
    .slice(0, 3)
    .map((result) => trophyLevel(result.rank, result.players));
  if (recent.length === 0) return null;
  return recent.sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b))[0];
}
