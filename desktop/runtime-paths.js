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
  };
}

/** @param {string} executablePath */
export function loginItemOptions(executablePath) {
  return { name: 'Wattelier', path: executablePath, args: ['--hidden'] };
}
