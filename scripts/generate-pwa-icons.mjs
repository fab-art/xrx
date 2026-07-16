// Generate PWA PNG icons from the master SVG using sharp.
// Run with: bun run scripts/generate-pwa-icons.mjs
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'public', 'icons', 'icon.svg');
const outDir = join(root, 'public', 'icons');

mkdirSync(outDir, { recursive: true });

const svgBuffer = readFileSync(svgPath);

const targets = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-512-maskable.png', size: 512, padding: 0.2 }, // safe zone for maskable
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon-32.png', size: 32 },
  { name: 'favicon-16.png', size: 16 },
  { name: 'favicon.ico', size: 64 }, // ico stored as png, browsers accept
];

for (const t of targets) {
  const out = join(outDir, t.name);
  if (t.padding) {
    // For maskable: composite SVG onto a filled background with padding
    const inner = Math.round(t.size * (1 - t.padding));
    const bg = await sharp({
      create: {
        width: t.size,
        height: t.size,
        channels: 4,
        background: { r: 15, g: 17, b: 35, alpha: 1 }, // #0F1123
      },
    }).png().toBuffer();
    const innerPng = await sharp(svgBuffer).resize(inner, inner).png().toBuffer();
    const left = Math.round((t.size - inner) / 2);
    await sharp(bg).composite([{ input: innerPng, left, top: left }]).png().toFile(out);
  } else {
    await sharp(svgBuffer).resize(t.size, t.size).png().toFile(out);
  }
  console.log('  ✓', t.name, `${t.size}x${t.size}`);
}

// Also generate an OG image (1200x630) for social sharing
const ogBg = await sharp({
  create: {
    width: 1200,
    height: 630,
    channels: 4,
    background: { r: 15, g: 17, b: 35, alpha: 1 },
  },
}).png().toBuffer();
const ogIcon = await sharp(svgBuffer).resize(380, 380).png().toBuffer();
await sharp(ogBg)
  .composite([{ input: ogIcon, left: 90, top: 125 }])
  .png()
  .toFile(join(root, 'public', 'icons', 'og-image.png'));
console.log('  ✓ og-image.png 1200x630');

console.log('\nAll PWA icons generated in public/icons/');
