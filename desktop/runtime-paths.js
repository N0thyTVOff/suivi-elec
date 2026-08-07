import path from 'node:path';

/** @param {{ portableDirectory: string, userDataDirectory: string }} options */
export function resolveRuntimePaths({ portableDirectory, userDataDirectory }) {
  const portable = Boolean(portableDirectory);
  const root = portable
    ? path.join(path.resolve(portableDirectory), 'Wattelier-data')
    : path.join(path.resolve(userDataDirectory), 'app-data');
  return {
    portable,
    dataDirectory: root,
    logsDirectory: path.join(root, 'logs'),
    databasePath: path.join(root, 'elec.db'),
    preferencesPath: path.join(root, 'desktop-preferences.json'),
  };
}

/**
 * @param {{ packaged: boolean, resourcesDirectory: string, applicationDirectory: string, filename: string }} options
 */
export function resolveDesktopAssetPath({
  packaged,
  resourcesDirectory,
  applicationDirectory,
  filename,
}) {
  if (!['icon.png', 'tray.ico'].includes(filename)) {
    throw new Error('Ressource de bureau non autorisée');
  }
  return packaged
    ? path.join(path.resolve(resourcesDirectory), filename)
    : path.join(path.resolve(applicationDirectory), 'build', filename);
}

/** @param {string} executablePath */
export function loginItemOptions(executablePath) {
  return { name: 'Wattelier', path: executablePath, args: ['--hidden'] };
}
