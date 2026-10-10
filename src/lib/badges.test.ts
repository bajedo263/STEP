import assert from 'node:assert/strict';
import { test } from 'node:test';

import { badgesFor, nextBadges, type BadgeStats } from './badges.ts';

const none: BadgeStats = {
  bestStreak: 0,
  challenges: 0,
  places: 0,
  walkedM: 0,
  cells: 0,
  friends: 0,
  zonesExplored: 0,
  zonesComplete: 0,
  events: 0,
};

test('badgesFor débloque les paliers atteints', () => {
  const badges = badgesFor({ ...none, bestStreak: 30, places: 12, walkedM: 9_999 });
  const unlocked = badges.filter((badge) => badge.unlocked).map((badge) => badge.id);
  assert.deepEqual(unlocked, ['streak-7', 'streak-30', 'places-1', 'places-10']);
  const km = badges.find((badge) => badge.id === 'distance-10');
  assert.equal(km?.unlocked, false);
  assert.ok(Math.abs((km?.progress ?? 0) - 9.999) < 1e-9);
  assert.equal(badges.find((badge) => badge.id === 'streak-100')?.progress, 30);
});

test('les descriptions sont accordées', () => {
  const badges = badgesFor(none);
  const text = (id: string) => badges.find((badge) => badge.id === id)?.description;
  assert.equal(text('places-1'), '1 lieu remarquable découvert');
  assert.equal(text('places-10'), '10 lieux remarquables découverts');
  assert.equal(text('challenges-1'), '1 défi du jour réussi');
  assert.equal(text('streak-7'), '7 jours d’affilée à l’objectif');
  assert.equal(text('zones-explored-1'), 'La moitié des lieux d’un quartier découverte');
  assert.equal(text('zones-complete-3'), 'Tous les lieux de 3 quartiers découverts');
  assert.equal(text('events-1'), '1 événement réussi');
  assert.equal(text('events-5'), '5 événements réussis');
});

test('nextBadges donne un badge par famille, le plus avancé d’abord', () => {
  const next = nextBadges(badgesFor({ ...none, challenges: 9, cells: 10 }));
  assert.equal(next.length, 9);
  assert.equal(next[0].id, 'challenges-10');
  assert.equal(next[1].id, 'cells-50');
});
