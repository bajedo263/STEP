/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  osrmRouteUrl,
  parseOsrmResponse,
  parsePhotonPlaces,
  photonUrl,
} from '../../supabase/functions/_shared/osrm.ts';

const paris = { latitude: 48.849, longitude: 2.2985 };
const invalides = { latitude: 48.8553, longitude: 2.3155 };

test('osrmRouteUrl passe par les points dans l’ordre (longitude, latitude)', () => {
  assert.equal(
    osrmRouteUrl([paris, invalides, paris]),
    'https://routing.openstreetmap.de/routed-foot/route/v1/foot/2.298500,48.849000;2.315500,48.855300;2.298500,48.849000?overview=full&geometries=geojson'
  );
});

test('parseOsrmResponse lit distance, durée et tracé', () => {
  const route = parseOsrmResponse({
    code: 'Ok',
    routes: [
      {
        distance: 5379.1,
        duration: 4302.7,
        geometry: { type: 'LineString', coordinates: [[2.2985, 48.849], [2.3155, 48.8553]] },
      },
    ],
  });
  assert.deepEqual(route, {
    coordinates: [paris, invalides],
    distanceM: 5379,
    durationS: 4303,
  });
  assert.equal(parseOsrmResponse({ code: 'NoRoute', routes: [] }), null);
  assert.equal(parseOsrmResponse(null), null);
});

test('parsePhotonPlaces compose un libellé lisible', () => {
  const places = parsePhotonPlaces({
    features: [
      {
        geometry: { coordinates: [2.2945, 48.8582] },
        properties: {
          osm_type: 'W',
          osm_id: 5013364,
          name: 'Tour Eiffel',
          housenumber: '5',
          street: 'Avenue Anatole France',
          city: 'Paris',
        },
      },
      { geometry: { coordinates: [2.3, 48.85] }, properties: { street: 'Rue Letellier', city: 'Paris' } },
      { geometry: { coordinates: [2.3, 48.85] }, properties: {} },
      { properties: { name: 'Sans position' } },
    ],
  });
  assert.deepEqual(
    places.map((p) => p.label),
    ['Tour Eiffel, 5 Avenue Anatole France, Paris', 'Rue Letellier, Paris']
  );
  assert.equal(places[0].id, 'photon/W5013364');
  assert.deepEqual(places[0].coords, { latitude: 48.8582, longitude: 2.2945 });
  assert.match(photonUrl('tour eiffel', paris), /q=tour\+eiffel&lang=fr&limit=6&lat=48\.849&lon=2\.2985/);
});
