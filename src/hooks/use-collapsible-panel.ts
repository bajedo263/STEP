import { useCallback, useMemo, useState } from 'react';
import { Animated, Keyboard, LayoutAnimation, PanResponder } from 'react-native';

/** Distance de glissé (px) qui replie ou rouvre le panneau. */
const SWIPE_THRESHOLD = 40;

/**
 * Panneau du bas repliable : glisser vers le bas le réduit pour mieux voir la carte,
 * glisser vers le haut (ou toucher la poignée) le rouvre.
 */
export function useCollapsiblePanel() {
  const [collapsed, setCollapsed] = useState(false);
  const [translateY] = useState(() => new Animated.Value(0));

  const change = useCallback(
    (next: boolean) => {
      if (next === collapsed) return;
      if (next) Keyboard.dismiss();
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setCollapsed(next);
    },
    [collapsed]
  );

  // Recréé seulement quand le panneau change d'état, jamais pendant un glissé.
  const panHandlers = useMemo(() => {
    const settle = () => Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
    return PanResponder.create({
      // On ne prend la main que sur un geste nettement vertical : les boutons restent utilisables.
      onMoveShouldSetPanResponderCapture: (_, { dx, dy }) =>
        Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.5,
      onPanResponderMove: (_, { dy }) => {
        // Le panneau suit le doigt vers le bas quand il est ouvert, un peu vers le haut sinon.
        translateY.setValue(
          collapsed ? Math.max(-SWIPE_THRESHOLD, Math.min(0, dy)) : Math.max(0, dy)
        );
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > SWIPE_THRESHOLD || vy > 0.8) change(true);
        else if (dy < -SWIPE_THRESHOLD / 2 || vy < -0.8) change(false);
        settle();
      },
      onPanResponderTerminate: settle,
    }).panHandlers;
  }, [collapsed, change, translateY]);

  return {
    collapsed,
    translateY,
    panHandlers,
    expand: () => change(false),
    toggle: () => change(!collapsed),
  };
}
