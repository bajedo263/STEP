import { useEffect, useState } from 'react';

import type { LatLng } from '@/lib/loop';
import type { Poi } from '@/lib/pois';
import { supabase } from '@/lib/supabase';

/** Points d'intérêt le long d'un tracé ; liste vide tant qu'ils ne sont pas arrivés. */
export function useRoutePois(path: LatLng[] | null): Poi[] {
  const [result, setResult] = useState<{ path: LatLng[]; pois: Poi[] } | null>(null);

  useEffect(() => {
    if (!path || !supabase) return;
    let cancelled = false;
    supabase.functions
      .invoke<{ pois: Poi[] }>('pois', { body: { path } })
      .then(({ data }) => {
        if (!cancelled) setResult({ path, pois: data?.pois ?? [] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path]);

  // Les points d'un ancien tracé ne s'affichent pas sur le nouveau.
  return result && result.path === path ? result.pois : [];
}
