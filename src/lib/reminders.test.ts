import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planReminders, walkMinutes } from './reminders.ts';

const base = { hour: 18, goal: 10_000, strideM: 0.75 };

test('rappel du jour chiffré et rappel du soir si la série est en danger', () => {
  const now = new Date(2026, 9, 9, 10, 0);
  const reminders = planReminders({ ...base, now, todaySteps: 7_700, streak: 5 });
  assert.deepEqual(
    reminders.map((r) => r.id),
    ['step-today', 'step-streak', 'step-day-1', 'step-day-2']
  );
  assert.match(reminders[0].title, /^Encore 2\s300 pas aujourd’hui$/);
  assert.match(reminders[0].body, /environ 20 min/);
  assert.equal(reminders[0].date.getHours(), 18);
  assert.equal(reminders[1].date.getHours(), 21);
  assert.match(reminders[1].title, /série de 5 jours/);
  assert.equal(reminders[2].date.getDate(), 10);
  assert.equal(reminders[0].url, `/carte?boucle=${reminders[0].date.getTime()}`);
});

test('rien pour aujourd’hui si l’objectif est atteint ou l’heure passée', () => {
  const done = planReminders({
    ...base,
    now: new Date(2026, 9, 9, 10),
    todaySteps: 10_500,
    streak: 3,
  });
  assert.deepEqual(
    done.map((r) => r.id),
    ['step-day-1', 'step-day-2']
  );
  const late = planReminders({
    ...base,
    now: new Date(2026, 9, 9, 19),
    todaySteps: 2_000,
    streak: 0,
  });
  assert.deepEqual(
    late.map((r) => r.id),
    ['step-day-1', 'step-day-2']
  );
});

test('aucun rappel quand ils sont coupés', () => {
  assert.deepEqual(
    planReminders({ ...base, hour: null, now: new Date(), todaySteps: 0, streak: 9 }),
    []
  );
});

test('walkMinutes arrondit à 5 minutes', () => {
  assert.equal(walkMinutes(2_300, 0.75), 20);
  assert.equal(walkMinutes(100, 0.75), 5);
});
