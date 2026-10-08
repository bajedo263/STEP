import { DEFAULT_DAILY_GOAL, type Sex } from './steps.ts';

/** Ligne de la table `profiles` (voir supabase/migrations). */
export type Profile = {
  id: string;
  username: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  sex: Sex;
  daily_goal: number;
};

/** Valeurs saisies dans le formulaire de profil, toutes sous forme de texte. */
export type ProfileForm = {
  username: string;
  heightCm: string;
  weightKg: string;
  sex: Sex;
  dailyGoal: string;
};

export type ProfileUpdate = Omit<Profile, 'id'>;

export type ProfileErrors = Partial<Record<keyof ProfileForm, string>>;

export function profileToForm(profile: Profile | null): ProfileForm {
  return {
    username: profile?.username ?? '',
    heightCm: profile?.height_cm?.toString() ?? '',
    weightKg: profile?.weight_kg?.toString().replace('.', ',') ?? '',
    sex: profile?.sex ?? 'unspecified',
    dailyGoal: (profile?.daily_goal ?? DEFAULT_DAILY_GOAL).toString(),
  };
}

/** Lit un nombre saisi à la française (virgule décimale, espaces de milliers). */
function parseNumber(value: string): number | null {
  const normalized = value.replace(/[\s  ]/g, '').replace(',', '.');
  if (normalized === '') return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : NaN;
}

/**
 * Valide le formulaire avec les mêmes bornes que les contraintes de la base.
 * Taille et poids sont facultatifs ; l'objectif est obligatoire.
 */
export function validateProfileForm(
  form: ProfileForm
): { ok: true; value: ProfileUpdate } | { ok: false; errors: ProfileErrors } {
  const errors: ProfileErrors = {};

  const username = form.username.trim();
  if (username !== '' && (username.length < 3 || username.length > 30)) {
    errors.username = 'Entre 3 et 30 caractères.';
  }

  const height = parseNumber(form.heightCm);
  if (height !== null && (!Number.isInteger(height) || height < 100 || height > 250)) {
    errors.heightCm = 'Une taille en centimètres, entre 100 et 250.';
  }

  const weight = parseNumber(form.weightKg);
  if (weight !== null && (Number.isNaN(weight) || weight < 25 || weight > 300)) {
    errors.weightKg = 'Un poids en kilos, entre 25 et 300.';
  }

  const goal = parseNumber(form.dailyGoal);
  if (goal === null || !Number.isInteger(goal) || goal < 1000 || goal > 100000) {
    errors.dailyGoal = 'Un nombre de pas entre 1 000 et 100 000.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      username: username === '' ? null : username,
      height_cm: height,
      weight_kg: weight === null ? null : Math.round(weight * 10) / 10,
      sex: form.sex,
      daily_goal: goal as number,
    },
  };
}
