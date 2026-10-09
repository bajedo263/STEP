/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { milestoneToday, protectedStreak } from './streak.ts';

const today = new Date(2026, 9, 20, 15, 0); // 20 octobre 2026

/** Jours consécutifs à partir du 1er octobre : 1 = objectif atteint, 0 = raté. */
function rows(pattern: string) {
  return [...pattern].map((c, index) => ({
    day: `2026-10-${String(index + 1).padStart(2, '0')}`,
    steps: c === '1' ? 10000 : 2000,
  }));
}

test('une série sans jour raté gagne un gel tous les 7 jours, 2 au plus', () => {
  const streak = protectedStreak(rows('1111111111111111111'), today, 0, 10000);
  assert.equal(streak.current, 19);
  assert.equal(streak.freezes, 2);
  assert.equal(streak.todayDone, false);
});

test('un gel sauve un jour raté', () => {
  // 7 jours, un raté le 8, puis 11 jours : le gel du 7e jour sauve le 8.
  const streak = protectedStreak(rows('1111111011111111111'), today, 12000, 10000);
  assert.deepEqual(streak.frozenDays, ['2026-10-08']);
  assert.equal(streak.current, 19);
  assert.equal(streak.best, 19);
  assert.equal(streak.todayDone, true);
});

test('sans gel, un jour raté remet la série à zéro', () => {
  const streak = protectedStreak(rows('1111101111111111111'), today, 0, 10000);
  assert.equal(streak.current, 13);
  assert.equal(streak.best, 13);
  assert.equal(streak.freezes, 1);
});

test('deux jours ratés d’affilée avec un seul gel cassent la série', () => {
  const streak = protectedStreak(rows('1111111001111111111'), today, 0, 10000);
  assert.equal(streak.current, 10);
  assert.equal(streak.frozenDays.length, 1);
});

test('un jour sans données compte comme raté', () => {
  const streak = protectedStreak(
    [
      { day: '2026-10-17', steps: 10000 },
      { day: '2026-10-19', steps: 10000 },
    ],
    today,
    0,
    10000
  );
  assert.equal(streak.current, 1);
});

test('milestoneToday', () => {
  const streak = protectedStreak(rows('1111111111111111111'), today, 10000, 10000);
  assert.equal(streak.current, 20);
  assert.equal(milestoneToday(streak), null);
  const seven = protectedStreak(rows('0000000000000111111'), today, 10000, 10000);
  assert.equal(milestoneToday(seven), 7);
});
