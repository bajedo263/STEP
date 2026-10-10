/** Une lecture de Santé (Apple Santé ou Health Connect) et le podomètre à ce moment-là. */
export type HealthReading = {
  steps: number;
  /** Pas du podomètre au moment de la lecture, pour ajouter ceux faits depuis. */
  pedometerAtRead: number;
};

/**
 * Pas du jour à afficher quand Santé et le podomètre sont tous deux disponibles.
 * Santé fait foi (montre comprise, sans doublon ni saisie manuelle) ; entre deux lectures, on y
 * ajoute les pas comptés depuis par le podomètre. Le podomètre seul sert de plancher : un accès
 * à Santé refusé renvoie 0 sans erreur sur iPhone.
 */
export function mergeTodaySteps(pedometer: number, health: HealthReading | null): number {
  if (!health) return pedometer;
  const sinceRead = Math.max(0, pedometer - health.pedometerAtRead);
  return Math.max(pedometer, Math.round(health.steps + sinceRead));
}

/** Enregistrement de pas Health Connect, réduit à ce qui sert au calcul. */
export type HealthConnectSteps = { count: number; manual: boolean };

/**
 * Total Health Connect hors saisies manuelles : l'agrégat (dédupliqué entre applis) moins les
 * pas saisis à la main, jamais négatif.
 */
export function stepsWithoutManualEntries(
  aggregate: number,
  records: HealthConnectSteps[]
): number {
  const manual = records.reduce((sum, record) => sum + (record.manual ? record.count : 0), 0);
  return Math.max(0, aggregate - manual);
}
