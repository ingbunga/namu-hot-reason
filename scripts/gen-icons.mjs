import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const svgPath = resolve(root, 'icon.svg');
const outDir = resolve(root, 'icons');
const sizes = [16, 48, 128];

const svg = await readFile(svgPath);
await mkdir(outDir, { recursive: true });

for (const size of sizes) {
  const png = await sharp(svg, { density: Math.max(72, size * 4) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  const file = resolve(outDir, `icon-${size}.png`);
  await writeFile(file, png);
  console.log(`✓ ${file} (${png.length} bytes)`);
}
