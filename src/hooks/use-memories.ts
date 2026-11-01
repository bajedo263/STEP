import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { VisitRow, WalkRow } from '@/lib/memories';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export type MemoryData = { visits: VisitRow[]; walks: WalkRow[] };

/** Lieux découverts et trajets depuis l'inscription, pour les souvenirs. */
export function useMemoryData(): MemoryData | null {
  return useMemoryState().data;
}

/** Même chose, avec l'échec du chargement et de quoi réessayer. */
export function useMemoryState(): { data: MemoryData | null; failed: boolean; retry: () => void } {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [data, setData] = useState<MemoryData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

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
          if (cancelled) return;
          if (visits.error || walks.error) {
            setFailed(true);
            return;
          }
          setFailed(false);
          setData({
            visits: (visits.data ?? []).flatMap((row) =>
              row.pois ? [{ visited_at: row.visited_at, name: row.pois.name }] : []
            ),
            walks: walks.data ?? [],
          });
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
      return () => {
        cancelled = true;
      };
      // `attempt` relance le chargement quand on touche « Réessayer ».
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, attempt])
  );

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((value) => value + 1);
  }, []);
  return { data, failed, retry };
}
