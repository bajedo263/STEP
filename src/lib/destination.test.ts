/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  detourWaypoint,
  FAR_PLACE_M,
  ignSearchUrl,
  looksLikeAddress,
  mergePlaces,
  parseIgnPlaces,
  orsAutocompleteParams,
  parseDestinationRequest,
  parseOrsPlaces,
  cityMissingDistrict,
  cityWithDistrict,
  districtFromInseeCode,
  labelMissingStreet,
  labelWithAddress,
  labelWithDistrict,
  parseReverseAddress,
  straightDistanceM,
} from '../../supabase/functions/_shared/destination.ts';

const paris = { latitude: 48.85, longitude: 2.35 };

test('parseDestinationRequest : recherche', () => {
  assert.deepEqual(parseDestinationRequest({ action: 'search', query: '  Louvre ', near: paris }), {
    ok: true,
    value: { action: 'search', query: 'Louvre', near: paris },
  });
  const noNear = parseDestinationRequest({ action: 'search', query: 'Louvre' });
  assert.equal(noNear.ok && noNear.value.action === 'search' && noNear.value.near, null);
  assert.equal(parseDestinationRequest({ action: 'search', query: 'ab' }).ok, false);
});

test('parseDestinationRequest : itinéraire', () => {
  assert.deepEqual(
    parseDestinationRequest({ action: 'route', start: paris, end: paris, targetM: 40_000, seed: 3.2 }),
    { ok: true, value: { action: 'route', start: paris, end: paris, targetM: 25_000, seed: 3 } }
  );
  const plain = parseDestinationRequest({ action: 'route', start: paris, end: paris });
  assert.equal(plain.ok && plain.value.action === 'route' && plain.value.targetM, null);
  assert.equal(parseDestinationRequest({ action: 'route', start: paris }).ok, false);
  assert.equal(parseDestinationRequest({ action: 'delete' }).ok, false);
  assert.equal(parseDestinationRequest(null).ok, false);
});

test('orsAutocompleteParams centre la recherche', () => {
  const params = orsAutocompleteParams('Louvre', paris);
  assert.equal(params.get('text'), 'Louvre');
  assert.equal(params.get('focus.point.lat'), '48.85');
  assert.equal(params.get('focus.point.lon'), '2.35');
  assert.equal(orsAutocompleteParams('Louvre', null).has('focus.point.lat'), false);
});

test('parseOrsPlaces lit les lieux et ignore les entrées incomplètes', () => {
  const places = parseOrsPlaces({
    features: [
      {
        geometry: { coordinates: [2.3376, 48.8606] },
        properties: { gid: 'osm:venue:1', label: 'Musée du Louvre, Paris, France' },
      },
      { geometry: { coordinates: [2.3] }, properties: { label: 'Cassé' } },
      { properties: { label: 'Sans géométrie' } },
    ],
  });
  assert.deepEqual(places, [
    { id: 'osm:venue:1', label: 'Musée du Louvre, Paris, France', coords: { latitude: 48.8606, longitude: 2.3376 } },
  ]);
  assert.deepEqual(parseOrsPlaces({ error: 'x' }), []);
});

test('detourWaypoint allonge le trajet à la longueur voulue', () => {
  const end = { latitude: 48.859, longitude: 2.35 }; // ~1 km au nord
  for (const side of [1, -1] as const) {
    const via = detourWaypoint(paris, end, 3000, side);
    const length = straightDistanceM(paris, via) + straightDistanceM(via, end);
    assert.ok(Math.abs(length - 3000) < 1, String(length));
  }
  // Les deux côtés sont symétriques par rapport à A–B.
  const left = detourWaypoint(paris, end, 3000, 1);
  const right = detourWaypoint(paris, end, 3000, -1);
  assert.ok(left.longitude < 2.35 && right.longitude > 2.35);
});

test('detourWaypoint sans écart possible ou au même endroit', () => {
  const end = { latitude: 48.859, longitude: 2.35 };
  const via = detourWaypoint(paris, end, 500, 1); // plus court que le direct
  assert.ok(straightDistanceM(via, { latitude: 48.8545, longitude: 2.35 }) < 1);
  const same = detourWaypoint(paris, paris, 2000, 1);
  assert.ok(Math.abs(straightDistanceM(paris, same) - 1000) < 1);
});

test('cityWithDistrict lit l’arrondissement au code postal', () => {
  assert.equal(cityWithDistrict('Paris', '75015'), 'Paris 15e');
  assert.equal(cityWithDistrict('Paris', '75001'), 'Paris 1er');
  assert.equal(cityWithDistrict('Paris', '75116'), 'Paris 16e');
  assert.equal(cityWithDistrict('Lyon', '69003'), 'Lyon 3e');
  assert.equal(cityWithDistrict('Marseille', '13008'), 'Marseille 8e');
  assert.equal(cityWithDistrict('Boulogne-Billancourt', '92100'), 'Boulogne-Billancourt');
  assert.equal(cityWithDistrict('Paris', null), 'Paris');
  assert.equal(cityWithDistrict(null, '75015'), null);
});

test('parseOrsPlaces distingue deux magasins par leur rue et leur arrondissement', () => {
  const places = parseOrsPlaces({
    features: [
      {
        geometry: { coordinates: [2.29, 48.84] },
        properties: {
          gid: 'osm:venue:2',
          label: 'Lidl, Paris, France',
          name: 'Lidl',
          housenumber: '28',
          street: 'Rue de la Croix-Nivert',
          postalcode: '75015',
          locality: 'Paris',
        },
      },
      {
        geometry: { coordinates: [2.27, 48.85] },
        properties: { gid: 'osm:address:3', name: '12 Rue de Passy', street: 'Rue de Passy', housenumber: '12', postalcode: '75016', locality: 'Paris' },
      },
    ],
  });
  assert.deepEqual(
    places.map((p) => p.label),
    ['Lidl, 28 Rue de la Croix-Nivert, Paris 15e', '12 Rue de Passy, Paris 16e']
  );
});

test('arrondissement ajouté d’après le code INSEE', () => {
  assert.equal(districtFromInseeCode('75115'), 15);
  assert.equal(districtFromInseeCode('69381'), 1);
  assert.equal(districtFromInseeCode('13208'), 8);
  assert.equal(districtFromInseeCode('92012'), null);
  assert.equal(districtFromInseeCode(undefined), null);
  assert.equal(cityMissingDistrict('Lidl, Paris'), 'Paris');
  assert.equal(cityMissingDistrict('Lidl, Paris, France'), 'Paris');
  assert.equal(cityMissingDistrict('Lidl, Paris 15e'), null);
  assert.equal(cityMissingDistrict('Lidl, Boulogne-Billancourt'), null);
  assert.equal(labelWithDistrict('Lidl, Paris', 15), 'Lidl, Paris 15e');
  assert.equal(labelWithDistrict('Lidl, Paris, France', 1), 'Lidl, Paris 1er');
  assert.equal(labelWithDistrict('Lidl, Paris 15e', 16), 'Lidl, Paris 15e');
});

test('labelMissingStreet : nom et ville seulement', () => {
  assert.equal(labelMissingStreet('Monoprix, Paris'), true);
  assert.equal(labelMissingStreet('Monoprix, Paris, France'), true);
  assert.equal(labelMissingStreet('Monoprix, 49 Rue d\'Auteuil, Paris 16e'), false);
});

const reverse = (properties: Record<string, unknown>) => ({ type: 'FeatureCollection', features: [{ properties }] });

test('parseReverseAddress : adresse proche, rue seule, trop loin', () => {
  assert.deepEqual(
    parseReverseAddress(reverse({ type: 'housenumber', housenumber: '12', street: 'Rue du Commerce', name: '12 Rue du Commerce', postcode: '75015', city: 'Paris', citycode: '75115', distance: 14 })),
    { housenumber: '12', street: 'Rue du Commerce', postcode: '75015', city: 'Paris', citycode: '75115' }
  );
  assert.equal(parseReverseAddress(reverse({ type: 'street', name: 'Rue Linois', city: 'Paris' }))?.street, 'Rue Linois');
  assert.equal(parseReverseAddress(reverse({ type: 'housenumber', street: 'Rue X', distance: 300 })), null);
  assert.equal(parseReverseAddress({ features: [] }), null);
});

test('labelWithAddress : la rue avant l\'arrondissement', () => {
  const address = { housenumber: '12', street: 'Rue du Commerce', postcode: '75015', city: 'Paris', citycode: '75115' };
  assert.equal(labelWithAddress('Monoprix, Paris', address), 'Monoprix, 12 Rue du Commerce, Paris 15e');
  assert.equal(labelWithAddress('Monoprix, Paris 15e', { ...address, postcode: null }), 'Monoprix, 12 Rue du Commerce, Paris 15e');
});

test('looksLikeAddress reconnaît numéro, code postal ou type de voie', () => {
  assert.equal(looksLikeAddress('26 rue tiphaine 75015'), true);
  assert.equal(looksLikeAddress('rue tiphaine paris'), true);
  assert.equal(looksLikeAddress('75015'), true);
  assert.equal(looksLikeAddress('12 bis avenue Félix Faure'), true);
  assert.equal(looksLikeAddress('monoprix'), false);
  assert.equal(looksLikeAddress('jardin du luxembourg'), false);
});

test('ignSearchUrl cherche les adresses autour de l’utilisateur', () => {
  const url = new URL(ignSearchUrl('26 rue tiphaine 75015', paris));
  assert.equal(url.host, 'data.geopf.fr');
  assert.equal(url.searchParams.get('q'), '26 rue tiphaine 75015');
  assert.equal(url.searchParams.get('index'), 'address');
  assert.equal(url.searchParams.get('lat'), '48.85');
  assert.equal(url.searchParams.get('lon'), '2.35');
});

test('parseIgnPlaces lit les adresses avec leur arrondissement', () => {
  const places = parseIgnPlaces({
    features: [
      {
        geometry: { coordinates: [2.2969, 48.8476] },
        properties: {
          id: '75115_9283_00026',
          type: 'housenumber',
          name: '26 Rue Tiphaine',
          housenumber: '26',
          street: 'Rue Tiphaine',
          postcode: '75015',
          city: 'Paris',
          score: 0.92,
        },
      },
      {
        geometry: { coordinates: [-1.75, 48.02] },
        properties: { type: 'street', name: 'Rue Tiphaine Raguenel', postcode: '35310', city: 'Saint-Erblon', score: 0.3 },
      },
      { geometry: { coordinates: [2.3, 48.8] }, properties: { type: 'municipality', name: 'Paris', city: 'Paris', score: 0.8 } },
    ],
  });
  assert.deepEqual(
    places.map((place) => place.label),
    ['26 Rue Tiphaine, Paris 15e', 'Paris']
  );
  assert.equal(places[0].id, 'ign:75115_9283_00026');
  assert.deepEqual(parseIgnPlaces(null), []);
});

test('mergePlaces dédoublonne et met les lieux lointains en dernier', () => {
  const place = (id: string, label: string, latitude: number, longitude: number) => ({
    id,
    label,
    coords: { latitude, longitude },
  });
  const far = place('a', 'Rue Tiphaine Raguenel, Saint-Erblon', 48.02, -1.75);
  const near = place('b', '26 Rue Tiphaine, Paris 15e', 48.8476, 2.2969);
  const sameSpot = place('c', '26 rue Tiphaine, Paris', 48.84761, 2.29691);
  const merged = mergePlaces([[far], [near, sameSpot]], paris);
  assert.deepEqual(
    merged.map((p) => p.id),
    ['b', 'a']
  );
  assert.ok(FAR_PLACE_M >= 25_000);
  assert.equal(mergePlaces([[far, near]], null).length, 2);
});
