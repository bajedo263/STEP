/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mergeTodaySteps, stepsWithoutManualEntries } from './step-sources.ts';

test('sans Santé, seul le podomètre compte', () => {
  assert.equal(mergeTodaySteps(4200, null), 4200);
});

test('Santé fait foi et on ajoute les pas comptés depuis la lecture', () => {
  // Santé compte aussi la montre : 6 000 alors que le téléphone n'en a vu que 4 000.
  assert.equal(mergeTodaySteps(4300, { steps: 6000, pedometerAtRead: 4000 }), 6300);
});

test('un accès à Santé refusé (0) ne fait pas baisser le compteur', () => {
  assert.equal(mergeTodaySteps(4300, { steps: 0, pedometerAtRead: 4000 }), 4300);
});

test('un podomètre relancé après la lecture ne retire pas de pas', () => {
  assert.equal(mergeTodaySteps(100, { steps: 6000, pedometerAtRead: 4000 }), 6000);
});

test('Health Connect : les saisies manuelles sont retirées du total', () => {
  const records = [
    { count: 3000, manual: false },
    { count: 2000, manual: true },
  ];
  assert.equal(stepsWithoutManualEntries(5000, records), 3000);
  assert.equal(stepsWithoutManualEntries(1000, records), 0);
});
