/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { collectionCounts, missingPlacesPoints, zoneLevel, zoneNextStep } from './collection.ts';

test('un quartier est exploré à moitié de ses lieux et complet quand tous sont vus', () => {
  assert.equal(zoneLevel({ total: 8, visited: 3 }), 'none');
  assert.equal(zoneLevel({ total: 8, visited: 4 }), 'explored');
  assert.equal(zoneLevel({ total: 8, visited: 8 }), 'complete');
  assert.equal(zoneLevel({ total: 0, visited: 0 }), 'none');
  assert.deepEqual(
    collectionCounts([
      { total: 8, visited: 4 },
      { total: 3, visited: 3 },
      { total: 5, visited: 1 },
    ]),
    { explored: 2, complete: 1 }
  );
});

test('le palier suivant dit combien de lieux il manque', () => {
  assert.equal(zoneNextStep({ total: 7, visited: 1 }), 'Encore 3 lieux pour l’explorer');
  assert.equal(zoneNextStep({ total: 7, visited: 6 }), 'Encore 1 lieu pour le compléter');
  assert.equal(zoneNextStep({ total: 7, visited: 7 }), null);
});

test('la boucle vise les lieux manquants les plus proches, dans l’ordre autour du départ', () => {
  const start = { latitude: 48.85, longitude: 2.35 };
  const at = (name: string, north: number, east: number) => ({
    name,
    latitude: start.latitude + north / 111_320,
    longitude: start.longitude + east / (111_320 * Math.cos((start.latitude * Math.PI) / 180)),
  });
  const places = [
    at('loin', 3_000, 0),
    at('nord', 500, 0),
    at('ouest', 0, -400),
    at('est', 0, 600),
    at('sud', -700, 0),
    at('sud-est', -900, 900),
  ];
  const points = missingPlacesPoints(places, start).map((place) => place.name);
  assert.equal(points.length, 4);
  assert.ok(!points.includes('loin'));
  assert.ok(!points.includes('sud-est'));
  // Ordonnés par cap : de l'ouest au sud en passant par le nord et l'est (ordre cyclique).
  const order = ['ouest', 'nord', 'est', 'sud'];
  const shift = order.indexOf(points[0]);
  assert.deepEqual(points, [...order.slice(shift), ...order.slice(0, shift)]);
});
