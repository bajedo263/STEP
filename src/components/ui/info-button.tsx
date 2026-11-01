import { Alert, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { MECHANICS, type Mechanic } from '@/lib/mechanics';

/** Petit « ? » qui explique une mécanique de jeu en deux phrases. */
export function InfoButton({ topic }: { topic: Mechanic }) {
  const theme = useTheme();
  const { title, text } = MECHANICS[topic];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title} : explication`}
      hitSlop={10}
      onPress={() => Alert.alert(title, text)}
      style={({ pressed }) => [
        styles.button,
        { borderColor: theme.textSecondary },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
        ?
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.5,
  },
});
