/**
 * Météo du jour (Open-Meteo, sans clé) : un conseil de créneau pour marcher (« temps sec
 * jusqu'à 17 h »), et les jours de pluie, un objectif réduit qui ne casse pas la série.
 */

import { goalOn, type GoalRule } from './steps.ts';

export type ForecastHour = {
  /** Jour local, « 2026-10-10 ». */
  day: string;
  /** Heure locale, 0 à 23. */
  hour: number;
  wet: boolean;
  /** Ciel dégagé ou presque. */
  sunny: boolean;
  temperature: number | null;
};

/** Sans marche conseillée après 21 h : le dernier créneau commence à 20 h. */
export const LAST_WALK_HOUR = 20;
const FIRST_DAY_HOUR = 8;
/** Heures de pluie entre 8 h et 21 h à partir desquelles la journée compte comme pluvieuse. */
const RAIN_DAY_HOURS = 6;
/** Part de l'objectif demandée un jour de pluie. */
export const RAIN_GOAL_RATIO = 0.6;

export const forecastUrl = (latitude: number, longitude: number) =>
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${latitude.toFixed(3)}&longitude=${longitude.toFixed(3)}` +
  '&hourly=precipitation_probability,precipitation,weather_code,temperature_2m' +
  '&timezone=auto&forecast_days=2';

type OpenMeteoResponse = {
  hourly?: {
    time?: string[];
    precipitation_probability?: (number | null)[];
    precipitation?: (number | null)[];
    weather_code?: (number | null)[];
    temperature_2m?: (number | null)[];
  };
};

/** Bruine, pluie, neige, averses et orages (codes WMO 51 et plus). */
const isWetCode = (code: number | null | undefined) => code != null && code >= 51;

/** Heures de la prévision, à l'heure locale du lieu (`timezone=auto`). */
export function parseForecast(json: unknown): ForecastHour[] {
  const hourly = (json as OpenMeteoResponse | null)?.hourly;
  if (!hourly?.time) return [];
  return hourly.time.flatMap((time, index) => {
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2})/.exec(time);
    if (!match) return [];
    const code = hourly.weather_code?.[index];
    const rain = hourly.precipitation?.[index] ?? 0;
    const chance = hourly.precipitation_probability?.[index] ?? 0;
    return [
      {
        day: match[1],
        hour: Number(match[2]),
        wet: isWetCode(code) || rain >= 0.3 || chance >= 60,
        sunny: code != null && code <= 1,
        temperature: hourly.temperature_2m?.[index] ?? null,
      },
    ];
  });
}

/** Vrai si la journée est pluvieuse : au moins 6 heures de pluie entre 8 h et 21 h. */
export function isRainDay(hours: ForecastHour[], day: string): boolean {
  const wet = hours.filter(
    (h) => h.day === day && h.hour >= FIRST_DAY_HOUR && h.hour <= LAST_WALK_HOUR && h.wet
  ).length;
  return wet >= RAIN_DAY_HOURS;
}

/** Objectif d'un jour de pluie, arrondi à 500 pas. */
export function rainGoal(goal: number): number {
  return Math.max(1000, Math.round((goal * RAIN_GOAL_RATIO) / 500) * 500);
}

/** Objectif de chaque jour, réduit les jours de pluie. */
export function withRainDays(rule: GoalRule, rainDays: string[]): GoalRule {
  if (rainDays.length === 0) return rule;
  const rainy = new Set(rainDays);
  return (day: string) => (rainy.has(day) ? rainGoal(goalOn(rule, day)) : goalOn(rule, day));
}

export type WeatherTip =
  /** Temps sec maintenant, jusqu'à `until` (heure de la première pluie) ou jusqu'au soir. */
  | { kind: 'dry'; until: number | null; sunny: boolean }
  /** Il pleut maintenant ; éclaircie prévue à `from`. */
  | { kind: 'clearing'; from: number }
  /** Pluie jusqu'au soir. */
  | { kind: 'rain' };

/** Créneau conseillé pour marcher à partir de `day` et `hour`, ou null après 21 h. */
export function weatherTip(hours: ForecastHour[], day: string, hour: number): WeatherTip | null {
  const rest = hours
    .filter((h) => h.day === day && h.hour >= hour && h.hour <= LAST_WALK_HOUR)
    .sort((a, b) => a.hour - b.hour);
  if (rest.length === 0) return null;
  const [now] = rest;
  if (!now.wet) {
    const firstWet = rest.find((h) => h.wet);
    const dry = firstWet ? rest.filter((h) => h.hour < firstWet.hour) : rest;
    return { kind: 'dry', until: firstWet?.hour ?? null, sunny: dry.every((h) => h.sunny) };
  }
  const firstDry = rest.find((h) => !h.wet);
  return firstDry ? { kind: 'clearing', from: firstDry.hour } : { kind: 'rain' };
}

/** Titre court du conseil, pour l'accueil. */
export function weatherTitle(tip: WeatherTip): string {
  switch (tip.kind) {
    case 'dry':
      if (tip.until !== null) return `Temps sec jusqu’à ${tip.until} h`;
      return tip.sunny ? 'Grand soleil jusqu’au soir' : 'Temps sec jusqu’au soir';
    case 'clearing':
      return `Éclaircie prévue à ${tip.from} h`;
    case 'rain':
      return 'Pluie jusqu’au soir';
  }
}

/**
 * Le conseil qui suit le titre : la boucle qui va avec le créneau. `minutes` est la durée de
 * marche qu'il reste à faire, `reducedGoal` l'objectif du jour s'il pleut.
 */
export function weatherAdvice(
  tip: WeatherTip,
  minutes: number,
  reducedGoal: number | null
): string {
  const loop = `une boucle d’environ ${minutes} min`;
  switch (tip.kind) {
    case 'dry':
      return tip.until !== null ? `${loop} avant la pluie ?` : `${loop} depuis chez vous ?`;
    case 'clearing':
      return `${loop} à ce moment-là ?`;
    case 'rain':
      return reducedGoal !== null
        ? `objectif réduit à ${reducedGoal.toLocaleString('fr-FR')} pas aujourd’hui, votre série ne risque rien.`
        : 'une petite boucle bien couvert suffira.';
  }
}

/** Une phrase pour un rappel : le créneau et la boucle qui va avec. */
export function weatherSentence(
  tip: WeatherTip,
  minutes: number,
  reducedGoal: number | null
): string {
  return `${weatherTitle(tip)} : ${weatherAdvice(tip, minutes, reducedGoal)}`;
}
