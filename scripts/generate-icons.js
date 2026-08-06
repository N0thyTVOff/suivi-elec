import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, 'web', 'public', 'brand', 'wattelier-mark.svg');
const build = path.join(root, 'build');
const icons = path.join(root, 'web', 'public', 'icons');
fs.mkdirSync(build, { recursive: true });
fs.mkdirSync(icons, { recursive: true });

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngPaths = [];
for (const size of sizes) {
  const target = path.join(build, `icon-${size}.png`);
  await sharp(source).resize(size, size).png().toFile(target);
  pngPaths.push(target);
}
await sharp(source).resize(512, 512).png().toFile(path.join(build, 'icon.png'));
await sharp(source).resize(180, 180).png().toFile(path.join(icons, 'apple-touch-icon.png'));
await sharp(source).resize(32, 32).png().toFile(path.join(icons, 'favicon-32.png'));
await sharp(source).resize(192, 192).png().toFile(path.join(icons, 'icon-192.png'));
await sharp(source).resize(512, 512).png().toFile(path.join(icons, 'icon-512.png'));
const ico = await pngToIco(pngPaths);
fs.writeFileSync(path.join(build, 'icon.ico'), ico);
fs.writeFileSync(path.join(build, 'tray.ico'), ico);
console.log('Icônes Wattelier générées.');
