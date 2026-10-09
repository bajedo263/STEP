/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nearestPois, type Poi } from './pois.ts';

const poi = (id: string, latitude: number): Poi =>
  ({ id, title: id, kind: 'monument', coords: { latitude, longitude: 2.33 } }) as Poi;

test('les lieux les plus proches, dans l’ordre, à moins d’un kilomètre', () => {
  const here = { latitude: 48.88, longitude: 2.33 };
  const pois = [
    poi('loin', 48.9),
    poi('b', 48.882),
    poi('a', 48.8805),
    poi('c', 48.884),
    poi('d', 48.886),
  ];
  assert.deepEqual(
    nearestPois(pois, here).map((p) => p.id),
    ['a', 'b', 'c']
  );
  assert.deepEqual(
    nearestPois(pois, here, 10).map((p) => p.id),
    ['a', 'b', 'c', 'd']
  );
  assert.deepEqual(nearestPois(pois, null), []);
});
