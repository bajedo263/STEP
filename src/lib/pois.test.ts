/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  bestPoiNear,
  distanceM,
  overpassQuery,
  parseOverpassPois,
  poisAlongPath,
  samplePath,
} from '../../supabase/functions/_shared/pois.ts';

// Une rue nord-sud d'environ 400 m.
const street = [
  { latitude: 48.88, longitude: 2.33 },
  { latitude: 48.8818, longitude: 2.33 },
  { latitude: 48.8836, longitude: 2.33 },
];

const overpass = {
  elements: [
    {
      type: 'node',
      id: 1,
      lat: 48.881,
      lon: 2.3302, // ~15 m de la rue
      tags: {
        historic: 'memorial',
        memorial: 'plaque',
        inscription: 'Ici est né Serge Gainsbourg le 2 avril 1928',
        wikidata: 'Q1290',
      },
    },
    {
      type: 'way',
      id: 2,
      center: { lat: 48.8830, lon: 2.3301 },
      tags: { tourism: 'artwork', name: 'Fresque du quartier', wikipedia: 'fr:Fresque du quartier' },
    },
    { type: 'node', id: 3, lat: 48.882, lon: 2.336, tags: { historic: 'monument', name: 'Trop loin' } },
    { type: 'node', id: 4, lat: 48.881, lon: 2.33, tags: { historic: 'memorial' } }, // ni nom ni texte
    { type: 'node', id: 5, tags: { name: 'Sans position' } },
  ],
};

test('parseOverpassPois lit les plaques, œuvres et monuments', () => {
  const pois = parseOverpassPois(overpass);
  assert.deepEqual(
    pois.map((p) => p.id),
    ['node/1', 'way/2', 'node/3']
  );
  const plaque = pois[0];
  assert.equal(plaque.kind, 'plaque');
  assert.equal(plaque.title, 'Ici est né Serge Gainsbourg le 2 avril 1928');
  assert.equal(plaque.description, null);
  assert.equal(plaque.score, 5); // plaque + inscription + wikidata
  assert.equal(pois[1].wikipediaUrl, 'https://fr.wikipedia.org/wiki/Fresque_du_quartier');
  assert.deepEqual(parseOverpassPois({ remark: 'timeout' }), []);
});

test('poisAlongPath garde ce qui est au bord du trajet, dans l’ordre de passage', () => {
  const pois = parseOverpassPois(overpass);
  assert.deepEqual(
    poisAlongPath(pois, street).map((p) => p.id),
    ['node/1', 'way/2']
  );
  assert.deepEqual(
    poisAlongPath(pois, [...street].reverse()).map((p) => p.id),
    ['way/2', 'node/1']
  );
  assert.equal(poisAlongPath(pois, street, 35, 1)[0].id, 'node/1');
});

test('bestPoiNear préfère le lieu le plus intéressant dans le rayon', () => {
  const pois = parseOverpassPois(overpass);
  const target = { latitude: 48.8825, longitude: 2.3301 };
  assert.equal(bestPoiNear(pois, target, 200)?.id, 'node/1');
  assert.equal(bestPoiNear(pois, target, 80)?.id, 'way/2');
  assert.equal(bestPoiNear(pois, target, 10), null);
});

test('samplePath allège le tracé en gardant les extrémités', () => {
  const dense = Array.from({ length: 101 }, (_, i) => ({ latitude: 48.88 + i * 0.00001, longitude: 2.33 }));
  const sampled = samplePath(dense, 20);
  assert.equal(sampled[0], dense[0]);
  assert.equal(sampled.at(-1), dense.at(-1));
  assert.ok(sampled.length < 12, String(sampled.length));
  assert.ok(samplePath(dense, 1, 10).length <= 10);
});

test('overpassQuery suit le tracé', () => {
  const query = overpassQuery(street, 35);
  assert.match(query, /\(around:35,48\.880000,2\.330000,48\.881800,2\.330000,48\.883600,2\.330000\);/);
  assert.match(query, /out center tags/);
});

test('distanceM', () => {
  assert.ok(Math.abs(distanceM(street[0], street[2]) - 400) < 2);
});



test('nearbyPoi signale le lieu le plus proche à portée', async () => {
  const { nearbyPoi } = await import('./pois.ts');
  const pois = parseOverpassPois(overpass);
  assert.equal(nearbyPoi(pois, { latitude: 48.8811, longitude: 2.3301 })?.id, 'node/1');
  assert.equal(nearbyPoi(pois, street[0]), null);
  assert.equal(nearbyPoi(pois, null), null);
});
