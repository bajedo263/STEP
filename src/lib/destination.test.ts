/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  orsAutocompleteParams,
  orsDirectionsBody,
  parseDestinationRequest,
  parseOrsPlaces,
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
  assert.equal(parseDestinationRequest({ action: 'route', start: paris, end: paris }).ok, true);
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

test('orsDirectionsBody', () => {
  assert.deepEqual(orsDirectionsBody(paris, { latitude: 48.86, longitude: 2.34 }).coordinates, [
    [2.35, 48.85],
    [2.34, 48.86],
  ]);
});
