import { useEffect, useMemo, useState } from 'react';

import type { LatLng } from '@/lib/loop';
import { mergePois, zoneKeyOf, type RoutePoi } from '@/lib/pois';
import { supabase } from '@/lib/supabase';

/** Points d'intérêt le long d'un tracé ; liste vide tant qu'ils ne sont pas arrivés. */
export function useRoutePois(path: LatLng[] | null): RoutePoi[] {
  const [result, setResult] = useState<{ path: LatLng[]; pois: RoutePoi[] } | null>(null);

  useEffect(() => {
    if (!path || !supabase) return;
    let cancelled = false;
    supabase.functions
      .invoke<{ pois: RoutePoi[] }>('pois', { body: { path } })
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

/**
 * Tous les lieux du quartier où l'on se trouve et des 8 voisins, rechargés quand on change
 * de quartier : c'est ce qui permet de découvrir un lieu même hors du trajet prévu.
 */
export function useAreaPois(position: LatLng | null | undefined): RoutePoi[] {
  const key = position ? zoneKeyOf(position) : null;
  const [areas, setAreas] = useState<Record<string, RoutePoi[]>>({});

  useEffect(() => {
    if (!key || !position || !supabase) return;
    let cancelled = false;
    supabase.functions
      .invoke<{ pois: RoutePoi[] }>('pois', { body: { around: position } })
      .then(({ data }) => {
        if (!cancelled && data) setAreas((current) => ({ ...current, [key]: data.pois }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Seul le changement de quartier relance le chargement, pas chaque pas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useMemo(() => mergePois(...Object.values(areas)), [areas]);
}
