/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { adaptiveLabel, adaptivePlan, startingGoal, suggestAdaptive } from './adaptive-goal.ts';
import { protectedStreak } from './streak.ts';

/** Pas par jour à partir du 1er octobre 2026. */
function rows(steps: number[]) {
  return steps.map((value, index) => ({
    day: `2026-10-${String(index + 1).padStart(2, '0')}`,
    steps: value,
  }));
}
const day = (date: number) => new Date(2026, 9, date, 15, 0);

test('l’objectif de départ vaut la moyenne + 10 %, arrondie aux 500 pas supérieurs', () => {
  assert.equal(startingGoal(5_000), 5_500);
  assert.equal(startingGoal(5_100), 6_000);
  assert.equal(startingGoal(1_000), 3_000);
  assert.equal(startingGoal(12_000), 10_000);
  assert.equal(startingGoal(null), 6_000);
});

test('avec une semaine d’historique avant l’activation, l’objectif part tout de suite', () => {
  const plan = adaptivePlan(
    rows([5000, 5000, 5000, 5000, 5000, 5000, 5000]),
    '2026-10-08',
    day(8),
    0
  );
  assert.equal(plan.phase, 'active');
  assert.equal(plan.goal, 5_500);
  assert.equal(plan.daysLeft, 7);
});

test('sans historique, une semaine d’essai fixe l’objectif de départ', () => {
  const during = adaptivePlan(rows([4000, 4000, 4000]), '2026-10-01', day(4), 1000);
  assert.equal(during.phase, 'calibrating');
  assert.equal(during.goal, 4_500);
  assert.equal(during.daysLeft, 4);
  assert.match(adaptiveLabel(during), /encore 4 jours/);

  const after = adaptivePlan(
    rows([4000, 4000, 4000, 4000, 4000, 4000, 4000]),
    '2026-10-01',
    day(8),
    0
  );
  assert.equal(after.phase, 'active');
  assert.equal(after.goal, 4_500);
});

test('5 jours sur 7 à l’objectif font monter de 500 pas, 1 jour ou moins fait redescendre', () => {
  const calibration = [5000, 5000, 5000, 5000, 5000, 5000, 5000]; // objectif 5 500
  const good = [6000, 6000, 6000, 6000, 6000, 0, 0];
  const plan = adaptivePlan(rows([...calibration, ...good]), '2026-10-08', day(15), 0);
  assert.equal(plan.goal, 6_000);
  // Les jours passés se jugent à leur propre objectif.
  assert.equal(plan.goalFor('2026-10-10'), 5_500);
  assert.equal(plan.goalFor('2026-10-15'), 6_000);
  assert.equal(plan.goalFor('2026-09-01'), 5_500);

  const bad = [6000, 0, 0, 0, 0, 0, 0];
  const down = adaptivePlan(rows([...calibration, ...good, ...bad]), '2026-10-08', day(22), 0);
  assert.equal(down.goal, 5_500);

  const middling = [6000, 6000, 6000, 0, 0, 0, 0];
  const same = adaptivePlan(rows([...calibration, ...good, ...middling]), '2026-10-08', day(22), 0);
  assert.equal(same.goal, 6_000);
});

test('l’objectif s’arrête à 10 000 pas', () => {
  const calibration = Array(7).fill(9_500);
  const plan = adaptivePlan(
    rows([...calibration, ...Array(21).fill(12_000)]),
    '2026-10-08',
    day(29),
    0
  );
  assert.equal(plan.goal, 10_000);
  assert.match(adaptiveLabel(plan), /maximum/);
});

test('le palier en cours compte les jours atteints, aujourd’hui compris', () => {
  const calibration = Array(7).fill(5_000);
  const plan = adaptivePlan(rows([...calibration, 6000, 6000, 0]), '2026-10-08', day(10), 5_600);
  assert.equal(plan.weekHits, 3);
  assert.equal(plan.daysLeft, 5);
  assert.match(adaptiveLabel(plan), /3 jours sur 5 cette semaine pour passer à 6/);
});

test('une série ne se casse pas quand l’objectif monte', () => {
  const calibration = Array(7).fill(5_000);
  const plan = adaptivePlan(
    rows([...calibration, ...Array(7).fill(5_600), 6_000]),
    '2026-10-08',
    day(15),
    6_000
  );
  assert.equal(plan.goal, 6_000);
  const streak = protectedStreak(
    rows([...calibration, ...Array(7).fill(5_600)]),
    day(15),
    6_000,
    plan.goalFor
  );
  assert.ok(streak.current >= 8);
  // Avec l'objectif du jour appliqué à tout l'historique, la série tomberait.
  assert.equal(protectedStreak(rows([...Array(7).fill(5_600)]), day(8), 6_000, 6_000).current, 1);
});

test('l’objectif adaptatif est proposé quand l’objectif fixe n’est presque jamais atteint', () => {
  assert.equal(suggestAdaptive(rows(Array(14).fill(4_000)), day(15), 10_000), true);
  assert.equal(suggestAdaptive(rows(Array(14).fill(10_500)), day(15), 10_000), false);
  assert.equal(suggestAdaptive(rows(Array(3).fill(4_000)), day(15), 10_000), false);
});
