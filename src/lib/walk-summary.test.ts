/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { summarizeWalk, walkRow } from './walk-summary.ts';

const base = {
  mode: 'loop' as const,
  track: {
    points: [
      { latitude: 48.85, longitude: 2.35, timestamp: 0 },
      { latitude: 48.8509, longitude: 2.35, timestamp: 60_000 },
    ],
    distanceM: 1500.4,
  },
  strideM: 0.75,
  weightKg: 70,
  startedAt: new Date('2026-10-08T10:00:00Z'),
  endedAt: new Date('2026-10-08T10:20:00Z'),
};

test('summarizeWalk préfère les pas du podomètre', () => {
  const summary = summarizeWalk({ ...base, pedometerSteps: 2104 });
  assert.equal(summary.steps, 2104);
  assert.equal(summary.distanceM, 1500);
  // 3,5 MET × 70 kg × 1/3 h
  assert.equal(summary.calories, 82);
  assert.match(summary.path ?? '', /^SRID=4326;LINESTRING/);
});

test('summarizeWalk estime les pas sans podomètre', () => {
  assert.equal(summarizeWalk({ ...base, pedometerSteps: null }).steps, 2000);
  assert.equal(summarizeWalk({ ...base, pedometerSteps: 0 }).steps, 2000);
});

test('walkRow', () => {
  const row = walkRow('u1', summarizeWalk({ ...base, pedometerSteps: null }));
  assert.equal(row.user_id, 'u1');
  assert.equal(row.mode, 'loop');
  assert.equal(row.started_at, '2026-10-08T10:00:00.000Z');
  assert.equal(row.distance_m, 1500);
});
