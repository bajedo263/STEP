import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';

import type { UserResource } from '@/lib/user-resource';
import { useAuth } from '@/providers/auth-provider';

/** Valeur partagée d'une donnée du compte, rafraîchie au retour sur l'écran si elle a vieilli. */
export function useUserResource<T>(resource: UserResource<T>): T | null {
  const { session } = useAuth();
  const userId = session?.user.id;
  const value = useSyncExternalStore(
    resource.subscribe,
    () => (userId ? resource.get(userId) : null),
    () => null
  );
  useFocusEffect(
    useCallback(() => {
      if (userId) resource.refresh(userId);
    }, [resource, userId])
  );
  return value;
}
