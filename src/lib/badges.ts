/** Badges : des paliers débloqués par la série, les défis, les lieux, la distance et la Conquête. */

/** Ce que l'utilisateur a accompli depuis toujours (ou au mieux, pour la série et les cases). */
export type BadgeStats = {
  /** Meilleure série de jours à l'objectif. */
  bestStreak: number;
  challenges: number;
  places: number;
  walkedM: number;
  /** Cases à soi en ce moment. */
  cells: number;
  friends: number;
};

export type BadgeFamily = 'streak' | 'challenges' | 'places' | 'distance' | 'cells' | 'friends';

export type Badge = {
  id: string;
  family: BadgeFamily;
  emoji: string;
  title: string;
  /** Ce qu'il faut faire, lisible même avant de le débloquer. */
  description: string;
  target: number;
  progress: number;
  unlocked: boolean;
};

type FamilyDefinition = {
  family: BadgeFamily;
  emoji: string;
  value: (stats: BadgeStats) => number;
  tiers: { target: number; title: string; description: string }[];
};

const plural = (count: number, word: string) =>
  `${count.toLocaleString('fr-FR')} ${word}${count > 1 ? 's' : ''}`;

const FAMILIES: FamilyDefinition[] = [
  {
    family: 'streak',
    emoji: '🔥',
    value: (stats) => stats.bestStreak,
    tiers: [7, 30, 100].map((target, index) => ({
      target,
      title: ['Régulier', 'Infatigable', 'Légende'][index],
      description: `${plural(target, 'jour')} d’affilée à l’objectif`,
    })),
  },
  {
    family: 'challenges',
    emoji: '🎯',
    value: (stats) => stats.challenges,
    tiers: [1, 10, 50].map((target, index) => ({
      target,
      title: ['Premier défi', 'Chasseur de défis', 'Maître des défis'][index],
      description: `${plural(target, 'défi')} du jour ${target > 1 ? 'réussis' : 'réussi'}`,
    })),
  },
  {
    family: 'places',
    emoji: '🏛️',
    value: (stats) => stats.places,
    tiers: [1, 10, 50].map((target, index) => ({
      target,
      title: ['Curieux', 'Explorateur', 'Guide de quartier'][index],
      description:
        target > 1 ? `${target} lieux remarquables découverts` : '1 lieu remarquable découvert',
    })),
  },
  {
    family: 'distance',
    emoji: '👟',
    value: (stats) => stats.walkedM / 1000,
    tiers: [10, 100, 500].map((target, index) => ({
      target,
      title: ['Promeneur', 'Randonneur', 'Globe-trotteur'][index],
      description: `${target.toLocaleString('fr-FR')} km parcourus avec STEP`,
    })),
  },
  {
    family: 'cells',
    emoji: '🚩',
    value: (stats) => stats.cells,
    tiers: [50, 250, 1000].map((target, index) => ({
      target,
      title: ['Conquérant', 'Seigneur du quartier', 'Empereur'][index],
      description: `${plural(target, 'case')} à vous en même temps`,
    })),
  },
  {
    family: 'friends',
    emoji: '🤝',
    value: (stats) => stats.friends,
    tiers: [1, 5].map((target, index) => ({
      target,
      title: ['En bonne compagnie', 'Bande de marcheurs'][index],
      description: `${plural(target, 'ami')} sur STEP`,
    })),
  },
];

/** Tous les badges, débloqués ou non, dans l'ordre d'affichage. */
export function badgesFor(stats: BadgeStats): Badge[] {
  return FAMILIES.flatMap(({ family, emoji, value, tiers }) => {
    const progress = Math.max(0, value(stats));
    return tiers.map(({ target, title, description }) => ({
      id: `${family}-${target}`,
      family,
      emoji,
      title,
      description,
      target,
      progress: Math.min(progress, target),
      unlocked: progress >= target,
    }));
  });
}

/** Par famille, le prochain badge à débloquer (le plus proche du but en premier). */
export function nextBadges(badges: Badge[]): Badge[] {
  const next = new Map<BadgeFamily, Badge>();
  for (const badge of badges) {
    if (!badge.unlocked && !next.has(badge.family)) next.set(badge.family, badge);
  }
  return [...next.values()].sort((a, b) => b.progress / b.target - a.progress / a.target);
}
