/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  closestRoute,
  isCloseEnough,
  nextRequestedLength,
  orsRoundTripBody,
  parseLoopRequest,
  parseOrsResponse,
} from '../../supabase/functions/_shared/loop.ts';
import { formatDuration, loopTargetDistance, regionForCoordinates } from './loop.ts';

test('parseLoopRequest valide et borne la demande', () => {
  const ok = parseLoopRequest({ start: { latitude: 48.85, longitude: 2.35 }, distanceM: 40_000, seed: 7.6 });
  assert.deepEqual(ok, {
    ok: true,
    value: { start: { latitude: 48.85, longitude: 2.35 }, distanceM: 15_000, seed: 7 },
  });
  assert.equal(parseLoopRequest({ start: { latitude: 48.85, longitude: 2.35 }, distanceM: 200 }).ok, true);
  assert.equal(parseLoopRequest(null).ok, false);
  assert.equal(parseLoopRequest({ start: { latitude: 95, longitude: 2 }, distanceM: 3000 }).ok, false);
  assert.equal(parseLoopRequest({ start: { latitude: 48, longitude: 2 } }).ok, false);
});

test('orsRoundTripBody inverse latitude et longitude', () => {
  const body = orsRoundTripBody({ latitude: 48.85, longitude: 2.35 }, 3_012.4, 3);
  assert.deepEqual(body.coordinates, [[2.35, 48.85]]);
  assert.deepEqual(body.options.round_trip, { length: 3012, points: 3, seed: 3 });
});

test('parseOrsResponse lit la géométrie et le résumé', () => {
  const route = parseOrsResponse({
    features: [
      {
        geometry: { coordinates: [[2.35, 48.85], [2.36, 48.86], [2.35, 48.85]] },
        properties: { summary: { distance: 3120.7, duration: 2246.2 } },
      },
    ],
  });
  assert.deepEqual(route, {
    coordinates: [
      { latitude: 48.85, longitude: 2.35 },
      { latitude: 48.86, longitude: 2.36 },
      { latitude: 48.85, longitude: 2.35 },
    ],
    distanceM: 3121,
    durationS: 2246,
  });
  assert.equal(parseOrsResponse({ features: [] }), null);
  assert.equal(parseOrsResponse({ error: 'x' }), null);
});

test('la correction de longueur compense l’écart observé', () => {
  assert.equal(isCloseEnough(3000, 3250), true);
  assert.equal(isCloseEnough(3000, 3400), false);
  // Demandé 3 km, obtenu 4 km : on redemande 2,25 km.
  assert.equal(nextRequestedLength(3000, 3000, 4000), 2250);
  assert.equal(nextRequestedLength(3000, 3000, 0), 3000);
});

test('closestRoute garde la boucle la plus proche', () => {
  const route = (distanceM: number) => ({ coordinates: [], distanceM, durationS: 0 });
  assert.equal(closestRoute(3000, [route(4000), route(2800), route(3500)])?.distanceM, 2800);
  assert.equal(closestRoute(3000, []), null);
});

test('loopTargetDistance part de la distance restante', () => {
  assert.equal(loopTargetDistance(4_231), 4_300);
  assert.equal(loopTargetDistance(250), 1_000);
  assert.equal(loopTargetDistance(30_000), 15_000);
  assert.equal(loopTargetDistance(0), 3_000);
  assert.equal(loopTargetDistance(null), 3_000);
});

test('regionForCoordinates englobe la boucle', () => {
  const region = regionForCoordinates([
    { latitude: 48.84, longitude: 2.34 },
    { latitude: 48.86, longitude: 2.38 },
  ]);
  assert.ok(region);
  assert.ok(Math.abs(region.latitude - 48.85) < 1e-9);
  assert.ok(Math.abs(region.longitude - 2.36) < 1e-9);
  assert.ok(Math.abs(region.latitudeDelta - 0.026) < 1e-9);
  assert.equal(regionForCoordinates([]), null);
});

test('formatDuration', () => {
  assert.equal(formatDuration(20), '1 min');
  assert.equal(formatDuration(45 * 60), '45 min');
  assert.equal(formatDuration(65 * 60), '1 h 05');
});
