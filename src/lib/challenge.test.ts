/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CHALLENGE_KINDS,
  challengeKindFor,
  evaluateChallenge,
  type TodayActivity,
} from './challenge.ts';

const idle: TodayActivity = { steps: 0, goal: 10000, walks: [], newPlaces: 0, cells: 0 };

test('challengeKindFor est stable et change d’un jour à l’autre', () => {
  const a = challengeKindFor('user-1', '2026-10-09');
  assert.equal(challengeKindFor('user-1', '2026-10-09'), a);
  assert.ok(CHALLENGE_KINDS.includes(a));
  // Sur un mois, jamais deux fois le même défi deux jours de suite, et de la variété.
  let previous = challengeKindFor('user-1', '2026-09-30');
  const seen = new Set();
  for (let day = 1; day <= 31; day += 1) {
    const key = `2026-10-${String(day).padStart(2, '0')}`;
    const kind = challengeKindFor('user-1', key);
    assert.notEqual(kind, previous, key);
    seen.add(kind);
    previous = kind;
  }
  assert.equal(seen.size, CHALLENGE_KINDS.length);
});

test('evaluateChallenge bonus de pas', () => {
  const challenge = evaluateChallenge('extra_steps', { ...idle, steps: 11000 });
  assert.equal(challenge.done, false);
  assert.equal(challenge.target, 12000);
  assert.equal(evaluateChallenge('extra_steps', { ...idle, steps: 12000 }).done, true);
});

test('evaluateChallenge trajets', () => {
  const walks: TodayActivity['walks'] = [
    { mode: 'free', distance_m: 3200 },
    { mode: 'loop', distance_m: 800 },
  ];
  assert.equal(evaluateChallenge('long_walk', { ...idle, walks }).done, true);
  assert.equal(evaluateChallenge('loop', { ...idle, walks }).done, false);
  assert.equal(
    evaluateChallenge('loop', { ...idle, walks: [{ mode: 'loop', distance_m: 1500 }] }).done,
    true
  );
  assert.equal(evaluateChallenge('destination', { ...idle, walks }).done, false);
});

test('evaluateChallenge lieux et cases', () => {
  assert.equal(evaluateChallenge('new_place', { ...idle, newPlaces: 1 }).done, true);
  const cells = evaluateChallenge('cells', { ...idle, cells: 4 });
  assert.equal(cells.progressLabel, '4 / 10 cases');
  assert.equal(cells.done, false);
});
