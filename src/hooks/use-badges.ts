import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useStepHistory } from '@/hooks/use-step-history';
import { badgesFor, type Badge } from '@/lib/badges';
import { collectionCounts, type ZoneProgress } from '@/lib/collection';
import type { GoalRule } from '@/lib/steps';
import { useGiftDays } from '@/hooks/use-comeback';
import { useEventsDone } from '@/hooks/use-events';
import { protectedStreak } from '@/lib/streak';
import { supabase } from '@/lib/supabase';

type Totals = {
  walkedM: number;
  places: number;
  challenges: number;
  cells: number;
  friends: number;
  zonesExplored: number;
  zonesComplete: number;
};

/**
 * Badges de l'utilisateur, relus à chaque retour sur l'écran ; null tant qu'ils ne sont pas
 * connus ou si la migration Badges n'est pas encore appliquée.
 */
export function useBadges(todaySteps: number | null, goal: GoalRule): Badge[] | null {
  const history = useStepHistory();
  const gifts = useGiftDays();
  const eventsDone = useEventsDone();
  const [totals, setTotals] = useState<Totals | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!supabase) return;
      const client = supabase;
      let cancelled = false;
      Promise.all([
        client.rpc('my_badge_stats'),
        client.rpc('my_conquest_count'),
        client.rpc('my_friends'),
        client.rpc('poi_zone_stats'),
      ])
        .then(([stats, cells, friends, zones]) => {
          if (cancelled || stats.error) return;
          const collection = collectionCounts(
            zones.error ? [] : ((zones.data as ZoneProgress[] | null) ?? [])
          );
          const row = (
            stats.data as { walked_m: number; places: number; challenges: number }[] | null
          )?.[0];
          setTotals({
            walkedM: row?.walked_m ?? 0,
            places: row?.places ?? 0,
            challenges: row?.challenges ?? 0,
            cells: typeof cells.data === 'number' ? cells.data : 0,
            friends: friends.error
              ? 0
              : ((friends.data as { status: string }[] | null) ?? []).filter(
                  (friend) => friend.status === 'friend'
                ).length,
            zonesExplored: collection.explored,
            zonesComplete: collection.complete,
          });
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [])
  );

  if (!totals || !history) return null;
  const { best } = protectedStreak(history, new Date(), todaySteps, goal, gifts);
  return badgesFor({ ...totals, bestStreak: best, events: eventsDone.length });
}
