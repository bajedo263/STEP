import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import type { Cell, ConquestCell, cellRangeOf } from '@/lib/conquest';
import type { SeasonRow } from '@/lib/season';
import { supabase } from '@/lib/supabase';

type CellRange = NonNullable<ReturnType<typeof cellRangeOf>>;

/** Cases en cours dans la zone affichée (les miennes et celles des autres). */
export function useConquestCells(range: CellRange | null): ConquestCell[] {
  const key = range ? `${range.minX}/${range.minY}/${range.maxX}/${range.maxY}` : null;
  const [loaded, setLoaded] = useState<{ key: string; cells: ConquestCell[] } | null>(null);

  useEffect(() => {
    if (!key || !range || !supabase) return;
    let cancelled = false;
    supabase
      .rpc('conquest_cells_in_box', {
        p_min_x: range.minX,
        p_min_y: range.minY,
        p_max_x: range.maxX,
        p_max_y: range.maxY,
      })
      .then(({ data, error }) => {
        if (!cancelled && !error) setLoaded({ key, cells: (data ?? []) as ConquestCell[] });
      });
    return () => {
      cancelled = true;
    };
    // La plage est entièrement décrite par sa clé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // On garde les cases déjà affichées pendant le chargement de la zone suivante.
  return loaded?.cells ?? [];
}

/** Nombre de cases à moi en ce moment ; null tant qu'il n'est pas connu. */
export function useMyConquestCount(): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.rpc('my_conquest_count').then(({ data, error }) => {
      if (!cancelled && !error && typeof data === 'number') setCount(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return count;
}

/** Cases qu'on m'a prises et que je n'ai pas reprises, et mes cases bientôt libérées. */
export type TerritoryAlerts = { lost: Cell[]; expiring: Cell[] };

/**
 * Alertes de territoire, rechargées à chaque retour sur l'écran ; null tant qu'elles ne sont pas
 * connues ou si la migration « territoire vivant » n'est pas encore appliquée.
 */
export function useTerritoryAlerts(): TerritoryAlerts | null {
  const [alerts, setAlerts] = useState<TerritoryAlerts | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!supabase) return;
      let cancelled = false;
      supabase.rpc('my_territory_alerts').then(({ data, error }) => {
        if (cancelled || error) return;
        const rows = (data ?? []) as { kind: 'lost' | 'expiring'; x: number; y: number }[];
        setAlerts({
          lost: rows.filter((row) => row.kind === 'lost').map(({ x, y }) => ({ x, y })),
          expiring: rows.filter((row) => row.kind === 'expiring').map(({ x, y }) => ({ x, y })),
        });
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );
  return alerts;
}

/**
 * Saison de Conquête en cours, mon rang et la saison passée, relus à chaque retour sur
 * l'écran ; null tant qu'ils ne sont pas connus ou si la migration Saisons n'est pas appliquée.
 */
export function useConquestSeason(): SeasonRow | null {
  const [season, setSeason] = useState<SeasonRow | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!supabase) return;
      let cancelled = false;
      supabase.rpc('my_conquest_season').then(({ data, error }) => {
        const row = (data as SeasonRow[] | null)?.[0];
        if (!cancelled && !error && row) setSeason(row);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );
  return season;
}
