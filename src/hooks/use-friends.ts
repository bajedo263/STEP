import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { FriendRequestResult, FriendRow } from '@/lib/friends';
import { supabase } from '@/lib/supabase';

export type FriendsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; friends: FriendRow[] };

/** Amis et demandes en cours, relus à chaque retour sur l'écran et après chaque action. */
export function useFriends() {
  const [state, setState] = useState<FriendsState>({ status: 'loading' });

  const reload = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('my_friends');
    if (error) {
      setState((current) => (current.status === 'ready' ? current : { status: 'error' }));
      return;
    }
    setState({ status: 'ready', friends: (data ?? []) as FriendRow[] });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload().catch(() => setState({ status: 'error' }));
    }, [reload])
  );

  /** Demande d'ami par pseudo ; null si le serveur n'a pas répondu. */
  const add = async (username: string): Promise<FriendRequestResult | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('send_friend_request', { p_username: username });
    if (error) return null;
    await reload();
    return data as FriendRequestResult;
  };

  const respond = async (friendId: string, accept: boolean) => {
    if (!supabase) return false;
    const { error } = await supabase.rpc('respond_friend_request', {
      p_from: friendId,
      p_accept: accept,
    });
    await reload();
    return !error;
  };

  const remove = async (friendId: string) => {
    if (!supabase) return false;
    const { error } = await supabase.rpc('remove_friend', { p_friend: friendId });
    await reload();
    return !error;
  };

  return { ...state, add, respond, remove };
}
