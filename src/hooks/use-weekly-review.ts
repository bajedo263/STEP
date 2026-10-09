import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import type { DailyStepsRow } from '@/lib/stats';
import type { GoalRule } from '@/lib/steps';
import { supabase } from '@/lib/supabase';
import { weeklyReview, type WeeklyReview } from '@/lib/weekly-review';

export type WeeklyExtras = { walks: number; distanceM: number; places: number };

/** Bilan de la semaine passée, avec ses trajets et ses lieux découverts quand ils sont lus. */
export function useWeeklyReview(
  history: DailyStepsRow[] | null,
  goal: GoalRule
): { review: WeeklyReview; extras: WeeklyExtras | null } | null {
  const review = useMemo(
    () => (history ? weeklyReview(history, new Date(), goal) : null),
    [history, goal]
  );
  const week = review?.week ?? null;
  const [extras, setExtras] = useState<{ week: string; value: WeeklyExtras } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!supabase || !week) return;
      const [year, month, date] = week.split('-').map(Number);
      const from = new Date(year, month - 1, date).toISOString();
      const to = new Date(year, month - 1, date + 7).toISOString();
      let cancelled = false;
      Promise.all([
        supabase
          .from('walks')
          .select('distance_m')
          .gte('started_at', from)
          .lt('started_at', to)
          .returns<{ distance_m: number | null }[]>(),
        supabase
          .from('poi_visits')
          .select('poi_id', { count: 'exact', head: true })
          .gte('visited_at', from)
          .lt('visited_at', to),
      ])
        .then(([walks, places]) => {
          if (cancelled || walks.error) return;
          setExtras({
            week,
            value: {
              walks: walks.data?.length ?? 0,
              distanceM: (walks.data ?? []).reduce((sum, walk) => sum + (walk.distance_m ?? 0), 0),
              places: places.count ?? 0,
            },
          });
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [week])
  );

  if (!review) return null;
  return { review, extras: extras?.week === review.week ? extras.value : null };
}
