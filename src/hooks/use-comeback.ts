import { useEffect, useMemo, useState } from 'react';

import { localFlag, setLocalFlag, useLocalFlag } from '@/hooks/use-local-flag';
import { isComeback } from '@/lib/comeback';
import { localDay } from '@/lib/daily-progress';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

/** Dernier jour d'ouverture de l'app sur ce téléphone, par compte. */
const lastOpenKey = (userId: string) => `step.last-open.${userId}`;
/** Jour où un gel a été offert au retour, pour l'annoncer une fois sur l'accueil. */
export const comebackGiftKey = (userId: string) => `step.comeback-gift.${userId}`;

/** Jours où un gel de série a été offert à ce compte (retours après une absence). */
export function useGiftDays(): string[] {
  const { session } = useAuth();
  const days: unknown = session?.user.user_metadata?.gift_freezes;
  return useMemo(
    () => (Array.isArray(days) ? days.filter((day): day is string => typeof day === 'string') : []),
    [days]
  );
}

/**
 * À l'ouverture : après 3 jours ou plus sans ouvrir STEP, offre un gel de série (gardé dans le
 * compte, sans migration) et le signale à l'accueil. Retient le jour d'ouverture.
 */
export function useComebackGift() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const gifts = session?.user.user_metadata?.gift_freezes;

  useEffect(() => {
    if (!userId || !supabase) return;
    const today = localDay(new Date());
    const last = localFlag(lastOpenKey(userId));
    setLocalFlag(lastOpenKey(userId), today);
    if (!isComeback(last, today)) return;
    const previous = Array.isArray(gifts) ? gifts : [];
    if (previous.includes(today)) return;
    supabase.auth
      .updateUser({ data: { gift_freezes: [...previous, today].slice(-20) } })
      .then(({ error }) => {
        if (!error) setLocalFlag(comebackGiftKey(userId), today);
      });
    // Une fois par ouverture de l'app : `gifts` change justement quand on offre le gel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
}

/** Vrai si un gel vient d'être offert aujourd'hui et que l'accueil doit l'annoncer. */
export function useComebackBanner(): { show: boolean; dismiss: () => void } {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const gift = useLocalFlag(userId ? comebackGiftKey(userId) : null);
  const today = localDay(new Date());
  return {
    show: gift === today,
    dismiss: () => {
      if (userId) setLocalFlag(comebackGiftKey(userId), `vu-${today}`);
    },
  };
}

/** Faux tant que le compte n'a enregistré aucun trajet ; null tant qu'on ne sait pas. */
export function useHasWalked(): boolean | null {
  const { session } = useAuth();
  const userId = session?.user.id;
  const done = useLocalFlag(userId ? firstWalkDoneKey(userId) : null);
  const [count, setCount] = useState<{ userId: string; walks: number } | null>(null);

  useEffect(() => {
    if (!userId || !supabase || done) return;
    let cancelled = false;
    supabase
      .from('walks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .then(({ count: walks, error }) => {
        if (!cancelled && !error && walks !== null) setCount({ userId, walks });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, done]);

  if (done) return true;
  return count && count.userId === userId ? count.walks > 0 : null;
}

/** Posé dès le premier trajet enregistré, pour ne plus proposer la première marche. */
export const firstWalkDoneKey = (userId: string) => `step.first-walk-done.${userId}`;
