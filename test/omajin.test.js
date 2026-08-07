import assert from 'node:assert/strict';
import test from 'node:test';
import { signTuyaRequest, TUYA_ENDPOINTS, TuyaCloudClient } from '../server/omajin/client.js';
import { normalizeOmajinStatus, parseOmajinDevices } from '../server/omajin/model.js';

/** @param {unknown} payload @param {number} [status] */
function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('la signature Tuya inclut méthode, contenu, URL, jeton et horodatage', () => {
  const signature = signTuyaRequest({
    clientId: 'client-test',
    secret: 'secret-test',
    accessToken: 'token-test',
    method: 'POST',
    path: '/v1.0/iot-03/devices/abc/commands',
    body: '{"commands":[]}',
    t: '1700000000000',
  });
  assert.equal(signature, 'B4DB32FB1B793C28CABD7D7F696F8116F7596924F5D9614536C442ABBBF572BA');
  assert.equal(TUYA_ENDPOINTS.eu, 'https://openapi.tuyaeu.com');
});

test('le client Tuya réutilise le jeton et signe les lectures et commandes', async () => {
  /** @type {Array<{url:string, options:RequestInit & {headers:Record<string,string>}}>} */
  const calls = [];
  /** @type {typeof fetch} */
  const fetchImpl = async (url, options) => {
    const urlString = String(url);
    const typedOptions = /** @type {RequestInit & {headers:Record<string,string>}} */ (options);
    calls.push({ url: urlString, options: typedOptions });
    if (urlString.endsWith('/v1.0/token?grant_type=1')) {
      return jsonResponse({ success: true, result: { access_token: 'token', expire_time: 7200 } });
    }
    if (urlString.endsWith('/status')) {
      return jsonResponse({ success: true, result: [{ code: 'switch_1', value: true }] });
    }
    return jsonResponse({ success: true, result: true });
  };
  const client = new TuyaCloudClient({
    accessId: 'client',
    accessSecret: 'secret',
    fetchImpl,
    now: () => 1_700_000_000_000,
  });

  assert.deepEqual(await client.getStatus('device/id'), [{ code: 'switch_1', value: true }]);
  assert.equal(await client.sendCommands('device/id', [{ code: 'switch_1', value: false }]), true);
  assert.equal(calls.length, 3);
  const statusCall = calls[1];
  const commandCall = calls[2];
  assert.ok(statusCall);
  assert.ok(commandCall);
  assert.match(statusCall.url, /device%2Fid\/status$/);
  assert.equal(statusCall.options.headers.access_token, 'token');
  assert.equal(commandCall.options.method, 'POST');
  assert.equal(commandCall.options.body, '{"commands":[{"code":"switch_1","value":false}]}');
  assert.ok(
    calls.every(
      (call) =>
        typeof call.options.headers.sign === 'string' &&
        /^[A-F0-9]{64}$/.test(call.options.headers.sign),
    ),
  );
});

test('le client Tuya renouvelle un jeton refusé une seule fois', async () => {
  let tokenRequests = 0;
  let statusRequests = 0;
  const client = new TuyaCloudClient({
    accessId: 'client',
    accessSecret: 'secret',
    now: () => 1_700_000_000_000,
    fetchImpl: async (url) => {
      if (String(url).includes('/token?')) {
        tokenRequests += 1;
        return jsonResponse({
          success: true,
          result: { access_token: `token-${tokenRequests}`, expire_time: 7200 },
        });
      }
      statusRequests += 1;
      if (statusRequests === 1) return jsonResponse({ success: false, code: 1010, msg: 'token' });
      return jsonResponse({ success: true, result: [] });
    },
  });

  assert.deepEqual(await client.getStatus('device123'), []);
  assert.equal(tokenRequests, 2);
  assert.equal(statusRequests, 2);
});

test('le client Tuya transforme les erreurs réseau et protocolaires en messages français', async () => {
  assert.throws(
    () => new TuyaCloudClient({ accessId: 'id', accessSecret: 'secret', region: 'ailleurs' }),
    /centre de données Tuya inconnu/,
  );

  const offline = new TuyaCloudClient({
    accessId: 'id',
    accessSecret: 'secret',
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  await assert.rejects(offline.getAccessToken(), /cloud Tuya injoignable : offline/);

  const refused = new TuyaCloudClient({
    accessId: 'id',
    accessSecret: 'secret',
    fetchImpl: async () => jsonResponse({ success: false, code: 1106, msg: 'permission denied' }),
  });
  await assert.rejects(refused.getAccessToken(), /Tuya a refusé la requête \(1106\)/);

  const unreadable = new TuyaCloudClient({
    accessId: 'id',
    accessSecret: 'secret',
    fetchImpl: async () => new Response('pas du json', { status: 502 }),
  });
  await assert.rejects(unreadable.getAccessToken(), /réponse Tuya illisible/);
});

test('les mesures Omajin respectent les échelles déclarées par la prise', () => {
  const specification = {
    status: [
      { code: 'cur_power', values: '{"scale":1}' },
      { code: 'cur_voltage', values: '{"scale":1}' },
      { code: 'cur_current', values: '{"scale":0}' },
      { code: 'add_ele', values: '{"scale":3}' },
    ],
  };
  assert.deepEqual(
    normalizeOmajinStatus(
      [
        { code: 'switch_1', value: true },
        { code: 'cur_power', value: 456 },
        { code: 'cur_voltage', value: 2312 },
        { code: 'cur_current', value: 198 },
        { code: 'add_ele', value: 1234 },
      ],
      specification,
    ),
    {
      switchCode: 'switch_1',
      switchState: 'on',
      watts: 45.6,
      volts: 231.2,
      amps: 0.198,
      energyKwh: 1.234,
    },
  );
});

test('les mesures Omajin tolèrent les fonctions absentes et spécifications invalides', () => {
  assert.deepEqual(normalizeOmajinStatus([], {}), {
    switchCode: undefined,
    switchState: null,
    watts: null,
    volts: null,
    amps: null,
    energyKwh: null,
  });
  const result = normalizeOmajinStatus(
    [
      { code: 'switch', value: false },
      { code: 'cur_power', value: '15' },
      { code: 'cur_current', value: 'bad' },
    ],
    { status: [{ code: 'cur_power', values: 'invalide' }] },
  );
  assert.equal(result.switchState, 'off');
  assert.equal(result.watts, 1.5);
  assert.equal(result.amps, null);
});

test('la liste Omajin accepte les noms, séparateurs et doublons mais refuse un numéro de série', () => {
  assert.deepEqual(parseOmajinDevices('device123=Salon\ndevice456;device123=Doublon'), [
    { id: 'device123', label: 'Salon' },
    { id: 'device456', label: '' },
  ]);
  assert.deepEqual(parseOmajinDevices(''), []);
  assert.throws(() => parseOmajinDevices('123456'), /identifiant d'appareil Tuya invalide/);
});
