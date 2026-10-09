/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { avatarFrame, leagueTrophy, seasonTrophies, trophyLevel } from './season-rewards.ts';

const result = (month: number, rank: number, players = 40, cells = 30) => ({
  season_start: new Date(2026, month - 1, 1).toISOString(),
  cells,
  rank,
  players,
});

test('niveaux de trophée', () => {
  assert.equal(trophyLevel(1, 40), 'gold');
  assert.equal(trophyLevel(3, 40), 'bronze');
  assert.equal(trophyLevel(4, 40), 'elite');
  assert.equal(trophyLevel(5, 40), 'finisher');
  assert.equal(trophyLevel(5, 4), 'finisher');
});

test('trophées de saison, du plus récent au plus ancien, sans les saisons à zéro case', () => {
  const trophies = seasonTrophies([result(8, 12), result(9, 1), result(7, 2, 40, 0)]);
  assert.equal(trophies.length, 2);
  assert.equal(trophies[0].emoji, '🥇');
  assert.match(trophies[0].title, /^Champion · Saison de septembre 2026$/);
  assert.equal(trophies[0].description, '1er sur 40, avec 30 cases.');
  assert.equal(trophies[1].level, 'finisher');
});

test('le cadre d’avatar vient des trois dernières saisons', () => {
  assert.equal(avatarFrame([]), null);
  assert.equal(avatarFrame([result(5, 1), result(7, 10), result(8, 3), result(9, 20)]), 'bronze');
  assert.equal(avatarFrame([result(9, 2), result(8, 1)]), 'gold');
});

test('trophée de ligue dès l’Argent', () => {
  assert.equal(leagueTrophy(0), null);
  assert.equal(leagueTrophy(null), null);
  assert.equal(leagueTrophy(2)?.title, 'Ligue Or');
  assert.equal(leagueTrophy(4)?.level, 'elite');
});
