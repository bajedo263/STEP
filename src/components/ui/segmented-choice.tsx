import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Option<T extends string> = { value: T; label: string };

type SegmentedChoiceProps<T extends string> = {
  label?: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedChoice<T extends string>({ label, options, value, onChange }: SegmentedChoiceProps<T>) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {label ? <ThemedText type="smallBold">{label}</ThemedText> : null}
      <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[styles.option, selected && { backgroundColor: theme.tint }]}>
              <ThemedText
                type={selected ? 'smallBold' : 'small'}
                themeColor="textSecondary"
                style={selected && { color: theme.onTint }}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
    alignSelf: 'stretch',
  },
  track: {
    flexDirection: 'row',
    padding: Spacing.one,
    borderRadius: Radius.pill,
    gap: Spacing.one,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two + Spacing.half,
    borderRadius: Radius.pill,
  },
});
