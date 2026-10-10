import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { localDay } from '@/lib/daily-progress';
import {
  activeEvents,
  eventProgress,
  upcomingEvent,
  type EventActivity,
  type EventProgress,
  type StepEvent,
} from '@/lib/events';
import type { DailyStepsRow } from '@/lib/stats';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export type ActiveEvent = { event: StepEvent; progress: EventProgress };

/** Début d'un jour local, pour filtrer les visites et les trajets. */
const startOf = (day: string) => new Date(`${day}T00:00:00`).toISOString();

/** Événements réussis par ce compte, gardés dans ses métadonnées (sans migration). */
export function useEventsDone(): string[] {
  const { session } = useAuth();
  const done: unknown = session?.user.user_metadata?.events_done;
  return useMemo(
    () => (Array.isArray(done) ? done.filter((id): id is string => typeof id === 'string') : []),
    [done]
  );
}

/**
 * Événements en cours et leur avancement, plus le prochain à annoncer. Les pas viennent de
 * l'historique (et des pas du jour), les lieux et trajets sont recomptés à chaque retour.
 */
export function useEvents(
  history: DailyStepsRow[] | null,
  todaySteps: number | null
): { active: ActiveEvent[]; upcoming: StepEvent | null } {
  const { session } = useAuth();
  const userId = session?.user.id;
  const today = localDay(new Date());
  const events = useMemo(() => activeEvents(today), [today]);
  const upcoming = useMemo(() => upcomingEvent(today), [today]);
  const [counts, setCounts] = useState<Record<string, { places: number; walks: number }>>({});
  const done = useEventsDone();

  useFocusEffect(
    useCallback(() => {
      if (!supabase || !userId) return;
      const client = supabase;
      let cancelled = false;
      const counted = events.filter((event) => event.metric !== 'steps');
      Promise.all(
        counted.map(async (event) => {
          const since = startOf(event.start);
          const [places, walks] = await Promise.all([
            client
              .from('poi_visits')
              .select('poi_id', { count: 'exact', head: true })
              .eq('user_id', userId)
              .gte('visited_at', since),
            client
              .from('walks')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', userId)
              .gte('started_at', since),
          ]);
          return [event.id, { places: places.count ?? 0, walks: walks.count ?? 0 }] as const;
        })
      )
        .then((entries) => {
          if (!cancelled) setCounts(Object.fromEntries(entries));
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [events, userId])
  );

  const active = useMemo(
    () =>
      events.map((event) => {
        const steps = (history ?? [])
          .filter((row) => row.day >= event.start && row.day <= event.end && row.day !== today)
          .reduce((sum, row) => sum + row.steps, 0);
        const activity: EventActivity = {
          steps: steps + (todaySteps ?? 0),
          places: counts[event.id]?.places ?? 0,
          walks: counts[event.id]?.walks ?? 0,
        };
        const progress = eventProgress(event, activity);
        return { event, progress: { ...progress, done: progress.done || done.includes(event.id) } };
      }),
    [events, history, todaySteps, counts, today, done]
  );

  // Un événement réussi est retenu une fois : il compte pour les badges.
  const newlyDone = active
    .filter(({ event, progress }) => progress.done && !done.includes(event.id))
    .map(({ event }) => event.id)
    .join(',');
  useEffect(() => {
    if (!newlyDone || !supabase) return;
    supabase.auth
      .updateUser({ data: { events_done: [...done, ...newlyDone.split(',')].slice(-100) } })
      .then(
        () => {},
        () => {}
      );
    // `done` change justement quand l'événement est retenu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newlyDone]);

  return { active, upcoming };
}
