/// <reference types="node" />

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dailyProgress, formatDistance, localDay, startOfDay } from './daily-progress.ts';

test('la progression utilise la taille et le poids du profil', () => {
  const p = dailyProgress({ steps: 5000, goal: 10000, heightCm: 180, weightKg: 80, sex: 'male' });
  assert.equal(p.ratio, 0.5);
  assert.equal(p.remainingSteps, 5000);
  assert.equal(Math.round(p.distanceM), 3735);
  assert.equal(Math.round(p.remainingDistanceM), 3735);
  // 3,735 km à 5 km/h = 0,747 h ; 3,5 × 80 × 0,747 ≈ 209 kcal
  assert.equal(Math.round(p.calories), 209);
  assert.equal(p.goalReached, false);
});

test('sans profil, des valeurs par défaut sont utilisées', () => {
  const p = dailyProgress({ steps: 1000 });
  assert.equal(p.goal, 10000);
  assert.ok(p.distanceM > 690 && p.distanceM < 710);
});

test('la progression plafonne à 100 % une fois l’objectif dépassé', () => {
  const p = dailyProgress({ steps: 13000, goal: 10000 });
  assert.equal(p.ratio, 1);
  assert.equal(p.remainingSteps, 0);
  assert.equal(p.remainingDistanceM, 0);
  assert.equal(p.goalReached, true);
});

test('le jour local sert de clé', () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
  const start = startOfDay(new Date(2026, 9, 8, 21, 15));
  assert.equal(start.getHours(), 0);
  assert.equal(start.getDate(), 8);
});

test('les distances sont lisibles', () => {
  assert.equal(formatDistance(843), '840 m');
  assert.equal(formatDistance(4230), '4,2 km');
});
