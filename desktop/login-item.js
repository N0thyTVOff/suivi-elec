import { loginItemOptions } from './runtime-paths.js';

/**
 * Retourne l’état effectif du démarrage automatique sous Windows.
 *
 * @param {{ getLoginItemSettings: (options: { path: string, args: string[] }) => { openAtLogin: boolean, executableWillLaunchAtLogin: boolean } }} electronApp
 * @param {string} executablePath
 */
export function readOpenAtLogin(electronApp, executablePath) {
  const { path, args } = loginItemOptions(executablePath);
  const settings = electronApp.getLoginItemSettings({ path, args });
  return Boolean(settings.openAtLogin && settings.executableWillLaunchAtLogin);
}

/**
 * Active ou désactive l’entrée de démarrage et vérifie que Windows a appliqué
 * la demande, notamment dans la clé StartupApproved.
 *
 * @param {{ setLoginItemSettings: (options: object) => void, getLoginItemSettings: (options: { path: string, args: string[] }) => { openAtLogin: boolean, executableWillLaunchAtLogin: boolean } }} electronApp
 * @param {string} executablePath
 * @param {boolean} enabled
 */
export function updateOpenAtLogin(electronApp, executablePath, enabled) {
  const desiredState = Boolean(enabled);
  electronApp.setLoginItemSettings({
    ...loginItemOptions(executablePath),
    openAtLogin: desiredState,
    enabled: desiredState,
  });

  const effectiveState = readOpenAtLogin(electronApp, executablePath);
  if (effectiveState !== desiredState) {
    throw new Error(
      desiredState
        ? 'Windows n’a pas activé le démarrage automatique. Vérifiez Paramètres → Applications → Démarrage.'
        : 'Windows n’a pas désactivé le démarrage automatique. Vérifiez Paramètres → Applications → Démarrage.',
    );
  }
  return effectiveState;
}
