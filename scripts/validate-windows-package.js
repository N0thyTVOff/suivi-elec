import fs from 'node:fs';
import path from 'node:path';
import { listPackage } from '@electron/asar';
import packageJson from '../package.json' with { type: 'json' };

const releaseDirectory = path.resolve('release');
const asarPath = path.join(releaseDirectory, 'win-unpacked', 'resources', 'app.asar');
const expectedArtifacts = [
  `Wattelier-Setup-v${packageJson.version}-x64.exe`,
  `Wattelier-Portable-v${packageJson.version}-x64.exe`,
];
const allowedDirectories = ['/desktop', '/server', '/dist', '/node_modules'];
const allowedFiles = ['/package.json', '/LICENSE', '/NOTICE'];
const expectedResources = ['tray.ico', 'icon.png'];
const forbiddenPatterns = [
  /(^|\/)\.env(?:\.|$)/i,
  /^\/data\//i,
  /\.db(?:-|$)/i,
  /(^|\/)test(?:s|-results)?\//i,
  /(^|\/)e2e\//i,
  /(^|\/)web\/src\//i,
  /(^|\/)docs\//i,
  /(^|\/)\.github\//i,
  /\.log$/i,
];

const errors = [];
if (!fs.existsSync(asarPath)) errors.push('archive app.asar absente');

for (const artifact of expectedArtifacts) {
  const target = path.join(releaseDirectory, artifact);
  if (!fs.existsSync(target) || fs.statSync(target).size === 0) {
    errors.push(`artefact absent ou vide : ${artifact}`);
  }
}

if (fs.existsSync(asarPath)) {
  const packagedFiles = listPackage(asarPath).map((entry) => entry.replaceAll('\\', '/'));
  for (const file of packagedFiles) {
    if (
      !allowedFiles.includes(file) &&
      !allowedDirectories.some(
        (directory) => file === directory || file.startsWith(`${directory}/`),
      )
    ) {
      errors.push(`fichier hors liste blanche dans app.asar : ${file}`);
    }
    if (forbiddenPatterns.some((pattern) => pattern.test(file))) {
      errors.push(`fichier sensible ou inutile dans app.asar : ${file}`);
    }
  }
}

const resourcesDirectory = path.dirname(asarPath);
for (const resource of expectedResources) {
  const target = path.join(resourcesDirectory, resource);
  if (!fs.existsSync(target) || fs.statSync(target).size === 0) {
    errors.push(`ressource Electron absente ou vide : ${resource}`);
  }
}

const unpackedDirectory = path.join(
  releaseDirectory,
  'win-unpacked',
  'resources',
  'app.asar.unpacked',
);
if (fs.existsSync(unpackedDirectory)) {
  const pending = [unpackedDirectory];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else {
        const relative = path.relative(unpackedDirectory, target).replaceAll('\\', '/');
        if (forbiddenPatterns.some((pattern) => pattern.test(relative))) {
          errors.push(`fichier sensible ou inutile hors app.asar : ${relative}`);
        }
      }
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Paquet Wattelier ${packageJson.version} validé : exécutable, portable et contenu minimal.`,
  );
}
