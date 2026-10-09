import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

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

  const day = localDay(new Date());
  const challenge = userId
    ? evaluateChallenge(challengeKindFor(userId, day), {
        steps: todaySteps ?? 0,
        goal,
        walks: loaded?.walks ?? [],
        newPlaces: loaded?.newPlaces ?? 0,
        cells: loaded?.cells ?? 0,
      })
    : null;

  // Un défi réussi est enregistré une fois (il compte pour les badges), même si l'app est rouverte.
  const recorded = useRef<string | null>(null);
  const done = challenge?.done ?? false;
  const kind = challenge?.kind;
  useEffect(() => {
    if (!done || !kind || !userId || !supabase || recorded.current === day) return;
    recorded.current = day;
    supabase
      .from('challenge_completions')
      .upsert({ user_id: userId, day, kind }, { onConflict: 'user_id,day', ignoreDuplicates: true })
      .then(
        ({ error }) => {
          // Sans la migration Badges, on réessaiera à la prochaine ouverture.
          if (error) recorded.current = null;
        },
        () => {
          recorded.current = null;
        }
      );
  }, [done, kind, userId, day]);

  return challenge;
}
