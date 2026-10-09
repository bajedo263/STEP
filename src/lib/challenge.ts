/** Défi du jour : une mission courte, différente chaque jour, vérifiée avec les données de l'app. */

export type ChallengeKind =
  | 'extra_steps'
  | 'long_walk'
  | 'loop'
  | 'destination'
  | 'new_place'
  | 'cells';

/** Ce que l'utilisateur a fait aujourd'hui, de quoi vérifier tous les défis. */
export type TodayActivity = {
  steps: number;
  goal: number;
  /** Trajets enregistrés aujourd'hui. */
  walks: { mode: 'loop' | 'destination' | 'free'; distance_m: number | null }[];
  /** Lieux découverts pour la première fois aujourd'hui. */
  newPlaces: number;
  /** Cases prises aujourd'hui. */
  cells: number;
};

export type Challenge = {
  kind: ChallengeKind;
  title: string;
  description: string;
  progress: number;
  target: number;
  done: boolean;
  /** Libellé de la quantité suivie : « 1,2 / 3 km »… */
  progressLabel: string;
};

export const CHALLENGE_KINDS: ChallengeKind[] = [
  'extra_steps',
  'long_walk',
  'loop',
  'destination',
  'new_place',
  'cells',
];

const EXTRA_STEPS = 2000;
const LONG_WALK_M = 3000;
const LOOP_MIN_M = 1000;
const DESTINATION_MIN_M = 1000;
const CELLS_TARGET = 10;

/** Petit hachage stable d'une chaîne (FNV-1a), pour tirer le même défi toute la journée. */
function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Jour de départ du tirage : chaque jour se déduit du précédent, sans jamais le répéter. */
const EPOCH = Date.UTC(2026, 0, 1);

/** Défi du jour d'un utilisateur : le même toute la journée, jamais deux jours de suite. */
export function challengeKindFor(userId: string, day: string): ChallengeKind {
  const [year, month, date] = day.split('-').map(Number);
  const days = Math.max(0, Math.round((Date.UTC(year, month - 1, date) - EPOCH) / 86_400_000));
  const count = CHALLENGE_KINDS.length;
  let index = hash(userId) % count;
  for (let step = 1; step <= days; step += 1) {
    // On avance de 1 à count - 1 crans : jamais le même défi que la veille.
    index = (index + 1 + (hash(`${userId}|${step}`) % (count - 1))) % count;
  }
  return CHALLENGE_KINDS[index];
}

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');
const formatKm = (meters: number) =>
  (meters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/** Le défi, son avancement et s'il est réussi. */
export function evaluateChallenge(kind: ChallengeKind, activity: TodayActivity): Challenge {
  const longest = Math.max(0, ...activity.walks.map((walk) => walk.distance_m ?? 0));
  const longestOf = (mode: 'loop' | 'destination') =>
    Math.max(
      0,
      ...activity.walks.filter((walk) => walk.mode === mode).map((walk) => walk.distance_m ?? 0)
    );

  const make = (
    title: string,
    description: string,
    progress: number,
    target: number,
    progressLabel: string
  ): Challenge => ({
    kind,
    title,
    description,
    progress: Math.min(progress, target),
    target,
    done: progress >= target,
    progressLabel,
  });

  switch (kind) {
    case 'extra_steps': {
      const target = activity.goal + EXTRA_STEPS;
      return make(
        'Bonus de pas',
        `Dépassez votre objectif de ${formatNumber(EXTRA_STEPS)} pas aujourd’hui.`,
        activity.steps,
        target,
        `${formatNumber(Math.min(activity.steps, target))} / ${formatNumber(target)} pas`
      );
    }
    case 'long_walk':
      return make(
        'Grande marche',
        `Faites un trajet d’au moins ${formatKm(LONG_WALK_M)} km d’une traite.`,
        longest,
        LONG_WALK_M,
        `${formatKm(Math.min(longest, LONG_WALK_M))} / ${formatKm(LONG_WALK_M)} km`
      );
    case 'loop': {
      const best = longestOf('loop');
      return make(
        'Boucle du jour',
        `Bouclez une boucle proposée par STEP d’au moins ${formatKm(LOOP_MIN_M)} km.`,
        best >= LOOP_MIN_M ? 1 : 0,
        1,
        best >= LOOP_MIN_M ? 'Boucle faite' : 'Aucune boucle pour l’instant'
      );
    }
    case 'destination': {
      const best = longestOf('destination');
      return make(
        'Cap sur une destination',
        `Rejoignez à pied un lieu choisi en mode Destination, à au moins ${formatKm(DESTINATION_MIN_M)} km.`,
        best >= DESTINATION_MIN_M ? 1 : 0,
        1,
        best >= DESTINATION_MIN_M ? 'Destination atteinte' : 'Pas encore de destination'
      );
    }
    case 'new_place':
      return make(
        'Explorateur',
        'Passez devant un lieu remarquable que vous n’avez jamais vu.',
        activity.newPlaces,
        1,
        activity.newPlaces > 0 ? 'Lieu découvert' : 'Aucun nouveau lieu pour l’instant'
      );
    case 'cells':
      return make(
        'Conquérant',
        `Prenez ${CELLS_TARGET} cases aujourd’hui (la Conquête s’active à 10 000 pas).`,
        activity.cells,
        CELLS_TARGET,
        `${Math.min(activity.cells, CELLS_TARGET)} / ${CELLS_TARGET} cases`
      );
  }
}
