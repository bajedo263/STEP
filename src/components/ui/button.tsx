import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
};

export function Button({ title, variant = 'primary', loading = false, disabled, style, ...props }: ButtonProps) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={(state) => [
        styles.button,
        { backgroundColor: isPrimary ? theme.tint : theme.backgroundElement },
        (state.pressed || isDisabled) && styles.dimmed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}>
      {loading ? (
        <ActivityIndicator color={isPrimary ? theme.onTint : theme.text} />
      ) : (
        <ThemedText type="smallBold" style={{ color: isPrimary ? theme.onTint : theme.text }}>
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
  },
  dimmed: {
    opacity: 0.6,
  },
});
