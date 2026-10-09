/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loopHandles, moveHandle, pointAlong } from './loop-handles.ts';
import { haversineMeters } from './track.ts';

// Carré d'environ 1 km de côté, parcouru dans le sens des aiguilles d'une montre.
const start = { latitude: 48.85, longitude: 2.35 };
const dLat = 1000 / 111_320;
const dLon = 1000 / (111_320 * Math.cos((48.85 * Math.PI) / 180));
const square = [
  start,
  { latitude: start.latitude + dLat, longitude: start.longitude },
  { latitude: start.latitude + dLat, longitude: start.longitude + dLon },
  { latitude: start.latitude, longitude: start.longitude + dLon },
  start,
];

test('un point le long du tracé', () => {
  const half = pointAlong(square, 500);
  assert.ok(
    haversineMeters(half, { latitude: start.latitude + dLat / 2, longitude: start.longitude }) < 2
  );
  assert.deepEqual(pointAlong(square, 99_999), start);
});

test('trois poignées au quart, à la moitié et aux trois quarts de la boucle', () => {
  const handles = loopHandles(square);
  assert.equal(handles.length, 3);
  assert.ok(haversineMeters(handles[0], square[1]) < 5);
  assert.ok(haversineMeters(handles[1], square[2]) < 5);
  assert.ok(haversineMeters(handles[2], square[3]) < 5);
  assert.deepEqual(loopHandles([start]), []);
});

test('déplacer une poignée ne touche pas aux autres', () => {
  const handles = loopHandles(square);
  const moved = moveHandle(handles, 1, start);
  assert.deepEqual(moved[1], start);
  assert.deepEqual(moved[0], handles[0]);
  assert.deepEqual(moved[2], handles[2]);
});
