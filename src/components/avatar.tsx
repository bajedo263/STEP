import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

/**
 * Pastille ronde à l'initiale du pseudo, en attendant les photos de profil. `ring` ajoute un
 * cadre de couleur, gagné en fin de saison.
 */
export function Avatar({ name, size = 40, ring }: { name: string; size?: number; ring?: string | null }) {
  const theme = useTheme();
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const border = Math.max(2, Math.round(size / 14));
  if (ring) {
    return (
      <View
        style={{
          padding: border,
          borderRadius: size / 2 + border * 2,
          borderWidth: border,
          borderColor: ring,
        }}>
        <Avatar name={name} size={size - border * 4} />
      </View>
    );
  }
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
