/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  leagueChangeLabel,
  leagueStatusLabel,
  leagueZone,
  stepsToOvertake,
  tierName,
  type LeagueRow,
} from './league.ts';

const row = (rank: number, steps: number, extra: Partial<LeagueRow> = {}): LeagueRow => ({
  user_id: `u${rank}`,
  username: `Marcheur ${rank}`,
  steps,
  rank,
  is_me: false,
  tier: 1,
  players: 12,
  promote: 4,
  demote: 4,
  week_start: '2026-10-05',
  previous_tier: 1,
  ...extra,
});

test('zones de montée et de descente', () => {
  assert.equal(leagueZone(row(4, 30_000)), 'promote');
  assert.equal(leagueZone(row(5, 30_000)), 'safe');
  assert.equal(leagueZone(row(9, 10_000)), 'demote');
  assert.equal(leagueZone(row(2, 0)), 'demote');
  assert.equal(leagueZone(row(1, 50_000, { tier: 4 })), 'safe');
  assert.equal(leagueZone(row(12, 1_000, { tier: 0 })), 'safe');
});

test('messages de ligue', () => {
  assert.equal(tierName(1), '🥈 Ligue Argent');
  assert.match(leagueStatusLabel(row(2, 30_000)), /passeriez en Or/);
  assert.match(leagueStatusLabel(row(10, 3_000)), /redescendriez en Bronze/);
  assert.match(leagueStatusLabel(row(6, 20_000)), /Les 4 premiers montent en Or/);
  assert.match(leagueStatusLabel(row(1, 5_000, { players: 1 })), /vous montez en Or/);
  assert.equal(
    leagueChangeLabel(row(1, 0, { tier: 2, previous_tier: 1 })),
    'Bravo, vous passez en Or !'
  );
  assert.match(
    leagueChangeLabel(row(1, 0, { tier: 0, previous_tier: 1 })) ?? '',
    /Retour en Bronze/
  );
  assert.equal(leagueChangeLabel(row(1, 0, { previous_tier: null })), null);
});

test('pas à faire pour doubler le marcheur devant', () => {
  const rows = [row(1, 40_000), row(2, 25_000), row(3, 24_000, { is_me: true })];
  assert.equal(stepsToOvertake(rows), 1_001);
  assert.equal(stepsToOvertake([row(1, 1, { is_me: true })]), null);
});
