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
import { readDesktopPreferences, writeDesktopPreferences } from '../desktop/preferences.js';
import {
  loginItemOptions,
  resolveDesktopAssetPath,
  resolveRuntimePaths,
} from '../desktop/runtime-paths.js';
import {
  githubReleaseUrl,
  isNewerWattelierVersion,
  parseWattelierVersion,
} from '../desktop/update-policy.js';

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
  assert.equal(path.basename(installed.preferencesPath), 'desktop-preferences.json');

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

test('les icônes Electron utilisent les ressources externes dans le paquet', () => {
  assert.equal(
    resolveDesktopAssetPath({
      packaged: true,
      resourcesDirectory: path.join('C:', 'Program Files', 'Wattelier', 'resources'),
      applicationDirectory: path.join('C:', 'sources', 'wattelier'),
      filename: 'tray.ico',
    }),
    path.resolve(path.join('C:', 'Program Files', 'Wattelier', 'resources', 'tray.ico')),
  );
  assert.equal(
    resolveDesktopAssetPath({
      packaged: false,
      resourcesDirectory: path.join('C:', 'unused'),
      applicationDirectory: path.join('C:', 'sources', 'wattelier'),
      filename: 'icon.png',
    }),
    path.resolve(path.join('C:', 'sources', 'wattelier', 'build', 'icon.png')),
  );
  assert.throws(
    () =>
      resolveDesktopAssetPath({
        packaged: true,
        resourcesDirectory: '.',
        applicationDirectory: '.',
        filename: '../secret.txt',
      }),
    /non autorisée/,
  );
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
    automaticUpdates: false,
  });
  assert.deepEqual(
    desktopRuntimeInfo({
      version: '2.0.0',
      portable: true,
      openAtLogin: true,
      automaticUpdates: true,
    }),
    {
      version: '2.0.0',
      mode: 'portable',
      portable: true,
      openAtLogin: false,
      automaticUpdates: false,
    },
  );
});

test('le preload n’expose que les méthodes de bureau autorisées', () => {
  const preload = fs.readFileSync(new URL('../desktop/preload.cjs', import.meta.url), 'utf8');
  const exposedMethods = [...preload.matchAll(/^\s{2}([a-zA-Z]+):/gm)].map((match) => match[1]);
  assert.deepEqual(exposedMethods, [
    'getRuntimeInfo',
    'setOpenAtLogin',
    'setAutomaticUpdates',
    'checkForUpdates',
  ]);
  assert.match(preload, /wattelier:get-runtime-info/);
  assert.match(preload, /wattelier:set-open-at-login/);
  assert.match(preload, /wattelier:set-automatic-updates/);
  assert.match(preload, /wattelier:check-for-updates/);
  assert.doesNotMatch(preload, /require\(['"](?:node:)?(?:fs|child_process)/);
});

test('le bureau relie la détection de mise à jour à une source GitHub sûre', () => {
  const main = fs.readFileSync(new URL('../desktop/main.js', import.meta.url), 'utf8');
  const updater = fs.readFileSync(new URL('../desktop/updater.js', import.meta.url), 'utf8');
  const builder = fs.readFileSync(new URL('../electron-builder.yml', import.meta.url), 'utf8');
  const releaseWorkflow = fs.readFileSync(
    new URL('../.github/workflows/release-windows.yml', import.meta.url),
    'utf8',
  );

  assert.match(main, /wattelier:set-automatic-updates/);
  assert.match(main, /wattelier:check-for-updates/);
  assert.match(main, /setTimeout\(\(\) => updater\.checkForUpdates\(\), 10_000\)/);
  assert.match(updater, /api\.github\.com\/repos\/N0thyTVOff\/wattelier\/releases\/latest/);
  assert.match(updater, /autoUpdater\.autoDownload = false/);
  assert.match(updater, /autoUpdater\.quitAndInstall\(false, true\)/);
  assert.match(builder, /provider: github/);
  assert.match(builder, /repo: wattelier/);
  assert.match(releaseWorkflow, /release\/latest\.yml/);
  assert.match(releaseWorkflow, /\.exe\.blockmap/);
});

test('les préférences de mise à jour sont locales, validées et écrites atomiquement', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wattelier-preferences-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'nested', 'desktop-preferences.json');

  assert.deepEqual(readDesktopPreferences(filename), { automaticUpdates: false });
  assert.deepEqual(writeDesktopPreferences(filename, { automaticUpdates: true, secret: 'non' }), {
    automaticUpdates: true,
  });
  assert.deepEqual(readDesktopPreferences(filename), { automaticUpdates: true });
  assert.equal(fs.existsSync(`${filename}.tmp`), false);

  fs.writeFileSync(filename, '{invalide');
  assert.deepEqual(readDesktopPreferences(filename), { automaticUpdates: false });
  fs.writeFileSync(filename, JSON.stringify({ automaticUpdates: 'oui' }));
  assert.deepEqual(readDesktopPreferences(filename), { automaticUpdates: false });
});

test('la détection de version accepte les tags Wattelier et verrouille les liens GitHub', () => {
  assert.deepEqual(parseWattelierVersion('wattelier-v2.3.4'), [2, 3, 4]);
  assert.deepEqual(parseWattelierVersion('v3.0.0-beta.1'), [3, 0, 0]);
  assert.equal(parseWattelierVersion('version récente'), null);
  assert.equal(isNewerWattelierVersion('2.2.0', '2.1.9'), true);
  assert.equal(isNewerWattelierVersion('2.1.9', '2.2.0'), false);
  assert.equal(isNewerWattelierVersion('2.1.9', '2.1.9'), false);
  assert.equal(isNewerWattelierVersion('invalide', '2.1.9'), false);
  assert.equal(
    githubReleaseUrl('https://github.com/N0thyTVOff/wattelier/releases/tag/wattelier-v2.2.0'),
    'https://github.com/N0thyTVOff/wattelier/releases/tag/wattelier-v2.2.0',
  );
  assert.equal(githubReleaseUrl('http://github.com/N0thyTVOff/wattelier/releases/latest'), null);
  assert.equal(githubReleaseUrl('https://example.com/N0thyTVOff/wattelier/releases/latest'), null);
  assert.equal(githubReleaseUrl('adresse invalide'), null);
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
  assert.match(smokeScript, /Confirm-WattelierStaysRunning/);
  assert.match(smokeScript, /Start-Sleep -Seconds 2/);
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
