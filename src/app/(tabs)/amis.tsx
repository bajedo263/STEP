import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { ActionSheet } from '@/components/ui/action-sheet';
import { Button } from '@/components/ui/button';
import { CardLink } from '@/components/ui/card-link';
import { InfoButton } from '@/components/ui/info-button';
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
import { ordinal, seasonName, type SeasonRow } from '@/lib/season';
import { MIN_LEAGUE_PLAYERS, tierName, type LeagueRow } from '@/lib/league';
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
  const [selected, setSelected] = useState<RankingEntry | null>(null);
  // Résultat d'un encouragement ou d'un défi, affiché en bas de l'écran, près du geste.
  const [toast, setToast] = useState<{ text: string; isError: boolean } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

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
      setToast(
        result === 'sent'
          ? { text: `${entry.name} verra votre encouragement à sa prochaine ouverture.`, isError: false }
          : result === 'already'
            ? { text: `Vous avez déjà encouragé ${entry.name} aujourd’hui.`, isError: false }
            : { text: 'L’encouragement n’a pas pu être envoyé. Réessayez.', isError: true }
      );
    };
    const challenge = async (days: number) => {
      const result = await duels.challenge(entry.id, days);
      setToast(
        result === 'sent'
          ? { text: `Défi envoyé à ${entry.name}. Il commence dès qu’il est accepté.`, isError: false }
          : result === 'already'
            ? { text: `Un duel est déjà en cours avec ${entry.name}.`, isError: false }
            : { text: 'Le défi n’a pas pu être envoyé. Réessayez.', isError: true }
      );
    };
    // Retirer un ami ne se rattrape pas : on demande confirmation (deux boutons, sûrs sur Android).
    const remove = () =>
      Alert.alert(`Retirer ${entry.name} de vos amis ?`, 'Il faudra lui renvoyer une demande pour le retrouver.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Retirer', style: 'destructive', onPress: () => friends.remove(entry.id) },
      ]);
    return [
      { label: 'Encourager 👏', onPress: cheer },
      ...DUEL_DAYS.map((days) => ({ label: `Défier sur ${days} jours`, onPress: () => challenge(days) })),
      { label: 'Retirer de mes amis', destructive: true, onPress: remove },
    ];
  };

  const respondDuel = async (duel: DuelRow, accept: boolean) => {
    await duels.respond(duel.id, accept);
    const name = duel.other_name ?? 'votre ami';
    setToast({
      text: accept ? `Duel accepté contre ${name}. Bonne marche !` : `Défi de ${name} refusé.`,
      isError: false,
    });
  };
  const rematch = async (duel: DuelRow) => {
    const result = await duels.challenge(duel.other_id, duel.days);
    const name = duel.other_name ?? 'votre ami';
    setToast(
      result === 'sent'
        ? { text: `Revanche proposée à ${name}.`, isError: false }
        : result === 'already'
          ? { text: `Un duel est déjà en cours avec ${name}.`, isError: false }
          : { text: 'Le défi n’a pas pu être envoyé. Réessayez.', isError: true }
    );
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
  // Seul dans son classement : aucun ami accepté pour l'instant.
  const noFriends = ranking.length === 1;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="subtitle">Amis</ThemedText>

            {friends.status === 'loading' ? <ActivityIndicator style={styles.loader} /> : null}
            {friends.status === 'error' ? (
              <Message text="Impossible de charger vos amis. Vérifiez votre connexion." isError />
            ) : null}

            {/* D'abord ce qui attend une réponse : demandes et défis reçus. */}
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

            {duels.duels.length > 0 ? (
              <DuelsCard duels={duels.duels} onRespond={respondDuel} onRematch={rematch} />
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
            {friends.status === 'ready' && noFriends ? (
              // Sans ami, pas de classement vide : une invitation, avec un seul bouton plein.
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="subtitle">Marchez à plusieurs</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Avec des amis, vous comparez vos pas chaque jour, vous vous lancez des duels et
                  vous voyez leurs cases sur la carte, pour aller les reprendre.
                </ThemedText>
                {profile?.username ? <Button title="Inviter un ami" onPress={invite} /> : null}
              </ThemedView>
            ) : null}
            {friends.status === 'ready' && !noFriends ? (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">Classement du jour</ThemedText>
                {ranking.map((entry) => (
                  <RankingRow key={entry.id} entry={entry} onPress={() => setSelected(entry)} />
                ))}
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
              {profile?.username && !noFriends ? (
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
              {/* Le bouton n'apparaît qu'une fois la saisie commencée, avec la raison s'il attend. */}
              {username.trim().length === 0 ? null : username.trim().length < 3 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Un pseudo fait au moins 3 caractères.
                </ThemedText>
              ) : (
                <Button
                  title={`Envoyer la demande à ${username.trim()}`}
                  variant="secondary"
                  loading={adding}
                  onPress={add}
                />
              )}
            </ThemedView>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/competitions')}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={[styles.card, styles.linkCard]}>
                <View style={styles.flex}>
                  <ThemedText type="smallBold">🏆 Compétitions</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {competitionsSummary(league, season)}
                  </ThemedText>
                </View>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  ›
                </ThemedText>
              </ThemedView>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      {toast ? (
        <View style={styles.toastArea} pointerEvents="none">
          <ThemedView
            type="backgroundSelected"
            style={styles.toast}
            accessibilityLiveRegion="polite">
            <Message {...toast} />
          </ThemedView>
        </View>
      ) : null}
      <ActionSheet
        visible={selected !== null}
        title={selected?.name}
        actions={selected ? friendActions(selected) : []}
        onClose={() => setSelected(null)}
      />
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
      accessibilityHint={entry.isMe ? undefined : 'Défier, encourager ou retirer cet ami'}
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
      {entry.isMe ? null : (
        <View style={[styles.pill, { borderColor: theme.tint }]}>
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            Défier
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

/** Duels entre amis : défis reçus à accepter, duels en cours et résultats récents. */
function DuelsCard({
  duels,
  onRespond,
  onRematch,
}: {
  duels: DuelRow[];
  onRespond: (duel: DuelRow, accept: boolean) => Promise<void>;
  onRematch: (duel: DuelRow) => void;
}) {
  const theme = useTheme();
  const today = localDay(new Date());
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.titleRow}>
        <ThemedText type="smallBold">⚔️ Duels</ThemedText>
        <InfoButton topic="duel" />
      </View>
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
                <Button title="Relever" style={styles.flex} onPress={() => onRespond(duel, true)} />
                <Button
                  title="Refuser"
                  variant="secondary"
                  style={styles.flex}
                  onPress={() => onRespond(duel, false)}
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
            {phase === 'won' || phase === 'lost' || phase === 'tie' ? (
              <CardLink
                title={phase === 'lost' ? 'Prendre ma revanche' : 'Rejouer'}
                onPress={() => onRematch(duel)}
              />
            ) : null}
          </View>
        );
      })}
    </ThemedView>
  );
}

/** Résumé de la ligne « Compétitions » : sa ligue et son rang de saison. */
function competitionsSummary(league: LeagueRow[] | null, season: SeasonRow | null): string {
  const me = league?.find((row) => row.is_me);
  const parts: string[] = [];
  if (me)
    parts.push(
      me.players < MIN_LEAGUE_PLAYERS
        ? `${tierName(me.tier)} : groupe en formation`
        : `${tierName(me.tier)} : ${ordinal(me.rank)} sur ${me.players}`
    );
  if (season?.rank) parts.push(`${seasonName(new Date(season.season_start))} : ${ordinal(season.rank)}`);
  return parts.length > 0 ? parts.join(' · ') : 'Ligue de la semaine et saison de Conquête';
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pill: {
    borderWidth: 1.5,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  toastArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: BottomTabInset + Spacing.five,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  toast: {
    maxWidth: MaxContentWidth,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.tile,
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
