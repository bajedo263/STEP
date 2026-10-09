import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
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
import { sendCheer, useDuels } from '@/hooks/use-duels';
import { useFriends } from '@/hooks/use-friends';
import { useLeague } from '@/hooks/use-league';
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
import {
  leagueChangeLabel,
  leagueStatusLabel,
  leagueZone,
  stepsToOvertake,
  tierName,
  type LeagueRow,
} from '@/lib/league';
import { localDay } from '@/lib/daily-progress';
import { DUEL_DAYS, duelLabel, duelPhase, inviteMessage, type DuelRow } from '@/lib/duels';
import { useAuth } from '@/providers/auth-provider';

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');

export default function FriendsScreen() {
  const { session } = useAuth();
  const profile = useProfile();
  const today = useTodaySteps();
  const myCells = useMyConquestCount();
  const season = useConquestSeason();
  const league = useLeague();
  const friends = useFriends();
  const duels = useDuels();
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

  const invite = () => {
    if (!profile?.username) return;
    // Dans Expo Go, le lien d'ajout n'est pas stable : seul le pseudo est partagé.
    const link =
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient
        ? null
        : Linking.createURL('ami', { queryParams: { pseudo: profile.username } });
    Share.share({ message: inviteMessage(profile.username, link) }).catch(() => {});
  };

  // Un appui sur un ami : l'encourager, le défier ou le retirer.
  const friendActions = (entry: RankingEntry) => {
    const cheer = async () => {
      const result = await sendCheer(entry.id);
      setMessage(
        result === 'sent'
          ? { text: `${entry.name} verra votre encouragement à sa prochaine ouverture.`, isError: false }
          : result === 'already'
            ? { text: `Vous avez déjà encouragé ${entry.name} aujourd’hui.`, isError: false }
            : { text: 'L’encouragement n’a pas pu être envoyé. Réessayez.', isError: true }
      );
    };
    const challenge = async (days: number) => {
      const result = await duels.challenge(entry.id, days);
      setMessage(
        result === 'sent'
          ? { text: `Défi envoyé à ${entry.name}. Il commence dès qu’il est accepté.`, isError: false }
          : result === 'already'
            ? { text: `Un duel est déjà en cours avec ${entry.name}.`, isError: false }
            : { text: 'Le défi n’a pas pu être envoyé. Réessayez.', isError: true }
      );
    };
    Alert.alert(entry.name, undefined, [
      { text: 'Encourager 👏', onPress: cheer },
      ...DUEL_DAYS.map((days) => ({
        text: `Défier sur ${days} jours`,
        onPress: () => challenge(days),
      })),
      {
        text: 'Retirer de mes amis',
        style: 'destructive' as const,
        onPress: () => friends.remove(entry.id),
      },
      { text: 'Annuler', style: 'cancel' as const },
    ]);
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
              {profile?.username ? (
                <Button title="Inviter un ami" variant="secondary" onPress={invite} />
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

            {duels.duels.length > 0 ? (
              <DuelsCard duels={duels.duels} onRespond={duels.respond} />
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
                    <RankingRow key={entry.id} entry={entry} onPress={() => friendActions(entry)} />
                  ))
                )}
                {ranking.length > 1 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Touchez un ami pour l’encourager ou le défier en duel.
                  </ThemedText>
                ) : null}
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

            {league ? <LeagueCard rows={league} /> : null}

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

function RankingRow({ entry, onPress }: { entry: RankingEntry; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={entry.isMe ? undefined : 'button'}
      accessibilityHint={entry.isMe ? undefined : 'Encourager, défier ou retirer cet ami'}
      disabled={entry.isMe}
      onPress={onPress}
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

/** Ligue de la semaine : le groupe classé aux pas, zones de montée et de descente. */
function LeagueCard({ rows }: { rows: LeagueRow[] }) {
  const theme = useTheme();
  const me = rows.find((row) => row.is_me);
  if (!me) return null;
  const change = leagueChangeLabel(me);
  const overtake = stepsToOvertake(rows);
  // Les 10 premiers, et sa propre place si elle est plus loin.
  const shown = rows.filter((row) => row.rank <= 10 || row.is_me);
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View>
        <ThemedText type="smallBold">{tierName(me.tier)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Classement aux pas de la semaine, jusqu’à dimanche soir.
        </ThemedText>
      </View>
      {change ? <ThemedText type="smallBold">{change}</ThemedText> : null}
      <ThemedText type="small">{`Vous : ${me.rank}${me.rank === 1 ? 'er' : 'e'} sur ${me.players}. ${leagueStatusLabel(me)}`}</ThemedText>
      {overtake ? (
        <ThemedText type="small" themeColor="textSecondary">
          {`${formatNumber(overtake)} pas pour gagner une place.`}
        </ThemedText>
      ) : null}
      {rows.length > 1
        ? shown.map((row) => {
            const zone = leagueZone(row);
            return (
              <View
                key={row.user_id}
                style={[styles.rankingRow, row.is_me && { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText
                  type="smallBold"
                  style={[
                    styles.rank,
                    zone === 'promote' && { color: theme.success },
                    zone === 'demote' && { color: theme.danger },
                  ]}>
                  {row.rank}
                </ThemedText>
                <ThemedText
                  numberOfLines={1}
                  type={row.is_me ? 'smallBold' : 'small'}
                  style={styles.flex}>
                  {`${row.username ?? 'Marcheur'}${row.is_me ? ' (vous)' : ''}`}
                </ThemedText>
                <ThemedText type="smallBold">{`${formatNumber(row.steps)} pas`}</ThemedText>
              </View>
            );
          })
        : null}
    </ThemedView>
  );
}

/** Duels entre amis : défis reçus à accepter, duels en cours et résultats récents. */
function DuelsCard({
  duels,
  onRespond,
}: {
  duels: DuelRow[];
  onRespond: (duelId: string, accept: boolean) => Promise<void>;
}) {
  const theme = useTheme();
  const today = localDay(new Date());
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">⚔️ Duels</ThemedText>
      {duels.map((duel) => {
        const phase = duelPhase(duel, today);
        const total = Math.max(1, duel.my_steps + duel.their_steps);
        return (
          <View key={duel.id} style={styles.request}>
            <ThemedText
              type="small"
              style={[
                phase === 'won' && { color: theme.success },
                phase === 'lost' && { color: theme.danger },
              ]}>
              {duelLabel(duel, today)}
            </ThemedText>
            {phase === 'pending' && duel.incoming ? (
              <View style={styles.row}>
                <Button title="Relever" style={styles.flex} onPress={() => onRespond(duel.id, true)} />
                <Button
                  title="Refuser"
                  variant="secondary"
                  style={styles.flex}
                  onPress={() => onRespond(duel.id, false)}
                />
              </View>
            ) : null}
            {phase !== 'pending' ? (
              <View style={[styles.duelTrack, { backgroundColor: ConquestFriendColor }]}>
                <View
                  style={[
                    styles.duelFill,
                    { width: `${(duel.my_steps / total) * 100}%`, backgroundColor: theme.tint },
                  ]}
                />
              </View>
            ) : null}
            {phase !== 'pending' ? (
              <View style={styles.row}>
                <ThemedText type="small" style={styles.flex}>
                  {`Vous : ${formatNumber(duel.my_steps)}`}
                </ThemedText>
                <ThemedText type="small">
                  {`${duel.other_name ?? 'Ami'} : ${formatNumber(duel.their_steps)}`}
                </ThemedText>
              </View>
            ) : null}
          </View>
        );
      })}
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
  duelTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  duelFill: {
    height: '100%',
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
