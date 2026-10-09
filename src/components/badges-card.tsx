import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Badge } from '@/lib/badges';

const formatProgress = (badge: Badge) =>
  `${Math.floor(badge.progress).toLocaleString('fr-FR')} / ${badge.target.toLocaleString('fr-FR')}`;

/** Collection de badges : débloqués en couleur, les autres en grisé avec leur avancement. */
export function BadgesCard({ badges }: { badges: Badge[] }) {
  const unlocked = badges.filter((badge) => badge.unlocked).length;
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.header}>
        <ThemedText type="smallBold" style={styles.flex}>
          Badges
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {`${unlocked} / ${badges.length}`}
        </ThemedText>
      </View>
      <View style={styles.grid}>
        {badges.map((badge) => (
          <BadgeTile key={badge.id} badge={badge} />
        ))}
      </View>
    </ThemedView>
  );
}

function BadgeTile({ badge }: { badge: Badge }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${badge.title} : ${badge.description}${badge.unlocked ? ', débloqué' : `, ${formatProgress(badge)}`}`}
      style={[
        styles.tile,
        {
          backgroundColor: theme.background,
          borderColor: badge.unlocked ? theme.tint : theme.backgroundSelected,
        },
      ]}>
      <ThemedText style={[styles.emoji, !badge.unlocked && styles.locked]}>
        {badge.emoji}
      </ThemedText>
      <ThemedText type="smallBold" numberOfLines={2} style={styles.centered}>
        {badge.title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={3} style={styles.centered}>
        {badge.unlocked ? badge.description : formatProgress(badge)}
      </ThemedText>
    </View>
  );
}

/** Le badge le plus proche d'être débloqué, pour donner un but. */
export function NextBadge({ badge }: { badge: Badge }) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.header}>
        <ThemedText style={styles.emoji}>{badge.emoji}</ThemedText>
        <View style={styles.flex}>
          <ThemedText type="smallBold">{`Prochain badge · ${badge.title}`}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {`${badge.description} (${formatProgress(badge)})`}
          </ThemedText>
        </View>
      </View>
      <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.max(2, (badge.progress / badge.target) * 100)}%`,
              backgroundColor: theme.tint,
            },
          ]}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tile: {
    width: '31%',
    flexGrow: 1,
    alignItems: 'center',
    gap: Spacing.one,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  emoji: {
    fontSize: 28,
    lineHeight: 34,
  },
  locked: {
    opacity: 0.3,
  },
  centered: {
    textAlign: 'center',
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
});
