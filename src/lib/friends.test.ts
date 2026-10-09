/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dailyRanking, friendRequestMessage, type FriendRow } from './friends.ts';

const friends: FriendRow[] = [
  { friend_id: 'b', username: 'bob', status: 'friend', steps_today: 12000, cells: 40 },
  { friend_id: 'c', username: 'carol', status: 'friend', steps_today: 5000, cells: 0 },
  { friend_id: 'd', username: 'dan', status: 'incoming', steps_today: null, cells: null },
  { friend_id: 'e', username: 'eve', status: 'outgoing', steps_today: null, cells: null },
];

test('dailyRanking classe moi et mes amis confirmés', () => {
  const ranking = dailyRanking(friends, { id: 'a', name: 'Moi', steps: 8000, cells: 3 });
  assert.deepEqual(
    ranking.map((entry) => [entry.name, entry.rank, entry.isMe]),
    [
      ['bob', 1, false],
      ['Moi', 2, true],
      ['carol', 3, false],
    ]
  );
});

test('dailyRanking donne le même rang aux ex æquo, moi en premier', () => {
  const ranking = dailyRanking(friends, { id: 'a', name: 'Moi', steps: 12000, cells: null });
  assert.deepEqual(
    ranking.map((entry) => [entry.name, entry.rank]),
    [
      ['Moi', 1],
      ['bob', 1],
      ['carol', 3],
    ]
  );
});

test('friendRequestMessage', () => {
  assert.match(friendRequestMessage('sent', 'bob'), /Demande envoyée à bob/);
  assert.match(friendRequestMessage('not_found', 'zz'), /« zz »/);
});
