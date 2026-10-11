/** Titre d'article tiré d'un lien Wikipédia, ex. « Musée_Rodin » ; null si ce n'en est pas un. */
export function wikipediaTitleFromUrl(url: string | null | undefined): string | null {
  const match = url?.match(/^https:\/\/fr\.(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

const DOT = '\u2024';

/**
 * Anecdote courte : les premières phrases du résumé de l'article, sans dépasser `maxChars`.
 * Les références entre crochets et les parenthèses de prononciation sont retirées.
 */
export function shortStory(extract: string | null | undefined, maxChars = 420): string | null {
  const text = extract
    ?.replace(/\[\d+\]/g, '')
    .replace(/\s*\((?:prononcé|API)[^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;

  // Découpe en phrases sans couper « av. J.-C. », « M. » ou les initiales : leurs points sont
  // masqués le temps du découpage.
  const masked = text
    .replace(/J\.-C\./g, `J${DOT}-C${DOT}`)
    .replace(/\b(av|apr|env|cf|Mme|Mgr|Dr|St|Ste|[A-Z])\./g, `$1${DOT}`);
  const sentences = masked.match(/[^.!?]+(?:[.!?]+(?=\s+[A-ZÀ-ÖØ-Þ«"]|$)|$)/g) ?? [masked];
  let story = '';
  for (const sentence of sentences) {
    const next = `${story} ${sentence.trim()}`.trim();
    if (story && next.length > maxChars) break;
    story = next;
  }
  story = story.replaceAll(DOT, '.');
  return story.length <= maxChars ? story : `${story.slice(0, maxChars - 1).trimEnd()}…`;
}

/** Largeur de la photo affichée en grand : assez nette pour zoomer, sans charger l'original. */
const LARGE_IMAGE_WIDTH = 1280;

export type PoiImage = {
  /** Vignette (environ 320 px) pour la petite photo de la fiche. */
  thumbnail: string;
  /** Version en grand, pour l'agrandir au doigt. */
  large: string;
  /** Largeur sur hauteur. */
  aspectRatio: number;
};

type SummaryImage = { source?: string; width?: number; height?: number };

/**
 * Photo d'un lieu tirée du résumé Wikipédia (`thumbnail` et `originalimage`) ; null sans
 * photo. La version en grand est une miniature Wikimedia de 1 280 px quand l'original est
 * plus large, pour ne pas télécharger une photo de plusieurs mégaoctets.
 */
export function poiImage(
  summary: { thumbnail?: SummaryImage; originalimage?: SummaryImage } | null | undefined
): PoiImage | null {
  const thumbnail = summary?.thumbnail;
  if (!thumbnail?.source || !thumbnail.width || !thumbnail.height) return null;
  const original = summary?.originalimage;
  let large = original?.source ?? thumbnail.source;
  if (
    original?.width &&
    original.width > LARGE_IMAGE_WIDTH &&
    /\/\d+px-[^/]+$/.test(thumbnail.source)
  ) {
    large = thumbnail.source.replace(/\/\d+px-([^/]+)$/, `/${LARGE_IMAGE_WIDTH}px-$1`);
  }
  return { thumbnail: thumbnail.source, large, aspectRatio: thumbnail.width / thumbnail.height };
}
