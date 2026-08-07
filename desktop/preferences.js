import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PREFERENCES = Object.freeze({ automaticUpdates: false });

/** @param {string} filename */
export function readDesktopPreferences(filename) {
  try {
    const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
    return {
      automaticUpdates:
        typeof value.automaticUpdates === 'boolean'
          ? value.automaticUpdates
          : DEFAULT_PREFERENCES.automaticUpdates,
    };
  } catch (error) {
    const missing =
      error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
    if (!missing && !(error instanceof SyntaxError)) throw error;
    return { ...DEFAULT_PREFERENCES };
  }
}

/** @param {string} filename @param {{ automaticUpdates: unknown, [key: string]: unknown }} preferences */
export function writeDesktopPreferences(filename, preferences) {
  const normalized = { automaticUpdates: Boolean(preferences.automaticUpdates) };
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filename);
  return normalized;
}
