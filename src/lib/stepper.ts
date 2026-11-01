export type StepperRange = { min: number; max: number; step: number };

/**
 * Valeur suivante d'un sélecteur à crans : on se cale sur le cran le plus proche dans le sens
 * demandé (5 146 + 500 → 5 500, pas 5 646), sans sortir des bornes.
 */
export function stepValue(value: number, direction: 1 | -1, { min, max, step }: StepperRange): number {
  const snapped =
    direction > 0 ? Math.floor(value / step) * step + step : Math.ceil(value / step) * step - step;
  return Math.min(max, Math.max(min, snapped));
}
