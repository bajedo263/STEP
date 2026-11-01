import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { InfoButton } from '@/components/ui/info-button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  MIN_LEAGUE_PLAYERS,
  leagueChangeLabel,
  leagueStatusLabel,
  leagueZone,
  stepsToOvertake,
  tierName,
  type LeagueRow,
} from '@/lib/league';
import {
  ordinal,
  seasonEndLabel,
  seasonMeLabel,
  seasonName,
  seasonRanking,
  type SeasonRow,
} from '@/lib/season';

const formatNumber = (value: number) => Math.round(value).toLocaleString('fr-FR');

/** Saison de Conquête : classement entre amis aux cases détenues, rang général et saison passée. */
export function SeasonCard({
  season,
  ranking,
}: {
  season: SeasonRow;
  ranking: ReturnType<typeof seasonRanking>;
}) {
  const theme = useTheme();
  const lastPlayers = season.last_players ?? 0;
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View>
        <View style={styles.titleRow}>
          <ThemedText type="smallBold">{`🚩 ${seasonName(new Date(season.season_start))}`}</ThemedText>
          <InfoButton topic="season" />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {`${seasonEndLabel(new Date(season.season_end), new Date())}. Toutes les cases repartent de zéro le 1er du mois.`}
        </ThemedText>
      </View>
      <ThemedText type="small">{seasonMeLabel(season.rank, season.players)}</ThemedText>
      {ranking.length > 1
        ? ranking.map((entry) => (
            <View
              key={entry.id}
              style={[
                styles.rankingRow,
                entry.isMe && { backgroundColor: theme.backgroundSelected },
              ]}>
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
export function LeagueCard({ rows }: { rows: LeagueRow[] }) {
  const theme = useTheme();
  const me = rows.find((row) => row.is_me);
  if (!me) return null;
  const change = leagueChangeLabel(me);
  const forming = me.players < MIN_LEAGUE_PLAYERS;
  const overtake = stepsToOvertake(rows);
  // Les 10 premiers, et sa propre place si elle est plus loin.
  const shown = rows.filter((row) => row.rank <= 10 || row.is_me);
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View>
        <View style={styles.titleRow}>
          <ThemedText type="smallBold">{tierName(me.tier)}</ThemedText>
          <InfoButton topic="league" />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Classement aux pas de la semaine, jusqu’à dimanche soir.
        </ThemedText>
      </View>
      {change ? <ThemedText type="smallBold">{change}</ThemedText> : null}
      {/* Seul ou presque dans son groupe : pas de « 1er sur 1 ». */}
      <ThemedText type="small">
        {forming
          ? `${leagueStatusLabel(me)} Vous : ${formatNumber(me.steps)} pas cette semaine.`
          : `Vous : ${me.rank}${me.rank === 1 ? 'er' : 'e'} sur ${me.players}. ${leagueStatusLabel(me)}`}
      </ThemedText>
      {overtake ? (
        <ThemedText type="small" themeColor="textSecondary">
          {`${formatNumber(overtake)} pas pour gagner une place.`}
        </ThemedText>
      ) : null}
      {!forming
        ? shown.map((row) => {
            const zone = leagueZone(row);
            return (
              <View
                key={row.user_id}
                style={[
                  styles.rankingRow,
                  row.is_me && { backgroundColor: theme.backgroundSelected },
                ]}>
                <ThemedText
                  type="smallBold"
                  style={[
                    styles.rank,
                    zone === 'promote' && { color: theme.success },
                    zone === 'demote' && { color: theme.danger },
                  ]}>
                  {/* Flèche en plus de la couleur : la zone se lit sans distinguer vert et rouge. */}
                  {zone === 'promote' ? `▲${row.rank}` : zone === 'demote' ? `▼${row.rank}` : row.rank}
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

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.card,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
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
    width: 32,
    textAlign: 'center',
  },
});
