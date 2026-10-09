import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, PoiColor, Radius, Spacing, VisitedPoiColor } from '@/constants/theme';
import { usePoiStory } from '@/hooks/use-poi-story';
import { useTheme } from '@/hooks/use-theme';
import { POI_KIND_LABELS, type Poi } from '@/lib/pois';

/** Fiche d'un lieu touché sur la carte, avec une courte anecdote tirée de Wikipédia. */
export function PoiSheet({
  poi,
  visited,
  onClose,
  topOffset = 0,
}: {
  poi: Poi;
  visited: boolean;
  onClose: () => void;
  /** Espace à laisser sous la barre d'état, pour des boutons posés en haut de l'écran. */
  topOffset?: number;
}) {
  const theme = useTheme();
  // Marge haute calculée ici : dans un écran modal, SafeAreaView l'oubliait (fiche sous l'heure).
  const insets = useSafeAreaInsets();
  const color = visited ? VisitedPoiColor : PoiColor;

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + topOffset, paddingLeft: insets.left, paddingRight: insets.right },
      ]}
      pointerEvents="box-none">
      <ThemedView style={[styles.sheet, { borderColor: color }]}>
        <View style={styles.header}>
          <ThemedText type="smallBold" style={[styles.flex, { color }]}>
            {visited ? `Déjà découvert · ${POI_KIND_LABELS[poi.kind]}` : POI_KIND_LABELS[poi.kind]}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            hitSlop={8}
            onPress={onClose}
            style={[styles.close, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              ✕
            </ThemedText>
          </Pressable>
        </View>
        <ThemedText type="default" style={styles.title}>
          {poi.title}
        </ThemedText>
        <PoiStory poi={poi} />
        {poi.wikipediaUrl ? (
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(poi.wikipediaUrl!)}>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              Lire l’article sur Wikipédia
            </ThemedText>
          </Pressable>
        ) : null}
      </ThemedView>
    </View>
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
    marginHorizontal: Spacing.three,
  },
  sheet: {
    // La marge latérale est portée par le conteneur : avec width 100 % + marge, la fiche débordait.
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.two,
    padding: Spacing.three,
    marginTop: Spacing.two,
    borderRadius: Radius.card,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: 800,
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
