import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loopStepsRange } from '@/lib/loop';

export type LoopStepsChoice = 'goal' | 'custom';

type LoopStepsPickerProps = {
  choice: LoopStepsChoice;
  onChoiceChange: (choice: LoopStepsChoice) => void;
  /** Pas de la boucle proposée par défaut (ce qui manque pour l'objectif, ou le bonus). */
  defaultSteps: number;
  goalReached: boolean;
  /** Saisie en cours, telle que tapée. */
  text: string;
  onTextChange: (text: string) => void;
  strideM: number;
};

const formatSteps = (value: number) => Math.round(value).toLocaleString('fr-FR');

/**
 * Choix de la longueur de la boucle : par défaut ce qui manque pour l'objectif,
 * ou un nombre de pas précis saisi par l'utilisateur.
 */
export function LoopStepsPicker({
  choice,
  onChoiceChange,
  defaultSteps,
  goalReached,
  text,
  onTextChange,
  strideM,
}: LoopStepsPickerProps) {
  const theme = useTheme();
  const { min, max } = loopStepsRange(strideM);
  const typed = parseSteps(text);
  const outOfRange = typed != null && (typed < min || typed > max);

  return (
    <View style={styles.container}>
      <SegmentedChoice<LoopStepsChoice>
        options={[
          {
            value: 'goal',
            label: `${goalReached ? 'Bonus' : 'Objectif'} · ${formatSteps(defaultSteps)} pas`,
          },
          { value: 'custom', label: 'Au choix' },
        ]}
        value={choice}
        onChange={onChoiceChange}
      />
      {choice === 'custom' ? (
        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={(value) => onTextChange(value.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            returnKeyType="done"
            placeholder={formatSteps(defaultSteps)}
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Nombre de pas souhaités"
            autoFocus={text === ''}
            selectTextOnFocus
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
                borderColor: outOfRange ? theme.danger : 'transparent',
              },
            ]}
          />
          <ThemedText themeColor="textSecondary">pas</ThemedText>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={[styles.flex, outOfRange && { color: theme.danger }]}>
            {outOfRange
              ? typed < min
                ? `Minimum ${formatSteps(min)} pas`
                : `Maximum ${formatSteps(max)} pas`
              : `De ${formatSteps(min)} à ${formatSteps(max)}`}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

/** Pas tapés, ou `null` si le champ est vide. */
export function parseSteps(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
    alignSelf: 'stretch',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    minWidth: 110,
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    borderRadius: Radius.tile,
    borderWidth: 1.5,
    textAlign: 'center',
  },
  flex: {
    flex: 1,
  },
});
