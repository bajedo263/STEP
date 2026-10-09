import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { LeagueRow } from '@/lib/league';
import { supabase } from '@/lib/supabase';

/**
 * Ligue de la semaine (l'appel inscrit l'utilisateur s'il ne l'est pas encore) ; null tant
 * qu'elle n'est pas chargée ou si la migration Ligues n'est pas appliquée.
 */
export function useLeague(): LeagueRow[] | null {
  const [rows, setRows] = useState<LeagueRow[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!supabase) return;
      let cancelled = false;
      supabase.rpc('my_league').then(
        ({ data, error }) => {
          const list = data as LeagueRow[] | null;
          if (!cancelled && !error && list && list.length > 0) setRows(list);
        },
        () => {}
      );
      return () => {
        cancelled = true;
      };
    }, [])
  );
  return rows;
}
