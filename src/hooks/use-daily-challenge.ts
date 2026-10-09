import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import {
  challengeKindFor,
  evaluateChallenge,
  type Challenge,
  type TodayActivity,
} from '@/lib/challenge';
import { localDay, startOfDay } from '@/lib/daily-progress';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type Loaded = Omit<TodayActivity, 'steps' | 'goal'>;

/** Défi du jour et son avancement, relus à chaque retour sur l'écran. */
export function useDailyChallenge(todaySteps: number | null, goal: number): Challenge | null {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!supabase || !userId) return;
      const client = supabase;
      let cancelled = false;
      const since = startOfDay(new Date()).toISOString();

      Promise.all([
        client
          .from('walks')
          .select('mode, distance_m')
          .eq('user_id', userId)
          .gte('started_at', since)
          .returns<TodayActivity['walks']>(),
        client
          .from('poi_visits')
          .select('poi_id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('visited_at', since),
        client
          .from('conquest_cells')
          .select('x', { count: 'exact', head: true })
          .eq('owner_id', userId)
          .gte('captured_at', since),
      ])
        .then(([walks, visits, cells]) => {
          if (cancelled) return;
          setLoaded({
            walks: walks.data ?? [],
            newPlaces: visits.count ?? 0,
            cells: cells.count ?? 0,
          });
        })
        .catch(() => {});

      return () => {
        cancelled = true;
      };
    }, [userId])
  );

  if (!userId) return null;
  const kind = challengeKindFor(userId, localDay(new Date()));
  return evaluateChallenge(kind, {
    steps: todaySteps ?? 0,
    goal,
    walks: loaded?.walks ?? [],
    newPlaces: loaded?.newPlaces ?? 0,
    cells: loaded?.cells ?? 0,
  });
}
