import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { localDay } from '@/lib/daily-progress';
import { historyStart, type HistoryRow } from '@/lib/stats';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export type WalkRow = {
  id: string;
  mode: 'loop' | 'destination' | 'free';
  started_at: string;
  ended_at: string | null;
  steps: number | null;
  distance_m: number | null;
  calories_kcal: number | null;
};

/** Lieux vus sur le total d'un quartier (tuile) où l'utilisateur a marché. */
export type PoiZoneStats = {
  zone_x: number;
  zone_y: number;
  total: number;
  visited: number;
  /** Nom du lieu le plus remarquable du quartier, pour le reconnaître. */
  label: string | null;
};

export type StatsData =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      /** Jours enregistrés sur les 12 derniers mois. */
      days: HistoryRow[];
      walks: WalkRow[];
      /** Trajet le plus long jamais enregistré. */
      longestWalk: WalkRow | null;
      poiZones: PoiZoneStats[];
    };

/** Historique des pas, derniers trajets et records, relus à chaque retour sur l'écran. */
export function useStats(): StatsData {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [state, setState] = useState<StatsData>({ status: 'loading' });

  useFocusEffect(
    useCallback(() => {
      if (!supabase || !userId) return;
      const client = supabase;
      let cancelled = false;

      (async () => {
        const [days, walks, longestWalk, poiZones] = await Promise.all([
          client
            .from('daily_steps')
            .select('day, steps, distance_m, calories_kcal')
            .eq('user_id', userId)
            .gte('day', localDay(historyStart(new Date())))
            .returns<HistoryRow[]>(),
          client
            .from('walks')
            .select('id, mode, started_at, ended_at, steps, distance_m, calories_kcal')
            .eq('user_id', userId)
            .order('started_at', { ascending: false })
            .limit(10)
            .returns<WalkRow[]>(),
          client
            .from('walks')
            .select('id, mode, started_at, ended_at, steps, distance_m, calories_kcal')
            .eq('user_id', userId)
            .not('distance_m', 'is', null)
            .order('distance_m', { ascending: false })
            .limit(1)
            .returns<WalkRow[]>(),
          client.rpc('poi_zone_stats'),
        ]);
        if (cancelled) return;
        if (days.error || walks.error) {
          setState((current) => (current.status === 'ready' ? current : { status: 'error' }));
          return;
        }
        setState({
          status: 'ready',
          days: days.data ?? [],
          walks: walks.data ?? [],
          longestWalk: longestWalk.data?.[0] ?? null,
          // Les statistiques de lieux sont un plus : leur absence n'empêche pas le reste.
          poiZones: poiZones.error ? [] : ((poiZones.data as PoiZoneStats[] | null) ?? []),
        });
      })().catch(() => {
        if (!cancelled) setState((current) => (current.status === 'ready' ? current : { status: 'error' }));
      });

      return () => {
        cancelled = true;
      };
    }, [userId])
  );

  return state;
}
