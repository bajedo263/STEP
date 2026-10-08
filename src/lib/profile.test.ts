/// <reference types="node" />

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { profileToForm, validateProfileForm, type ProfileForm } from './profile.ts';

const valid: ProfileForm = {
  username: '  marcheur ',
  heightCm: '175',
  weightKg: '70,5',
  sex: 'male',
  dailyGoal: '10 000',
};

test('un formulaire valide donne la mise à jour attendue', () => {
  const result = validateProfileForm(valid);
  assert.deepEqual(result, {
    ok: true,
    value: { username: 'marcheur', height_cm: 175, weight_kg: 70.5, sex: 'male', daily_goal: 10000 },
  });
});

test('taille, poids et pseudo vides sont acceptés', () => {
  const result = validateProfileForm({ ...valid, username: '', heightCm: '', weightKg: '' });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.username, null);
    assert.equal(result.value.height_cm, null);
    assert.equal(result.value.weight_kg, null);
  }
});

test('les valeurs hors bornes sont refusées champ par champ', () => {
  const result = validateProfileForm({
    username: 'ab',
    heightCm: '1,75',
    weightKg: 'beaucoup',
    sex: 'unspecified',
    dailyGoal: '500',
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(Object.keys(result.errors).sort(), ['dailyGoal', 'heightCm', 'username', 'weightKg']);
  }
});

test('un profil absent donne l’objectif par défaut', () => {
  assert.equal(profileToForm(null).dailyGoal, '10000');
});

test('le poids est affiché avec une virgule', () => {
  const form = profileToForm({
    id: 'u1',
    username: null,
    height_cm: 180,
    weight_kg: 72.5,
    sex: 'female',
    daily_goal: 8000,
  });
  assert.equal(form.weightKg, '72,5');
});
