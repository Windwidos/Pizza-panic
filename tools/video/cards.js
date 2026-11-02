// Renders frame/title/end cards and caption overlays from cards.html: node cards.js
const { chromium } = require('../node_modules/playwright-core');
const fs = require('fs');
const path = require('path');
const P = 'C:/Users/Asus ROG STRIX/Desktop/pizza-panic/public/';
const pub = path.join(__dirname, 'pub');
fs.rmSync(pub, { recursive: true, force: true });
fs.mkdirSync(pub);
fs.cpSync(P + 'img', pub + '/img', { recursive: true });
fs.cpSync(P + 'fonts', pub + '/fonts', { recursive: true });
fs.copyFileSync(P + 'fonts.css', pub + '/fonts.css');
const OUT = path.join(__dirname, 'gfx');
fs.mkdirSync(OUT, { recursive: true });
const CAPS = {
  home: ['Play with friends|– or bots!'],
  place: ['Top every pizza|on your order'],
  steal: ['Steal finished pizzas…'],
  burn: ['…or let them burn!'],
  players: ['2–6 players|online'],
  theme: ['5 theme packs', 'New toppings & special pizzas'],
  tutorial: ['Luigi shows you|how to play'],
  lang: ['Play in 5 languages!', 'English · Deutsch · Français · Español · Italiano'],
  shop: ['Unlock boards|& emotes'],
  win: ['Become a|Pizza Legend!'],
};
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const url = 'file:///' + path.join(__dirname, 'cards.html').replace(/\\/g, '/');
  const shot = async (query, file, transparent) => {
    await page.goto(`${url}?${query}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, file), omitBackground: !!transparent });
  };
  await shot('w=frame', 'frame.png', true);
  await shot('w=title', 'title.png');
  await shot('w=end', 'end.png');
  for (const [k, [h, p]] of Object.entries(CAPS)) {
    await shot(`w=cap&h=${encodeURIComponent(h)}${p ? `&p=${encodeURIComponent(p)}` : ''}`, `cap_${k}.png`, true);
  }
  await browser.close();
  console.log('Grafiken fertig');
})();
