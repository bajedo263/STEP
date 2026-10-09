import { useEffect, useState } from 'react';

import { shortStory, wikipediaTitleFromUrl } from '@/lib/poi-story';

type Story = { status: 'loading' } | { status: 'ready'; text: string | null };

// Les anecdotes déjà lues restent en mémoire le temps de la session.
const cache = new Map<string, string | null>();

/** Anecdote d'un lieu : les premières lignes de son article Wikipédia. */
export function usePoiStory(wikipediaUrl: string | null | undefined): Story {
  const title = wikipediaTitleFromUrl(wikipediaUrl);
  const [loaded, setLoaded] = useState<{ title: string; text: string | null } | null>(null);

  useEffect(() => {
    if (!title || cache.has(title)) return;
    let cancelled = false;
    fetch(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      headers: { 'Api-User-Agent': 'STEP/1.0 (https://github.com/bajedo263/step)' },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { extract?: string } | null) => shortStory(json?.extract))
      .catch(() => null)
      .then((text) => {
        cache.set(title, text);
        if (!cancelled) setLoaded({ title, text });
      });
    return () => {
      cancelled = true;
    };
  }, [title]);

  if (!title) return { status: 'ready', text: null };
  if (cache.has(title)) return { status: 'ready', text: cache.get(title) ?? null };
  if (loaded?.title === title) return { status: 'ready', text: loaded.text };
  return { status: 'loading' };
}
