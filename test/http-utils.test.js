import assert from 'node:assert/strict';
import test from 'node:test';
import { isIsoDate, rowsToCsv } from '../server/http-utils.js';
import { editableSettings, toPublicSettings } from '../server/public-settings.js';
import { hashAccessToken, matchesAccessToken } from '../server/token-utils.js';

test('isIsoDate accepte une date civile réelle au format ISO', () => {
  assert.equal(isIsoDate('2026-08-06'), true);
  assert.equal(isIsoDate('2026-02-29'), false);
  assert.equal(isIsoDate('06/08/2026'), false);
  assert.equal(isIsoDate(null), false);
});

test('rowsToCsv échappe les séparateurs, guillemets et formules', () => {
  const csv = rowsToCsv([{ appareil: 'Cuisine; prise', valeur: '=1+1', note: 'dit "bonjour"' }]);
  assert.equal(csv, '\uFEFFappareil;valeur;note\n"Cuisine; prise";\'=1+1;"dit ""bonjour"""\n');
  assert.equal(rowsToCsv([]), '\uFEFF');
});

test('toPublicSettings ne renvoie jamais le jeton Linky', () => {
  assert.deepEqual(
    toPublicSettings({
      conso_token: 'secret',
      prm: '1234',
      ewelink_password: 'secret-cloud',
      server_token_hash: 'hash',
    }),
    {
      conso_token: '',
      conso_token_configured: true,
      prm: '1234',
      ewelink_password: '',
      ewelink_password_configured: true,
      ewelink_email: '',
      ewelink_email_configured: false,
    },
  );
});

test('editableSettings filtre les clés et préserve un jeton masqué', () => {
  assert.deepEqual(editableSettings({ price_kwh: 0.2, admin: true, conso_token: '' }), {
    price_kwh: '0.2',
  });
  assert.deepEqual(editableSettings({ clear_conso_token: true }), { conso_token: '' });
  assert.deepEqual(
    editableSettings({ ewelink_password: '', supplier_name: 'Autre', server_token_hash: 'non' }),
    { supplier_name: 'Autre' },
  );
  assert.deepEqual(
    editableSettings({
      clear_ewelink_email: true,
      clear_ewelink_password: true,
      ewelink_enabled: true,
      tariff_type: 'hphc',
      ignored_object: {},
    }),
    {
      ewelink_email: '',
      ewelink_password: '',
      ewelink_enabled: 'true',
      tariff_type: 'hphc',
    },
  );
  assert.deepEqual(editableSettings([]), {});
  assert.deepEqual(editableSettings(null), {});
});

test('toPublicSettings masque aussi les identifiants eWeLink absents ou présents', () => {
  assert.deepEqual(
    toPublicSettings({
      conso_token: '',
      ewelink_email: 'test@example.invalid',
      ewelink_password: '',
    }),
    {
      conso_token: '',
      conso_token_configured: false,
      ewelink_email: '',
      ewelink_email_configured: true,
      ewelink_password: '',
      ewelink_password_configured: false,
    },
  );
});

test('les jetons serveur sont comparés par empreinte', () => {
  const hash = hashAccessToken('se_test').toString('hex');
  assert.equal(matchesAccessToken('se_test', hash), true);
  assert.equal(matchesAccessToken('se_autre', hash), false);
  assert.equal(matchesAccessToken('', hash), false);
  assert.equal(matchesAccessToken('se_test', 'invalide'), false);
});
