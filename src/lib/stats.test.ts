/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildWeek, weekTotals } from './stats.ts';

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
