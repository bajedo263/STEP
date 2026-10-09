/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clusterByRegion, upcomingPois } from './map-declutter.ts';

const at = (latitude: number, longitude: number) => ({ coords: { latitude, longitude } });

test('clusterByRegion regroupe les lieux voisins quand on dézoome', () => {
  const pois = [at(48.86, 2.31), at(48.8601, 2.3101), at(48.9, 2.4)];
  const wide = { latitude: 48.87, longitude: 2.35, latitudeDelta: 0.2, longitudeDelta: 0.2 };
  const clusters = clusterByRegion(pois, wide);
  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters.map((cluster) => cluster.items.length).sort(), [1, 2]);
});

test('clusterByRegion sépare les mêmes lieux quand on zoome', () => {
  const pois = [at(48.85, 2.3), at(48.851, 2.301)];
  const close = { latitude: 48.85, longitude: 2.3, latitudeDelta: 0.002, longitudeDelta: 0.002 };
  assert.equal(clusterByRegion(pois, close).length, 2);
});

test('clusterByRegion sans région laisse chaque lieu seul', () => {
  assert.equal(clusterByRegion([at(1, 1), at(1, 1)], null).length, 2);
});

// Un tracé nord-sud de 5 points.
const route = [0, 1, 2, 3, 4].map((step) => ({ latitude: 48.85 + step * 0.001, longitude: 2.3 }));
const poi = (id: string, step: number, visited = false) => ({
  id,
  visited,
  coords: { latitude: 48.85 + step * 0.001, longitude: 2.3001 },
});

test('upcomingPois garde les prochains lieux non découverts, dans l’ordre du tracé', () => {
  const pois = [poi('d', 4), poi('a', 0), poi('c', 3), poi('b', 2, true), poi('e', 1)];
  const position = { latitude: 48.851, longitude: 2.3 };
  assert.deepEqual(
    upcomingPois(pois, route, position, 2).map((item) => item.id),
    ['e', 'c']
  );
});

test('upcomingPois part du début du tracé sans position', () => {
  const pois = [poi('b', 2), poi('a', 0)];
  assert.deepEqual(
    upcomingPois(pois, route, null).map((item) => item.id),
    ['a', 'b']
  );
});
