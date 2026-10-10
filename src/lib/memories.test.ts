/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { memoriesFor, placesByMonth } from './memories.ts';
import { lineCoordinates, projectPaths } from './walk-art.ts';

/** Midi, heure locale, pour éviter les surprises de fuseau. */
const at = (day: string) => new Date(`${day}T12:00:00`).toISOString();

test('anniversaires de lieux et de marches', () => {
  const today = new Date('2026-10-10T09:00:00');
  const visits = [
    { visited_at: at('2026-09-10'), name: 'Église Saint-Eustache' },
    { visited_at: at('2026-09-10'), name: 'Fontaine des Innocents' },
    { visited_at: at('2025-10-10'), name: 'Tour Saint-Jacques' },
    { visited_at: at('2026-10-09'), name: 'Hier' },
  ];
  const walks = [
    { started_at: at('2026-10-03'), distance_m: 4200 },
    { started_at: at('2026-10-03'), distance_m: 1500 },
    { started_at: at('2026-07-10'), distance_m: 900 },
  ];
  assert.deepEqual(memoriesFor(today, visits, walks), [
    { when: 'Il y a un an', kind: 'place', text: 'vous découvriez Tour Saint-Jacques.' },
    {
      when: 'Il y a un mois',
      kind: 'place',
      text: 'vous découvriez Église Saint-Eustache et 1 autre lieu.',
    },
    { when: 'Il y a une semaine', kind: 'walk', text: 'vous marchiez 4,2 km d’une traite.' },
  ]);
  assert.deepEqual(memoriesFor(today, [], []), []);
});

test('pas d’anniversaire un jour qui n’existe pas', () => {
  // Le 31 octobre, « il y a un mois » serait le 31 septembre.
  const memories = memoriesFor(
    new Date('2026-10-31T09:00:00'),
    [{ visited_at: at('2026-10-01'), name: 'X' }],
    []
  );
  assert.deepEqual(memories, []);
});

test('lieux par mois', () => {
  const groups = placesByMonth([
    { visited_at: at('2026-09-10'), name: 'A' },
    { visited_at: at('2026-10-02'), name: 'B' },
    { visited_at: at('2026-10-05'), name: 'C' },
  ]);
  assert.deepEqual(
    groups.map((group) => group.names),
    [['C', 'B'], ['A']]
  );
});

test('lecture et projection des tracés', () => {
  const line = lineCoordinates('{"type":"LineString","coordinates":[[2.35,48.86],[2.36,48.87]]}');
  assert.deepEqual(line, [
    { latitude: 48.86, longitude: 2.35 },
    { latitude: 48.87, longitude: 2.36 },
  ]);
  assert.equal(lineCoordinates({ type: 'Point', coordinates: [2, 48] }), null);
  assert.equal(lineCoordinates('pas du json'), null);

  const [points] = projectPaths([line!], 100, 100, 10);
  const pairs = points.split(' ').map((pair) => pair.split(',').map(Number));
  // Le nord en haut, le tracé tient dans le cadre avec sa marge.
  assert.ok(pairs[0][1] > pairs[1][1]);
  for (const [x, y] of pairs) {
    assert.ok(x >= 10 && x <= 90 && y >= 10 && y <= 90);
  }
  assert.deepEqual(projectPaths([], 100, 100), []);
});
