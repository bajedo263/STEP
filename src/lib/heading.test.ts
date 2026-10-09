/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { angleDelta, bestHeading } from './heading.ts';

test('angleDelta passe par le nord', () => {
  assert.equal(angleDelta(350, 10), 20);
  assert.equal(angleDelta(10, 350), 20);
  assert.equal(angleDelta(90, 270), 180);
  assert.equal(angleDelta(45, 45), 0);
});

test('bestHeading préfère le nord géographique', () => {
  assert.equal(bestHeading({ trueHeading: 12, magHeading: 10 }), 12);
  assert.equal(bestHeading({ trueHeading: -1, magHeading: 10 }), 10);
  assert.equal(bestHeading({ trueHeading: -1, magHeading: -1 }), null);
  assert.equal(bestHeading({ trueHeading: 360, magHeading: 0 }), 0);
});
