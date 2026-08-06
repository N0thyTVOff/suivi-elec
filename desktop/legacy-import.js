import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export async function importLegacyDatabase(sourcePath, destinationPath) {
  const source = path.resolve(sourcePath);
  const destination = path.resolve(destinationPath);
  if (source === destination)
    throw new Error('La base sélectionnée est déjà utilisée par Wattelier.');
  if (!fs.existsSync(source) || path.basename(source).toLowerCase() !== 'elec.db') {
    throw new Error('Sélectionnez le fichier elec.db de votre ancienne installation.');
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const sourceDb = new Database(source, { readonly: true, fileMustExist: true });
  try {
    const integrity = sourceDb.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error("La base sélectionnée n'est pas intègre.");
    await sourceDb.backup(destination);
  } finally {
    sourceDb.close();
  }
  return destination;
}
