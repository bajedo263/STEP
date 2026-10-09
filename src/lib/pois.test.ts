/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  bestPoiNear,
  distanceM,
  parseWikipediaPois,
  poisAlongPath,
  samplePath,
  wikipediaBboxParams,
  wikipediaNearParams,
} from '../../supabase/functions/_shared/pois.ts';

// Une rue nord-sud d'environ 400 m.
const street = [
  { latitude: 48.88, longitude: 2.33 },
  { latitude: 48.8818, longitude: 2.33 },
  { latitude: 48.8836, longitude: 2.33 },
];

// Réponse de l'API Wikipédia (formatversion=2).
const wikipedia = {
  batchcomplete: true,
  query: {
    pages: [
      {
        pageid: 1,
        title: 'Musée de la Vie romantique (Paris)',
        description: 'musée parisien consacré au romantisme',
        fullurl: 'https://fr.wikipedia.org/wiki/Mus%C3%A9e_de_la_Vie_romantique',
        coordinates: [{ lat: 48.881, lon: 2.3302 }], // ~15 m de la rue
      },
      {
        pageid: 2,
        title: 'Fresque du quartier',
        fullurl: 'https://fr.wikipedia.org/wiki/Fresque_du_quartier',
        coordinates: [{ lat: 48.883, lon: 2.3301 }],
      },
      {
        pageid: 3,
        title: 'Trop loin',
        description: 'monument historique',
        coordinates: [{ lat: 48.882, lon: 2.336 }],
      },
      { pageid: 4, title: 'Rue Chaptal', description: 'rue de Paris, en France', coordinates: [{ lat: 48.881, lon: 2.33 }] },
      { pageid: 5, title: '9e arrondissement de Paris', coordinates: [{ lat: 48.88, lon: 2.33 }] },
      { pageid: 6, title: 'Sans position', description: 'église' },
    ],
  },
};

test('parseWikipediaPois garde les lieux à voir, pas les rues ni les découpages', () => {
  const pois = parseWikipediaPois(wikipedia);
  assert.deepEqual(
    pois.map((p) => p.id),
    ['wiki/1', 'wiki/2', 'wiki/3']
  );
  const museum = pois[0];
  assert.equal(museum.kind, 'museum');
  assert.equal(museum.title, 'Musée de la Vie romantique');
  assert.equal(museum.description, 'Musée parisien consacré au romantisme');
  assert.equal(museum.score, 4); // musée + description
  assert.equal(pois[1].kind, 'artwork');
  assert.equal(pois[1].description, null);
  assert.equal(pois[2].kind, 'monument');
  assert.deepEqual(parseWikipediaPois({ error: { code: 'toobig' } }), []);
  // L'ancien format (pages indexées par identifiant) est aussi lu.
  assert.equal(parseWikipediaPois({ query: { pages: { 1: wikipedia.query.pages[0] } } }).length, 1);
});

test('paramètres de recherche Wikipédia', () => {
  const box = wikipediaBboxParams({ south: 48.848, west: 2.3, north: 48.862, east: 2.32 });
  assert.equal(box.ggsbbox, '48.862000|2.300000|48.848000|2.320000');
  assert.equal(box.generator, 'geosearch');
  const near = wikipediaNearParams(street[0], 20_000);
  assert.equal(near.ggscoord, '48.880000|2.330000');
  assert.equal(near.ggsradius, '10000');
});

test('poisAlongPath garde ce qui est au bord du trajet, dans l’ordre de passage', () => {
  const pois = parseWikipediaPois(wikipedia);
  assert.deepEqual(
    poisAlongPath(pois, street).map((p) => p.id),
    ['wiki/1', 'wiki/2']
  );
  assert.deepEqual(
    poisAlongPath(pois, [...street].reverse()).map((p) => p.id),
    ['wiki/2', 'wiki/1']
  );
  assert.equal(poisAlongPath(pois, street, 35, 1)[0].id, 'wiki/1');
});

test('bestPoiNear préfère le lieu le plus intéressant dans le rayon', () => {
  const pois = parseWikipediaPois(wikipedia);
  const target = { latitude: 48.8825, longitude: 2.3301 };
  assert.equal(bestPoiNear(pois, target, 200)?.id, 'wiki/1');
  assert.equal(bestPoiNear(pois, target, 80)?.id, 'wiki/2');
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

test('distanceM', () => {
  assert.ok(Math.abs(distanceM(street[0], street[2]) - 400) < 2);
});

test('nearbyPoi signale le lieu le plus proche à portée', async () => {
  const { nearbyPoi } = await import('./pois.ts');
  const pois = parseWikipediaPois(wikipedia);
  assert.equal(nearbyPoi(pois, { latitude: 48.8811, longitude: 2.3301 })?.id, 'wiki/1');
  assert.equal(nearbyPoi(pois, street[0]), null);
  assert.equal(nearbyPoi(pois, null), null);
});

test('zoneOf et zoneBbox sont cohérents', async () => {
  const { zoneOf, zoneBbox, zonesAround, zonesAlongPath } = await import(
    '../../supabase/functions/_shared/pois.ts'
  );
  const point = { latitude: 48.8566, longitude: 2.3522 };
  const zone = zoneOf(point);
  assert.deepEqual(zone, { x: 16598, y: 11273 });
  const box = zoneBbox(zone);
  assert.ok(box.south <= point.latitude && point.latitude <= box.north);
  assert.ok(box.west <= point.longitude && point.longitude <= box.east);
  assert.ok(distanceM({ latitude: box.south, longitude: box.west }, { latitude: box.south, longitude: box.east }) < 900);
  assert.equal(zonesAround(point).length, 9);
  assert.ok(zonesAlongPath(street).length >= 1);
});
