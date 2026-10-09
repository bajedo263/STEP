/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cheersLabel,
  duelDaysLeft,
  duelLabel,
  duelLastDay,
  duelPhase,
  inviteMessage,
  type DuelRow,
} from './duels.ts';

const duel = (extra: Partial<DuelRow> = {}): DuelRow => ({
  id: 'd1',
  other_id: 'u2',
  other_name: 'Paul',
  incoming: false,
  status: 'active',
  days: 3,
  start_day: '2026-10-30',
  my_steps: 21_000,
  their_steps: 18_500,
  ...extra,
});

test('le duel dure le nombre de jours prévu, à cheval sur deux mois', () => {
  assert.equal(duelLastDay(duel()), '2026-11-01');
  assert.equal(duelPhase(duel(), '2026-10-31'), 'running');
  assert.equal(duelDaysLeft(duel(), '2026-10-31'), 2);
  assert.equal(duelPhase(duel(), '2026-11-02'), 'won');
  assert.equal(duelPhase(duel({ my_steps: 1 }), '2026-11-02'), 'lost');
  assert.equal(duelPhase(duel({ my_steps: 18_500 }), '2026-11-02'), 'tie');
  assert.equal(duelPhase(duel({ status: 'pending', start_day: null }), '2026-10-31'), 'pending');
});

test('messages de duel', () => {
  assert.match(duelLabel(duel(), '2026-10-31'), /^Encore 2 jours : vous menez de 2\s500 pas\.$/);
  assert.match(
    duelLabel(duel({ my_steps: 10_000 }), '2026-11-01'),
    /^Dernier jour : Paul mène de 8\s500 pas\.$/
  );
  assert.match(duelLabel(duel(), '2026-11-03'), /^Victoire contre Paul/);
  assert.match(duelLabel(duel({ my_steps: 1_000 }), '2026-11-03'), /Revanche \?$/);
  assert.equal(
    duelLabel(duel({ status: 'pending', start_day: null, incoming: true, days: 7 }), '2026-10-31'),
    'Paul vous défie : le plus de pas en 7 jours.'
  );
});

test('encouragements et invitation', () => {
  assert.equal(cheersLabel([]), null);
  assert.equal(cheersLabel(['Paul']), 'Paul vous encourage 👏');
  assert.equal(cheersLabel(['Paul', 'Marie']), 'Paul et Marie vous encouragent 👏');
  assert.equal(
    cheersLabel(['Paul', 'Marie', 'Léa', 'Tom']),
    'Paul, Marie et 2 autres vous encouragent 👏'
  );
  assert.match(inviteMessage('jb', null), /mon pseudo : jb$/);
  assert.match(inviteMessage('jb', 'step://ami?pseudo=jb'), /\nstep:\/\/ami\?pseudo=jb$/);
});
