import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { VisitRow, WalkRow } from '@/lib/memories';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export type MemoryData = { visits: VisitRow[]; walks: WalkRow[] };

/** Lieux découverts et trajets depuis l'inscription, pour les souvenirs. */
export function useMemoryData(): MemoryData | null {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [data, setData] = useState<MemoryData | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!supabase || !userId) return;
      const client = supabase;
      let cancelled = false;
      Promise.all([
        client
          .from('poi_visits')
          .select('visited_at, pois(name)')
          .eq('user_id', userId)
          .order('visited_at', { ascending: false })
          .limit(2000)
          .returns<{ visited_at: string; pois: { name: string } | null }[]>(),
        client
          .from('walks')
          .select('started_at, distance_m')
          .eq('user_id', userId)
          .order('started_at', { ascending: false })
          .limit(2000)
          .returns<WalkRow[]>(),
      ])
        .then(([visits, walks]) => {
          if (cancelled || visits.error || walks.error) return;
          setData({
            visits: (visits.data ?? []).flatMap((row) =>
              row.pois ? [{ visited_at: row.visited_at, name: row.pois.name }] : []
            ),
            walks: walks.data ?? [],
          });
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [userId])
  );

  return data;
}
