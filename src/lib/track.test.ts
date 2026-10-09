/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addPoint,
  emptyTrack,
  formatElapsed,
  hasArrived,
  haversineMeters,
  remainingAlongPath,
  toLineStringWkt,
} from './track.ts';

// ~0,0009° de latitude ≈ 100 m.
const at = (latitude: number, timestamp: number, accuracy = 5) => ({
  latitude,
  longitude: 2.35,
  timestamp,
  accuracy,
});

test('haversineMeters', () => {
  const d = haversineMeters(
    { latitude: 48.85, longitude: 2.35 },
    { latitude: 48.8509, longitude: 2.35 }
  );
  assert.ok(Math.abs(d - 100) < 1, String(d));
});

test('addPoint cumule la distance des positions fiables', () => {
  let track = emptyTrack();
  track = addPoint(track, at(48.85, 0));
  track = addPoint(track, at(48.8509, 70_000));
  track = addPoint(track, at(48.8518, 140_000));
  assert.equal(track.points.length, 3);
  // Le lissage rattrape la position réelle avec un léger retard.
  assert.ok(Math.abs(track.distanceM - 200) < 10, String(track.distanceM));
});

test('addPoint ignore le bruit, les positions imprécises et les sauts', () => {
  let track = addPoint(emptyTrack(), at(48.85, 0));
  const start = track;
  track = addPoint(track, at(48.85001, 5_000)); // ~1 m : bruit
  track = addPoint(track, at(48.8509, 10_000, 80)); // précision 80 m
  track = addPoint(track, at(48.8599, 20_000)); // 1 km en 10 s
  assert.deepEqual(track.points, start.points);
  assert.equal(track.distanceM, 0);
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

// Marche vers le nord le long de la longitude 2.35, avec un GPS qui zigzague de ±10 m.
const east = (meters: number) => meters / (111_320 * Math.cos((48.85 * Math.PI) / 180));
const zigzag = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    latitude: 48.85 + (i * 10) / 111_195,
    longitude: 2.35 + east(i % 2 === 0 ? 10 : -10),
    timestamp: i * 7_000,
    accuracy: 12,
  }));
const lateral = (point: { longitude: number }) =>
  Math.abs(point.longitude - 2.35) * 111_320 * Math.cos((48.85 * Math.PI) / 180);

test('addPoint lisse un GPS qui zigzague en ville', () => {
  let track = emptyTrack();
  for (const point of zigzag(30)) track = addPoint(track, point);
  const after = track.points.slice(3);
  assert.ok(Math.max(...after.map(lateral)) < 6, String(Math.max(...after.map(lateral))));
  // Sans lissage, les zigzags gonfleraient la distance (≈ 650 m au lieu de 290 m).
  assert.ok(track.distanceM < 360, String(track.distanceM));
});

test('addPoint pose les positions sur le trajet prévu quand elles en sont proches', () => {
  const path = [
    { latitude: 48.85, longitude: 2.35 },
    { latitude: 48.853, longitude: 2.35 },
  ];
  let track = emptyTrack();
  for (const point of zigzag(30)) track = addPoint(track, point, path);
  assert.ok(track.points.every((point) => lateral(point) < 0.01));
  assert.ok(Math.abs(track.distanceM - 290) < 25, String(track.distanceM));
  assert.ok(Math.abs(remainingAlongPath(path, track) - (333.6 - track.distanceM)) < 5);
  assert.equal(hasArrived(path, track), false);
  for (const point of zigzag(36).slice(30)) track = addPoint(track, point, path);
  track = addPoint(
    track,
    { latitude: 48.853, longitude: 2.35, timestamp: 260_000, accuracy: 8 },
    path
  );
  assert.equal(hasArrived(path, track), true);
  assert.ok(remainingAlongPath(path, track) < 25);
});

test('une boucle ne se termine pas au départ', () => {
  const loop = [
    { latitude: 48.85, longitude: 2.35 },
    { latitude: 48.852, longitude: 2.35 },
    { latitude: 48.852, longitude: 2.353 },
    { latitude: 48.85, longitude: 2.35 },
  ];
  const track = addPoint(
    emptyTrack(),
    { latitude: 48.85, longitude: 2.35, timestamp: 0, accuracy: 5 },
    loop
  );
  assert.equal(hasArrived(loop, track), false);
  assert.ok(remainingAlongPath(loop, track) > 600);
});
