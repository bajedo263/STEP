import { useEffect, useMemo, useRef } from 'react';

import { useRainDays } from '@/hooks/use-weather';

import { adaptivePlan, type AdaptivePlan } from '@/lib/adaptive-goal';
import { localDay } from '@/lib/daily-progress';
import type { Profile } from '@/lib/profile';
import type { DailyStepsRow } from '@/lib/stats';
import { DEFAULT_DAILY_GOAL, goalOn, type GoalRule } from '@/lib/steps';
import { supabase } from '@/lib/supabase';
import { withRainDays } from '@/lib/weather';
import { useAuth } from '@/providers/auth-provider';

export type DailyGoal = {
  /** Objectif du jour. */
  goal: number;
  /** Objectif de chaque jour, pour les séries et les statistiques. */
  rule: GoalRule;
  /** Avancement de l'objectif adaptatif, null s'il n'est pas activé ou pas encore calculé. */
  plan: AdaptivePlan | null;
  adaptive: boolean;
  /** Vrai si l'objectif du jour est réduit pour cause de pluie. */
  rainy: boolean;
};

/** Jour d'activation de l'objectif adaptatif, gardé dans les métadonnées du compte. */
export function useAdaptiveSince(): string | null {
  const { session } = useAuth();
  const since = session?.user.user_metadata?.adaptive_goal_since;
  return typeof since === 'string' ? since : null;
}

/** Active l'objectif adaptatif à partir d'aujourd'hui, ou le désactive. */
export async function setAdaptiveGoal(on: boolean): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.auth.updateUser({
    data: { adaptive_goal_since: on ? localDay(new Date()) : null },
  });
  return !error;
}

/**
 * Objectif du jour : celui du profil, ou l'objectif adaptatif quand il est activé. Dans ce
 * cas, le profil est mis à jour à chaque changement de palier pour que les autres écrans
 * et les rappels suivent.
 */
export function useDailyGoal(
  profile: Profile | null,
  history: DailyStepsRow[] | null,
  todaySteps: number | null
): DailyGoal {
  const since = useAdaptiveSince();
  const plan = useMemo(
    () => (since && history ? adaptivePlan(history, since, new Date(), todaySteps) : null),
    [since, history, todaySteps]
  );

  const synced = useRef<number | null>(null);
  const profileId = profile?.id;
  const profileGoal = profile?.daily_goal;
  useEffect(() => {
    if (!supabase || !plan || !profileId || profileGoal === plan.goal) return;
    if (synced.current === plan.goal) return;
    synced.current = plan.goal;
    supabase
      .from('profiles')
      .update({ daily_goal: plan.goal })
      .eq('id', profileId)
      .then(
        () => {},
        () => {}
      );
  }, [plan, profileId, profileGoal]);

  // Les jours de pluie, l'objectif est réduit, pour la série comme pour les statistiques.
  const rainDays = useRainDays();
  const base = plan?.goal ?? profile?.daily_goal ?? DEFAULT_DAILY_GOAL;
  const baseRule: GoalRule = plan ? plan.goalFor : base;
  const rule = useMemo(() => withRainDays(baseRule, rainDays), [baseRule, rainDays]);
  const today = localDay(new Date());
  const goal = goalOn(rule, today);
  return { goal, rule, plan, adaptive: since !== null, rainy: rainDays.includes(today) };
}
