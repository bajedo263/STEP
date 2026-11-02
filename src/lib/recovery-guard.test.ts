import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  decodeResetRequest,
  encodeResetRequest,
  recoveryLinkAllowed,
  RESET_REQUEST_TTL_MS,
  tokenEmail,
} from './recovery-guard.ts';

const jwt = (payload: object) =>
  ['e30', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.');

const now = 1_000_000_000;
const request = decodeResetRequest(encodeResetRequest('  Marie@Example.com ', now - 60_000));

test("lit l'adresse du jeton", () => {
  assert.equal(tokenEmail(jwt({ email: 'Marie@example.com' })), 'marie@example.com');
  assert.equal(tokenEmail('pas-un-jeton'), null);
});

test('accepte le lien demandé ici, récemment, pour la même adresse', () => {
  assert.equal(recoveryLinkAllowed(request, jwt({ email: 'marie@example.com' }), now), true);
});

test("refuse un lien sans demande depuis ce téléphone (lien piégé)", () => {
  assert.equal(recoveryLinkAllowed(null, jwt({ email: 'marie@example.com' }), now), false);
  assert.equal(recoveryLinkAllowed(decodeResetRequest('{oups'), jwt({ email: 'a@b.c' }), now), false);
});

test("refuse le lien d'un autre compte", () => {
  assert.equal(recoveryLinkAllowed(request, jwt({ email: 'pirate@example.com' }), now), false);
});

test('refuse une demande trop ancienne', () => {
  const old = decodeResetRequest(encodeResetRequest('marie@example.com', now - RESET_REQUEST_TTL_MS - 1));
  assert.equal(recoveryLinkAllowed(old, jwt({ email: 'marie@example.com' }), now), false);
});
