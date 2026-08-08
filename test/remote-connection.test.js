import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  accessTokenFromInput,
  connectionTokenFromInput,
  createConnectionToken,
  normalizeRemoteServerUrl,
  optionalConnectionToken,
  parseConnectionToken,
} from '../server/connection-token.js';
import {
  clearDesktopConnection,
  readDesktopConnection,
  writeDesktopConnection,
} from '../desktop/connection-store.js';
import { enableTailscaleServe, tailscaleStatus } from '../desktop/tailscale.js';

const ACCESS_TOKEN = `se_${'a'.repeat(43)}`;

test('le jeton de connexion autonome contient une origine HTTPS et le secret serveur', () => {
  const token = createConnectionToken('https://pc.maison.ts.net/', ACCESS_TOKEN);
  assert.match(token, /^wtl1_/);
  assert.deepEqual(parseConnectionToken(token), {
    serverUrl: 'https://pc.maison.ts.net',
    accessToken: ACCESS_TOKEN,
  });
  assert.equal(accessTokenFromInput(token), ACCESS_TOKEN);
  assert.equal(accessTokenFromInput(ACCESS_TOKEN), ACCESS_TOKEN);
  assert.equal(optionalConnectionToken('', ACCESS_TOKEN), null);
  assert.equal(normalizeRemoteServerUrl(' https://PC.MAISON.ts.net '), 'https://pc.maison.ts.net');
});

test('la connexion distante accepte un jeton d’accès accompagné de son adresse HTTPS', () => {
  const fromAccessToken = connectionTokenFromInput('  ' + ACCESS_TOKEN, 'https://pc.maison.ts.net');
  assert.deepEqual(parseConnectionToken(fromAccessToken), {
    serverUrl: 'https://pc.maison.ts.net',
    accessToken: ACCESS_TOKEN,
  });

  const combined = createConnectionToken('https://serveur.fiable.ts.net', ACCESS_TOKEN);
  assert.deepEqual(
    parseConnectionToken(connectionTokenFromInput(combined, 'https://adresse-ignoree.ts.net')),
    {
      serverUrl: 'https://serveur.fiable.ts.net',
      accessToken: ACCESS_TOKEN,
    },
  );
  assert.throws(() => connectionTokenFromInput(ACCESS_TOKEN), /adresse du serveur invalide/);
});

test('le jeton distant refuse HTTP, les URL ambiguës et les secrets invalides', () => {
  assert.throws(() => createConnectionToken('http://pc.maison.ts.net', ACCESS_TOKEN), /HTTPS/);
  assert.throws(
    () => createConnectionToken('https://user@pc.maison.ts.net', ACCESS_TOKEN),
    /invalide/,
  );
  assert.throws(
    () => createConnectionToken('https://pc.maison.ts.net/api', ACCESS_TOKEN),
    /racine/,
  );
  assert.throws(
    () => createConnectionToken('https://pc.maison.ts.net?q=1', ACCESS_TOKEN),
    /invalide/,
  );
  assert.throws(() => createConnectionToken('https://pc.maison.ts.net', 'secret'), /invalide/);
  assert.throws(() => parseConnectionToken('se_secret'), /invalide/);
  assert.throws(() => parseConnectionToken('wtl1_pas-du-json'), /invalide/);
});

test('la connexion distante est chiffrée localement et effaçable', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wattelier-connection-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'nested', 'desktop-connection.bin');
  const token = createConnectionToken('https://pc.maison.ts.net', ACCESS_TOKEN);
  const storage = {
    async isAsyncEncryptionAvailable() {
      return true;
    },
    /** @param {string} value */
    async encryptStringAsync(value) {
      return Buffer.from(value).reverse();
    },
    /** @param {Buffer} value */
    async decryptStringAsync(value) {
      return { result: Buffer.from(value).reverse().toString() };
    },
  };

  await writeDesktopConnection(filename, token, storage);
  assert.doesNotMatch(fs.readFileSync(filename, 'utf8'), /se_aaaa/);
  assert.deepEqual(await readDesktopConnection(filename, storage), parseConnectionToken(token));
  clearDesktopConnection(filename);
  assert.equal(fs.existsSync(filename), false);
  clearDesktopConnection(filename);
  assert.equal(await readDesktopConnection(filename, storage), null);
});

test('la connexion distante refuse un poste sans chiffrement Windows', async () => {
  const storage = {
    async isAsyncEncryptionAvailable() {
      return false;
    },
    async encryptStringAsync() {
      throw new Error('ne doit pas être appelée');
    },
    async decryptStringAsync() {
      throw new Error('ne doit pas être appelée');
    },
  };
  await assert.rejects(
    writeDesktopConnection(
      'jamais-écrit',
      createConnectionToken('https://pc.ts.net', ACCESS_TOKEN),
      storage,
    ),
    /chiffrement Windows/,
  );
});

test('le module Tailscale détecte le tailnet et active Serve sur le serveur local', async () => {
  /** @type {{ executable: string, args: string[] }[]} */
  const calls = [];
  /** @param {string} executable @param {string[]} args */
  const execute = async (executable, args) => {
    calls.push({ executable, args });
    if (args[0] === 'status') {
      return {
        stdout: JSON.stringify({
          BackendState: 'Running',
          Self: { ID: 'local_node', DNSName: 'pc.maison.ts.net.' },
        }),
      };
    }
    return { stdout: '' };
  };
  assert.deepEqual(await tailscaleStatus(execute), {
    installed: true,
    connected: true,
    dnsName: 'pc.maison.ts.net',
    serverUrl: 'https://pc.maison.ts.net',
  });
  const enabled = await enableTailscaleServe(3017, execute);
  assert.equal(enabled.serverUrl, 'https://pc.maison.ts.net');
  assert.equal(enabled.enabled, true);
  const lastCall = calls.at(-1);
  assert.ok(lastCall);
  assert.deepEqual(lastCall.args, ['serve', '--bg', 'http://127.0.0.1:3017']);
});

test('le module Tailscale signale une installation absente sans exposer la commande', async () => {
  const missing = Object.assign(new Error('absent'), { code: 'ENOENT' });
  const status = await tailscaleStatus(async () => {
    throw missing;
  });
  assert.deepEqual(status, {
    installed: false,
    connected: false,
    dnsName: '',
    serverUrl: '',
    error: "Tailscale n'est pas installé.",
  });
  await assert.rejects(
    enableTailscaleServe(3017, async () => {
      throw missing;
    }),
    /pas installé/,
  );
});

test('le module Tailscale corrige un lien Serve visant un autre appareil', async () => {
  /** @type {object[]} */
  const optionsSeen = [];
  /** @param {string} _executable @param {string[]} args @param {object} options */
  const execute = async (_executable, args, options) => {
    optionsSeen.push(options);
    if (args[0] === 'status') {
      return {
        stdout: JSON.stringify({
          BackendState: 'Running',
          Self: { ID: 'local_456', DNSName: 'pc.maison.ts.net.' },
        }),
      };
    }
    throw Object.assign(new Error('expiration'), {
      code: 'ETIMEDOUT',
      stdout:
        'Serve is not enabled on your tailnet.\nTo enable, visit:\nhttps://login.tailscale.com/f/serve?node=abc_123',
      stderr: '',
    });
  };

  const result = await enableTailscaleServe(3017, execute);
  assert.deepEqual(result, {
    installed: true,
    connected: true,
    dnsName: 'pc.maison.ts.net',
    serverUrl: 'https://pc.maison.ts.net',
    enabled: false,
    needsApproval: true,
    approvalUrl: 'https://login.tailscale.com/f/serve?node=local_456',
  });
  assert.deepEqual(optionsSeen.at(-1), {
    timeout: 5_000,
    windowsHide: true,
    maxBuffer: 1_000_000,
  });
});

test('le module Tailscale ne transforme plus une erreur Serve en erreur d’installation', async () => {
  let calls = 0;
  /** @param {string} _executable @param {string[]} args */
  const execute = async (_executable, args) => {
    calls += 1;
    if (args[0] === 'status') {
      return {
        stdout: JSON.stringify({
          BackendState: 'Running',
          Self: { DNSName: 'pc.maison.ts.net.' },
        }),
      };
    }
    throw Object.assign(new Error('refusé'), { code: 1, stderr: 'permission denied' });
  };

  await assert.rejects(enableTailscaleServe(3017, execute), /Serve n'a pas pu être activé/);
  assert.equal(calls, 2, 'une erreur réelle ne doit pas relancer les autres chemins candidats');
});

test('le preload de connexion distante ne propose que valider ou annuler', () => {
  const preload = fs.readFileSync(
    new URL('../desktop/connect-preload.cjs', import.meta.url),
    'utf8',
  );
  const exposedMethods = [...preload.matchAll(/^\s{2}([a-zA-Z]+):/gm)].map((match) => match[1]);
  assert.deepEqual(exposedMethods, ['submit', 'cancel']);
  assert.match(preload, /serverUrl/);
  assert.doesNotMatch(preload, /require\(['"](?:node:)?(?:fs|child_process)/);
});
