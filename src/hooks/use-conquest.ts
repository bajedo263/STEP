import { useEffect, useState } from 'react';

import type { ConquestCell, cellRangeOf } from '@/lib/conquest';
import { supabase } from '@/lib/supabase';

type CellRange = NonNullable<ReturnType<typeof cellRangeOf>>;

/** Cases prises aujourd'hui dans la zone affichée (les miennes et celles des autres). */
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

/** Nombre de cases à moi aujourd'hui ; null tant qu'il n'est pas connu. */
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
