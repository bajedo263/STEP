/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shortStory, wikipediaTitleFromUrl } from './poi-story.ts';

test('wikipediaTitleFromUrl lit le titre de l’article', () => {
  assert.equal(
    wikipediaTitleFromUrl('https://fr.wikipedia.org/wiki/Mus%C3%A9e_Rodin'),
    'Musée_Rodin'
  );
  assert.equal(wikipediaTitleFromUrl('https://fr.m.wikipedia.org/wiki/Champ-de-Mars#Histoire'), 'Champ-de-Mars');
  assert.equal(wikipediaTitleFromUrl('https://example.com/wiki/X'), null);
  assert.equal(wikipediaTitleFromUrl(null), null);
});

test('shortStory garde les premières phrases', () => {
  const extract =
    'Le mur pour la Paix est un monument[1] érigé en 2000 sur le Champ-de-Mars. Il fut conçu par Clara Halter. ' +
    'Il porte le mot « paix » en 32 langues. Une quatrième phrase qui ne tient plus dans la limite fixée.';
  assert.equal(
    shortStory(extract, 140),
    'Le mur pour la Paix est un monument érigé en 2000 sur le Champ-de-Mars. Il fut conçu par Clara Halter.'
  );
  assert.equal(shortStory('Bâti vers 50 av. J.-C. par les Romains. Fin.', 42), 'Bâti vers 50 av. J.-C. par les Romains.');
  assert.equal(shortStory('Paris (prononcé [pa.ʁi]) est une ville.'), 'Paris est une ville.');
  assert.equal(shortStory('   '), null);
  assert.ok(shortStory('x'.repeat(600))!.length <= 420);
});
