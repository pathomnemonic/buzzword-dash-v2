// tools/make-app-assets.mjs
// Draws the app icon, splash and store images from the Dx Dash mark (tools/brand.mjs).
//
//   node tools/make-app-assets.mjs && npx capacitor-assets generate --android
//
// Writes: assets/*.png (icon + splash sources), public/icon.svg, public/og.png,
// and assets/store/* (Google Play feature graphic). Screenshots: node tools/make-screenshots.mjs

import sharp from 'sharp';
import fs from 'node:fs';
import { BG, CYAN, WHITE, TAGLINE, MARK, mark, glow } from './brand.mjs';

fs.mkdirSync('assets/store', { recursive: true });
const svg = (w, h, inner) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${glow}${inner}</svg>`);
const png = async (path, buf, w, h = w) => { await sharp(buf).resize(w, h).png().toFile(path); console.log('wrote ' + path); };
const halo = (size, r = 0.55) => `<circle cx="${size / 2}" cy="${size / 2}" r="${size * r / 2}" fill="${CYAN}" opacity=".22" filter="url(#g)"/>`;

// Full icon (iOS and legacy Android)
await png('assets/icon-only.png', svg(1024, 1024, `<rect width="1024" height="1024" fill="url(#bgr)"/>${halo(1024)}${mark(1024, 0.78)}`), 1024);
// Adaptive icon layers (Android): background plus a mark inside the safe zone
await png('assets/icon-background.png', svg(1024, 1024, `<rect width="1024" height="1024" fill="url(#bgr)"/>`), 1024);
await png('assets/icon-foreground.png', svg(1024, 1024, mark(1024, 0.56)), 1024);
// The website icon
fs.writeFileSync('public/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="${BG}"/><g transform="translate(51 51) scale(.8)">${MARK}</g></svg>\n`);
console.log('wrote public/icon.svg');

// Splash
const splash = svg(2732, 2732, `<rect width="2732" height="2732" fill="${BG}"/>${halo(2732, 0.3)}${mark(2732, 0.3, 1366, 1250)}` +
  `<text x="1366" y="1830" font-family="Arial, Helvetica, sans-serif" font-size="170" font-weight="800" fill="${WHITE}" text-anchor="middle" letter-spacing="18">DX DASH</text>` +
  `<text x="1366" y="1960" font-family="Arial, Helvetica, sans-serif" font-size="80" fill="${CYAN}" text-anchor="middle" letter-spacing="6">${TAGLINE}</text>`);
await png('assets/splash.png', splash, 2732);
await png('assets/splash-dark.png', splash, 2732);

// Wide banner: Google Play feature graphic (1024x500) and the link-preview card (1200x630)
const banner = (w, h) => svg(w, h, `<rect width="${w}" height="${h}" fill="url(#bgr)"/>` +
  `<g opacity=".35" stroke="${CYAN}" stroke-width="3" stroke-linecap="round">${[0, 1, 2, 3, 4].map((i) => `<path d="M${w * 0.48 + i * 40} ${h * (0.2 + i * 0.14)}h${w * 0.5}" opacity="${0.9 - i * 0.15}"/>`).join('')}</g>` +
  `<circle cx="${w * 0.22}" cy="${h / 2}" r="${h * 0.36}" fill="${CYAN}" opacity=".2" filter="url(#g)"/>` +
  mark(h, 0.74, w * 0.22, h / 2) +
  `<text x="${w * 0.43}" y="${h * 0.47}" font-family="Arial, Helvetica, sans-serif" font-size="${h * 0.19}" font-weight="900" fill="${WHITE}" letter-spacing="3">DX DASH</text>` +
  `<text x="${w * 0.43}" y="${h * 0.63}" font-family="Arial, Helvetica, sans-serif" font-size="${h * 0.075}" font-weight="600" fill="${CYAN}">${TAGLINE}</text>` +
  `<text x="${w * 0.43}" y="${h * 0.78}" font-family="Arial, Helvetica, sans-serif" font-size="${h * 0.05}" fill="#9fb3d9">USMLE &amp; COMLEX board prep, at a sprint</text>`);
await png('assets/store/feature-graphic.png', banner(1024, 500), 1024, 500);
await png('public/og.png', banner(1200, 630), 1200, 630);
