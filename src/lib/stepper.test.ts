/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { stepValue } from './stepper.ts';

const range = { min: 1_400, max: 21_000, step: 500 };

test('stepValue avance d’un cran en se calant dessus', () => {
  assert.equal(stepValue(5_000, 1, range), 5_500);
  assert.equal(stepValue(5_146, 1, range), 5_500);
  assert.equal(stepValue(5_146, -1, range), 5_000);
  assert.equal(stepValue(5_500, -1, range), 5_000);
});

test('stepValue reste dans les bornes', () => {
  assert.equal(stepValue(1_400, -1, range), 1_400);
  assert.equal(stepValue(1_600, -1, range), 1_500);
  assert.equal(stepValue(1_500, -1, range), 1_400);
  assert.equal(stepValue(21_000, 1, range), 21_000);
  assert.equal(stepValue(20_900, 1, range), 21_000);
});
