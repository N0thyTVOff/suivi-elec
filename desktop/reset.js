import fs from 'node:fs';
import path from 'node:path';

/** @param {string} markerPath */
export function requestApplicationReset(markerPath) {
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, 'reset\n', { mode: 0o600 });
}

/** @param {string} markerPath */
export function cancelApplicationReset(markerPath) {
  try {
    fs.unlinkSync(markerPath);
  } catch (error) {
    const missing =
      error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
    if (!missing) throw error;
  }
}

/** @param {Date} now */
function timestamp(now) {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Exécuté au redémarrage, avant l’ouverture de SQLite et des journaux.
 * @param {{ markerPath: string, dataDirectory: string, now?: Date }} options
 */
export function performPendingReset({ markerPath, dataDirectory, now = new Date() }) {
  if (!fs.existsSync(markerPath)) return { requested: false, backupPath: null };

  let backupPath = null;
  if (fs.existsSync(dataDirectory)) {
    const base = `${dataDirectory}-backup-${timestamp(now)}`;
    backupPath = base;
    let suffix = 1;
    while (fs.existsSync(backupPath)) {
      backupPath = `${base}-${suffix}`;
      suffix += 1;
    }
    fs.renameSync(dataDirectory, backupPath);
  }
  cancelApplicationReset(markerPath);
  return { requested: true, backupPath };
}
