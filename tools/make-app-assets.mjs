// tools/make-app-assets.mjs
// Draws the app icon and splash source images (assets/*.png), then
// `npx capacitor-assets generate` turns them into every size the stores need.
//
//   node tools/make-app-assets.mjs && npx capacitor-assets generate --android

import sharp from 'sharp';

const BG = '#0b1020';
const BOLT = 'M290 48 130 288h110l-24 176 166-244H272z'; // the lightning bolt from public/icon.svg (512 box)

const svg = (size, inner) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${inner}</svg>`);
// Place the 512-unit bolt centered in a `size` square, scaled to `fraction` of it.
const bolt = (size, fraction, fill = '#22d3ee') => {
  const s = (size * fraction) / 512;
  const off = (size - 512 * s) / 2;
  return `<path transform="translate(${off} ${off}) scale(${s})" d="${BOLT}" fill="${fill}"/>`;
};

const out = async (name, buf, size) => {
  await sharp(buf).resize(size, size).png().toFile(`assets/${name}`);
  console.log('wrote assets/' + name);
};

// Full icon (iOS and legacy Android): solid background, bolt filling most of it
await out('icon-only.png', svg(1024, `<rect width="1024" height="1024" fill="${BG}"/>${bolt(1024, 0.82)}`), 1024);
// Adaptive icon layers (Android): background plus a bolt inside the safe zone
await out('icon-background.png', svg(1024, `<rect width="1024" height="1024" fill="${BG}"/>`), 1024);
await out('icon-foreground.png', svg(1024, bolt(1024, 0.58)), 1024);
// Splash screens
const splash = (bg) => svg(2732, `<rect width="2732" height="2732" fill="${bg}"/>${bolt(2732, 0.28)}` +
  `<text x="1366" y="1900" font-family="Arial, Helvetica, sans-serif" font-size="150" font-weight="800" fill="#e8f7ff" text-anchor="middle" letter-spacing="14">BUZZWORD DASH</text>`);
await out('splash.png', splash(BG), 2732);
await out('splash-dark.png', splash(BG), 2732);
