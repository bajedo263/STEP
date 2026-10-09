import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { friendRequestMessage, type FriendRequestResult } from '@/lib/friends';
import { supabase } from '@/lib/supabase';

/** Lien d'invitation (step://ami?pseudo=…) : propose d'ajouter l'ami en un appui. */
export default function InviteScreen() {
  const { pseudo } = useLocalSearchParams<{ pseudo?: string }>();
  const name = (pseudo ?? '').trim();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ text: string; done: boolean } | null>(null);

  const add = async () => {
    if (!supabase || name.length < 3) return;
    setSending(true);
    const { data, error } = await supabase.rpc('send_friend_request', { p_username: name });
    setSending(false);
    if (error) {
      setResult({ text: 'La demande n’a pas pu être envoyée. Réessayez.', done: false });
      return;
    }
    const outcome = data as FriendRequestResult;
    setResult({
      text: friendRequestMessage(outcome, name),
      done: outcome !== 'not_found',
    });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ThemedText type="subtitle">Invitation</ThemedText>
          {name.length >= 3 ? (
            <ThemedText>{`${name} vous invite à marcher ensemble sur STEP.`}</ThemedText>
          ) : (
            <ThemedText>Ce lien d’invitation est incomplet.</ThemedText>
          )}
          {result ? <ThemedText type="small">{result.text}</ThemedText> : null}
          {result?.done || name.length < 3 ? (
            <Button title="Voir mes amis" onPress={() => router.replace('/amis')} />
          ) : (
            <Button title={`Ajouter ${name}`} loading={sending} onPress={add} />
          )}
          <Button
            title="Fermer"
            variant="secondary"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  content: {
    gap: Spacing.three,
    padding: Spacing.four,
  },
});
