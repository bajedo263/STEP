import assert from 'node:assert/strict';
import { test } from 'node:test';

import { rankLabel, seasonEndLabel, seasonName, seasonRanking } from './season.ts';

test('seasonName élide devant une voyelle', () => {
  assert.equal(seasonName(new Date('2026-10-01T00:00:00+02:00')), 'Saison d’octobre');
  assert.equal(seasonName(new Date('2026-08-01T00:00:00+02:00')), 'Saison d’août');
  assert.equal(seasonName(new Date('2026-03-01T00:00:00+01:00')), 'Saison de mars');
  assert.equal(seasonName(new Date('2026-09-01T00:00:00+02:00'), true), 'Saison de septembre 2026');
});

test('seasonEndLabel donne le dernier jour, à l’heure de Paris', () => {
  const end = new Date('2026-11-01T00:00:00+01:00');
  assert.equal(seasonEndLabel(end, new Date('2026-10-09T12:00:00+02:00')), 'jusqu’au 31 octobre');
  assert.equal(
    seasonEndLabel(end, new Date('2026-10-31T23:30:00+01:00')),
    'dernier jour aujourd’hui'
  );
});

test('rankLabel', () => {
  assert.equal(rankLabel(1, 1), '1er sur 1 conquérant');
  assert.equal(rankLabel(2, 15), '2e sur 15 conquérants');
  assert.equal(rankLabel(null, 4), '4 conquérants en lice');
  assert.equal(rankLabel(null, 0), 'Personne n’a encore de case');
});

test('seasonRanking classe les amis confirmés par cases', () => {
  const ranking = seasonRanking(
    [
      { friend_id: 'a', username: 'Ana', status: 'friend', steps_today: 0, cells: 40 },
      { friend_id: 'b', username: 'Bob', status: 'friend', steps_today: 0, cells: 12 },
      { friend_id: 'c', username: 'Cid', status: 'incoming', steps_today: null, cells: null },
    ],
    { id: 'me', name: 'Moi', cells: 12 }
  );
  assert.deepEqual(
    ranking.map((entry) => [entry.name, entry.rank]),
    [
      ['Ana', 1],
      ['Moi', 2],
      ['Bob', 2],
    ]
  );
});
