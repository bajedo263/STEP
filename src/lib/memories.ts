/**
 * Souvenirs : les anniversaires d'un lieu découvert ou d'une belle marche (« il y a un mois,
 * vous découvriez l'église Saint-Eustache »), et le bilan depuis l'inscription.
 */

export type VisitRow = { visited_at: string; name: string };
export type WalkRow = { started_at: string; distance_m: number | null };

export type Memory = {
  /** « Il y a un mois ». */
  when: string;
  text: string;
  kind: 'place' | 'walk';
};

/** Anniversaires fêtés : une semaine, puis 1, 3 et 6 mois, puis chaque année. */
const MONTH_OFFSETS = [1, 3, 6];
/** Une marche n'est un souvenir qu'à partir de 2 km. */
const MEMORABLE_WALK_M = 2000;

const pad = (value: number) => String(value).padStart(2, '0');
const localDay = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Le même jour, `months` mois plus tôt ; null si ce jour n'existe pas (31 avril). */
function monthsAgo(today: Date, months: number): string | null {
  const date = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
  return date.getDate() === today.getDate() ? localDay(date) : null;
}

function anniversaries(today: Date): { day: string; when: string }[] {
  const week = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
  const list = [{ day: localDay(week), when: 'Il y a une semaine' }];
  for (const months of MONTH_OFFSETS) {
    const day = monthsAgo(today, months);
    if (day) list.push({ day, when: months === 1 ? 'Il y a un mois' : `Il y a ${months} mois` });
  }
  for (let years = 1; years <= 5; years += 1) {
    const day = monthsAgo(today, years * 12);
    if (day) list.push({ day, when: years === 1 ? 'Il y a un an' : `Il y a ${years} ans` });
  }
  return list;
}

const formatKm = (meters: number) =>
  (meters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/** Souvenirs du jour, les plus anciens d'abord : ce sont les plus marquants. */
export function memoriesFor(today: Date, visits: VisitRow[], walks: WalkRow[]): Memory[] {
  const memories: Memory[] = [];
  for (const { day, when } of anniversaries(today).reverse()) {
    const places = visits.filter((visit) => localDay(new Date(visit.visited_at)) === day);
    if (places.length > 0) {
      const [first] = places;
      const others = places.length - 1;
      memories.push({
        when,
        kind: 'place',
        text:
          others > 0
            ? `vous découvriez ${first.name} et ${others} autre${others > 1 ? 's' : ''} lieu${others > 1 ? 'x' : ''}.`
            : `vous découvriez ${first.name}.`,
      });
      continue;
    }
    const longest = Math.max(
      0,
      ...walks
        .filter((walk) => localDay(new Date(walk.started_at)) === day)
        .map((walk) => walk.distance_m ?? 0)
    );
    if (longest >= MEMORABLE_WALK_M) {
      memories.push({
        when,
        kind: 'walk',
        text: `vous marchiez ${formatKm(longest)} km d’une traite.`,
      });
    }
  }
  return memories;
}

/** Visites regroupées par mois, le plus récent d'abord : « octobre 2026 », lieux. */
export function placesByMonth(visits: VisitRow[]): { month: string; names: string[] }[] {
  const groups = new Map<string, { label: string; names: string[] }>();
  const sorted = [...visits].sort((a, b) => b.visited_at.localeCompare(a.visited_at));
  for (const visit of sorted) {
    const date = new Date(visit.visited_at);
    const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
    const label = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const group = groups.get(key) ?? { label, names: [] };
    group.names.push(visit.name);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ label, names }) => ({ month: label, names }));
}
