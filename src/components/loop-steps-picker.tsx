import { StyleSheet, View } from 'react-native';

import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { Stepper } from '@/components/ui/stepper';
import { Spacing } from '@/constants/theme';
import { loopStepsRange } from '@/lib/loop';

export type LoopStepsChoice = 'goal' | 'custom';

/** Cran du sélecteur de pas de la boucle. */
export const LOOP_STEPS_STEP = 500;

type LoopStepsPickerProps = {
  choice: LoopStepsChoice;
  onChoiceChange: (choice: LoopStepsChoice) => void;
  /** Pas de la boucle proposée par défaut (ce qui manque pour l'objectif, ou le bonus). */
  defaultSteps: number;
  goalReached: boolean;
  /** Pas choisis en mode « Au choix ». */
  customSteps: number;
  onCustomStepsChange: (steps: number) => void;
  strideM: number;
};

const formatSteps = (value: number) => Math.round(value).toLocaleString('fr-FR');

/**
 * Choix de la longueur de la boucle : par défaut ce qui manque pour l'objectif, ou un nombre de
 * pas réglé par crans de 500 (pas de clavier qui couvre la carte).
 */
export function LoopStepsPicker({
  choice,
  onChoiceChange,
  defaultSteps,
  goalReached,
  customSteps,
  onCustomStepsChange,
  strideM,
}: LoopStepsPickerProps) {
  const { min, max } = loopStepsRange(strideM);

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
        <Stepper
          value={customSteps}
          onChange={onCustomStepsChange}
          min={min}
          max={max}
          step={LOOP_STEPS_STEP}
          unit="pas"
          accessibilityLabel="Longueur de la boucle"
        />
      ) : null}
    </View>
  );
}

/** Valeur de départ du mode « Au choix » : la boucle par défaut, calée sur un cran. */
export function initialCustomSteps(defaultSteps: number, strideM: number): number {
  const { min, max } = loopStepsRange(strideM);
  const snapped = Math.round(defaultSteps / LOOP_STEPS_STEP) * LOOP_STEPS_STEP;
  return Math.min(max, Math.max(min, snapped));
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
    alignSelf: 'stretch',
  },
});
