import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PinchZone, ZoomablePhoto } from '@/components/zoomable-photo';
import { MaxContentWidth, PoiColor, Radius, Spacing, VisitedPoiColor } from '@/constants/theme';
import { usePoiIntro, usePoiStory } from '@/hooks/use-poi-story';
import { useTheme } from '@/hooks/use-theme';
import { POI_KIND_LABELS, type Poi } from '@/lib/pois';

/** Fiche d'un lieu touché sur la carte, en haut de l'écran : on la déplie vers le bas. */
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
  // Marge haute calculée ici : dans un écran modal, SafeAreaView l'oubliait (fiche sous l'heure).
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + topOffset,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
      pointerEvents="box-none">
      <PoiCard
        key={poi.id}
        poi={poi}
        label={
          visited ? `Déjà découvert · ${POI_KIND_LABELS[poi.kind]}` : POI_KIND_LABELS[poi.kind]
        }
        color={visited ? VisitedPoiColor : PoiColor}
        placement="top"
        onClose={onClose}
      />
    </View>
  );
}

/** Taille de la petite photo d'un lieu. */
const PHOTO_SIZE = 64;
/** Glissé (px) qui déplie, replie ou ferme la fiche. */
const SWIPE_THRESHOLD = 36;

/**
 * Fiche d'un lieu : repliée, son nom et sa photo ; on la déplie d'un glissé (vers le bas en
 * haut de l'écran, vers le haut en bas) pour lire l'introduction de l'article Wikipédia, avec
 * le lien vers l'article à la fin. Glisser dans l'autre sens la replie, puis la ferme.
 */
export function PoiCard({
  poi,
  label,
  color,
  placement,
  onClose,
}: {
  poi: Poi;
  label: string;
  color: string;
  placement: 'top' | 'bottom';
  onClose: () => void;
}) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const story = usePoiStory(poi.wikipediaUrl);
  const [expanded, setExpanded] = useState(false);
  const [translateY] = useState(() => new Animated.Value(0));
  // Sens du glissé qui déplie la fiche : vers le bas en haut de l'écran, vers le haut en bas.
  const opening = placement === 'top' ? 1 : -1;
  const canExpand = Boolean(poi.wikipediaUrl || poi.description);

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
        const toward = dy * opening;
        // La fiche suit le doigt vers la sortie, et un peu dans le sens qui la déplie.
        const limited = expanded ? Math.min(0, toward) : Math.min(SWIPE_THRESHOLD, toward);
        translateY.setValue(limited * opening);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        const toward = dy * opening;
        const speed = vy * opening;
        if (!expanded && canExpand && (toward > SWIPE_THRESHOLD / 2 || speed > 0.6)) {
          expand(true);
          settle();
        } else if (toward < -SWIPE_THRESHOLD || speed < -0.8) {
          if (expanded) {
            expand(false);
            settle();
          } else {
            Animated.timing(translateY, {
              toValue: -opening * 400,
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
  }, [expanded, canExpand, opening, onClose, translateY]);

  const grabber = <View style={[styles.grabber, { backgroundColor: theme.backgroundSelected }]} />;
  const hint =
    placement === 'top'
      ? 'Glissez vers le bas pour en savoir plus'
      : 'Glissez vers le haut pour en savoir plus';

  return (
    <Animated.View
      // Repliée, toute la fiche se glisse ; dépliée, seul l'en-tête, pour laisser défiler le texte.
      {...(expanded ? {} : panHandlers)}
      style={[styles.wrapper, { transform: [{ translateY }] }]}>
      <PinchZone image={story.image}>
        <ThemedView
          style={[styles.card, { borderColor: color }, expanded && { maxHeight: height * 0.6 }]}>
          <View {...(expanded ? panHandlers : {})} style={styles.header}>
            {placement === 'bottom' ? grabber : null}
            <View style={styles.headingRow}>
              <ThemedText type="small" style={[styles.flex, { color }]}>
                {label}
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
            <View style={styles.titleRow}>
              {story.image ? (
                <ZoomablePhoto image={story.image} size={PHOTO_SIZE} label={poi.title} />
              ) : null}
              <View style={[styles.flex, styles.titleText]}>
                <ThemedText type="default" style={styles.title}>
                  {poi.title}
                </ThemedText>
                {!expanded && canExpand ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Lire la suite"
                    hitSlop={8}
                    onPress={() => expand(true)}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {hint}
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
            </View>
            {placement === 'top' && !expanded ? grabber : null}
          </View>
          {expanded ? (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <PoiStory poi={poi} long />
              {poi.wikipediaUrl ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => Linking.openURL(poi.wikipediaUrl!)}>
                  <ThemedText type="smallBold" style={{ color: theme.tint }}>
                    Lire l’article sur Wikipédia
                  </ThemedText>
                </Pressable>
              ) : null}
            </ScrollView>
          ) : null}
          {placement === 'top' && expanded ? (
            <View {...panHandlers} style={styles.bottomGrip}>
              {grabber}
            </View>
          ) : null}
        </ThemedView>
      </PinchZone>
    </Animated.View>
  );
}

/** Texte du lieu : l'introduction de l'article, ou à défaut sa description courte. */
export function PoiStory({ poi, long = false }: { poi: Poi; long?: boolean }) {
  const story = usePoiStory(poi.wikipediaUrl);
  const intro = usePoiIntro(poi.wikipediaUrl, long);
  const short = story.status === 'ready' ? (story.text ?? poi.description) : poi.description;
  const text = long && intro.status === 'ready' && intro.text ? intro.text : short;
  const loading = story.status === 'loading' || (long && intro.status === 'loading');
  return (
    <View style={styles.story}>
      {text ? <ThemedText type="small">{text}</ThemedText> : null}
      {loading ? <ActivityIndicator size="small" style={styles.loader} /> : null}
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
  wrapper: {
    // La marge latérale est portée par le conteneur : avec width 100 % + marge, la fiche débordait.
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    marginVertical: Spacing.two,
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  header: {
    gap: Spacing.two,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: Radius.pill,
  },
  bottomGrip: {
    paddingTop: Spacing.one,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  titleText: {
    gap: Spacing.one,
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
  flex: {
    flex: 1,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.one,
  },
  story: {
    gap: Spacing.one,
  },
  loader: {
    alignSelf: 'flex-start',
  },
});
