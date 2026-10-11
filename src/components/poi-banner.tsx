import { useMemo, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  Linking,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { PoiStory } from '@/components/poi-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, PoiColor, Radius, Spacing, VisitedPoiColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { POI_KIND_LABELS, type RoutePoi } from '@/lib/pois';

/** Glissé (px) qui déplie, replie ou ferme la fiche. */
const SWIPE_THRESHOLD = 36;

/**
 * Le lieu devant lequel on passe, pendant le trajet. Glisser vers le haut déplie la fiche pour
 * lire toute l'introduction de l'article ; vers le bas, la replie puis la ferme.
 */
export function PoiBanner({
  poi,
  status,
  onClose,
}: {
  poi: RoutePoi;
  status: 'new' | 'visited' | 'here';
  onClose: () => void;
}) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const [translateY] = useState(() => new Animated.Value(0));
  const color = status === 'here' ? PoiColor : VisitedPoiColor;
  const heading = {
    new: 'Nouveau lieu découvert !',
    visited: 'Déjà découvert',
    here: 'À voir ici',
  }[status];

  const expand = (next: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(next);
  };

  // Recréé seulement quand la fiche change d'état, jamais pendant un glissé.
  const panHandlers = useMemo(() => {
    const settle = () => Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
    return PanResponder.create({
      // Un seul doigt et un geste nettement vertical : la photo se pince, les liens se touchent.
      onMoveShouldSetPanResponderCapture: (_, { dx, dy, numberActiveTouches }) =>
        numberActiveTouches === 1 && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * 1.5,
      onPanResponderMove: (_, { dy }) => {
        // La fiche suit le doigt vers le bas, et un peu vers le haut tant qu'elle est repliée.
        translateY.setValue(expanded ? Math.max(0, dy) : Math.max(-SWIPE_THRESHOLD, dy));
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (!expanded && (dy < -SWIPE_THRESHOLD / 2 || vy < -0.6)) {
          expand(true);
          settle();
        } else if (dy > SWIPE_THRESHOLD || vy > 0.8) {
          if (expanded) {
            expand(false);
            settle();
          } else {
            Animated.timing(translateY, {
              toValue: 400,
              duration: 180,
              useNativeDriver: true,
            }).start(onClose);
          }
        } else {
          settle();
        }
      },
      onPanResponderTerminate: settle,
    }).panHandlers;
  }, [expanded, onClose, translateY]);

  const wikipediaLink = poi.wikipediaUrl ? (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(poi.wikipediaUrl!)}>
      <ThemedText type="small" style={{ color: theme.tint }}>
        {expanded ? 'Lire l’article complet sur Wikipédia' : 'En savoir plus sur Wikipédia'}
      </ThemedText>
    </Pressable>
  ) : null;

  return (
    <Animated.View
      // Repliée, toute la fiche se glisse ; dépliée, seul l'en-tête, pour laisser défiler le texte.
      {...(expanded ? {} : panHandlers)}
      style={[styles.wrapper, { transform: [{ translateY }] }]}>
      <ThemedView
        style={[styles.card, { borderColor: color }, expanded && { maxHeight: height * 0.6 }]}>
        <View {...(expanded ? panHandlers : {})} style={styles.header}>
          <View style={[styles.grabber, { backgroundColor: theme.backgroundSelected }]} />
          <View style={styles.headingRow}>
            <ThemedText type="small" style={[styles.flex, { color }]}>
              {`${heading} · ${POI_KIND_LABELS[poi.kind]}`}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fermer la fiche"
              hitSlop={10}
              onPress={onClose}
              style={[styles.close, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                ✕
              </ThemedText>
            </Pressable>
          </View>
          <ThemedText type="smallBold">{poi.title}</ThemedText>
        </View>
        {expanded ? (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <PoiStory poi={poi} long />
            {wikipediaLink}
          </ScrollView>
        ) : (
          <>
            <PoiStory poi={poi} numberOfLines={4} />
            {poi.wikipediaUrl ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Lire la suite"
                hitSlop={8}
                onPress={() => expand(true)}>
                <ThemedText type="smallBold" style={{ color: theme.tint }}>
                  Lire la suite ↑
                </ThemedText>
              </Pressable>
            ) : null}
          </>
        )}
      </ThemedView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    marginBottom: Spacing.two,
  },
  card: {
    gap: Spacing.one,
    padding: Spacing.three,
    paddingTop: Spacing.two,
    borderRadius: Spacing.four,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  header: {
    gap: Spacing.one,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: Radius.pill,
    marginBottom: Spacing.one,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  close: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.one,
  },
});
