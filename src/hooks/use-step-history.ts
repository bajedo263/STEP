import { useUserResource } from '@/hooks/use-user-resource';
import { localDay } from '@/lib/daily-progress';
import { historyStart, type DailyStepsRow } from '@/lib/stats';
import { supabase } from '@/lib/supabase';
import { createUserResource } from '@/lib/user-resource';

/** Les pas du jour viennent du podomètre ; l'historique enregistré bouge au plus une fois par minute. */
const HISTORY_FRESH_MS = 60_000;

const historyResource = createUserResource<DailyStepsRow[]>(async (userId) => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('daily_steps')
    .select('day, steps')
    .eq('user_id', userId)
    .gte('day', localDay(historyStart(new Date())))
    .order('day')
    .returns<DailyStepsRow[]>();
  return error ? null : (data ?? []);
}, HISTORY_FRESH_MS);

/** Pas enregistrés sur les 12 derniers mois ; null tant qu'ils ne sont pas chargés. */
export function useStepHistory(): DailyStepsRow[] | null {
  return useUserResource(historyResource);
}
