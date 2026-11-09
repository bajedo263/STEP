import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createUserResource } from './user-resource.ts';

test('une valeur fraîche n’est pas relue, une valeur vieillie si', async () => {
  let calls = 0;
  let clock = 0;
  const resource = createUserResource(async () => ({ n: ++calls }), 1000, () => clock);
  assert.equal(resource.get('u1'), null);
  assert.equal(await resource.refresh('u1'), true);
  assert.deepEqual(resource.get('u1'), { n: 1 });
  await resource.refresh('u1');
  assert.equal(calls, 1);
  clock = 1500;
  await resource.refresh('u1');
  assert.deepEqual(resource.get('u1'), { n: 2 });
});

test('deux écrans en même temps ne font qu’une lecture', async () => {
  let calls = 0;
  const resource = createUserResource(async () => ({ n: ++calls }), 1000);
  await Promise.all([resource.refresh('u1'), resource.refresh('u1'), resource.refresh('u1')]);
  assert.equal(calls, 1);
});

test('un échec garde la dernière valeur et se réessaie', async () => {
  let fail = false;
  let clock = 0;
  const resource = createUserResource(
    async () => {
      if (fail) throw new Error('réseau');
      return { ok: true };
    },
    1000,
    () => clock
  );
  await resource.refresh('u1');
  fail = true;
  clock = 2000;
  assert.equal(await resource.refresh('u1'), false);
  assert.deepEqual(resource.get('u1'), { ok: true });
  fail = false;
  assert.equal(await resource.refresh('u1'), true);
});

test('un autre compte ne voit jamais la valeur du précédent', async () => {
  const resource = createUserResource(async (userId) => ({ userId }), 1000);
  await resource.refresh('u1');
  assert.equal(resource.get('u2'), null);
  const pending = resource.refresh('u2');
  assert.equal(resource.get('u1'), null);
  await pending;
  assert.deepEqual(resource.get('u2'), { userId: 'u2' });
});

test('invalidate relit pour les écrans abonnés et écarte une lecture en cours', async () => {
  let stored = 1;
  const resource = createUserResource(async () => {
    const read = stored;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { v: read };
  }, 60_000);
  let notified = 0;
  resource.subscribe(() => notified++);
  const first = resource.refresh('u1');
  // Écriture pendant la lecture : le résultat lu avant ne doit pas rester affiché.
  stored = 2;
  resource.invalidate();
  assert.equal(await first, true);
  assert.deepEqual(resource.get('u1'), { v: 2 });
  assert.equal(notified, 1);
});

test('une valeur identique garde le même objet', async () => {
  let clock = 0;
  const resource = createUserResource(async () => ({ a: 1 }), 10, () => clock);
  await resource.refresh('u1');
  const before = resource.get('u1');
  clock = 100;
  await resource.refresh('u1');
  assert.equal(resource.get('u1'), before);
});
