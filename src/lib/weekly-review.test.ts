/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  mondayOf,
  weekCheer,
  weeklyReview,
  weeklyReviewReminder,
  weekRangeLabel,
  weekTrendLabel,
} from './weekly-review.ts';

/** Pas par jour à partir du lundi 28 septembre 2026. */
function rows(steps: number[]) {
  const start = new Date(2026, 8, 28);
  return steps.map((value, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { day, steps: value };
  });
}

test('le lundi de la semaine', () => {
  assert.equal(mondayOf(new Date(2026, 9, 11, 20)).getDate(), 5); // dimanche 11 octobre
  assert.equal(mondayOf(new Date(2026, 9, 12, 8)).getDate(), 12); // lundi 12 octobre
});

test('le bilan porte sur la semaine passée, du lundi au dimanche', () => {
  const previous = [5000, 5000, 5000, 5000, 5000, 5000, 5000];
  const last = [10000, 12000, 4000, 10500, 0, 11000, 9000];
  const review = weeklyReview(
    rows([...previous, ...last, 3000]),
    new Date(2026, 9, 12, 10),
    10_000
  );
  assert.ok(review);
  assert.equal(review.week, '2026-10-05');
  assert.equal(review.steps, 56_500);
  assert.equal(review.average, 8_071);
  assert.equal(review.daysAtGoal, 4);
  assert.deepEqual(review.bestDay, { day: '2026-10-06', steps: 12_000 });
  assert.equal(review.previousSteps, 35_000);
  assert.equal(weekTrendLabel(review), '+61 % par rapport à la semaine d’avant.');
  assert.match(weekCheer(review), /plus marché/);
});

test('pas de bilan sans pas la semaine passée', () => {
  assert.equal(weeklyReview(rows([5000]), new Date(2026, 9, 12), 10_000), null);
});

test('libellés de semaine', () => {
  assert.equal(weekRangeLabel('2026-10-05'), 'du 5 au 11 octobre');
  assert.equal(weekRangeLabel('2026-09-28'), 'du 28 septembre au 4 octobre');
  assert.equal(weekRangeLabel('2026-06-01'), 'du 1er au 7 juin');
});

test('le rappel du bilan tombe le lundi suivant à 9 h', () => {
  const sunday = weeklyReviewReminder(new Date(2026, 9, 11, 20));
  assert.equal(sunday.date.getDate(), 12);
  assert.equal(sunday.date.getHours(), 9);
  const mondayMorning = weeklyReviewReminder(new Date(2026, 9, 12, 8));
  assert.equal(mondayMorning.date.getDate(), 12);
  const mondayNoon = weeklyReviewReminder(new Date(2026, 9, 12, 12));
  assert.equal(mondayNoon.date.getDate(), 19);
});
