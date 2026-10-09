/** Écart le plus court entre deux caps, en degrés (0 à 180). */
export function angleDelta(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** Cap retenu : le nord géographique quand il est connu, sinon le nord magnétique. */
export function bestHeading(reading: { trueHeading: number; magHeading: number }): number | null {
  const value = reading.trueHeading >= 0 ? reading.trueHeading : reading.magHeading;
  return Number.isFinite(value) && value >= 0 ? value % 360 : null;
}
