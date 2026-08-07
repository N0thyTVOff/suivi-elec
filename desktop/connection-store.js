import fs from 'node:fs';
import path from 'node:path';
import { parseConnectionToken } from '../server/connection-token.js';

/**
 * @typedef {{ isAsyncEncryptionAvailable: () => Promise<boolean>, encryptStringAsync: (value: string) => Promise<Buffer>, decryptStringAsync: (value: Buffer) => Promise<{ result: string }> }} ConnectionStorage
 */

/** @param {string} filename @param {string} connectionToken @param {ConnectionStorage} storage */
export async function writeDesktopConnection(filename, connectionToken, storage) {
  if (!(await storage.isAsyncEncryptionAvailable())) {
    throw new Error('Le chiffrement Windows est indisponible.');
  }
  const normalized = parseConnectionToken(connectionToken);
  const encrypted = await storage.encryptStringAsync(JSON.stringify(normalized));
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp`;
  fs.writeFileSync(temporary, encrypted, { mode: 0o600 });
  fs.renameSync(temporary, filename);
  return normalized;
}

/** @param {string} filename @param {ConnectionStorage} storage */
export async function readDesktopConnection(filename, storage) {
  try {
    if (!(await storage.isAsyncEncryptionAvailable())) return null;
    const decrypted = await storage.decryptStringAsync(fs.readFileSync(filename));
    const value = JSON.parse(decrypted.result);
    return {
      serverUrl: String(value.serverUrl),
      accessToken: String(value.accessToken),
    };
  } catch {
    return null;
  }
}

/** @param {string} filename */
export function clearDesktopConnection(filename) {
  try {
    fs.unlinkSync(filename);
  } catch (error) {
    const missing =
      error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
    if (!missing) throw error;
  }
}
