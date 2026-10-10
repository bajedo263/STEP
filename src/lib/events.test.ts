/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  activeEvents,
  daysLeftLabel,
  eventProgress,
  eventReminder,
  upcomingEvent,
} from './events.ts';

test('week-end explorateur : 2e week-end du mois', () => {
  const events = activeEvents('2026-10-10');
  assert.deepEqual(
    events.map((event) => event.id),
    ['explorateur-2026-10', 'saison-2026-09-22']
  );
  assert.equal(events[0].end, '2026-10-11');
  assert.equal(activeEvents('2026-10-12').length, 1);
  assert.equal(
    activeEvents('2026-10-17').some((event) => event.metric === 'places'),
    false
  );
});

test('rendez-vous de septembre', () => {
  // 3e samedi de septembre 2026 : le 19.
  assert.deepEqual(
    activeEvents('2026-09-19').map((event) => event.id),
    ['patrimoine-2026', 'mobilite-2026', 'saison-2026-06-21']
  );
  assert.equal(
    activeEvents('2026-09-12').some((event) => event.id.startsWith('explorateur')),
    false
  );
});

test('défi de saison, y compris l’hiver à cheval sur deux ans', () => {
  const autumn = activeEvents('2026-10-10').at(-1)!;
  assert.equal(autumn.start, '2026-09-22');
  assert.equal(autumn.end, '2026-12-20');
  assert.equal(autumn.target, 540_000);
  assert.equal(autumn.title, 'Défi de l’automne');
  const winter = activeEvents('2027-01-05').find((event) => event.metric === 'steps')!;
  assert.equal(winter.start, '2026-12-21');
  assert.equal(winter.end, '2027-03-19');
});

test('annonce du prochain événement', () => {
  assert.equal(upcomingEvent('2026-11-12')?.id, 'explorateur-2026-11');
  assert.equal(upcomingEvent('2026-11-10'), null);
  assert.equal(upcomingEvent('2026-11-14'), null);
});

test('avancement', () => {
  const [explorer] = activeEvents('2026-10-10');
  assert.deepEqual(eventProgress(explorer, { steps: 0, places: 2, walks: 0 }), {
    progress: 2 / 3,
    done: false,
    label: '2 / 3 lieux',
  });
  assert.equal(eventProgress(explorer, { steps: 0, places: 4, walks: 0 }).done, true);
  assert.equal(daysLeftLabel(explorer, '2026-10-10'), 'Plus que 2 jours');
  assert.equal(daysLeftLabel(explorer, '2026-10-11'), 'Dernier jour');
});

test('annonce le matin du premier jour', () => {
  const reminder = eventReminder(new Date(2026, 10, 12, 18), '2026-11-12');
  assert.equal(reminder?.title, '🧭 Week-end explorateur');
  assert.equal(reminder?.date.getTime(), new Date(2026, 10, 14, 10).getTime());
  // Le jour même, avant 10 h, puis plus rien une fois l'heure passée.
  assert.equal(eventReminder(new Date(2026, 10, 14, 8), '2026-11-14')?.id, 'step-event');
  assert.equal(eventReminder(new Date(2026, 10, 14, 11), '2026-11-14'), null);
  assert.equal(eventReminder(new Date(2026, 10, 2, 9), '2026-11-02'), null);
});
