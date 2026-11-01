/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  dayLine,
  goalReachedDuringWalk,
  nearArrival,
  nextOffRoute,
  OFF_ROUTE_DELAY_MS,
  onRoute,
} from './walk-guidance.ts';

// Tracé nord-sud de ~1 km ; 0,0001° de longitude ≈ 7,3 m à cette latitude.
const path = [
  { latitude: 48.85, longitude: 2.35 },
  { latitude: 48.859, longitude: 2.35 },
];
const east = (meters: number, accuracy = 5) => ({
  latitude: 48.854,
  longitude: 2.35 + (meters / 7.33) * 0.0001,
  accuracy,
});

test('nextOffRoute attend avant d’alerter, puis s’éteint une fois revenu', () => {
  let state = nextOffRoute(onRoute(), path, east(60), 0);
  assert.equal(state.off, false);
  assert.equal(state.since, 0);
  state = nextOffRoute(state, path, east(60), OFF_ROUTE_DELAY_MS - 1);
  assert.equal(state.off, false);
  state = nextOffRoute(state, path, east(60), OFF_ROUTE_DELAY_MS);
  assert.equal(state.off, true);
  assert.ok(Math.abs(state.distanceM - 60) < 3);
  // Entre les deux seuils, l'alerte reste.
  state = nextOffRoute(state, path, east(32), OFF_ROUTE_DELAY_MS + 3000);
  assert.equal(state.off, true);
  state = nextOffRoute(state, path, east(10), OFF_ROUTE_DELAY_MS + 6000);
  assert.equal(state.off, false);
  assert.equal(state.since, null);
});

test('nextOffRoute oublie un écart bref et ignore les positions imprécises', () => {
  let state = nextOffRoute(onRoute(), path, east(60), 0);
  state = nextOffRoute(state, path, east(5), 4000);
  state = nextOffRoute(state, path, east(60), 8000);
  state = nextOffRoute(state, path, east(60), 12_000);
  assert.equal(state.off, false);
  const imprecise = nextOffRoute(onRoute(), path, east(80, 50), 0);
  assert.equal(imprecise.since, null);
});

test('nearArrival seulement à moins de 500 m, sur un trajet assez long', () => {
  assert.equal(nearArrival(3000, 480), true);
  assert.equal(nearArrival(3000, 600), false);
  assert.equal(nearArrival(1000, 400), false);
  assert.equal(nearArrival(3000, 10), false);
});

test('goalReachedDuringWalk', () => {
  assert.equal(goalReachedDuringWalk(8000, 10_100, 10_000, 2100), true);
  assert.equal(goalReachedDuringWalk(10_500, 11_000, 10_000, 500), false);
  assert.equal(goalReachedDuringWalk(null, 11_000, 10_000, 3000), false);
  assert.equal(goalReachedDuringWalk(8000, 9000, 10_000, 1000), false);
  // Santé arrive après le départ avec 6 000 pas de plus : ce n'est pas la marche.
  assert.equal(goalReachedDuringWalk(4000, 10_500, 10_000, 300), false);
});

test('dayLine', () => {
  const plain = (text: string | null) => text?.replace(/\s/g, ' ');
  assert.equal(
    plain(dayLine({ steps: 8200, goal: 10_000, streak: 6 })),
    'Objectif : 8 200 / 10 000 pas · série de 6 jours'
  );
  assert.equal(
    dayLine({ steps: 10_400, goal: 10_000, streak: 1 }),
    'Objectif du jour atteint · série de 1 jour'
  );
  assert.equal(plain(dayLine({ steps: 300, goal: 6000, streak: 0 })), 'Objectif : 300 / 6 000 pas');
  assert.equal(dayLine({ steps: null, goal: 6000, streak: 3 }), null);
});
