/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bestDay, buildWeek, goalStreaks, historyTotals, monthTotals, weekTotals } from './stats.ts';

const today = new Date(2026, 9, 8, 15, 0); // jeudi 8 octobre 2026

test('buildWeek couvre les 7 derniers jours', () => {
  const week = buildWeek(
    [
      { day: '2026-10-02', steps: 8000 },
      { day: '2026-10-05', steps: 12000 },
      { day: '2026-10-08', steps: 3000 },
      { day: '2026-09-30', steps: 99999 },
    ],
    today,
    4500
  );
  assert.deepEqual(
    week.map((d) => d.day),
    ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']
  );
  assert.deepEqual(week.map((d) => d.label).join(''), 'VSDLMMJ');
  assert.deepEqual(week.map((d) => d.steps), [8000, 0, 0, 12000, 0, 0, 4500]);
  assert.equal(week[6].isToday, true);
});

test('buildWeek garde la base si le téléphone compte moins', () => {
  const week = buildWeek([{ day: '2026-10-08', steps: 6000 }], today, 200);
  assert.equal(week[6].steps, 6000);
  assert.equal(buildWeek([], today, null)[6].steps, 0);
});

test('weekTotals', () => {
  const week = buildWeek([{ day: '2026-10-05', steps: 12000 }], today, 2000);
  assert.deepEqual(weekTotals(week, 10000), { steps: 14000, average: 2000, daysAtGoal: 1 });
});

test('goalStreaks compte la série jusqu’à hier tant qu’aujourd’hui n’est pas fini', () => {
  const rows = [
    { day: '2026-10-01', steps: 11000 },
    { day: '2026-10-02', steps: 10000 },
    { day: '2026-10-03', steps: 12000 },
    { day: '2026-10-04', steps: 2000 },
    { day: '2026-10-05', steps: 10500 },
    { day: '2026-10-06', steps: 10100 },
    { day: '2026-10-07', steps: 15000 },
  ];
  assert.deepEqual(goalStreaks(rows, today, 4000, 10000), { current: 3, best: 3, todayDone: false });
  assert.deepEqual(goalStreaks(rows, today, 10001, 10000), { current: 4, best: 4, todayDone: true });
  assert.deepEqual(goalStreaks(rows.slice(0, 5), today, 0, 10000), {
    current: 0,
    best: 3,
    todayDone: false,
  });
});

test('goalStreaks traverse les changements de mois', () => {
  const rows = ['2026-09-29', '2026-09-30', '2026-10-01'].map((day) => ({ day, steps: 10000 }));
  const firstOct = new Date(2026, 9, 1, 12);
  assert.deepEqual(goalStreaks(rows, firstOct, null, 10000), { current: 3, best: 3, todayDone: true });
});

test('monthTotals compare au mois précédent à la même date', () => {
  const rows = [
    { day: '2026-09-02', steps: 9000, distance_m: 6000, calories_kcal: 300 },
    { day: '2026-09-20', steps: 20000, distance_m: 14000, calories_kcal: 700 },
    { day: '2026-10-01', steps: 10000, distance_m: 7000, calories_kcal: 350 },
    { day: '2026-10-08', steps: 3000, distance_m: 2000, calories_kcal: 100 },
  ];
  const { current, previous } = monthTotals(rows, today, 5000, 10000);
  assert.deepEqual(current, { steps: 15000, distanceM: 9000, calories: 450, daysAtGoal: 1, days: 8 });
  assert.deepEqual(previous, { steps: 9000, distanceM: 6000, calories: 300, daysAtGoal: 0, days: 8 });
});

test('monthTotals tient compte des mois plus courts', () => {
  const march31 = new Date(2027, 2, 31, 12);
  const rows = [{ day: '2027-02-28', steps: 10000, distance_m: 7000, calories_kcal: 350 }];
  const { current, previous } = monthTotals(rows, march31, 0, 10000);
  assert.equal(current.days, 31);
  assert.equal(previous.days, 28);
  assert.equal(previous.daysAtGoal, 1);
});

test('bestDay et historyTotals', () => {
  const rows = [
    { day: '2026-09-02', steps: 9000, distance_m: 6000, calories_kcal: 300 },
    { day: '2026-10-08', steps: 3000, distance_m: 2000, calories_kcal: 100 },
  ];
  assert.deepEqual(bestDay(rows, today, 12000), { day: '2026-10-08', steps: 12000 });
  assert.deepEqual(bestDay([], today, 0), null);
  assert.deepEqual(historyTotals(rows), { steps: 12000, distanceM: 8000, calories: 400 });
});
