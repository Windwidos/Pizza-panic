// Prüft die Sprachdateien: jede Sprache hat genau die Schlüssel von Deutsch, dieselben {platzhalter},
// gleich viele Einträge bei Listen und dieselben HTML-Tags (<b> …). Außerdem: jeder Kartentyp, jede Pizza,
// jedes Thema, Shop-Artikel und jeder Protokoll-/Fehlerschlüssel der Spiellogik hat einen deutschen Text.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const I18n = require('../public/i18n');
const E = require('../public/engine');
const Shop = require('../public/shop');

const DIR = path.join(__dirname, '..', 'public', 'lang');
const de = require(path.join(DIR, 'de.js'));
const holders = s => (Array.isArray(s) ? s.join('\n') : s).match(/\{\w+\}/g)?.sort().join() || '';
const tags = s => (Array.isArray(s) ? s.join('\n') : s).match(/<\/?[a-z]+/g)?.sort().join() || '';
let problems = 0;
const problem = msg => { problems++; console.log('  ✗ ' + msg); };

// Everything the game code refers to by id must exist in German.
const need = [];
for (const [t, def] of Object.entries(E.TYPES)) need.push(def.kind === 'act' ? `act.${t}` : `ing.${t}`);
for (const t of Object.keys(E.TYPES)) if (E.TYPES[t].kind === 'ing') need.push(`acc.${t}`);
for (const r of E.RECIPES) need.push(`recipe.${r.id}`);
for (const id of Object.keys(E.THEMES)) need.push(`theme.${id}`);
E.TITLES.forEach((_, i) => need.push(`title.${i}`));
for (const t of Shop.TRAYS) need.push(`tray.${t.id}`);
for (const e of Shop.EMOTES) need.push(`emote.${e.id}`);
for (const p of Shop.PACKS) need.push(`pack.${p.id}`);
for (const p of Shop.IAP) need.push(p.theme ? `theme.${p.theme}` : `iap.${p.id}`); // theme packs are named like their theme
for (const f of ['public/engine.js', 'server.js']) {
  const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  for (const m of src.matchAll(/'((?:log|err)\.[\w.]+)'/g)) need.push(m[1]);
}
for (const k of new Set(need)) if (de[k] == null) problem(`de: Schlüssel fehlt: ${k}`);

for (const code of Object.keys(I18n.LANGS).filter(c => c !== 'de')) {
  const file = path.join(DIR, code + '.js');
  if (!fs.existsSync(file)) { problem(`${code}: Datei fehlt`); continue; }
  const d = require(file);
  const missing = Object.keys(de).filter(k => d[k] == null);
  const extra = Object.keys(d).filter(k => de[k] == null);
  if (missing.length) problem(`${code}: ${missing.length} Schlüssel fehlen: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}`);
  if (extra.length) problem(`${code}: ${extra.length} unbekannte Schlüssel: ${extra.slice(0, 8).join(', ')}`);
  for (const k of Object.keys(de)) {
    if (d[k] == null) continue;
    if (Array.isArray(de[k]) !== Array.isArray(d[k])) problem(`${code}: ${k} muss ${Array.isArray(de[k]) ? 'eine Liste' : 'ein Text'} sein`);
    else if (holders(de[k]) !== holders(d[k])) problem(`${code}: ${k} Platzhalter ${holders(d[k]) || '–'} statt ${holders(de[k]) || '–'}`);
    else if (tags(de[k]) !== tags(d[k])) problem(`${code}: ${k} HTML-Tags ${tags(d[k]) || '–'} statt ${tags(de[k]) || '–'}`);
    if (typeof d[k] === 'string' && !d[k].trim()) problem(`${code}: ${k} ist leer`);
  }
}
assert.strictEqual(problems, 0, `${problems} Sprachprobleme`);
console.log(`Sprachen ok (${Object.keys(de).length} Texte, ${Object.keys(I18n.LANGS).length} Sprachen)`);
