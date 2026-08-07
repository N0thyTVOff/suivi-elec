import electronUpdater from 'electron-updater';
import { githubReleaseUrl, isNewerWattelierVersion } from './update-policy.js';

const { autoUpdater } = electronUpdater;
const LATEST_RELEASE_API = 'https://api.github.com/repos/N0thyTVOff/wattelier/releases/latest';
const RELEASES_URL = 'https://github.com/N0thyTVOff/wattelier/releases/latest';

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function createDesktopUpdater({
  app,
  dialog,
  net,
  shell,
  portable,
  getAutomaticUpdates,
  beforeInstall,
  getWindow,
}) {
  let phase = 'idle';
  let availableVersion = null;
  let releaseUrl = RELEASES_URL;
  let checkPromise = null;
  let promptedVersion = null;

  const publicStatus = (message = '') => ({
    phase,
    currentVersion: app.getVersion(),
    availableVersion,
    automaticUpdates: Boolean(getAutomaticUpdates()),
    portable,
    message,
  });

  const showMessage = (options) => {
    const window = getWindow();
    return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options);
  };

  async function installUpdate() {
    phase = 'installing';
    await beforeInstall();
    autoUpdater.quitAndInstall(false, true);
  }

  async function promptDownloaded() {
    phase = 'downloaded';
    const automatic = Boolean(getAutomaticUpdates());
    const choice = await showMessage({
      type: 'info',
      title: 'Mise à jour Wattelier prête',
      message: `Wattelier ${availableVersion || ''} est prêt à être installé.`,
      detail: automatic
        ? "Vous pouvez redémarrer maintenant ou laisser Wattelier l'installer à sa fermeture."
        : 'Redémarrez Wattelier pour terminer la mise à jour.',
      buttons: automatic
        ? ['Redémarrer maintenant', 'À la fermeture']
        : ['Redémarrer maintenant', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (choice.response === 0) await installUpdate();
  }

  async function promptAvailable({ version, url }) {
    availableVersion = version;
    releaseUrl = githubReleaseUrl(url) || RELEASES_URL;
    phase = 'available';
    if (promptedVersion === version) return;
    promptedVersion = version;

    if (portable) {
      const choice = await showMessage({
        type: 'info',
        title: 'Mise à jour Wattelier disponible',
        message: `Wattelier ${version} est disponible.`,
        detail:
          'La version portable se met à jour manuellement afin de ne pas déplacer vos données. Téléchargez le nouvel exécutable puis placez-le à côté de Wattelier-data.',
        buttons: ['Ouvrir le téléchargement', 'Plus tard'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (choice.response === 0) await shell.openExternal(releaseUrl);
      return;
    }

    const automatic = Boolean(getAutomaticUpdates());
    if (automatic) {
      await showMessage({
        type: 'info',
        title: 'Mise à jour Wattelier disponible',
        message: `Wattelier ${version} va être téléchargé en arrière-plan.`,
        buttons: ['OK'],
        noLink: true,
      });
      phase = 'downloading';
      await autoUpdater.downloadUpdate();
      return;
    }

    const choice = await showMessage({
      type: 'info',
      title: 'Mise à jour Wattelier disponible',
      message: `Wattelier ${version} est disponible.`,
      detail: 'Voulez-vous la télécharger maintenant ?',
      buttons: ['Télécharger', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (choice.response === 0) {
      phase = 'downloading';
      await autoUpdater.downloadUpdate();
    }
  }

  autoUpdater.autoDownload = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on('update-available', (info) => {
    void promptAvailable({
      version: info.version,
      url: info.releaseUrl || RELEASES_URL,
    }).catch(() => {});
  });
  autoUpdater.on('update-not-available', () => {
    phase = 'up-to-date';
    availableVersion = null;
  });
  autoUpdater.on('download-progress', () => {
    phase = 'downloading';
  });
  autoUpdater.on('update-downloaded', () => {
    void promptDownloaded().catch(() => {});
  });
  autoUpdater.on('error', () => {
    phase = 'error';
  });

  async function checkPortable() {
    const response = await net.fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`GitHub a répondu ${response.status}`);
    const release = await response.json();
    const version = String(release.tag_name || '').replace(/^wattelier-v/i, '');
    if (isNewerWattelierVersion(version, app.getVersion())) {
      await promptAvailable({ version, url: release.html_url });
      return publicStatus();
    }
    phase = 'up-to-date';
    availableVersion = null;
    return publicStatus('Wattelier est à jour.');
  }

  async function checkForUpdates({ manual = false } = {}) {
    if (checkPromise) return checkPromise;
    if (!app.isPackaged)
      return publicStatus('La recherche est disponible dans l’application Windows publiée.');
    phase = 'checking';
    checkPromise = (
      portable ? checkPortable() : autoUpdater.checkForUpdates().then(() => publicStatus())
    )
      .catch(async (error) => {
        phase = 'error';
        const message = `Recherche impossible : ${errorMessage(error)}`;
        if (manual) {
          await showMessage({
            type: 'warning',
            title: 'Mise à jour Wattelier',
            message: 'Impossible de rechercher une mise à jour.',
            detail: 'Vérifiez votre connexion Internet puis réessayez.',
            buttons: ['OK'],
          });
        }
        return publicStatus(message);
      })
      .finally(() => {
        checkPromise = null;
      });
    const status = await checkPromise;
    if (manual && status.phase === 'up-to-date') {
      await showMessage({
        type: 'info',
        title: 'Mise à jour Wattelier',
        message: `Wattelier ${app.getVersion()} est à jour.`,
        buttons: ['OK'],
      });
    }
    return status;
  }

  function refreshAutomaticUpdates() {
    autoUpdater.autoInstallOnAppQuit = !portable && Boolean(getAutomaticUpdates());
    return publicStatus();
  }

  refreshAutomaticUpdates();
  return { checkForUpdates, getStatus: publicStatus, refreshAutomaticUpdates };
}
