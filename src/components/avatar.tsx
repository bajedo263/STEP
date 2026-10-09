import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

/** Pastille ronde à l'initiale du pseudo, en attendant les photos de profil. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const theme = useTheme();
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.tint },
      ]}>
      <ThemedText style={{ color: theme.onTint, fontSize: size * 0.42, lineHeight: size * 0.55, fontWeight: 800 }}>
        {initial}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
