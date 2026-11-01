import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { feedback } from '@/lib/feedback';
import { stepValue, type StepperRange } from '@/lib/stepper';

type StepperProps = StepperRange & {
  value: number;
  onChange: (value: number) => void;
  /** Unité affichée après le nombre, et lue par VoiceOver. */
  unit: string;
  accessibilityLabel: string;
};

const format = (value: number) => Math.round(value).toLocaleString('fr-FR');

/**
 * Sélecteur à crans « − 5 500 pas + » : pas de clavier à ouvrir puis à refermer, et une valeur
 * toujours dans les bornes. Avec VoiceOver, on le règle en balayant vers le haut ou le bas.
 */
export function Stepper({ value, onChange, unit, accessibilityLabel, ...range }: StepperProps) {
  const theme = useTheme();
  const move = (direction: 1 | -1) => {
    const next = stepValue(value, direction, range);
    if (next === value) return;
    feedback.tap();
    onChange(next);
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: `${format(value)} ${unit}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => move(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={[styles.container, { backgroundColor: theme.backgroundElement }]}>
      <StepButton label="−" disabled={value <= range.min} onPress={() => move(-1)} />
      <View style={styles.value}>
        <ThemedText type="stat" maxFontSizeMultiplier={1.3}>
          {format(value)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {unit}
        </ThemedText>
      </View>
      <StepButton label="+" disabled={value >= range.max} onPress={() => move(1)} />
    </View>
  );
}

function StepButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      hitSlop={Spacing.one}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.tintFill },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <ThemedText style={[styles.buttonLabel, { color: theme.onTint }]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    padding: Spacing.one,
    borderRadius: Radius.pill,
  },
  value: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.35,
  },
});
