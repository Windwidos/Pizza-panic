// Einmal-Werkzeug: node tools/replace.js <datei> <paare.json>  – ersetzt exakte Textstellen und meldet fehlende.
const fs = require('fs');
const [file, pairsFile] = process.argv.slice(2);
let c = fs.readFileSync(file, 'utf8');
const pairs = JSON.parse(fs.readFileSync(pairsFile, 'utf8'));
let missing = 0;
for (const [from, to] of pairs) {
  if (!c.includes(from)) { console.log('FEHLT:', from.slice(0, 110)); missing++; continue; }
  c = c.split(from).join(to);
}
fs.writeFileSync(file, c);
console.log(`${pairs.length - missing}/${pairs.length} ersetzt in ${file}`);
