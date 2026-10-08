import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { Profile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

/** Profil de l'utilisateur connecté, relu à chaque fois que l'écran reprend le focus. */
export function useProfile(): Profile | null {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [profile, setProfile] = useState<Profile | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!supabase || !userId) return;
      let cancelled = false;

      supabase
        .from('profiles')
        .select('id, username, height_cm, weight_kg, sex, daily_goal')
        .eq('id', userId)
        .maybeSingle<Profile>()
        .then(
          ({ data }) => {
            if (!cancelled && data) setProfile(data);
          },
          () => {}
        );

      return () => {
        cancelled = true;
      };
    }, [userId])
  );

  return profile;
}
