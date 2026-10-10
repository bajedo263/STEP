/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { comebackReminders, daysBetween, firstWalkDistance, isComeback } from './comeback.ts';
import { protectedStreak } from './streak.ts';

test('absence de 3 jours ou plus', () => {
  assert.equal(daysBetween('2026-10-09', '2026-10-12'), 3);
  assert.equal(daysBetween('2026-10-30', '2026-11-02'), 3);
  assert.equal(isComeback('2026-10-09', '2026-10-11'), false);
  assert.equal(isComeback('2026-10-09', '2026-10-12'), true);
  assert.equal(isComeback(null, '2026-10-12'), false);
});

test('première marche de 2 500 pas', () => {
  assert.equal(firstWalkDistance(0.75), 1900);
});

test('rappels de retour à J+3 et J+7 avec les cases', () => {
  const now = new Date(2026, 9, 9, 20);
  const [three, seven] = comebackReminders({ now, hour: 18, streak: 4, best: 12, cells: 18 });
  assert.equal(three.date.getDate(), 12);
  assert.equal(three.date.getHours(), 18);
  assert.equal(three.title, 'Votre série de 4 jours vous attend');
  assert.equal(seven.date.getDate(), 16);
  assert.equal(seven.title, 'Vos 18 cases ont expiré');
  const [, empty] = comebackReminders({ now, hour: 18, streak: 0, best: 12, cells: 0 });
  assert.match(empty.body, /record est de 12 jours/);
});

test('un gel offert au retour garde la série au prochain jour raté', () => {
  const rows = [
    { day: '2026-10-01', steps: 12000 },
    { day: '2026-10-05', steps: 12000 },
  ];
  const today = new Date(2026, 9, 6, 22);
  // Sans gel : le 6 n'est pas fini, la série vaut 1.
  assert.equal(protectedStreak(rows, today, 0, 10_000).freezes, 0);
  // Gel offert le 5 (jour du retour), gardé en stock.
  const gifted = protectedStreak(rows, today, 0, 10_000, ['2026-10-05']);
  assert.equal(gifted.freezes, 1);
  assert.equal(gifted.current, 1);
  // Le lendemain raté est sauvé par le gel.
  const next = protectedStreak(rows, new Date(2026, 9, 7, 22), 0, 10_000, ['2026-10-05']);
  assert.deepEqual(next.frozenDays, ['2026-10-06']);
  assert.equal(next.current, 1);
});
