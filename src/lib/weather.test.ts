/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isRainDay,
  parseForecast,
  rainGoal,
  weatherSentence,
  weatherTip,
  withRainDays,
  type ForecastHour,
} from './weather.ts';
import { goalOn } from './steps.ts';

/** Une journée dont les heures `wet` sont pluvieuses, ensoleillée sinon. */
function day(date: string, wet: number[]): ForecastHour[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    day: date,
    hour,
    wet: wet.includes(hour),
    sunny: !wet.includes(hour),
    temperature: 15,
  }));
}

test('lecture de la réponse Open-Meteo', () => {
  const hours = parseForecast({
    hourly: {
      time: ['2026-10-10T14:00', '2026-10-10T15:00', '2026-10-10T16:00', 'invalide'],
      precipitation_probability: [10, 80, 0, 0],
      precipitation: [0, 0, 1.2, 0],
      weather_code: [0, 3, 61, 0],
      temperature_2m: [18, 17, null, 0],
    },
  });
  assert.equal(hours.length, 3);
  assert.deepEqual(hours[0], {
    day: '2026-10-10',
    hour: 14,
    wet: false,
    sunny: true,
    temperature: 18,
  });
  assert.equal(hours[1].wet, true);
  assert.equal(hours[2].wet, true);
  assert.equal(hours[2].temperature, null);
  assert.deepEqual(parseForecast(null), []);
  assert.deepEqual(parseForecast({}), []);
});

test('jour de pluie : 6 heures de pluie entre 8 h et 21 h', () => {
  assert.equal(isRainDay(day('2026-10-10', [9, 10, 11, 12, 13]), '2026-10-10'), false);
  assert.equal(isRainDay(day('2026-10-10', [9, 10, 11, 12, 13, 14]), '2026-10-10'), true);
  // La pluie de la nuit ne compte pas.
  assert.equal(isRainDay(day('2026-10-10', [0, 1, 2, 3, 4, 5, 22, 23]), '2026-10-10'), false);
  assert.equal(isRainDay(day('2026-10-10', [9, 10, 11, 12, 13, 14]), '2026-10-11'), false);
});

test('objectif réduit les jours de pluie', () => {
  assert.equal(rainGoal(10_000), 6000);
  assert.equal(rainGoal(7300), 4500);
  assert.equal(rainGoal(1000), 1000);
  const rule = withRainDays(10_000, ['2026-10-10']);
  assert.equal(goalOn(rule, '2026-10-10'), 6000);
  assert.equal(goalOn(rule, '2026-10-11'), 10_000);
  assert.equal(withRainDays(8000, []), 8000);
});

test('créneau conseillé', () => {
  const today = '2026-10-10';
  assert.deepEqual(weatherTip(day(today, [17, 18]), today, 14), {
    kind: 'dry',
    until: 17,
    sunny: true,
  });
  assert.deepEqual(weatherTip(day(today, []), today, 14), {
    kind: 'dry',
    until: null,
    sunny: true,
  });
  assert.deepEqual(weatherTip(day(today, [14, 15]), today, 14), { kind: 'clearing', from: 16 });
  assert.deepEqual(weatherTip(day(today, [14, 15, 16, 17, 18, 19, 20]), today, 14), {
    kind: 'rain',
  });
  // Pas de conseil après 21 h.
  assert.equal(weatherTip(day(today, []), today, 21), null);
});

test('phrases', () => {
  assert.equal(
    weatherSentence({ kind: 'dry', until: 17, sunny: true }, 25, null),
    'Temps sec jusqu’à 17 h : une boucle d’environ 25 min avant la pluie ?'
  );
  assert.equal(
    weatherSentence({ kind: 'dry', until: null, sunny: true }, 30, null),
    'Grand soleil jusqu’au soir : une boucle d’environ 30 min depuis chez vous ?'
  );
  assert.match(weatherSentence({ kind: 'rain' }, 30, 6000), /objectif réduit à 6.000 pas/);
});
