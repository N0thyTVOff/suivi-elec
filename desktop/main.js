import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, Tray } from 'electron';
import { importLegacyDatabase } from './legacy-import.js';
import { desktopRuntimeInfo, isTrustedDesktopUrl, requestSingleInstance } from './policy.js';
import { loginItemOptions, resolveRuntimePaths } from './runtime-paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3017;
const LOCAL_URL = `http://127.0.0.1:${PORT}`;
const portableDirectory = process.env.PORTABLE_EXECUTABLE_DIR || '';
const hiddenLaunch = process.argv.includes('--hidden');
const hasInstanceLock = requestSingleInstance(app);

let mainWindow;
let tray;
let stopServer;
let quitting = false;
let serverReady = false;
let runtimePaths;

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

function currentLoginState() {
  if (runtimePaths.portable) return false;
  return app.getLoginItemSettings(loginItemOptions(process.execPath)).openAtLogin;
}

function registerDesktopBridge() {
  ipcMain.handle('wattelier:get-runtime-info', (event) => {
    if (!isTrustedSender(event)) throw new Error('Origine non autorisée');
    return desktopRuntimeInfo({
      version: app.getVersion(),
      portable: runtimePaths.portable,
      openAtLogin: currentLoginState(),
    });
  });
  ipcMain.handle('wattelier:set-open-at-login', (event, enabled) => {
    if (!isTrustedSender(event)) throw new Error('Origine non autorisée');
    if (runtimePaths.portable) return { openAtLogin: false, portable: true };
    app.setLoginItemSettings({
      ...loginItemOptions(process.execPath),
      openAtLogin: Boolean(enabled),
    });
    return { openAtLogin: currentLoginState(), portable: false };
  });
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

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Wattelier',
    width: 1280,
    height: 820,
    minWidth: 320,
    minHeight: 620,
    show: false,
    backgroundColor: '#090f1f',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });
  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(LOCAL_URL)) event.preventDefault();
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
  mainWindow.loadURL(LOCAL_URL);
}

function createTray() {
  tray = new Tray(path.join(__dirname, '..', 'build', 'tray.ico'));
  tray.setToolTip('Wattelier — serveur énergétique actif');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Ouvrir Wattelier', click: showWindow },
      {
        label: serverReady ? 'Serveur actif sur le port 3017' : 'Démarrage du serveur…',
        enabled: false,
      },
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
  fs.mkdirSync(runtimePaths.logsDirectory, { recursive: true });
  app.setAppLogsPath(runtimePaths.logsDirectory);
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
  if (!runtimePaths.portable) {
    const marker = path.join(runtimePaths.dataDirectory, '.startup-configured');
    if (!fs.existsSync(marker)) {
      app.setLoginItemSettings({
        ...loginItemOptions(process.execPath),
        openAtLogin: true,
      });
      fs.writeFileSync(marker, '1');
    }
  }
  registerDesktopBridge();
  createTray();
  createWindow();
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
