/// <reference types="node" />

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  remainingSteps,
  strideLengthMeters,
  targetDistanceMeters,
  walkingCalories,
} from './steps.ts';

test('la foulée dépend de la taille et du sexe', () => {
  assert.equal(strideLengthMeters(175, 'male').toFixed(3), '0.726');
  assert.equal(strideLengthMeters(165, 'female').toFixed(3), '0.681');
});

test('les pas restants ne sont jamais négatifs', () => {
  assert.equal(remainingSteps(3_200), 6_800);
  assert.equal(remainingSteps(12_000), 0);
  assert.equal(remainingSteps(4_000, 7_000), 3_000);
});

test('la distance cible complète l’objectif du jour', () => {
  assert.equal(targetDistanceMeters(0, 0.75), 7_500);
  assert.equal(targetDistanceMeters(6_000, 0.75), 3_000);
});

test('les calories suivent la formule MET', () => {
  assert.equal(walkingCalories(70, 60), 245);
});
