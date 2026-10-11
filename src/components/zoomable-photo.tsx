import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
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
 * Petite photo qu'on agrandit en écartant deux doigts, comme sur Instagram : elle grossit
 * par-dessus la fiche et reprend sa place au lâcher. Un appui l'ouvre en plein écran.
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
  const scale = useSharedValue(1);
  const originX = useSharedValue(size / 2);
  const originY = useSharedValue(size / 2);

  const pinch = Gesture.Pinch()
    .onStart((event) => {
      // La photo grossit autour des doigts.
      originX.set(event.focalX);
      originY.set(event.focalY);
    })
    .onUpdate((event) => {
      scale.set(Math.min(MAX_SCALE, Math.max(1, event.scale)));
    })
    .onFinalize(() => {
      scale.set(withSpring(1, SPRING));
    });
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => setOpen(true));

  const animatedStyle = useAnimatedStyle(() => ({
    zIndex: scale.get() > 1 ? 100 : 0,
    transformOrigin: [originX.get(), originY.get(), 0],
    transform: [{ scale: scale.get() }],
  }));

  return (
    <>
      <GestureHandlerRootView style={[styles.thumbnailRoot, { width: size, height: size }]}>
        <GestureDetector gesture={Gesture.Race(pinch, tap)}>
          <Animated.View
            accessible
            accessibilityRole="imagebutton"
            accessibilityLabel={`Photo : ${label}. Touchez pour l’agrandir.`}
            style={[{ width: size, height: size }, animatedStyle]}>
            <Image
              source={image.thumbnail}
              style={styles.thumbnail}
              contentFit="cover"
              transition={200}
            />
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
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
  thumbnailRoot: {
    // La photo pincée déborde de son cadre, par-dessus la fiche.
    overflow: 'visible',
    zIndex: 10,
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
