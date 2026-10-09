import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { localDay } from '@/lib/daily-progress';
import { historyStart, type DailyStepsRow } from '@/lib/stats';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

/** Pas enregistrés sur les 12 derniers mois ; null tant qu'ils ne sont pas chargés. */
export function useStepHistory(): DailyStepsRow[] | null {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [rows, setRows] = useState<DailyStepsRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!supabase || !userId) return;
      let cancelled = false;
      supabase
        .from('daily_steps')
        .select('day, steps')
        .eq('user_id', userId)
        .gte('day', localDay(historyStart(new Date())))
        .returns<DailyStepsRow[]>()
        .then(
          ({ data, error }) => {
            if (!cancelled && !error) setRows(data ?? []);
          },
          () => {}
        );
      return () => {
        cancelled = true;
      };
    }, [userId])
  );

  return rows;
}
