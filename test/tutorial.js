// Plays the scripted tutorial exactly as Luigi explains it and checks every step is possible.
const assert = require('assert');
const E = require('../public/engine');

// Same as TUTORIAL_RIG / TUTORIAL_BOT_RIG and the tutorial options in server.js.
const RIG = ['sauce', 'basil', 'sauce', 'mozzarella', 'ham', 'steal', 'mozzarella', 'burn', 'hamMushroom',
  'sauceSalami', 'dig', 'sauceSalami', 'pepper', 'mozzarella'];
const BOT_RIG = ['sauce', 'ham', 'mushroom', 'mushroom', 'mozzarella', 'mozzarella', 'basil', 'pepper', 'basil', 'pepper'];

for (let run = 0; run < 200; run++) {
  const s = E.newGame(['Du', 'Luigi'], 0, Math.random, { rig: { 0: RIG.slice(), 1: BOT_RIG.slice() }, gentle: [1], noDig: [1], slow: { 1: 6 } });
  const me = s.players[0], luigi = s.players[1];
  const card = t => { const c = me.hand.find(x => x.t === t); assert(c, `Karte ${t} fehlt, Hand: ${me.hand.map(x => x.t)}`); return c.id; };
  const ok = a => { const r = E.act(s, 0, a); assert(r.ok, `${JSON.stringify(a)}: ${r.error}`); };
  const luigiTurn = () => { let g = 0; while (s.current === 1 && g++ < 10) assert(E.act(s, 1, E.botStep(s, 1)).ok); };
  const layers = st => E.layersOf(st).join(',');

  // Zug 1: Margherita anfangen (Soße + Basilikum), zweite Soße als neue Pizza.
  ok({ type: 'place', cardId: card('sauce'), stack: 'new' });
  ok({ type: 'place', cardId: card('basil'), stack: 0 });
  ok({ type: 'place', cardId: card('sauce'), stack: 'new' });
  assert.strictEqual(s.current, 1);
  luigiTurn();
  assert.deepStrictEqual(luigi.tray.map(layers), ['sauce,ham,mushroom']);

  // Zug 2: Margherita fertig, Schinken auf die Soße, Luigis Pilze klauen.
  ok({ type: 'place', cardId: card('mozzarella'), stack: 0 });
  assert.strictEqual(E.completedCount(me.tray, s.recipes), 1);
  ok({ type: 'place', cardId: card('ham'), stack: 1 });
  ok({ type: 'steal', cardId: card('steal'), mode: 'top', from: { player: 1, stack: 0 }, to: { player: 0, stack: 1 } });
  assert.strictEqual(layers(me.tray[1]), 'sauce,ham,mushroom');
  luigiTurn();
  assert.strictEqual(layers(luigi.tray[0]), 'sauce,ham,mushroom,mozzarella', 'Luigi soll eine Prosciutto e Funghi fertig haben');

  // Zug 3: eigene Funghi fertig, Luigis Funghi anbrennen, Schinken + Pilze behalten.
  ok({ type: 'place', cardId: card('mozzarella'), stack: 1 });
  assert.strictEqual(E.completedCount(me.tray, s.recipes), 2);
  ok({ type: 'burn', cardId: card('burn'), target: { player: 1, stack: 0 } });
  assert(me.hand.some(c => c.t === 'hamMushroom'));
  ok({ type: 'end' });
  luigiTurn();
  assert.strictEqual(E.completedCount(luigi.tray, s.recipes), 0, 'Luigi darf nicht aufholen');

  // Zug 4: Kombi Soße + Salami, Schinken + Pilze drauf, Mozzarella per Mülltaucher → Speciale.
  ok({ type: 'place', cardId: card('sauceSalami'), stack: 'new' });
  const speciale = me.tray.findIndex(st => layers(st) === 'sauce,salami');
  ok({ type: 'place', cardId: card('hamMushroom'), stack: speciale });
  ok({ type: 'dig', cardId: card('dig') });
  assert(s.pending, 'Mülltaucher muss etwas finden');
  const mozz = s.trash.find(c => c.t === 'mozzarella');
  assert(mozz, 'Im Müll muss ein Mozzarella liegen');
  ok({ type: 'digPick', cardId: mozz.id, stack: speciale });
  assert.strictEqual(E.completedCount(me.tray, s.recipes), 3);
  luigiTurn();
  assert(E.completedCount(luigi.tray, s.recipes) < 2, 'Luigi bleibt hinten');

  // Zug 5: Salami mit Soße + Salami, Paprika, Mozzarella → Sieg.
  ok({ type: 'place', cardId: card('sauceSalami'), stack: 'new' });
  const salami = me.tray.findIndex(st => layers(st) === 'sauce,salami');
  ok({ type: 'place', cardId: card('pepper'), stack: salami });
  ok({ type: 'place', cardId: card('mozzarella'), stack: salami });
  assert.strictEqual(s.winner, 0, 'Du gewinnst die Übungsrunde');
}
console.log('Tutorial-Ablauf ok');
