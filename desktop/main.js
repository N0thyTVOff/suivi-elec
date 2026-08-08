import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  safeStorage,
  session,
  shell,
  Tray,
} from 'electron';
import {
  clearDesktopConnection,
  readDesktopConnection,
  writeDesktopConnection,
} from './connection-store.js';
import { importLegacyDatabase } from './legacy-import.js';
import { readOpenAtLogin, updateOpenAtLogin } from './login-item.js';
import { desktopRuntimeInfo, isTrustedDesktopUrl, requestSingleInstance } from './policy.js';
import { readDesktopPreferences, writeDesktopPreferences } from './preferences.js';
import { cancelApplicationReset, performPendingReset, requestApplicationReset } from './reset.js';
import { loginItemOptions, resolveDesktopAssetPath, resolveRuntimePaths } from './runtime-paths.js';
import { enableTailscaleServe, tailscaleStatus } from './tailscale.js';
import { createDesktopUpdater } from './updater.js';
import { connectionTokenFromInput, parseConnectionToken } from '../server/connection-token.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3017;
const LOCAL_URL = `http://127.0.0.1:${PORT}`;
const TAILSCALE_DNS_ADMIN_URL = 'https://login.tailscale.com/admin/dns';
const portableDirectory = process.env.PORTABLE_EXECUTABLE_DIR || '';
const hiddenLaunch = process.argv.includes('--hidden');
const hasInstanceLock = requestSingleInstance(app);

let mainWindow;
let tray;
let stopServer;
let quitting = false;
let serverReady = false;
let runtimePaths;
let desktopPreferences;
let updater;
let applicationMode = 'server';
let remoteConnection = null;

function desktopAsset(filename) {
  return resolveDesktopAssetPath({
    packaged: app.isPackaged,
    resourcesDirectory: process.resourcesPath,
    applicationDirectory: path.join(__dirname, '..'),
    filename,
  });
}

if (!hasInstanceLock) app.quit();

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function isTrustedSender(event) {
  return isTrustedDesktopUrl(event.senderFrame?.url, PORT);
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function currentLoginState() {
  if (runtimePaths.portable) return false;
  return readOpenAtLogin(app, process.execPath);
}

async function confirmApplicationReset() {
  const choice = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Réinitialiser Wattelier',
    message: 'Revenir à la configuration initiale ?',
    detail:
      'Wattelier va arrêter la collecte, redémarrer et déplacer la base, les réglages et les journaux dans un dossier de sauvegarde. Vous devrez refaire l’onboarding. La configuration externe Tailscale ne sera pas modifiée.',
    buttons: ['Réinitialiser et redémarrer', 'Annuler'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (choice.response !== 0) return { reset: false };

  requestApplicationReset(runtimePaths.resetRequestPath);
  try {
    await stopServer?.();
  } catch (error) {
    cancelApplicationReset(runtimePaths.resetRequestPath);
    throw error;
  }
  quitting = true;
  app.relaunch({ args: process.argv.slice(1).filter((argument) => argument !== '--hidden') });
  app.quit();
  return { reset: true };
}

function registerDesktopBridge() {
  ipcMain.handle('wattelier:get-runtime-info', (event) => {
    if (!isTrustedSender(event)) throw new Error('Origine non autorisée');
    return desktopRuntimeInfo({
      version: app.getVersion(),
      portable: runtimePaths.portable,
      openAtLogin: currentLoginState(),
      automaticUpdates: desktopPreferences.automaticUpdates,
      applicationMode,
    });
  });
  ipcMain.handle('wattelier:set-open-at-login', (event, enabled) => {
    if (!isTrustedSender(event)) throw new Error('Origine non autorisée');
    if (runtimePaths.portable) return { openAtLogin: false, portable: true };
    const openAtLogin = updateOpenAtLogin(app, process.execPath, enabled);
    return { openAtLogin, portable: false };
  });
  ipcMain.handle('wattelier:set-automatic-updates', (event, enabled) => {
    if (!isTrustedSender(event)) throw new Error('Origine non autorisée');
    if (runtimePaths.portable) return updater.getStatus();
    desktopPreferences = writeDesktopPreferences(runtimePaths.preferencesPath, {
      ...desktopPreferences,
      automaticUpdates: Boolean(enabled),
    });
    return updater.refreshAutomaticUpdates();
  });
  ipcMain.handle('wattelier:check-for-updates', (event) => {
    if (!isTrustedSender(event)) throw new Error('Origine non autorisée');
    return updater.checkForUpdates({ manual: true });
  });
  ipcMain.handle('wattelier:tailscale-status', async (event) => {
    if (!isTrustedSender(event) || applicationMode !== 'server') {
      throw new Error('Origine non autorisée');
    }
    return tailscaleStatus();
  });
  ipcMain.handle('wattelier:tailscale-enable', async (event) => {
    if (!isTrustedSender(event) || applicationMode !== 'server') {
      throw new Error('Origine non autorisée');
    }
    const result = await enableTailscaleServe(PORT);
    if (result.needsApproval) {
      await shell.openExternal(TAILSCALE_DNS_ADMIN_URL);
      const publicResult = { ...result };
      delete publicResult.approvalUrl;
      return publicResult;
    }
    return result;
  });
  ipcMain.handle('wattelier:reset-application', async (event) => {
    if (!isTrustedSender(event) || applicationMode !== 'server') {
      throw new Error('Origine non autorisée');
    }
    return confirmApplicationReset();
  });
}

async function validateRemoteConnection(connection) {
  const response = await net.fetch(`${connection.serverUrl}/api/setup/status`, {
    headers: { Authorization: `Bearer ${connection.accessToken}` },
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Le serveur a répondu ${response.status}.`);
  const status = await response.json();
  if (!status.onboardingCompleted || !status.authenticated) {
    throw new Error('Ce jeton est refusé par le serveur.');
  }
}

function requestRemoteConnection() {
  return new Promise((resolve) => {
    const connectUrl = pathToFileURL(path.join(__dirname, 'connect.html')).href;
    const connectWindow = new BrowserWindow({
      title: 'Connexion à Wattelier',
      width: 620,
      height: 690,
      minWidth: 320,
      minHeight: 620,
      backgroundColor: '#090f1f',
      icon: desktopAsset('icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'connect-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        devTools: !app.isPackaged,
      },
    });
    connectWindow.removeMenu();
    connectWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    connectWindow.webContents.on('will-navigate', (event, url) => {
      if (url !== connectUrl) event.preventDefault();
    });
    let completed = false;
    const finish = (connection) => {
      if (completed) return;
      completed = true;
      ipcMain.removeHandler('wattelier:connect-submit');
      ipcMain.removeAllListeners('wattelier:connect-cancel');
      if (!connectWindow.isDestroyed()) connectWindow.destroy();
      resolve(connection);
    };
    ipcMain.handle('wattelier:connect-submit', async (event, value) => {
      if (event.senderFrame?.url !== connectUrl)
        return { ok: false, error: 'Origine non autorisée.' };
      try {
        const input = value && typeof value === 'object' ? value : { token: value };
        const connectionToken = connectionTokenFromInput(input.token, input.serverUrl);
        const connection = parseConnectionToken(connectionToken);
        await validateRemoteConnection(connection);
        await writeDesktopConnection(runtimePaths.connectionPath, connectionToken, safeStorage);
        desktopPreferences = writeDesktopPreferences(runtimePaths.preferencesPath, {
          ...desktopPreferences,
          mode: 'client',
        });
        finish(connection);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.message || 'Connexion impossible.' };
      }
    });
    ipcMain.once('wattelier:connect-cancel', () => finish(null));
    connectWindow.on('closed', () => finish(null));
    connectWindow.loadURL(connectUrl);
  });
}

async function chooseApplicationMode() {
  if (desktopPreferences.mode === 'client') {
    const saved = await readDesktopConnection(runtimePaths.connectionPath, safeStorage);
    if (saved) return { mode: 'client', connection: saved };
  }
  if (desktopPreferences.mode === 'server' || fs.existsSync(runtimePaths.databasePath)) {
    desktopPreferences = writeDesktopPreferences(runtimePaths.preferencesPath, {
      ...desktopPreferences,
      mode: 'server',
    });
    return { mode: 'server' };
  }
  if (process.env.WATTELIER_SKIP_LEGACY_IMPORT === '1') return { mode: 'server' };

  const choice = await dialog.showMessageBox({
    type: 'question',
    title: 'Bienvenue dans Wattelier',
    message: 'Comment souhaitez-vous utiliser Wattelier ?',
    detail:
      'Créez le serveur énergétique sur ce PC, ou connectez cette application à un serveur Wattelier déjà configuré.',
    buttons: ['Créer mon serveur', 'Accéder à mon serveur distant', 'Annuler'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (choice.response === 2) return null;
  if (choice.response === 1) {
    const connection = await requestRemoteConnection();
    return connection ? { mode: 'client', connection } : null;
  }
  desktopPreferences = writeDesktopPreferences(runtimePaths.preferencesPath, {
    ...desktopPreferences,
    mode: 'server',
  });
  return { mode: 'server' };
}

async function offerLegacyImport() {
  if (fs.existsSync(runtimePaths.databasePath)) return;
  if (process.env.WATTELIER_SKIP_LEGACY_IMPORT === '1') return;
  const choice = await dialog.showMessageBox({
    type: 'question',
    title: 'Bienvenue dans Wattelier',
    message: 'Souhaitez-vous importer vos données de Suivi Élec ?',
    detail:
      "Vous pouvez repartir de zéro ou sélectionner le fichier data\\elec.db d'une ancienne installation.",
    buttons: ['Nouvelle installation', 'Importer…', 'Annuler'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (choice.response === 2) {
    app.quit();
    throw new Error('Démarrage annulé');
  }
  if (choice.response !== 1) return;
  const selected = await dialog.showOpenDialog({
    title: "Sélectionner l'ancienne base Suivi Élec",
    properties: ['openFile'],
    filters: [{ name: 'Base Wattelier/Elec', extensions: ['db'] }],
  });
  if (selected.canceled || !selected.filePaths[0]) return offerLegacyImport();
  try {
    await importLegacyDatabase(selected.filePaths[0], runtimePaths.databasePath);
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Import impossible',
      message: error.message,
    });
    return offerLegacyImport();
  }
}

async function createWindow() {
  const remote = applicationMode === 'client';
  mainWindow = new BrowserWindow({
    title: 'Wattelier',
    width: 1280,
    height: 820,
    minWidth: 320,
    minHeight: 620,
    show: false,
    backgroundColor: '#090f1f',
    icon: desktopAsset('icon.png'),
    webPreferences: {
      ...(remote ? {} : { preload: path.join(__dirname, 'preload.cjs') }),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });
  mainWindow.removeMenu();
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (safeHttpsUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const expectedOrigin = remote ? new URL(remoteConnection.serverUrl).origin : LOCAL_URL;
    let allowed;
    try {
      allowed = new URL(url).origin === expectedOrigin;
    } catch {
      allowed = false;
    }
    if (!allowed) event.preventDefault();
  });
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.once('ready-to-show', () => {
    if (!hiddenLaunch) showWindow();
  });
  if (remote) {
    await session.defaultSession.cookies.set({
      url: remoteConnection.serverUrl,
      name: 'wattelier_token',
      value: remoteConnection.accessToken,
      secure: true,
      httpOnly: true,
      sameSite: 'strict',
      expirationDate: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
    });
  }
  mainWindow.loadURL(remote ? remoteConnection.serverUrl : LOCAL_URL);
}

function createTray() {
  tray = new Tray(desktopAsset('tray.ico'));
  tray.setToolTip(
    applicationMode === 'server'
      ? 'Wattelier — serveur énergétique actif'
      : 'Wattelier — accès distant',
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Ouvrir Wattelier', click: showWindow },
      {
        label:
          applicationMode === 'client'
            ? `Connecté à ${new URL(remoteConnection.serverUrl).hostname}`
            : serverReady
              ? 'Serveur actif sur le port 3017'
              : 'Démarrage du serveur…',
        enabled: false,
      },
      {
        label: 'Rechercher une mise à jour',
        click: () => updater.checkForUpdates({ manual: true }),
      },
      ...(applicationMode === 'client'
        ? [
            {
              label: 'Changer de serveur distant',
              click: () => {
                clearDesktopConnection(runtimePaths.connectionPath);
                writeDesktopPreferences(runtimePaths.preferencesPath, {
                  ...desktopPreferences,
                  mode: '',
                });
                quitting = true;
                app.relaunch();
                app.quit();
              },
            },
          ]
        : []),
      ...(applicationMode === 'server'
        ? [
            {
              label: 'Réinitialiser Wattelier…',
              click: () =>
                confirmApplicationReset().catch((error) =>
                  dialog.showErrorBox('Réinitialisation impossible', error.message),
                ),
            },
          ]
        : []),
      { type: 'separator' },
      { label: 'Quitter Wattelier', click: () => app.quit() },
    ]),
  );
  tray.on('click', showWindow);
}

async function startApplication() {
  runtimePaths = resolveRuntimePaths({
    portableDirectory,
    userDataDirectory: app.getPath('userData'),
  });
  const completedReset = performPendingReset({
    markerPath: runtimePaths.resetRequestPath,
    dataDirectory: runtimePaths.dataDirectory,
  });
  if (completedReset.requested && process.env.WATTELIER_SKIP_LEGACY_IMPORT !== '1') {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Wattelier a été réinitialisé',
      message: 'La configuration initiale va redémarrer.',
      detail: completedReset.backupPath
        ? `Vos anciennes données restent récupérables dans :\n${completedReset.backupPath}`
        : 'Aucune ancienne donnée locale n’a été trouvée.',
      buttons: ['Continuer'],
      noLink: true,
    });
  }
  desktopPreferences = readDesktopPreferences(runtimePaths.preferencesPath);
  fs.mkdirSync(runtimePaths.logsDirectory, { recursive: true });
  app.setAppLogsPath(runtimePaths.logsDirectory);
  const selection = await chooseApplicationMode();
  if (!selection) throw new Error('Démarrage annulé');
  applicationMode = selection.mode;
  remoteConnection = selection.connection || null;
  if (applicationMode === 'server') {
    await offerLegacyImport();
    process.env.DATA_DIR = runtimePaths.dataDirectory;
    process.env.HOST = process.env.HOST || '0.0.0.0';
    process.env.PORT = String(PORT);
    const serverModule = await import('../server/index.js');
    stopServer = serverModule.stopServer;
    await serverModule.startServer({
      host: process.env.HOST,
      port: PORT,
      dataDir: runtimePaths.dataDirectory,
    });
    serverReady = true;
  }
  if (!runtimePaths.portable) {
    const marker = path.join(runtimePaths.dataDirectory, '.startup-configured');
    if (!fs.existsSync(marker)) {
      app.setLoginItemSettings({
        ...loginItemOptions(process.execPath),
        openAtLogin: true,
        enabled: true,
      });
      fs.writeFileSync(marker, '1');
    }
  }
  updater = createDesktopUpdater({
    app,
    dialog,
    net,
    shell,
    portable: runtimePaths.portable,
    getAutomaticUpdates: () => desktopPreferences.automaticUpdates,
    beforeInstall: async () => {
      quitting = true;
      await stopServer?.();
    },
    getWindow: () => mainWindow,
  });
  if (applicationMode === 'server') registerDesktopBridge();
  createTray();
  await createWindow();
  setTimeout(() => updater.checkForUpdates(), 10_000);
}

app.on('second-instance', showWindow);
app.on('activate', showWindow);
app.on('window-all-closed', () => {});
app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  Promise.resolve(stopServer?.()).finally(() => app.quit());
});

if (hasInstanceLock) {
  app
    .whenReady()
    .then(startApplication)
    .catch(async (error) => {
      if (error.message !== 'Démarrage annulé') {
        await dialog.showMessageBox({
          type: 'error',
          title: 'Wattelier ne peut pas démarrer',
          message: error.code === 'EADDRINUSE' ? 'Le port 3017 est déjà utilisé.' : error.message,
        });
      }
      quitting = true;
      app.quit();
    });
}
