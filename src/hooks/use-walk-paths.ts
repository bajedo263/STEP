import { useEffect, useState } from 'react';

import type { LatLng } from '@/lib/loop';
import { supabase } from '@/lib/supabase';
import { lineCoordinates } from '@/lib/walk-art';

type PathRow = { id: string; started_at: string; distance_m: number | null; path: unknown };

export type WalkPath = { id: string; startedAt: string; distanceM: number; points: LatLng[] };

/**
 * Tracés de ses trajets depuis `since` (ou depuis toujours), null pendant le chargement et
 * `unavailable` si la migration Souvenirs n'est pas encore appliquée.
 */
export function useWalkPaths(since: string | null): WalkPath[] | 'unavailable' | null {
  const [result, setResult] = useState<{
    since: string | null;
    paths: WalkPath[] | 'unavailable';
  } | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.rpc('my_walk_paths', since ? { p_since: since } : {}).then(
      ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setResult({ since, paths: 'unavailable' });
          return;
        }
        const rows = (data ?? []) as PathRow[];
        const paths = rows.flatMap((row) => {
          const points = lineCoordinates(row.path);
          return points
            ? [{ id: row.id, startedAt: row.started_at, distanceM: row.distance_m ?? 0, points }]
            : [];
        });
        setResult({ since, paths });
      },
      () => {
        if (!cancelled) setResult({ since, paths: 'unavailable' });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [since]);

  return result && result.since === since ? result.paths : null;
}
