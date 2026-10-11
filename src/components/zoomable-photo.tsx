import { Image } from 'expo-image';
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  makeMutable,
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { PoiImage } from '@/lib/poi-story';

/** Agrandissement maximal au doigt. */
const MAX_SCALE = 5;
/** Zoom d'un double appui dans la visionneuse. */
const DOUBLE_TAP_SCALE = 2.5;
/** Glissé vers le bas, à taille normale, au-delà duquel la visionneuse se ferme. */
const DISMISS_DRAG = 120;
const SPRING = { damping: 18, stiffness: 220 };

/**
 * Zoom en cours, partagé entre la zone qu'on pince et la photo agrandie, dessinée tout en haut
 * de l'écran par `PhotoZoomOverlay` (une seule photo se pince à la fois).
 */
const zoom = {
  active: makeMutable(false),
  /** Position de la petite photo à l'écran au début du geste. */
  x: makeMutable(0),
  y: makeMutable(0),
  width: makeMutable(0),
  height: makeMutable(0),
  scale: makeMutable(1),
  /** Point entre les doigts au début du geste, puis maintenant (coordonnées de l'écran). */
  startX: makeMutable(0),
  startY: makeMutable(0),
  focalX: makeMutable(0),
  focalY: makeMutable(0),
};

// Photo agrandie : côté JavaScript, pour que l'image s'affiche.
let zoomedImage: PoiImage | null = null;
const listeners = new Set<() => void>();
function setZoomedImage(image: PoiImage | null) {
  zoomedImage = image;
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const PinchContext = createContext<{
  photoHandle: AnimatedRef<Animated.View>;
  zooming: SharedValue<boolean>;
} | null>(null);

/**
 * Zone qu'on pince pour agrandir la photo qu'elle contient, comme sur Instagram : toute la
 * fiche, bien plus large que la photo. La photo suit les doigts (on l'écarte vers le centre
 * de l'écran) et reprend sa place au lâcher.
 */
export function PinchZone({
  image,
  style,
  children,
}: {
  image: PoiImage | null;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const photoHandle = useAnimatedRef<Animated.View>();
  const zoneHandle = useAnimatedRef<Animated.View>();
  const zoneX = useSharedValue(0);
  const zoneY = useSharedValue(0);
  const zooming = useSharedValue(false);

  const pinch = Gesture.Pinch()
    .enabled(image !== null)
    // Les rappels du geste tournent sur le fil de l'interface pendant le pincement, jamais au
    // rendu : la règle prend à tort la mesure des vues pour une lecture de ref.
    // eslint-disable-next-line react-hooks/refs
    .onStart((event) => {
      const photo = measure(photoHandle);
      const zone = measure(zoneHandle);
      if (!photo || !zone) return;
      zoneX.set(zone.pageX);
      zoneY.set(zone.pageY);
      zoom.x.set(photo.pageX);
      zoom.y.set(photo.pageY);
      zoom.width.set(photo.width);
      zoom.height.set(photo.height);
      zoom.startX.set(zone.pageX + event.focalX);
      zoom.startY.set(zone.pageY + event.focalY);
      zoom.focalX.set(zone.pageX + event.focalX);
      zoom.focalY.set(zone.pageY + event.focalY);
      zoom.scale.set(1);
      zoom.active.set(true);
      zooming.set(true);
      scheduleOnRN(setZoomedImage, image);
    })
    .onUpdate((event) => {
      if (!zooming.get()) return;
      zoom.scale.set(Math.min(MAX_SCALE, Math.max(1, event.scale)));
      zoom.focalX.set(zoneX.get() + event.focalX);
      zoom.focalY.set(zoneY.get() + event.focalY);
    })
    .onFinalize(() => {
      if (!zooming.get()) return;
      // La photo revient à sa place, puis la petite photo réapparaît.
      zoom.focalX.set(withSpring(zoom.startX.get(), SPRING));
      zoom.focalY.set(withSpring(zoom.startY.get(), SPRING));
      zoom.scale.set(
        withSpring(1, SPRING, (finished) => {
          if (!finished) return;
          zoom.active.set(false);
          zooming.set(false);
          scheduleOnRN(setZoomedImage, null);
        })
      );
    });

  const context = useMemo(() => ({ photoHandle, zooming }), [photoHandle, zooming]);

  return (
    <PinchContext value={context}>
      <GestureHandlerRootView style={style}>
        <GestureDetector gesture={pinch}>
          <Animated.View ref={zoneHandle} collapsable={false}>
            {children}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </PinchContext>
  );
}

/**
 * La photo qu'on est en train de pincer, par-dessus tout l'écran. À poser en dernier dans
 * l'écran qui affiche des fiches de lieux.
 */
export function PhotoZoomOverlay() {
  const image = useSyncExternalStore(subscribe, () => zoomedImage);
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: zoom.active.get() ? Math.min(0.75, (zoom.scale.get() - 1) * 0.6) : 0,
  }));
  const photoStyle = useAnimatedStyle(() => {
    const scale = zoom.scale.get();
    const centerX = zoom.x.get() + zoom.width.get() / 2;
    const centerY = zoom.y.get() + zoom.height.get() / 2;
    // Le point sous les doigts reste sous les doigts : on agrandit autour de lui et on le suit.
    const movedX = zoom.focalX.get() + scale * (centerX - zoom.startX.get());
    const movedY = zoom.focalY.get() + scale * (centerY - zoom.startY.get());
    return {
      opacity: zoom.active.get() ? 1 : 0,
      left: zoom.x.get(),
      top: zoom.y.get(),
      width: zoom.width.get(),
      height: zoom.height.get(),
      transform: [{ translateX: movedX - centerX }, { translateY: movedY - centerY }, { scale }],
    };
  });
  if (!image) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      <Animated.View style={[styles.zoomed, photoStyle]}>
        <Image
          source={image.large}
          placeholder={image.thumbnail}
          style={styles.thumbnail}
          contentFit="cover"
        />
      </Animated.View>
    </View>
  );
}

/**
 * Petite photo d'un lieu. Posée dans une `PinchZone`, elle s'agrandit en pinçant la zone ; un
 * appui l'ouvre en plein écran.
 */
export function ZoomablePhoto({
  image,
  size,
  label,
}: {
  image: PoiImage;
  size: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const pinch = use(PinchContext);

  // La version en grand est prête quand on pince.
  useEffect(() => {
    Image.prefetch(image.large).catch(() => {});
  }, [image.large]);

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => setOpen(true));

  // Pendant le zoom, seule la photo agrandie est visible.
  const hiddenStyle = useAnimatedStyle(() => ({
    opacity: pinch?.zooming.get() ? 0 : 1,
  }));

  return (
    <>
      <GestureDetector gesture={tap}>
        <Animated.View
          ref={pinch?.photoHandle}
          collapsable={false}
          accessible
          accessibilityRole="imagebutton"
          accessibilityLabel={`Photo : ${label}. Touchez pour l’agrandir.`}
          style={[{ width: size, height: size }, hiddenStyle]}>
          <Image
            source={image.thumbnail}
            style={styles.thumbnail}
            contentFit="cover"
            transition={200}
          />
        </Animated.View>
      </GestureDetector>
      <PhotoViewer image={image} label={label} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Photo en plein écran : pincer pour zoomer, glisser pour se déplacer, double appui. */
function PhotoViewer({
  image,
  label,
  visible,
  onClose,
}: {
  image: PoiImage;
  label: string;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  // Taille de la photo à l'écran, avant zoom.
  const photoWidth = Math.min(width, height * image.aspectRatio);
  const photoHeight = photoWidth / image.aspectRatio;

  const reset = () => {
    scale.set(1);
    savedScale.set(1);
    x.set(0);
    y.set(0);
    savedX.set(0);
    savedY.set(0);
  };

  const close = () => {
    reset();
    onClose();
  };

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.set(Math.min(MAX_SCALE, Math.max(1, savedScale.get() * event.scale)));
    })
    .onEnd(() => {
      savedScale.set(scale.get());
      if (scale.get() <= 1) {
        x.set(withSpring(0, SPRING));
        y.set(withSpring(0, SPRING));
        savedX.set(0);
        savedY.set(0);
      }
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((event) => {
      x.set(savedX.get() + event.translationX);
      y.set(savedY.get() + event.translationY);
    })
    .onEnd((event) => {
      if (savedScale.get() <= 1) {
        // À taille normale, on glisse vers le bas pour fermer, sinon la photo revient.
        if (event.translationY > DISMISS_DRAG) {
          y.set(
            withTiming(height, { duration: 180 }, (finished) => {
              if (finished) scheduleOnRN(close);
            })
          );
          return;
        }
        x.set(withSpring(0, SPRING));
        y.set(withSpring(0, SPRING));
        return;
      }
      // Zoomée, la photo ne quitte pas l'écran.
      const maxX = Math.max(0, (photoWidth * savedScale.get() - width) / 2);
      const maxY = Math.max(0, (photoHeight * savedScale.get() - height) / 2);
      const clampedX = Math.min(maxX, Math.max(-maxX, x.get()));
      const clampedY = Math.min(maxY, Math.max(-maxY, y.get()));
      x.set(withSpring(clampedX, SPRING));
      y.set(withSpring(clampedY, SPRING));
      savedX.set(clampedX);
      savedY.set(clampedY);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = savedScale.get() > 1 ? 1 : DOUBLE_TAP_SCALE;
      scale.set(withSpring(next, SPRING));
      savedScale.set(next);
      x.set(withSpring(0, SPRING));
      y.set(withSpring(0, SPRING));
      savedX.set(0);
      savedY.set(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));
  // Le fond s'éclaircit à mesure qu'on glisse la photo vers le bas pour la fermer.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: savedScale.get() > 1 ? 1 : Math.max(0.3, 1 - Math.abs(y.get()) / (height * 0.6)),
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}
      onDismiss={reset}>
      <GestureHandlerRootView style={styles.viewer}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
        <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
          <View style={styles.stage}>
            <Animated.View style={[{ width: photoWidth, height: photoHeight }, animatedStyle]}>
              <Image
                source={image.large}
                placeholder={image.thumbnail}
                style={styles.full}
                contentFit="contain"
                transition={200}
                accessibilityLabel={`Photo : ${label}`}
              />
            </Animated.View>
          </View>
        </GestureDetector>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer la photo"
          hitSlop={12}
          onPress={close}
          style={[styles.close, { top: insets.top + Spacing.two }]}>
          <ThemedText type="smallBold" style={styles.closeText}>
            ✕
          </ThemedText>
        </Pressable>
        <ThemedText
          type="small"
          style={[styles.credit, { bottom: insets.bottom + Spacing.three }]}
          numberOfLines={1}>
          {`${label} · Photo Wikimedia Commons`}
        </ThemedText>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 1000,
    elevation: 1000,
  },
  zoomed: {
    position: 'absolute',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.card / 2,
  },
  viewer: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: '#000000',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  full: {
    width: '100%',
    height: '100%',
  },
  close: {
    position: 'absolute',
    right: Spacing.three,
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  closeText: {
    color: '#FFFFFF',
  },
  credit: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.7)',
  },
});
