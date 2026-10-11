/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { poiImage, shortStory, wikipediaTitleFromUrl } from './poi-story.ts';

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

test('poiImage : vignette et version en grand', () => {
  const thumb =
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Tour_Eiffel.jpg/320px-Tour_Eiffel.jpg';
  assert.deepEqual(
    poiImage({
      thumbnail: { source: thumb, width: 320, height: 480 },
      originalimage: {
        source: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Tour_Eiffel.jpg',
        width: 4000,
        height: 6000,
      },
    }),
    {
      thumbnail: thumb,
      large:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Tour_Eiffel.jpg/1280px-Tour_Eiffel.jpg',
      aspectRatio: 320 / 480,
    }
  );
  // Original assez petit : on le garde tel quel.
  assert.equal(
    poiImage({
      thumbnail: { source: thumb, width: 320, height: 240 },
      originalimage: { source: 'https://example.org/petit.jpg', width: 800, height: 600 },
    })?.large,
    'https://example.org/petit.jpg'
  );
  assert.equal(poiImage({}), null);
  assert.equal(poiImage(null), null);
});
