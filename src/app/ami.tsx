import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendRequestMessage, type FriendRequestResult } from '@/lib/friends';
import { supabase } from '@/lib/supabase';

/** Lien d'invitation (step://ami?pseudo=…) : propose d'ajouter l'ami en un appui. */
export default function InviteScreen() {
  const { pseudo } = useLocalSearchParams<{ pseudo?: string }>();
  const name = (pseudo ?? '').trim();
  const [sending, setSending] = useState(false);
  const theme = useTheme();
  const [result, setResult] = useState<{ text: string; done: boolean; isError: boolean } | null>(
    null
  );

  const add = async () => {
    if (name.length < 3) return;
    if (!supabase) {
      setResult({ text: 'Le service est momentanément indisponible. Réessayez plus tard.', done: false, isError: true });
      return;
    }
    setSending(true);
    const { data, error } = await supabase.rpc('send_friend_request', { p_username: name });
    setSending(false);
    if (error) {
      setResult({ text: 'La demande n’a pas pu être envoyée. Réessayez.', done: false, isError: true });
      return;
    }
    // Pseudo introuvable ou le sien : réessayer ne changerait rien, on s'arrête là.
    const outcome = data as FriendRequestResult;
    setResult({
      text: friendRequestMessage(outcome, name),
      done: true,
      isError: outcome === 'not_found' || outcome === 'self',
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
          {result ? (
            <ThemedText
              type="smallBold"
              accessibilityLiveRegion="polite"
              style={{ color: result.isError ? theme.danger : theme.success }}>
              {`${result.isError ? '⚠︎ ' : '✓ '}${result.text}`}
            </ThemedText>
          ) : null}
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
