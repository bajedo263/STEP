import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useElapsedSeconds } from '@/hooks/use-walk-tracker';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance } from '@/lib/daily-progress';
import { formatElapsed } from '@/lib/track';
import { useActiveWalk, type ActiveWalk } from '@/providers/walk-provider';

/** Bandeau en haut des onglets tant qu'un trajet tourne : un appui pour y revenir. */
export function WalkBanner() {
  const walk = useActiveWalk();
  return walk ? <Banner walk={walk} /> : null;
}

function Banner({ walk }: { walk: ActiveWalk }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const elapsed = useElapsedSeconds(walk.tracker.startedAt, walk.summary === null);
  const label = walk.summary
    ? 'Trajet terminé · voir le bilan'
    : `Trajet en cours · ${formatDistance(walk.tracker.track.distanceM)} · ${formatElapsed(elapsed)}`;

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { top: insets.top + Spacing.one }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Revenir à l’écran du trajet"
        onPress={() => router.push('/trajet')}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: theme.tint },
          pressed && styles.pressed,
        ]}>
        <View style={styles.dot} />
        <ThemedText type="smallBold" style={styles.text}>
          {label}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  text: {
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.8,
  },
});
