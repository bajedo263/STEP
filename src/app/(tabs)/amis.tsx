import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import {
  BottomTabInset,
  ConquestFriendColor,
  MaxContentWidth,
  Radius,
  Spacing,
} from '@/constants/theme';
import { useConquestSeason, useMyConquestCount } from '@/hooks/use-conquest';
import { useFriends } from '@/hooks/use-friends';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { useTodaySteps } from '@/hooks/use-today-steps';
import {
  dailyRanking,
  friendRequestMessage,
  type FriendRow,
  type RankingEntry,
} from '@/lib/friends';
import {
  ordinal,
  rankLabel,
  seasonEndLabel,
  seasonName,
  seasonRanking,
  type SeasonRow,
} from '@/lib/season';
import { useAuth } from '@/providers/auth-provider';

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');

export default function FriendsScreen() {
  const { session } = useAuth();
  const profile = useProfile();
  const today = useTodaySteps();
  const myCells = useMyConquestCount();
  const season = useConquestSeason();
  const friends = useFriends();
  const [username, setUsername] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const add = async () => {
    const name = username.trim();
    if (name.length < 3) return;
    setAdding(true);
    const result = await friends.add(name);
    setAdding(false);
    if (result === null) {
      setMessage({ text: 'La demande n’a pas pu être envoyée. Réessayez.', isError: true });
      return;
    }
    setMessage({
      text: friendRequestMessage(result, name),
      isError: result === 'not_found' || result === 'self',
    });
    if (result === 'sent' || result === 'accepted') setUsername('');
  };

  const list = friends.status === 'ready' ? friends.friends : [];
  const incoming = list.filter((friend) => friend.status === 'incoming');
  const outgoing = list.filter((friend) => friend.status === 'outgoing');
  const ranking = dailyRanking(list, {
    id: session?.user.id ?? 'me',
    name: profile?.username ?? 'Moi',
    steps: today.status === 'ready' ? today.steps : 0,
    cells: myCells,
  });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="subtitle">Amis</ThemedText>

            <ThemedView type="backgroundElement" style={styles.card}>
              {profile && !profile.username ? (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    Choisissez d’abord un pseudo : c’est grâce à lui que vos amis vous trouvent.
                  </ThemedText>
                  <Button title="Choisir mon pseudo" onPress={() => router.navigate('/profil')} />
                </>
              ) : profile?.username ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {`Votre pseudo : `}
                  <ThemedText type="smallBold">{profile.username}</ThemedText>
                  {`. Donnez-le à vos amis pour qu’ils vous ajoutent.`}
                </ThemedText>
              ) : null}
              <TextField
                label="Ajouter un ami"
                placeholder="Son pseudo"
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  setMessage(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="send"
                onSubmitEditing={add}
              />
              {message ? <Message {...message} /> : null}
              <Button
                title="Envoyer la demande"
                loading={adding}
                disabled={username.trim().length < 3}
                onPress={add}
              />
            </ThemedView>

            {friends.status === 'loading' ? <ActivityIndicator style={styles.loader} /> : null}
            {friends.status === 'error' ? (
              <Message text="Impossible de charger vos amis. Vérifiez votre connexion." isError />
            ) : null}

            {incoming.length > 0 ? (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">Demandes reçues</ThemedText>
                {incoming.map((friend) => (
                  <IncomingRequest
                    key={friend.friend_id}
                    friend={friend}
                    onRespond={friends.respond}
                  />
                ))}
              </ThemedView>
            ) : null}

            {friends.status === 'ready' ? (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">Classement du jour</ThemedText>
                {ranking.length === 1 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Ajoutez des amis pour comparer vos pas chaque jour et voir leurs cases sur la
                    carte, pour aller les reprendre.
                  </ThemedText>
                ) : (
                  ranking.map((entry) => (
                    <RankingRow
                      key={entry.id}
                      entry={entry}
                      onRemove={() =>
                        Alert.alert(`Retirer ${entry.name} de vos amis ?`, undefined, [
                          { text: 'Annuler', style: 'cancel' },
                          {
                            text: 'Retirer',
                            style: 'destructive',
                            onPress: () => friends.remove(entry.id),
                          },
                        ])
                      }
                    />
                  ))
                )}
                {ranking.length > 1 ? (
                  <View style={styles.legend}>
                    <View style={[styles.swatch, { backgroundColor: ConquestFriendColor }]} />
                    <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                      Les cases de vos amis apparaissent dans cette couleur sur la carte.
                    </ThemedText>
                  </View>
                ) : null}
              </ThemedView>
            ) : null}

            {season && friends.status === 'ready' ? (
              <SeasonCard
                season={season}
                ranking={seasonRanking(list, {
                  id: session?.user.id ?? 'me',
                  name: profile?.username ?? 'Moi',
                  cells: season.cells,
                })}
              />
            ) : null}

            {outgoing.length > 0 ? (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">En attente de réponse</ThemedText>
                {outgoing.map((friend) => (
                  <View key={friend.friend_id} style={styles.row}>
                    <ThemedText style={styles.flex} numberOfLines={1}>
                      {friend.username ?? 'Marcheur'}
                    </ThemedText>
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={Spacing.two}
                      onPress={() => friends.remove(friend.friend_id)}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Annuler
                      </ThemedText>
                    </Pressable>
                  </View>
                ))}
              </ThemedView>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

function IncomingRequest({
  friend,
  onRespond,
}: {
  friend: FriendRow;
  onRespond: (friendId: string, accept: boolean) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const respond = async (accept: boolean) => {
    setBusy(true);
    await onRespond(friend.friend_id, accept);
    setBusy(false);
  };
  return (
    <View style={styles.request}>
      <ThemedText numberOfLines={1}>{friend.username ?? 'Marcheur'}</ThemedText>
      <View style={styles.row}>
        <Button
          title="Accepter"
          style={styles.flex}
          disabled={busy}
          onPress={() => respond(true)}
        />
        <Button
          title="Refuser"
          variant="secondary"
          style={styles.flex}
          disabled={busy}
          onPress={() => respond(false)}
        />
      </View>
    </View>
  );
}

function RankingRow({ entry, onRemove }: { entry: RankingEntry; onRemove: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={entry.isMe ? undefined : 'button'}
      accessibilityHint={entry.isMe ? undefined : 'Appui long pour retirer cet ami'}
      disabled={entry.isMe}
      onLongPress={onRemove}
      style={[styles.rankingRow, entry.isMe && { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold" style={styles.rank}>
        {entry.rank}
      </ThemedText>
      <View style={styles.flex}>
        <ThemedText numberOfLines={1} type={entry.isMe ? 'smallBold' : 'small'}>
          {entry.isMe ? `${entry.name} (vous)` : entry.name}
        </ThemedText>
        {entry.cells ? (
          <ThemedText type="small" themeColor="textSecondary">
            {`${formatNumber(entry.cells)} case${entry.cells > 1 ? 's' : ''} conquise${entry.cells > 1 ? 's' : ''}`}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText type="smallBold">{`${formatNumber(entry.steps)} pas`}</ThemedText>
    </Pressable>
  );
}

/** Saison de Conquête : classement entre amis aux cases détenues, rang général et saison passée. */
function SeasonCard({ season, ranking }: { season: SeasonRow; ranking: ReturnType<typeof seasonRanking> }) {
  const theme = useTheme();
  const lastPlayers = season.last_players ?? 0;
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View>
        <ThemedText type="smallBold">{`🚩 ${seasonName(new Date(season.season_start))}`}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {`${seasonEndLabel(new Date(season.season_end), new Date())}. Toutes les cases repartent de zéro le 1er du mois.`}
        </ThemedText>
      </View>
      <ThemedText type="small">{`Vous : ${rankLabel(season.rank, season.players)}.`}</ThemedText>
      {ranking.length > 1
        ? ranking.map((entry) => (
            <View
              key={entry.id}
              style={[styles.rankingRow, entry.isMe && { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="smallBold" style={styles.rank}>
                {entry.rank}
              </ThemedText>
              <ThemedText
                numberOfLines={1}
                type={entry.isMe ? 'smallBold' : 'small'}
                style={styles.flex}>
                {entry.isMe ? `${entry.name} (vous)` : entry.name}
              </ThemedText>
              <ThemedText type="smallBold">
                {`${formatNumber(entry.cells)} case${entry.cells > 1 ? 's' : ''}`}
              </ThemedText>
            </View>
          ))
        : null}
      {season.last_rank && season.last_cells ? (
        <ThemedText type="small" themeColor="textSecondary">
          {`${seasonName(new Date(season.last_season_start))} : vous avez fini ${ordinal(season.last_rank)} sur ${lastPlayers}, avec ${formatNumber(season.last_cells)} case${season.last_cells > 1 ? 's' : ''}.`}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

function Message({ text, isError }: { text: string; isError: boolean }) {
  const theme = useTheme();
  return (
    <ThemedText type="small" style={{ color: isError ? theme.danger : theme.success }}>
      {text}
    </ThemedText>
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
  flex: {
    flex: 1,
  },
  content: {
    gap: Spacing.three,
    padding: Spacing.four,
    paddingTop: Platform.select({ web: Spacing.six + Spacing.four, default: Spacing.four }),
    paddingBottom: BottomTabInset + Spacing.four,
  },
  loader: {
    marginVertical: Spacing.six,
  },
  card: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  request: {
    gap: Spacing.two,
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.three,
  },
  rank: {
    width: 24,
    textAlign: 'center',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
});
