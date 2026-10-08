/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addPoint, emptyTrack, formatElapsed, haversineMeters, toLineStringWkt } from './track.ts';

// ~0,0009° de latitude ≈ 100 m.
const at = (latitude: number, timestamp: number, accuracy = 5) => ({
  latitude,
  longitude: 2.35,
  timestamp,
  accuracy,
});

test('haversineMeters', () => {
  const d = haversineMeters({ latitude: 48.85, longitude: 2.35 }, { latitude: 48.8509, longitude: 2.35 });
  assert.ok(Math.abs(d - 100) < 1, String(d));
});

test('addPoint cumule la distance des positions fiables', () => {
  let track = emptyTrack();
  track = addPoint(track, at(48.85, 0));
  track = addPoint(track, at(48.8509, 70_000));
  track = addPoint(track, at(48.8518, 140_000));
  assert.equal(track.points.length, 3);
  assert.ok(Math.abs(track.distanceM - 200) < 2);
});

test('addPoint ignore le bruit, les positions imprécises et les sauts', () => {
  let track = addPoint(emptyTrack(), at(48.85, 0));
  const start = track;
  track = addPoint(track, at(48.85001, 5_000)); // ~1 m : bruit
  track = addPoint(track, at(48.8509, 10_000, 80)); // précision 80 m
  track = addPoint(track, at(48.8599, 20_000)); // 1 km en 10 s
  assert.equal(track, start);
  assert.equal(addPoint(emptyTrack(), at(48.85, 0, 100)).points.length, 0);
});

test('toLineStringWkt', () => {
  assert.equal(toLineStringWkt([at(48.85, 0)]), null);
  assert.equal(
    toLineStringWkt([at(48.85, 0), at(48.8509, 1)]),
    'SRID=4326;LINESTRING(2.350000 48.850000,2.350000 48.850900)'
  );
});

test('formatElapsed', () => {
  assert.equal(formatElapsed(245), '4:05');
  assert.equal(formatElapsed(3729), '1:02:09');
  assert.equal(formatElapsed(-3), '0:00');
});
