import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { feedback } from '@/lib/feedback';

/** Moment fort plein écran : un disque vert qui surgit, une vibration, un mot. */
export function Celebration({
  visible,
  title,
  message,
  onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [scale] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0);
    feedback.success();
    Animated.spring(scale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }).start();
  }, [visible, scale]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer">
        <ThemedView style={styles.card}>
          <Animated.View
            style={[
              styles.disc,
              {
                backgroundColor: theme.success,
                transform: [
                  { scale },
                  {
                    rotate: scale.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['-30deg', '0deg'],
                      easing: Easing.out(Easing.quad),
                    }),
                  },
                ],
              },
            ]}>
            <View style={styles.check} />
          </Animated.View>
          <ThemedText type="subtitle" style={styles.centered}>
            {title}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centered}>
            {message}
          </ThemedText>
          <Button title="Super !" onPress={onClose} />
        </ThemedView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: '#00000099',
  },
  card: {
    alignSelf: 'stretch',
    maxWidth: 420,
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.card,
  },
  disc: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Coche dessinée avec deux bords, sans dépendre d'une police d'icônes.
  check: {
    width: 24,
    height: 44,
    marginTop: -8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderColor: '#FFFFFF',
    transform: [{ rotate: '45deg' }],
  },
  centered: {
    textAlign: 'center',
  },
});
