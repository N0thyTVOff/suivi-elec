import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
  desktopRuntimeInfo,
  isTrustedDesktopUrl,
  requestSingleInstance,
} from '../desktop/policy.js';
import { loginItemOptions, resolveRuntimePaths } from '../desktop/runtime-paths.js';

const execFileAsync = promisify(execFile);
const childEnvironment = { ...process.env };
delete childEnvironment.NODE_V8_COVERAGE;
delete childEnvironment.NODE_TEST_CONTEXT;

test('résout les chemins installé et portable sans mélanger les données', () => {
  const installed = resolveRuntimePaths({
    portableDirectory: '',
    userDataDirectory: path.join('C:', 'Users', 'Test', 'AppData', 'Roaming', 'Wattelier'),
  });
  assert.equal(installed.portable, false);
  assert.equal(installed.dataDirectory, path.resolve(installed.dataDirectory));
  assert.equal(path.basename(installed.dataDirectory), 'app-data');
  assert.equal(path.basename(installed.databasePath), 'elec.db');

  const portable = resolveRuntimePaths({
    portableDirectory: path.join('D:', 'Apps', 'Wattelier'),
    userDataDirectory: path.join('C:', 'unused'),
  });
  assert.equal(portable.portable, true);
  assert.equal(path.basename(portable.dataDirectory), 'Wattelier-data');
  assert.equal(
    path.dirname(portable.dataDirectory),
    path.resolve(path.join('D:', 'Apps', 'Wattelier')),
  );
});

test('le démarrage Windows utilise le lancement caché', () => {
  assert.deepEqual(loginItemOptions('C:\\Program Files\\Wattelier\\Wattelier.exe'), {
    name: 'Wattelier',
    path: 'C:\\Program Files\\Wattelier\\Wattelier.exe',
    args: ['--hidden'],
  });
});

test('la politique Electron limite l’instance, l’origine IPC et les informations exposées', () => {
  let lockRequests = 0;
  const hasLock = requestSingleInstance({
    requestSingleInstanceLock() {
      lockRequests += 1;
      return false;
    },
  });
  assert.equal(hasLock, false);
  assert.equal(lockRequests, 1);

  assert.equal(isTrustedDesktopUrl('http://127.0.0.1:3017/settings', 3017), true);
  assert.equal(isTrustedDesktopUrl('http://localhost:3017/', 3017), true);
  assert.equal(isTrustedDesktopUrl('https://localhost:3017/', 3017), false);
  assert.equal(isTrustedDesktopUrl('http://example.com:3017/', 3017), false);
  assert.equal(isTrustedDesktopUrl('adresse invalide', 3017), false);
  assert.equal(isTrustedDesktopUrl(undefined, 3017), false);

  assert.deepEqual(desktopRuntimeInfo({ version: '2.0.0', portable: false, openAtLogin: true }), {
    version: '2.0.0',
    mode: 'installed',
    portable: false,
    openAtLogin: true,
  });
  assert.deepEqual(desktopRuntimeInfo({ version: '2.0.0', portable: true, openAtLogin: true }), {
    version: '2.0.0',
    mode: 'portable',
    portable: true,
    openAtLogin: false,
  });
});

test('le preload n’expose que les deux méthodes autorisées', () => {
  const preload = fs.readFileSync(new URL('../desktop/preload.cjs', import.meta.url), 'utf8');
  const exposedMethods = [...preload.matchAll(/^\s{2}([a-zA-Z]+):/gm)].map((match) => match[1]);
  assert.deepEqual(exposedMethods, ['getRuntimeInfo', 'setOpenAtLogin']);
  assert.match(preload, /wattelier:get-runtime-info/);
  assert.match(preload, /wattelier:set-open-at-login/);
  assert.doesNotMatch(preload, /require\(['"](?:node:)?(?:fs|child_process)/);
});

test('le smoke test Windows reste analysable et attend la libération des exécutables', () => {
  const smokeScript = fs.readFileSync(
    new URL('../scripts/smoke-windows-package.ps1', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    smokeScript,
    /[‘’]/,
    'PowerShell interprète les apostrophes typographiques comme des délimiteurs de chaîne',
  );
  assert.match(smokeScript, /WaitForExit\(5000\)/);
  assert.match(smokeScript, /for \(\$attempt = 1; \$attempt -le 10; \$attempt\+\+\)/);
});

test('importe une ancienne base elec.db sans modifier la source', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wattelier-import-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'elec.db');
  const destination = path.join(directory, 'new', 'elec.db');
  const sourceDb = new Database(source);
  sourceDb.exec(
    "CREATE TABLE marker (value TEXT NOT NULL); INSERT INTO marker VALUES ('préservé');",
  );
  sourceDb.close();
  const before = fs.statSync(source).size;

  const moduleUrl = new URL('../desktop/legacy-import.js', import.meta.url).href;
  const code = `import { importLegacyDatabase } from ${JSON.stringify(moduleUrl)}; await importLegacyDatabase(process.argv[1], process.argv[2]);`;
  await execFileAsync(
    process.execPath,
    ['--input-type=module', '--eval', code, source, destination],
    { env: childEnvironment },
  );

  assert.equal(fs.statSync(source).size, before);
  const imported = new Database(destination, { readonly: true });
  assert.equal(imported.prepare('SELECT value FROM marker').pluck().get(), 'préservé');
  imported.close();
});

test('le serveur peut être arrêté puis redémarré proprement', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wattelier-server-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const script = fileURLToPath(new URL('../scripts/check-server-lifecycle.js', import.meta.url));
  const { stdout } = await execFileAsync(process.execPath, [script, directory], {
    env: childEnvironment,
    timeout: 20_000,
  });
  assert.match(stdout, /"first":200/);
  assert.match(stdout, /"second":200/);
});
