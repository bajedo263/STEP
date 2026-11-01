/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { focusPaths } from './walk-art.ts';

test('focusPaths écarte un trajet lointain du cadrage', () => {
  const at = (latitude: number, longitude: number) => [
    { latitude, longitude },
    { latitude: latitude + 0.002, longitude: longitude + 0.002 },
  ];
  const paris = [at(48.84, 2.29), at(48.85, 2.3), at(48.845, 2.31)];
  const nice = at(43.7, 7.26);
  assert.equal(focusPaths([...paris, nice]).length, 3);
  assert.equal(focusPaths([nice]).length, 1);
  assert.equal(focusPaths([]).length, 0);
});
