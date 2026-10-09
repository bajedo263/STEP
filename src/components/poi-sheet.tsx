import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, PoiColor, Spacing, VisitedPoiColor } from '@/constants/theme';
import { usePoiStory } from '@/hooks/use-poi-story';
import { useTheme } from '@/hooks/use-theme';
import { POI_KIND_LABELS, type Poi } from '@/lib/pois';

/** Fiche d'un lieu touché sur la carte, avec une courte anecdote tirée de Wikipédia. */
export function PoiSheet({
  poi,
  visited,
  onClose,
}: {
  poi: Poi;
  visited: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const color = visited ? VisitedPoiColor : PoiColor;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container} pointerEvents="box-none">
      <ThemedView style={[styles.sheet, { borderColor: color }]}>
        <View style={styles.header}>
          <ThemedText type="small" style={[styles.flex, { color }]}>
            {visited ? `Déjà découvert · ${POI_KIND_LABELS[poi.kind]}` : POI_KIND_LABELS[poi.kind]}
          </ThemedText>
          <Pressable accessibilityRole="button" accessibilityLabel="Fermer" hitSlop={12} onPress={onClose}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              ✕
            </ThemedText>
          </Pressable>
        </View>
        <ThemedText type="smallBold">{poi.title}</ThemedText>
        <PoiStory poi={poi} />
        {poi.wikipediaUrl ? (
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(poi.wikipediaUrl!)}>
            <ThemedText type="small" style={{ color: theme.tint }}>
              Lire l’article sur Wikipédia
            </ThemedText>
          </Pressable>
        ) : null}
      </ThemedView>
    </SafeAreaView>
  );
}

/** Anecdote du lieu, ou sa description courte en attendant (ou à défaut). */
export function PoiStory({ poi, numberOfLines }: { poi: Poi; numberOfLines?: number }) {
  const story = usePoiStory(poi.wikipediaUrl);
  const text = story.status === 'ready' ? (story.text ?? poi.description) : poi.description;
  return (
    <View style={styles.story}>
      {text ? (
        <ThemedText type="small" numberOfLines={numberOfLines}>
          {text}
        </ThemedText>
      ) : null}
      {story.status === 'loading' ? <ActivityIndicator size="small" style={styles.loader} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.one,
    padding: Spacing.three,
    marginTop: Spacing.two,
    marginHorizontal: Spacing.three,
    borderRadius: Spacing.four,
    borderWidth: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  story: {
    gap: Spacing.one,
  },
  loader: {
    alignSelf: 'flex-start',
  },
});
