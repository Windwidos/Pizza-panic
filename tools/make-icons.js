// Baut App-Icon, Startbild und Favicon aus art-src/pizza/icon-slice.png und public/img/logo.png.
// Aufruf: node tools/make-icons.js  (danach in app/: npx @capacitor/assets generate --android)
const path = require('path');
const sharp = require(path.join(__dirname, '..', 'app', 'node_modules', 'sharp'));

const ROOT = path.join(__dirname, '..');
const A = p => path.join(ROOT, 'app', 'assets', p);
const SLICE = path.join(ROOT, 'art-src', 'pizza', 'icon-slice.png');
const LOGO = path.join(ROOT, 'public', 'img', 'logo.png');
const CREAM = '#FFF4E0';

// Tomato-red background with a soft light spot and a faint checkered tablecloth pattern.
const bgSvg = size => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#F0645A"/><stop offset="1" stop-color="#B8322A"/></radialGradient>
    <pattern id="c" width="${size / 8}" height="${size / 8}" patternUnits="userSpaceOnUse">
      <rect width="${size / 16}" height="${size / 16}" fill="#fff" opacity=".07"/>
      <rect x="${size / 16}" y="${size / 16}" width="${size / 16}" height="${size / 16}" fill="#fff" opacity=".07"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#c)"/>
</svg>`);

async function sliceAt(h) {
  return sharp(SLICE).resize({ height: h }).toBuffer();
}

(async () => {
  await sharp(bgSvg(1024)).png().toFile(A('icon-background.png'));

  // Adaptive icon: the launcher crops to a circle of ~66 % – keep the slice inside that safe zone.
  const fg = await sliceAt(600);
  const fgMeta = await sharp(fg).metadata();
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fg, left: Math.round((1024 - fgMeta.width) / 2), top: Math.round((1024 - fgMeta.height) / 2) }])
    .png().toFile(A('icon-foreground.png'));

  const big = await sliceAt(800);
  const bigMeta = await sharp(big).metadata();
  const only = await sharp(bgSvg(1024))
    .composite([{ input: big, left: Math.round((1024 - bigMeta.width) / 2), top: Math.round((1024 - bigMeta.height) / 2) }])
    .png().toBuffer();
  await sharp(only).toFile(A('icon-only.png'));
  await sharp(only).resize(512, 512).png().toFile(path.join(ROOT, 'store', 'app-icon-512.png'));
  await sharp(only).resize(64, 64).png().toFile(path.join(ROOT, 'public', 'favicon.png'));

  const logo = await sharp(LOGO).resize({ height: 1300 }).toBuffer();
  const lm = await sharp(logo).metadata();
  for (const name of ['splash.png', 'splash-dark.png']) {
    await sharp({ create: { width: 2732, height: 2732, channels: 4, background: CREAM } })
      .composite([{ input: logo, left: Math.round((2732 - lm.width) / 2), top: Math.round((2732 - lm.height) / 2) }])
      .png().toFile(A(name));
  }
  console.log('Icons, Startbild und Favicon gebaut.');
})();
