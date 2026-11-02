// Renders the Pizza Panic music loop (same instruments as public/sound.js) offline to music.wav: node music.js <seconds> [bpm]
const { chromium } = require('../node_modules/playwright-core');
const fs = require('fs');
const SECONDS = Number(process.argv[2] || 50), BPM = Number(process.argv[3] || 104);
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage();
  await page.goto('about:blank');
  const chans = await page.evaluate(async ([SECONDS, BPM]) => {
    const SR = 44100;
    const ctx = new OfflineAudioContext(2, SR * SECONDS, SR);
    let seed = 7;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    const bus = ctx.createGain(); bus.gain.value = 0.85;
    const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 3200;
    bus.connect(warm).connect(master);
    const noiseBuf = ctx.createBuffer(1, SR, SR);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = rnd() * 2 - 1;
    const hz = m => 440 * Math.pow(2, (m - 69) / 12);
    function tone({ f, f2, type = 'sine', at, dur = 0.2, vol = 0.3, attack = 0.005, detune = 0, q }) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, at);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, at + dur);
      o.detune.value = detune;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g);
      if (q) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = q; g.connect(fl); fl.connect(bus); } else g.connect(bus);
      o.start(at); o.stop(at + dur + 0.05);
    }
    function noise({ at, dur = 0.2, vol = 0.2, type = 'bandpass', f = 1200, q = 1 }) {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      s.connect(fl).connect(g).connect(bus); s.start(at, rnd() * 0.5); s.stop(at + dur + 0.05);
    }
    const EIGHTH = 60 / BPM / 2;
    const CHORDS = [{ notes: [53, 57, 60, 64], bass: 41 }, { notes: [50, 53, 57, 60], bass: 38 }, { notes: [55, 58, 62, 65], bass: 43 }, { notes: [52, 55, 58, 60], bass: 36 }];
    const MELODY = [72, 74, 77, 79, 81, 84];
    let lastMel = 77;
    for (let step = 0, t = 0.05; t < SECONDS; step++, t += EIGHTH) {
      const ch = CHORDS[Math.floor(step / 8) % 4], pos = step % 8;
      const at = t + (pos % 2 ? EIGHTH * 0.18 : 0);
      if (pos === 0) ch.notes.forEach((m, i) => tone({ f: hz(m), type: i % 2 ? 'triangle' : 'sine', at: at + i * 0.012, dur: EIGHTH * 7, vol: 0.07, attack: 0.03, detune: (i - 1.5) * 4, q: 1600 }));
      if (pos === 5 && rnd() < 0.6) ch.notes.slice(1).forEach(m => tone({ f: hz(m + 12), at, dur: EIGHTH * 2.5, vol: 0.035, attack: 0.02 }));
      if (pos === 0 || pos === 4) tone({ f: hz(ch.bass), type: 'triangle', at, dur: EIGHTH * 3, vol: 0.2, attack: 0.01, q: 500 });
      if (pos === 7 && rnd() < 0.5) tone({ f: hz(ch.bass + 7), type: 'triangle', at, dur: EIGHTH, vol: 0.12, q: 500 });
      if (pos === 0 || pos === 4) tone({ f: 110, f2: 45, at, dur: 0.25, vol: 0.32 });
      if (pos === 2 || pos === 6) noise({ at, dur: 0.12, vol: 0.08, f: 1800, q: 1.5 });
      noise({ at, dur: 0.05, vol: pos % 2 ? 0.022 : 0.036, type: 'highpass', f: 7000 });
      if (rnd() < (pos % 2 ? 0.22 : 0.5)) {
        const idx = MELODY.indexOf(lastMel);
        lastMel = MELODY[Math.max(0, Math.min(MELODY.length - 1, idx + Math.floor(rnd() * 3) - 1))];
        tone({ f: hz(lastMel), at, dur: 0.4, vol: 0.08 });
        tone({ f: hz(lastMel + 12), at, dur: 0.12, vol: 0.025 });
      }
    }
    const buf = await ctx.startRendering();
    return [Array.from(buf.getChannelData(0)), Array.from(buf.getChannelData(1))];
  }, [SECONDS, BPM]);
  await browser.close();
  // 16-bit stereo WAV
  const n = chans[0].length, data = Buffer.alloc(n * 4);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(chans[0][i]), Math.abs(chans[1][i]));
  const gain = peak > 0 ? 0.89 / peak : 1;
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, chans[0][i] * gain)) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, chans[1][i] * gain)) * 32767), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(44100, 24);
  h.writeUInt32LE(44100 * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(__dirname + '/music.wav', Buffer.concat([h, data]));
  console.log(`music.wav ${SECONDS} s, ${BPM} BPM, Pegel x${gain.toFixed(2)}`);
})();
