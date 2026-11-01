import { ActivityIndicator, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LeagueCard, SeasonCard } from '@/components/competition-cards';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useConquestSeason } from '@/hooks/use-conquest';
import { useFriends } from '@/hooks/use-friends';
import { useLeague } from '@/hooks/use-league';
import { useProfile } from '@/hooks/use-profile';
import { seasonRanking } from '@/lib/season';
import { useAuth } from '@/providers/auth-provider';

/**
 * Compétitions : la ligue de la semaine (aux pas) et la saison de Conquête (aux cases), à part
 * de l'écran Amis pour qu'il reste centré sur les amis et ce qui attend une réponse.
 */
export default function CompetitionsScreen() {
  const { session } = useAuth();
  const profile = useProfile();
  const league = useLeague();
  const season = useConquestSeason();
  const friends = useFriends();
  const list = friends.status === 'ready' ? friends.friends : [];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView
        style={styles.safeArea}
        edges={Platform.OS === 'ios' ? ['left', 'right'] : ['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Compétitions</ThemedText>
          <ThemedText themeColor="textSecondary">
            Chaque semaine, une ligue aux pas. Chaque mois, une saison aux cases de Conquête.
          </ThemedText>
          {league ? <LeagueCard rows={league} /> : null}
          {season ? (
            <SeasonCard
              season={season}
              ranking={seasonRanking(list, {
                id: session?.user.id ?? 'me',
                name: profile?.username ?? 'Moi',
                cells: season.cells,
              })}
            />
          ) : null}
          {!league && !season ? (
            friends.status === 'loading' ? (
              <ActivityIndicator style={styles.loader} />
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Marchez cette semaine pour entrer dans une ligue : le classement apparaîtra ici.
              </ThemedText>
            )
          ) : null}
        </ScrollView>
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
    paddingTop: Platform.select({ web: Spacing.six + Spacing.four, default: Spacing.four }),
    paddingBottom: Spacing.six,
  },
  loader: {
    marginVertical: Spacing.five,
  },
});
