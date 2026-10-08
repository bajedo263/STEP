import { useEffect, useRef } from 'react';

import { localDay, type DailyProgress } from '@/lib/daily-progress';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

/** Délai minimal entre deux enregistrements, pour ne pas écrire à chaque pas. */
const SYNC_INTERVAL_MS = 60_000;

/** Enregistre les pas du jour dans `daily_steps`, au plus une fois par minute. */
export function useSyncDailySteps(progress: DailyProgress | null) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const last = useRef<{ at: number; day: string; key: string } | null>(null);

  useEffect(() => {
    if (!supabase || !userId || !progress) return;

    const day = localDay(new Date());
    const row = {
      user_id: userId,
      day,
      steps: progress.steps,
      distance_m: Math.round(progress.distanceM),
      calories_kcal: Math.round(progress.calories),
    };
    // La distance et les calories changent aussi quand le profil arrive ou est modifié.
    const key = `${row.steps}|${row.distance_m}|${row.calories_kcal}`;
    const previous = last.current;
    const sameDay = previous?.day === day;
    if (sameDay && previous.key === key) return;
    if (sameDay && Date.now() - previous.at < SYNC_INTERVAL_MS) return;

    last.current = { at: Date.now(), day, key };
    supabase
      .from('daily_steps')
      .upsert({ ...row, updated_at: new Date().toISOString() })
      .then(
        ({ error }) => {
          // En cas d'échec, on retentera au prochain changement.
          if (error) last.current = previous;
        },
        () => {
          last.current = previous;
        }
      );
  }, [userId, progress]);
}
