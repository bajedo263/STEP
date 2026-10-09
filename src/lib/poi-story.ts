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
