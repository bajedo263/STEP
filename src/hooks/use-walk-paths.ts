import { useCallback, useEffect, useState } from 'react';

import type { LatLng } from '@/lib/loop';
import { supabase } from '@/lib/supabase';
import { lineCoordinates } from '@/lib/walk-art';

type PathRow = { id: string; started_at: string; distance_m: number | null; path: unknown };

export type WalkPath = { id: string; startedAt: string; distanceM: number; points: LatLng[] };

/**
 * Tracés de ses trajets depuis `since` (ou depuis toujours), null pendant le chargement et
 * `unavailable` s'ils ne peuvent pas être chargés.
 */
export function useWalkPaths(since: string | null): WalkPath[] | 'unavailable' | null {
  const { paths } = useWalkPathsState(since);
  return paths === 'error' ? 'unavailable' : paths;
}

/**
 * Même chose, en distinguant la migration Souvenirs pas encore appliquée (`unavailable`) d'un
 * échec du réseau (`error`), qu'on peut réessayer.
 */
export function useWalkPathsState(since: string | null): {
  paths: WalkPath[] | 'unavailable' | 'error' | null;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    paths: WalkPath[] | 'unavailable' | 'error';
  } | null>(null);
  const key = `${since ?? ''}/${attempt}`;

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.rpc('my_walk_paths', since ? { p_since: since } : {}).then(
      ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // PGRST202 : la fonction n'existe pas encore sur le serveur.
          setResult({ key, paths: error.code === 'PGRST202' ? 'unavailable' : 'error' });
          return;
        }
        const rows = (data ?? []) as PathRow[];
        const paths = rows.flatMap((row) => {
          const points = lineCoordinates(row.path);
          return points
            ? [{ id: row.id, startedAt: row.started_at, distanceM: row.distance_m ?? 0, points }]
            : [];
        });
        setResult({ key, paths });
      },
      () => {
        if (!cancelled) setResult({ key, paths: 'error' });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [since, key]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { paths: result && result.key === key ? result.paths : null, retry };
}
