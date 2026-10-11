import { useEffect, useState } from 'react';

import { poiImage, shortStory, wikipediaTitleFromUrl, type PoiImage } from '@/lib/poi-story';

type Summary = { text: string | null; image: PoiImage | null };
type Story = { status: 'loading'; image: null } | ({ status: 'ready' } & Summary);

const EMPTY: Summary = { text: null, image: null };

// Les anecdotes déjà lues restent en mémoire le temps de la session.
const cache = new Map<string, Summary>();

/** Anecdote d'un lieu et sa photo : les premières lignes de son article Wikipédia. */
export function usePoiStory(wikipediaUrl: string | null | undefined): Story {
  const title = wikipediaTitleFromUrl(wikipediaUrl);
  const [loaded, setLoaded] = useState<({ title: string } & Summary) | null>(null);

  useEffect(() => {
    if (!title || cache.has(title)) return;
    let cancelled = false;
    fetch(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      headers: { 'Api-User-Agent': 'STEP/1.0 (https://github.com/bajedo263/step)' },
    })
      .then((response) => (response.ok ? response.json() : null))
      // Une page d'homonymie ne raconte rien du lieu.
      .then(
        (json: ({ type?: string; extract?: string } & Parameters<typeof poiImage>[0]) | null) =>
          json?.type === 'standard'
            ? { text: shortStory(json.extract), image: poiImage(json) }
            : EMPTY
      )
      .catch(() => EMPTY)
      .then((summary) => {
        cache.set(title, summary);
        if (!cancelled) setLoaded({ title, ...summary });
      });
    return () => {
      cancelled = true;
    };
  }, [title]);

  if (!title) return { status: 'ready', ...EMPTY };
  const cached = cache.get(title);
  if (cached) return { status: 'ready', ...cached };
  if (loaded?.title === title) return { status: 'ready', text: loaded.text, image: loaded.image };
  return { status: 'loading', image: null };
}
