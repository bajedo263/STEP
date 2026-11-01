import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

/**
 * Action secondaire d'une carte, en lien plutôt qu'en bouton : un seul bouton plein par écran,
 * « Partir », pour que rien ne lui fasse concurrence.
 */
export function CardLink({ title, onPress }: { title: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
      <ThemedText type="smallBold" style={{ color: theme.tint }}>
        {`${title} ›`}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.5,
  },
});
