import { useFocusEffect } from 'expo-router';
import { useCallback, useState, useSyncExternalStore } from 'react';

import type { VisitRow, WalkRow } from '@/lib/memories';
import { supabase } from '@/lib/supabase';
import { createUserResource } from '@/lib/user-resource';
import { useAuth } from '@/providers/auth-provider';

export type MemoryData = { visits: VisitRow[]; walks: WalkRow[] };

/**
 * Les souvenirs parlent des mois et des années passés : jusqu'à 4 000 lignes qu'il est inutile de
 * recharger à chaque retour sur l'accueil.
 */
const MEMORIES_FRESH_MS = 15 * 60_000;

const memoryResource = createUserResource<MemoryData>(async (userId) => {
  if (!supabase) return null;
  const [visits, walks] = await Promise.all([
    supabase
      .from('poi_visits')
      .select('visited_at, pois(name)')
      .eq('user_id', userId)
      .order('visited_at', { ascending: false })
      .limit(2000)
      .returns<{ visited_at: string; pois: { name: string } | null }[]>(),
    supabase
      .from('walks')
      .select('started_at, distance_m')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(2000)
      .returns<WalkRow[]>(),
  ]);
  if (visits.error || walks.error) return null;
  return {
    visits: (visits.data ?? []).flatMap((row) =>
      row.pois ? [{ visited_at: row.visited_at, name: row.pois.name }] : []
    ),
    walks: walks.data ?? [],
  };
}, MEMORIES_FRESH_MS);

/** Lieux découverts et trajets depuis l'inscription, pour les souvenirs. */
export function useMemoryData(): MemoryData | null {
  return useMemoryState().data;
}

/** Même chose, avec l'échec du chargement et de quoi réessayer. */
export function useMemoryState(): { data: MemoryData | null; failed: boolean; retry: () => void } {
  const { session } = useAuth();
  const userId = session?.user.id;
  const data = useSyncExternalStore(
    memoryResource.subscribe,
    () => (userId ? memoryResource.get(userId) : null),
    () => null
  );
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    (force: boolean) => {
      if (!userId) return () => {};
      let cancelled = false;
      memoryResource.refresh(userId, force).then((ok) => {
        if (!cancelled) setFailed(!ok);
      });
      return () => {
        cancelled = true;
      };
    },
    [userId]
  );
  useFocusEffect(useCallback(() => load(false), [load]));

  const retry = useCallback(() => {
    setFailed(false);
    load(true);
  }, [load]);
  return { data, failed, retry };
}
