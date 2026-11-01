/**
 * Les mécaniques de motivation expliquées en deux phrases, derrière les « ? » de l'app.
 * Un seul endroit pour le vocabulaire : série, gel, Conquête, case, ligue, saison, duel.
 */
export const MECHANICS = {
  streak: {
    title: 'La série',
    text: 'Chaque jour où vous atteignez votre objectif prolonge votre série. Un jour raté la remet à zéro, sauf si un gel la protège : vous en gagnez un tous les 7 jours d’affilée (2 au plus).',
  },
  freeze: {
    title: 'Les gels',
    text: 'Tous les 7 jours d’affilée à l’objectif, vous gagnez un gel (2 au plus). Un jour raté utilise un gel au lieu de casser la série.',
  },
  conquest: {
    title: 'La Conquête',
    text: 'À partir de 10 000 pas dans la journée, les rues que vous parcourez deviennent vos cases sur la carte, pour 7 jours. Repassez-y pour les garder ; un autre marcheur peut vous les prendre.',
  },
  league: {
    title: 'La ligue',
    text: 'Chaque semaine, vous êtes classé aux pas dans un groupe de 30 marcheurs au plus, de votre niveau. Les premiers montent dans la ligue supérieure dimanche soir, les derniers descendent.',
  },
  season: {
    title: 'La saison de Conquête',
    text: 'Chaque mois, les marcheurs sont classés au nombre de cases détenues. Le 1er du mois, toutes les cases repartent de zéro et les meilleurs gagnent un trophée.',
  },
  duel: {
    title: 'Les duels',
    text: 'Défiez un ami sur quelques jours : celui qui fait le plus de pas sur la période gagne. Le duel commence dès que l’ami l’accepte.',
  },
} as const;

export type Mechanic = keyof typeof MECHANICS;
