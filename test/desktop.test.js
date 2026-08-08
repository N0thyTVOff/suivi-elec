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
import { readOpenAtLogin, updateOpenAtLogin } from '../desktop/login-item.js';
import {
  cancelApplicationReset,
  performPendingReset,
  requestApplicationReset,
} from '../desktop/reset.js';
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
  assert.equal(path.basename(installed.connectionPath), 'desktop-connection.bin');
  assert.equal(path.basename(installed.resetRequestPath), '.wattelier-reset-request');
  assert.equal(
    path.dirname(installed.resetRequestPath),
    path.resolve(installed.dataDirectory, '..'),
  );

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
  assert.equal(
    path.dirname(portable.resetRequestPath),
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

test('le démarrage Windows modifie aussi l’approbation système et vérifie son état effectif', () => {
  /** @type {Array<{ method: string, options: object }>} */
  const calls = [];
  let settings = { openAtLogin: false, executableWillLaunchAtLogin: false };
  const electronApp = {
    /** @param {{ path: string, args: string[] }} options */
    getLoginItemSettings(options) {
      calls.push({ method: 'get', options });
      return settings;
    },
    /** @param {object} options */
    setLoginItemSettings(options) {
      calls.push({ method: 'set', options });
      const loginOptions = /** @type {{ openAtLogin: boolean, enabled: boolean }} */ (options);
      settings = {
        openAtLogin: loginOptions.openAtLogin,
        executableWillLaunchAtLogin: loginOptions.enabled,
      };
    },
  };
  const executablePath = 'C:\\Program Files\\Wattelier\\Wattelier.exe';

  assert.equal(updateOpenAtLogin(electronApp, executablePath, true), true);
  assert.deepEqual(calls[0], {
    method: 'set',
    options: {
      name: 'Wattelier',
      path: executablePath,
      args: ['--hidden'],
      openAtLogin: true,
      enabled: true,
    },
  });
  assert.deepEqual(calls[1], {
    method: 'get',
    options: { path: executablePath, args: ['--hidden'] },
  });

  assert.equal(updateOpenAtLogin(electronApp, executablePath, false), false);
  assert.deepEqual(calls[2], {
    method: 'set',
    options: {
      name: 'Wattelier',
      path: executablePath,
      args: ['--hidden'],
      openAtLogin: false,
      enabled: false,
    },
  });
});

test('le démarrage Windows signale un refus au lieu de laisser le bouton sans réponse', () => {
  const refusedApp = {
    setLoginItemSettings() {},
    getLoginItemSettings() {
      return { openAtLogin: true, executableWillLaunchAtLogin: false };
    },
  };
  assert.equal(readOpenAtLogin(refusedApp, 'Wattelier.exe'), false);
  assert.throws(
    () => updateOpenAtLogin(refusedApp, 'Wattelier.exe', true),
    /Windows n’a pas activé.*Paramètres.*Démarrage/,
  );

  const cannotDisableApp = {
    setLoginItemSettings() {},
    getLoginItemSettings() {
      return { openAtLogin: true, executableWillLaunchAtLogin: true };
    },
  };
  assert.throws(
    () => updateOpenAtLogin(cannotDisableApp, 'Wattelier.exe', false),
    /Windows n’a pas désactivé.*Paramètres.*Démarrage/,
  );
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
    applicationMode: 'server',
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
      applicationMode: 'server',
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
    'getTailscaleStatus',
    'enableTailscale',
    'resetApplication',
  ]);
  assert.match(preload, /wattelier:get-runtime-info/);
  assert.match(preload, /wattelier:set-open-at-login/);
  assert.match(preload, /wattelier:set-automatic-updates/);
  assert.match(preload, /wattelier:check-for-updates/);
  assert.match(preload, /wattelier:tailscale-status/);
  assert.match(preload, /wattelier:tailscale-enable/);
  assert.match(preload, /wattelier:reset-application/);
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

test('le bureau sépare le serveur local du client HTTPS distant', () => {
  const main = fs.readFileSync(new URL('../desktop/main.js', import.meta.url), 'utf8');
  const connectionPage = fs.readFileSync(
    new URL('../desktop/connect.html', import.meta.url),
    'utf8',
  );

  assert.match(main, /Créer mon serveur/);
  assert.match(main, /Accéder à mon serveur distant/);
  assert.match(main, /applicationMode === 'server'/);
  assert.match(main, /remote \? \{\} : \{ preload:/);
  assert.match(main, /protocol === 'https:'/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /Changer de serveur distant/);
  assert.match(main, /clearDesktopConnection/);
  assert.match(main, /approvalUrl\.origin !== 'https:\/\/login\.tailscale\.com'/);
  assert.match(main, /shell\.openExternal\(approvalUrl\.href\)/);
  assert.match(connectionPage, /jeton de connexion/i);
  assert.match(connectionPage, /Content-Security-Policy/);
});

test('la réinitialisation Electron exige une confirmation et redémarre hors mode caché', () => {
  const main = fs.readFileSync(new URL('../desktop/main.js', import.meta.url), 'utf8');
  assert.match(main, /wattelier:reset-application/);
  assert.match(main, /label: 'Réinitialiser Wattelier…'/);
  assert.match(main, /Réinitialiser et redémarrer/);
  assert.match(main, /defaultId: 1/);
  assert.match(main, /requestApplicationReset\(runtimePaths\.resetRequestPath\)/);
  assert.match(main, /await stopServer\?\.\(\)/);
  assert.match(main, /argument !== '--hidden'/);
  assert.match(main, /performPendingReset/);
});

test('la réinitialisation déplace les données dans une sauvegarde récupérable', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wattelier-reset-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const dataDirectory = path.join(directory, 'app-data');
  const markerPath = path.join(directory, '.wattelier-reset-request');
  fs.mkdirSync(path.join(dataDirectory, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(dataDirectory, 'elec.db'), 'base-test');
  fs.writeFileSync(path.join(dataDirectory, 'logs', 'main.log'), 'journal-test');

  assert.deepEqual(performPendingReset({ markerPath, dataDirectory }), {
    requested: false,
    backupPath: null,
  });
  requestApplicationReset(markerPath);
  const reset = performPendingReset({
    markerPath,
    dataDirectory,
    now: new Date('2026-08-08T12:34:56.000Z'),
  });

  assert.equal(reset.requested, true);
  assert.equal(reset.backupPath, `${dataDirectory}-backup-20260808T123456Z`);
  assert.equal(fs.existsSync(dataDirectory), false);
  assert.equal(fs.existsSync(markerPath), false);
  assert.equal(fs.readFileSync(path.join(reset.backupPath, 'elec.db'), 'utf8'), 'base-test');
  assert.equal(
    fs.readFileSync(path.join(reset.backupPath, 'logs', 'main.log'), 'utf8'),
    'journal-test',
  );
});

test('la réinitialisation gère une absence de données et les demandes annulées', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wattelier-reset-empty-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const markerPath = path.join(directory, '.wattelier-reset-request');
  const dataDirectory = path.join(directory, 'Wattelier-data');

  requestApplicationReset(markerPath);
  cancelApplicationReset(markerPath);
  cancelApplicationReset(markerPath);
  assert.equal(fs.existsSync(markerPath), false);
  requestApplicationReset(markerPath);
  assert.deepEqual(performPendingReset({ markerPath, dataDirectory }), {
    requested: true,
    backupPath: null,
  });
});

test('les préférences de mise à jour sont locales, validées et écrites atomiquement', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wattelier-preferences-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'nested', 'desktop-preferences.json');

  assert.deepEqual(readDesktopPreferences(filename), { automaticUpdates: false, mode: '' });
  assert.deepEqual(
    writeDesktopPreferences(filename, {
      automaticUpdates: true,
      mode: 'client',
      secret: 'non',
    }),
    { automaticUpdates: true, mode: 'client' },
  );
  assert.deepEqual(readDesktopPreferences(filename), {
    automaticUpdates: true,
    mode: 'client',
  });
  assert.equal(fs.existsSync(`${filename}.tmp`), false);

  fs.writeFileSync(filename, '{invalide');
  assert.deepEqual(readDesktopPreferences(filename), { automaticUpdates: false, mode: '' });
  fs.writeFileSync(filename, JSON.stringify({ automaticUpdates: 'oui' }));
  assert.deepEqual(readDesktopPreferences(filename), { automaticUpdates: false, mode: '' });
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
