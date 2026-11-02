// Records the trailer clips (English) from the local server (SMASH_DEMO=1, port 3125) as frame sequences
// via the Chrome DevTools screencast, then turns each into a 30 fps mp4: node rec.js
const { chromium } = require('../node_modules/playwright-core');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const FF = 'C:/Users/Asus ROG STRIX/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.1-essentials_build/bin/ffmpeg.exe';
const U = 'http://localhost:3125/';
const ID = '11111111-2222-4333-8444-555555555555', TOKEN = 'demo-token-lena';
const OUT = path.join(__dirname, 'clips');
fs.mkdirSync(OUT, { recursive: true });
const marks = {};

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 2.625 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('Seitenfehler:', e.message));
  const cdp = await ctx.newCDPSession(page);
  const wait = ms => page.waitForTimeout(ms);
  const click = sel => page.click(sel, { force: true });

  let rec = null;
  cdp.on('Page.screencastFrame', f => {
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    if (!rec) return;
    const file = path.join(rec.dir, `f${String(rec.frames.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    rec.frames.push({ file, t: f.metadata.timestamp });
  });
  async function start(name) {
    const dir = path.join(OUT, name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir);
    rec = { name, dir, frames: [], t0: Date.now() / 1000 };
    marks[name] = {};
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1082, maxHeight: 2342, everyNthFrame: 1 });
    await wait(300);
  }
  const mark = label => { marks[rec.name][label] = +(Date.now() / 1000 - rec.t0).toFixed(2); };
  async function stop() {
    await cdp.send('Page.stopScreencast');
    const r = rec; rec = null;
    const end = Date.now() / 1000;
    // Concat list with real frame durations, the first frame starts the clip.
    let list = 'ffconcat version 1.0\n';
    r.frames.forEach((f, i) => {
      const next = i + 1 < r.frames.length ? r.frames[i + 1].t : end;
      list += `file '${f.file.replace(/\\/g, '/')}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}\n`;
    });
    list += `file '${r.frames[r.frames.length - 1].file.replace(/\\/g, '/')}'\n`;
    fs.writeFileSync(path.join(r.dir, 'list.txt'), list);
    // Marks are relative to the start call; the first frame came a little later.
    const lead = r.frames.length ? r.frames[0].t - r.t0 : 0;
    for (const k of Object.keys(marks[r.name])) marks[r.name][k] = +(marks[r.name][k] - lead).toFixed(2);
    execFileSync(FF, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(r.dir, 'list.txt'),
      '-vf', 'fps=30,scale=758:1640,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', path.join(OUT, r.name + '.mp4')]);
    console.log(r.name, r.frames.length, 'Bilder', JSON.stringify(marks[r.name]));
  }

  const fresh = async () => {
    await page.goto(U);
    await page.evaluate(([id, token]) => {
      localStorage.clear();
      localStorage.setItem('pizzapanic.profile', JSON.stringify({ id, token }));
      localStorage.setItem('pizzapanic.name', 'Lena');
      localStorage.setItem('pizzapanic.lang', 'en');
      localStorage.setItem('pizzapanic.audio', JSON.stringify({ music: false, sfx: false }));
    }, [ID, TOKEN]);
    await page.goto(U);
    await wait(1500);
  };
  const demo = async scene => {
    await fresh();
    await page.evaluate(async ([id, token, scene]) => {
      const r = await fetch('/api/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: id, profileToken: token, scene }) }).then(x => x.json());
      localStorage.setItem('pizzapanic.session', JSON.stringify({ code: r.code, pid: r.pid, token: r.token }));
      history.replaceState(null, '', '?room=' + r.code);
    }, [ID, TOKEN, scene]);
    await page.reload();
    await wait(2500);
  };

  // 1 Home → Quick Match
  await fresh();
  await start('c1_home');
  await wait(1300);
  await click('[data-do="quick"]');
  await wait(1900);
  await stop();

  // 2 Gameplay: finish Funghi, steal Mia's Salami, burn Tom's Funghi, bots play
  await demo('video');
  await start('c2_game');
  await wait(700);
  mark('place');
  await click('.hand .card[data-t="mozzarella"]');
  await wait(800);
  await click('.stack[data-p="0"][data-s="1"]');
  await wait(1800);
  mark('steal');
  await click('.hand .card[data-t="steal"]');
  await wait(500);
  await click('[data-do="play"]');
  await wait(600);
  await click('.stack[data-p="1"][data-s="0"]');
  await wait(500);
  if (await page.$('[data-do="stealMode"][data-m="whole"]')) { await click('[data-do="stealMode"][data-m="whole"]'); await wait(400); }
  await click('.stack[data-p="0"][data-s="new"]');
  await wait(3000);
  mark('burn');
  await click('.hand .card[data-t="burn"]');
  await wait(500);
  await click('[data-do="play"]');
  await wait(600);
  await click('.stack[data-p="2"][data-s="0"]');
  await wait(600);
  await click('.sheet [data-do="burnYes"]');
  await wait(3000);
  mark('bots');
  await wait(5000);
  await stop();

  // 3 Theme pack Fire & Flame
  await demo('diavolo');
  await start('c3_theme');
  await wait(800);
  await click('.hand .card[data-t="peperoni"]');
  await wait(2000);
  await stop();

  // 4 Luigi tutorial
  await fresh();
  await start('c4_tutorial');
  await click('[data-do="tutorial"]');
  await wait(2600);
  await click('#coach [data-do="coachNext"]');
  await wait(2600);
  await stop();

  // 5 Languages: switch through all five on the home screen
  await fresh();
  await start('c5_lang');
  await wait(700);
  for (const l of ['fr', 'es', 'it', 'de', 'en']) {
    await click('[data-do="lang"]');
    await wait(450);
    await click(`[data-do="setLang"][data-id="${l}"]`);
    mark(l);
    await wait(900);
  }
  await stop();

  // 6 Shop: pizza boards
  await fresh();
  await click('[data-do="openShop"]');
  await wait(600);
  await click('[data-do="shopTab"][data-id="trays"]');
  await wait(500);
  await start('c6_shop');
  await wait(900);
  for (let y = 0; y < 6; y++) { await page.mouse.wheel(0, 90); await wait(160); }
  await wait(900);
  await stop();

  // 7 Win screen at the end of the tutorial (only the last moves are recorded)
  await fresh();
  await click('[data-do="tutorial"]');
  await wait(1500);
  let n = 0;
  for (let i = 0; i < 160 && !(await page.$('.xp-detail')); i++) {
    let did = false;
    for (const sel of ['#coach [data-do="coachNext"]', '.tut-pick', '.sheet [data-do="burnYes"]', '.coach-hl']) {
      const el = await page.$(sel);
      if (el && await el.isVisible().catch(() => false)) {
        if (n === 47 && !rec) await start('c7_win');
        await el.click({ force: true }).catch(() => {});
        did = true; n++;
        break;
      }
    }
    await wait(did ? 500 : 900);
  }
  await wait(4200);
  await stop();

  fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify(marks, null, 2));
  await browser.close();
})();
