import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { DuelRow } from '@/lib/duels';
import { supabase } from '@/lib/supabase';

export type CheerResult = 'sent' | 'already' | 'not_friend';
export type DuelResult = 'sent' | 'already' | 'not_friend';

/** Encourage un ami (une fois par jour) ; null si le serveur n'a pas répondu. */
export async function sendCheer(friendId: string): Promise<CheerResult | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('send_cheer', { p_friend: friendId });
  return error ? null : (data as CheerResult);
}

/**
 * Duels en attente, en cours et récemment terminés ; vide si la migration n'est pas encore
 * appliquée.
 */
export function useDuels() {
  const [duels, setDuels] = useState<DuelRow[]>([]);

  const reload = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('my_duels');
    if (!error) setDuels((data ?? []) as DuelRow[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload().catch(() => {});
    }, [reload])
  );

  const challenge = async (friendId: string, days: number): Promise<DuelResult | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('create_duel', { p_friend: friendId, p_days: days });
    await reload();
    return error ? null : (data as DuelResult);
  };

  const respond = async (duelId: string, accept: boolean) => {
    if (!supabase) return;
    await supabase.rpc('respond_duel', { p_duel: duelId, p_accept: accept });
    await reload();
  };

  return { duels, challenge, respond };
}

/** Encouragements reçus pas encore vus, et de quoi les marquer comme vus. */
export function useCheers() {
  const [names, setNames] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!supabase) return;
      let cancelled = false;
      supabase.rpc('my_cheers').then(
        ({ data, error }) => {
          if (cancelled || error) return;
          const rows = (data ?? []) as { username: string | null }[];
          setNames(rows.map((row) => row.username ?? 'Un ami'));
        },
        () => {}
      );
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const dismiss = () => {
    setNames([]);
    supabase?.rpc('mark_cheers_seen').then(
      () => {},
      () => {}
    );
  };

  return { names, dismiss };
}
