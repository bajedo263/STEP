/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  capturedCells,
  cellOf,
  cellPolygon,
  cellRangeOf,
  cellsAlongTrack,
  MAX_VISIBLE_SPAN,
} from './conquest.ts';
import { distanceM } from '../../supabase/functions/_shared/pois.ts';

const start = { latitude: 48.8495, longitude: 2.3005 };

test('cellOf : cases d’environ 50 m à Paris, au même découpage que la base', () => {
  const cell = cellOf(start);
  // Même formule que conquest_cell_x / conquest_cell_y en SQL (2^19 = 524288).
  assert.equal(cell.x, Math.floor(((start.longitude + 180) / 360) * 524288));
  const [nw, ne, , sw] = cellPolygon(cell);
  const width = distanceM(nw, ne);
  assert.ok(width > 45 && width < 55, String(width));
  assert.ok(Math.abs(distanceM(nw, sw) - width) < 2);
});

test('cellsAlongTrack ignore le départ et ne saute aucune case', () => {
  // 500 m vers l'est en deux points seulement.
  const end = { latitude: start.latitude, longitude: start.longitude + 500 / (111_320 * Math.cos((start.latitude * Math.PI) / 180)) };
  const all = cellsAlongTrack([start, end], 0);
  assert.ok(all.length >= 10 && all.length <= 12, String(all.length));
  const xs = all.map((c) => c.x).sort((a, b) => a - b);
  assert.equal(xs.at(-1)! - xs[0] + 1, xs.length); // cases contiguës
  const skipped = cellsAlongTrack([start, end]);
  assert.ok(skipped.length < all.length - 2);
  assert.ok(!skipped.some((c) => c.x === cellOf(start).x));
  assert.deepEqual(cellsAlongTrack([start]), []);
});

test('cellRangeOf refuse une carte trop dézoomée', () => {
  const near = cellRangeOf({ ...start, latitudeDelta: 0.01, longitudeDelta: 0.01 });
  assert.ok(near && near.maxX - near.minX <= MAX_VISIBLE_SPAN && near.minY < near.maxY);
  assert.equal(cellRangeOf({ ...start, latitudeDelta: 0.2, longitudeDelta: 0.2 }), null);
});

test('capturedCells ignore aussi la fin et les trajets trop courts', () => {
  const east = (m: number) => ({ latitude: start.latitude, longitude: start.longitude + m / (111_320 * Math.cos((start.latitude * Math.PI) / 180)) });
  const cells = capturedCells([start, east(600)]);
  assert.ok(cells.length >= 5 && cells.length <= 8, String(cells.length));
  assert.ok(!cells.some((c) => c.x === cellOf(east(600)).x));
  assert.deepEqual(capturedCells([start, east(350)]), []);
});
