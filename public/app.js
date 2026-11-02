(function () {
  'use strict';
  const E = window.SmashEngine;
  const A = window.Art;
  const T = E.TYPES;
  const S = window.SmashShop;
  const app = document.getElementById('app');
  const sheet = document.getElementById('sheet');
  const toastEl = document.getElementById('toast');
  const CONFIG = window.SMASH_CONFIG || {};
  const SERVER = CONFIG.server || '';
  const LS_SESSION = 'pizzapanic.session';
  const LS_NAME = 'pizzapanic.name';
  const LS_PROFILE = 'pizzapanic.profile';
  const LS_TUT = 'pizzapanic.tutstep';
  const LS_LANG = 'pizzapanic.lang';

  // ---------- Sprache ----------
  // Saved choice first, otherwise the phone's language (English if none of ours fits).
  let savedLang = null;
  try { savedLang = localStorage.getItem(LS_LANG); } catch { /* ignore */ }
  I18n.setLang(savedLang || I18n.detect(navigator.languages || [navigator.language]));
  // `t` is a common local name in this file (types, trays, themes), so the translator is called tr().
  const tr = (k, p) => I18n.t(k, p);
  // <html lang> plus the few labels that style.css draws itself (content: var(--t-…)).
  function applyLang() {
    const root = document.documentElement;
    root.lang = I18n.lang();
    for (const k of ['order', 'board', 'action']) root.style.setProperty(`--t-${k}`, JSON.stringify(tr('css.' + k)));
  }
  applyLang();
  const ingName = type => tr((T[type] && T[type].kind === 'act' ? 'act.' : 'ing.') + type);
  const actDesc = type => tr('act.' + type + '.desc');
  const recipeName = i => tr('recipe.' + E.RECIPES[i].id);
  const themeName = id => tr('theme.' + id);
  const accOf = type => tr('acc.' + type);
  // Stack description in the log / banners: { r } finished pizza, { t } single card, { n } half pizza.
  function labelText(label) {
    if (!label) return '';
    if (label.r != null) return tr('label.done', { recipe: recipeName(label.r) });
    if (label.t != null) return ingName(label.t);
    return tr('label.half', { n: label.n });
  }

  let session = null;
  try { session = JSON.parse(localStorage.getItem(LS_SESSION)); } catch { /* ignore */ }
  let profileKey = null; // { id, token } – identifies this device's player
  try { profileKey = JSON.parse(localStorage.getItem(LS_PROFILE)); } catch { /* ignore */ }
  let profile = null; // latest profile data from the server (name, xp, …)
  let profileLoading = !!profileKey;
  let mm = null; // quick-match search state
  let view = null;
  let es = null;
  let ui = freshUi();
  let sheetKind = null; // 'info' sheets survive state updates, 'ctx' sheets belong to the current move
  let lastLogN = 0;
  let wasMyTurn = false;

  function freshUi() {
    return { sel: null, mode: null, steal: null, dig: null };
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Game log entries are language-neutral { n, k, p } (see engine.js log()); this turns one into a sentence.
  // html = true: player names (and the other inserted values) are escaped for innerHTML.
  function logText(entry, html) {
    if (!entry) return '';
    if (!entry.k) return html ? esc(entry.text || '') : entry.text || '';
    const v = s => (html ? esc(s) : String(s));
    const p = entry.p || {};
    const q = {};
    if (p.who != null) q.who = v(p.who);
    if (p.victim != null) q.victim = v(p.victim);
    if (p.card != null) q.card = v(ingName(p.card));
    if (p.recipe != null) q.recipe = v(recipeName(p.recipe));
    if (p.label != null) q.label = v(labelText(p.label));
    if (entry.k === 'log.steal') {
      q.from = p.from == null ? tr('log.steal.fromOwn') : tr('log.steal.from', { name: v(p.from) });
      q.to = p.to == null ? tr('log.steal.toOwn') : tr('log.steal.to', { name: v(p.to) });
    }
    return tr(entry.k, q);
  }

  // ---------- Netzwerk ----------

  // The free server sleeps when idle and needs ~20–40 s to wake up. Instead of a dry hint we show a loading
  // screen: the logo fills up with colour, a bar runs and funny kitchen messages rotate (Sims-style).
  // It only appears if the server doesn't answer within a moment.
  // The rotating lines live in the dictionary as one array ('loader.lines'), read fresh so a language switch applies.
  const loadingLines = () => { const l = tr('loader.lines'); return Array.isArray(l) ? l : [l]; };
  const loaderEl = document.getElementById('loader');
  let serverAwake = false;
  let waking = null;
  let loaderLineTimer = null;

  function showLoader() {
    if (!loaderEl.classList.contains('hidden')) return;
    const lines = loadingLines().slice().sort(() => Math.random() - 0.5);
    let k = 0;
    loaderEl.innerHTML = `
      <div class="loader-box">
        <div class="loader-logo">
          <img class="ghost" src="img/logo.png" alt="">
          <img class="fill" src="img/logo.png" alt="Pizza Panic">
        </div>
        <div class="loader-bar"><i></i></div>
        <p class="loader-line">${lines[0]}</p>
        <small>${tr('loader.sleepy')}</small>
      </div>`;
    loaderEl.classList.remove('hidden', 'done');
    requestAnimationFrame(() => requestAnimationFrame(() => loaderEl.classList.add('run')));
    const lineEl = loaderEl.querySelector('.loader-line');
    loaderLineTimer = setInterval(() => {
      lineEl.classList.add('out');
      setTimeout(() => {
        k = (k + 1) % lines.length;
        lineEl.textContent = lines[k];
        lineEl.classList.remove('out');
      }, 300);
    }, 2600);
  }

  function hideLoader() {
    clearInterval(loaderLineTimer);
    if (loaderEl.classList.contains('hidden')) return;
    loaderEl.classList.add('done'); // bar and logo jump to full
    setTimeout(() => loaderEl.classList.add('hidden'), 650);
    setTimeout(() => loaderEl.classList.remove('run', 'done'), 700);
  }

  function wakeServer() {
    if (waking) return waking;
    const slow = setTimeout(showLoader, 700);
    const attempt = () => fetch(SERVER + '/api/health', { cache: 'no-store' }).then(r => {
      if (!r.ok) throw new Error('not ready');
    });
    waking = (async () => {
      for (;;) {
        try {
          await attempt();
          break;
        } catch {
          await new Promise(r => setTimeout(r, 2500));
        }
      }
      serverAwake = true;
      clearTimeout(slow);
      hideLoader();
      waking = null;
    })();
    return waking;
  }

  async function post(path, body) {
    const r = await fetch(SERVER + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let j = {};
    try { j = await r.json(); } catch { /* ignore */ }
    if (!r.ok || j.error) {
      // The server answers with a key (err.xxx) and optional params; e.key keeps it for checks, e.message is translated.
      const key = j.error || 'net.problem';
      const err = new Error(errText(key, j.params));
      err.key = key;
      err.params = j.params;
      err.view = j.view;
      throw err;
    }
    return j;
  }

  function errText(key, params) {
    if (typeof key !== 'string') return String(key);
    if (key === 'err.doublesUsed') params = { n: S.DOUBLES_PER_DAY, ...(params || {}) };
    return /^(err|net)\./.test(key) ? tr(key, params) : key;
  }

  // Views arrive both over the live connection and as action replies; never go back to an older one.
  function applyView(v) {
    if (!v) return;
    // The same version arrives twice (live event + action reply); redrawing it again would cut animations short.
    if (view && v.code === view.code && v.version <= view.version) return;
    view = v;
    onView();
  }

  function saveSession(s) {
    session = s;
    if (s) localStorage.setItem(LS_SESSION, JSON.stringify(s));
    else localStorage.removeItem(LS_SESSION);
  }

  function connect() {
    if (es) es.close();
    const q = new URLSearchParams(session).toString();
    es = new EventSource(SERVER + '/api/events?' + q);
    lastMsg = Date.now();
    es.onmessage = e => {
      lastMsg = Date.now();
      applyView(JSON.parse(e.data));
    };
    es.addEventListener('ping', () => { lastMsg = Date.now(); });
    es.addEventListener('gone', () => {
      es.close();
      es = null;
      saveSession(null);
      view = null;
      closeSheet();
      toast(tr('toast.gone'));
      render();
    });
  }

  function send(action) {
    ui = freshUi();
    if (sheetKind === 'ctx') closeSheet();
    render();
    return post('/api/action', { ...session, action })
      .then(j => applyView(j.view))
      .catch(e => {
        applyView(e.view);
        toast(e.message);
      });
  }

  // Phones silently drop live connections (screen off, network switch): reconnect when pings stop.
  let lastMsg = 0;
  setInterval(() => {
    if (session && es && Date.now() - lastMsg > 25000) connect();
  }, 5000);
  let hiddenSince = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenSince = Date.now(); return; }
    // After a long break the server may have fallen asleep again.
    if (hiddenSince && Date.now() - hiddenSince > 10 * 60000) wakeServer();
    if (session) connect();
  });
  window.addEventListener('online', () => { if (session) connect(); });

  // ---------- Profil & Level ----------

  const withProfile = body => ({ ...body, profileId: profileKey && profileKey.id, profileToken: profileKey && profileKey.token });

  function dropProfile() {
    profileKey = null;
    profile = null;
    localStorage.removeItem(LS_PROFILE);
  }

  async function loadProfile() {
    if (!profileKey) { profileLoading = false; return render(); }
    try {
      profile = (await post('/api/profile/get', withProfile({}))).profile;
    } catch (e) {
      if (e.key === 'err.profileMissing') dropProfile();
      else setTimeout(loadProfile, 4000); // server still waking up
    }
    profileLoading = false;
    if (!session && !joining) render();
  }

  async function createProfile() {
    const name = (document.getElementById('name').value || '').trim();
    if (!name) return toast(tr('err.nameMissing'));
    try {
      const r = await post('/api/profile/create', { name });
      profileKey = { id: r.profile.id, token: r.token };
      localStorage.setItem(LS_PROFILE, JSON.stringify(profileKey));
      localStorage.setItem(LS_NAME, name);
      profile = r.profile;
      render();
    } catch (e) {
      toast(e.message);
    }
  }

  function levelBadge(level) {
    return `<span class="lv" title="${tr('level.badge', { level })}">${level}</span>`;
  }

  function xpBar(info, cls) {
    return `<div class="xpbar ${cls || ''}"><i style="width:${Math.round(info.into / info.need * 100)}%"></i><span>${info.into} / ${info.need} XP</span></div>`;
  }

  // Server answered "profile missing": start over with a new profile.
  function handleMissing(e) {
    if (e && e.key === 'err.relogin') {
      dropProfile();
      render();
      return true;
    }
    return false;
  }

  // While a table is being joined, background refreshes must not redraw the main menu (no flicker).
  let joining = false;
  async function joinTable(path, body) {
    joining = true;
    try {
      const r = await post(path, withProfile(body || {}));
      saveSession(r);
      closeSheet();
      history.replaceState(null, '', '?room=' + r.code);
      connect();
      render(); // "Tisch wird gedeckt" until the first table state arrives
    } catch (e) {
      if (!handleMissing(e)) toast(e.message);
      render();
    } finally {
      joining = false;
    }
  }

  // ---------- Werbung & Käufe (nur in der Android-App) ----------
  // Rewarded videos via @capacitor-community/admob, Google Play purchases via @capgo/native-purchases.
  // ADS_TEST_MODE true = only Google test ads. Own devices in TEST_DEVICES always get test ads
  // (clicking real ads on your own phone can get the AdMob account banned). Same device list as Atomic Nerds.

  const Cap = window.Capacitor;
  const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const AdMob = isNative && Cap.Plugins.AdMob;
  const Billing = isNative && Cap.Plugins.NativePurchases;
  const ADS_TEST_MODE = false;
  const TEST_DEVICES = ['C1826DA99F63CA2DC8FAE78CDC606204']; // Galaxy Fold (JMD)
  const REWARDED_ID = { test: 'ca-app-pub-3940256099942544/5224354917', live: 'ca-app-pub-2648510730204337/1514901729' };
  let adsReady = null;
  let adsNpa = false;
  const iapPrices = {};

  function initAds() {
    if (!AdMob) return Promise.resolve(false);
    adsReady = adsReady || (async () => {
      try {
        // initializeForTesting only applies testingDevices to the listed phones; everybody else gets real ads.
        await AdMob.initialize({ initializeForTesting: true, testingDevices: TEST_DEVICES, maxAdContentRating: 'Teen' });
      } catch (e) {
        console.warn('[ads] init', e);
        return false;
      }
      try {
        let info = await AdMob.requestConsentInfo();
        if (info.isConsentFormAvailable && info.status === 'REQUIRED') info = await AdMob.showConsentForm();
        return info.canRequestAds !== false;
      } catch (e) {
        adsNpa = true; // no consent message set up: non-personalised ads only
        return true;
      }
    })();
    return adsReady;
  }

  // 'rewarded' = watched to the end, 'cancelled', 'unavailable'
  async function showRewarded() {
    if (!(await initAds())) return 'unavailable';
    const adId = ADS_TEST_MODE || !REWARDED_ID.live ? REWARDED_ID.test : REWARDED_ID.live;
    const handles = [];
    try {
      await AdMob.prepareRewardVideoAd({ adId, isTesting: ADS_TEST_MODE, npa: adsNpa });
      let rewarded = false;
      let done;
      const closed = new Promise(r => { done = r; });
      handles.push(await AdMob.addListener('onRewardedVideoAdReward', () => { rewarded = true; }));
      handles.push(await AdMob.addListener('onRewardedVideoAdDismissed', () => done('closed')));
      handles.push(await AdMob.addListener('onRewardedVideoAdFailedToShow', () => done('failed')));
      await AdMob.showRewardVideoAd();
      if ((await closed) === 'failed') return 'unavailable';
      return rewarded ? 'rewarded' : 'cancelled';
    } catch (e) {
      console.warn('[ads] rewarded', e);
      return 'unavailable';
    } finally {
      handles.forEach(h => h && h.remove && h.remove());
    }
  }

  async function loadIapPrices() {
    if (!Billing) return;
    try {
      const { products } = await Billing.getProducts({ productIdentifiers: S.IAP.map(p => p.id), productType: 'inapp' });
      for (const p of products || []) if (p.priceString) iapPrices[p.identifier] = p.priceString;
    } catch (e) {
      console.warn('[billing] products', e);
    }
  }

  // Hands a Google Play purchase to the server (once per token); coin packs are then consumed so they can be bought again.
  async function redeem(productId, purchaseToken) {
    const r = await post('/api/iap/grant', withProfile({ product: productId, purchaseToken }));
    profile = r.profile;
    const item = S.iapById(productId);
    if (item && consumable(item)) await Billing.consumePurchase({ purchaseToken }).catch(e => console.warn('[billing] consume', e));
    return r.granted;
  }

  // Coin packs can be bought again and again; supporter status and theme packs are bought once.
  const consumable = item => !item.supporter && !item.theme;

  async function buyIap(productId) {
    if (!Billing) return toast(tr('toast.coinsInApp'));
    const item = S.iapById(productId);
    try {
      const t = await Billing.purchaseProduct({
        productIdentifier: productId, productType: 'inapp', quantity: 1,
        ...(consumable(item) ? { isConsumable: false, autoAcknowledgePurchases: false } : {}),
      });
      if (t.purchaseState !== '1' || !t.purchaseToken) return toast(tr('toast.purchasePending'));
      await redeem(productId, t.purchaseToken);
      celebrate(item.supporter ? tr('toast.thanksSupport') : item.theme ? `${E.THEMES[item.theme].icon} ${tr('toast.unlocked')}` : `+${item.coins} 🪙`);
      render();
    } catch (e) {
      if (!/cancel/i.test(String((e && e.message) || e))) toast(tr('toast.purchaseFailed'));
    }
  }

  // Picks up purchases that never reached the server (app closed mid-purchase, pending payments, reinstall).
  async function recoverPurchases() {
    if (!Billing || !profileKey) return;
    try {
      const { purchases } = await Billing.getPurchases({ productType: 'inapp' });
      for (const t of purchases || []) {
        if (t.purchaseState === '1' && t.purchaseToken && S.iapById(t.productIdentifier)) await redeem(t.productIdentifier, t.purchaseToken);
      }
      if (!session) render();
    } catch (e) {
      console.warn('[billing] recover', e);
    }
  }

  async function watchForCoins() {
    const res = await showRewarded();
    if (res === 'unavailable') return toast(tr('toast.noVideo'));
    if (res !== 'rewarded') return;
    try {
      profile = (await post('/api/ads/coins', withProfile({}))).profile;
      celebrate(`+${S.AD_COINS} 🪙`);
      render();
    } catch (e) {
      toast(e.message);
    }
  }

  async function doubleReward() {
    if (!profile.supporter) {
      const res = await showRewarded();
      if (res === 'unavailable') return toast(tr('toast.noVideo'));
      if (res !== 'rewarded') return;
    }
    await send({ type: 'double' });
    loadProfile();
  }

  function celebrate(text) {
    Snd.play('coin');
    const el = document.createElement('div');
    el.className = 'celebrate';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1900);
  }

  // ---------- Schnelles Spiel (Matchmaking) ----------

  let mmTimer = null;
  // ---------- Schnelles Spiel: echte Spieler oder sofort gegen Bots ----------

  const LS_BOTS = 'pizzapanic.bots';
  let botCfg = { skill: 'normal', opponents: 2, theme: '' };
  try { botCfg = { ...botCfg, ...JSON.parse(localStorage.getItem(LS_BOTS)) }; } catch { /* ignore */ }

  // Names and notes come from the dictionary: quick.skill.<id> / quick.skill.<id>.note
  const SKILLS = [
    { id: 'easy', icon: '😊' },
    { id: 'normal', icon: '🙂' },
    { id: 'hard', icon: '😈' },
  ];

  function quickSheet() {
    const themes = Object.entries(E.THEMES).filter(([id]) => S.ownsTheme(profile, id));
    const seg = (key, items) => `<div class="seg">${items.map(it =>
      `<button class="${String(botCfg[key]) === String(it.id) ? 'on' : ''}" data-do="botCfg" data-key="${key}" data-id="${it.id}">${it.label}</button>`).join('')}</div>`;
    openSheet(`<h2>⚡ ${tr('quick.title')}</h2>
      <button class="mode-card" data-do="quickReal">
        <span class="mb-ico">👥</span><span><b>${tr('quick.real')}</b><small>${tr('quick.real.sub')}</small></span>
      </button>
      <div class="mode-card bots">
        <div class="mc-head"><span class="mb-ico">🤖</span><span><b>${tr('quick.bots')}</b><small>${tr('quick.bots.sub')}</small></span></div>
        <div class="tc-label">${tr('quick.skill')}</div>
        ${seg('skill', SKILLS.map(s => ({ id: s.id, label: `${s.icon} ${tr('quick.skill.' + s.id)}` })))}
        <p class="note">${esc(tr('quick.skill.' + botCfg.skill + '.note'))}</p>
        <div class="tc-label">${tr('quick.opponents')}</div>
        ${seg('opponents', [1, 2, 3].map(n => ({ id: n, label: tr(n > 1 ? 'quick.bots.other' : 'quick.bots.one', { n }) })))}
        ${themes.length ? `<div class="tc-label">${tr('quick.theme')}</div>
          ${seg('theme', [{ id: '', label: `🍕 ${tr('theme.classic')}` }].concat(themes.map(([id, t]) => ({ id, label: `${t.icon} ${esc(themeName(id))}` }))))}` : ''}
        <button class="btn primary big" data-do="startBots">🤖 ${tr('quick.go')}</button>
      </div>`, 'info', 'quick');
  }

  function startBots() {
    localStorage.setItem(LS_BOTS, JSON.stringify(botCfg));
    if (botCfg.theme && !S.ownsTheme(profile, botCfg.theme)) botCfg.theme = '';
    return joinTable('/api/bots', { skill: botCfg.skill, opponents: botCfg.opponents, theme: botCfg.theme || null });
  }

  async function startQuick() {
    try {
      mm = { status: await post('/api/quick/join', withProfile({})) };
      render();
      pollQuick();
    } catch (e) {
      if (!handleMissing(e)) toast(e.message);
    }
  }

  async function pollQuick() {
    clearTimeout(mmTimer);
    if (!mm) return;
    try {
      const st = await post('/api/quick/status', withProfile({}));
      if (!mm) return;
      if (st.state === 'matched') {
        mm = null;
        saveSession({ code: st.code, pid: st.pid, token: st.token });
        history.replaceState(null, '', '?room=' + st.code);
        connect();
        return;
      }
      if (st.state === 'none') return startQuick();
      mm.status = st;
      render();
    } catch { /* try again */ }
    mmTimer = setTimeout(pollQuick, 1500);
  }

  function cancelQuick() {
    clearTimeout(mmTimer);
    mm = null;
    post('/api/quick/leave', withProfile({})).catch(() => {});
    render();
  }

  // nextGame: going straight into another game – show "table is being set" instead of the main menu meanwhile.
  function leaveTable(nextGame) {
    const done = post('/api/action', { ...session, action: { type: 'leave' } }).catch(() => {});
    if (es) es.close();
    es = null;
    saveSession(null);
    view = null;
    tutStep = null;
    closeSheet();
    hideCoach();
    history.replaceState(null, '', '/');
    if (nextGame) renderJoining();
    else render();
    return done.then(loadProfile);
  }

  // ---------- Hilfsfunktionen ----------

  const game = () => view && view.game;
  const me = () => view.you;
  const myTurn = () => { const g = game(); return g && g.winner == null && g.current === me(); };
  const myHand = () => game().players[me()].hand || [];
  const recipesOf = g => g.recipes;

  function findCard(id) {
    return myHand().find(c => c.id === id);
  }

  function twinOf(card) {
    return card && myHand().find(c => c.id !== card.id && c.t === card.t);
  }

  function canPair(card) {
    const g = game();
    return myTurn() && !g.pending && twinOf(card) && g.played + 2 <= E.MAX_PLAYS &&
      g.players.some((p, i) => i !== me() && p.handCount > 0);
  }

  function stealSources() {
    const g = game(), R = recipesOf(g), out = [];
    g.players.forEach((src, sp) => src.tray.forEach((st, si) => {
      const opts = stealOptions(sp, si);
      if (opts.whole.length || opts.top.length) out.push(`${sp}:${si}`);
    }));
    return out;
  }

  function stealOptions(sp, si) {
    const g = game(), R = recipesOf(g);
    const st = g.players[sp].tray[si];
    const res = { whole: [], top: [] };
    const complete = E.completeRecipe(st, R) >= 0;
    g.players.forEach((d, dp) => {
      if (dp === sp) return;
      if (complete && E.trayValid(E.withAdded(d.tray, st, 'new'), R)) res.whole.push(`${dp}:new`);
      for (const tg of E.placeTargets(d.tray, [st[st.length - 1]], R)) res.top.push(`${dp}:${tg}`);
    });
    return res;
  }

  // In the tutorial only the spots Luigi is currently talking about light up.
  function targets() {
    const all = rawTargets();
    const step = tutActive();
    if (!step) return all;
    return new Set([...all].filter(k => (step.spots ? step.spots(k) : !step.next)));
  }

  function rawTargets() {
    const g = game();
    if (!g || !myTurn()) return new Set();
    const R = recipesOf(g);
    const mine = g.players[me()].tray;
    if (ui.mode === 'place') {
      const c = findCard(ui.sel);
      return new Set(c ? E.placeTargets(mine, [c], R).map(t => `${me()}:${t}`) : []);
    }
    if (ui.mode === 'digPick') {
      const c = g.trash.find(x => x.id === ui.dig);
      return new Set(c ? E.placeTargets(mine, [c], R).map(t => `${me()}:${t}`) : []);
    }
    if (ui.mode === 'burn') {
      const s = new Set();
      g.players.forEach((p, i) => p.tray.forEach((_, si) => s.add(`${i}:${si}`)));
      return s;
    }
    if (ui.mode === 'stealSrc') return new Set(stealSources());
    if (ui.mode === 'stealDst') {
      const o = stealOptions(ui.steal.from.player, ui.steal.from.stack);
      return new Set(ui.steal.mode === 'whole' ? o.whole : o.top);
    }
    return new Set();
  }

  function stackLabel(st, R) {
    const done = E.completeRecipe(st, R);
    if (done >= 0) return `✓ ${recipeName(done)}`;
    return E.candidates(st, R).map(recipeName).join(' / ');
  }

  // ---------- Rendering ----------

  function render() {
    document.body.classList.toggle('in-game', !!game());
    // Themed tables get the pack's background (lobby and game).
    const theme = session && view ? (game() ? game().theme : view.theme) : null;
    if ((document.body.dataset.theme || '') !== (theme || '')) document.body.dataset.theme = theme || '';
    // Joined a table but its first state hasn't arrived yet: show a short "table is being set" screen
    // instead of flashing the main menu.
    if (session && !view) {
      hideCoach();
      return renderJoining();
    }
    if (session && view) {
      tutAdvance();
      if (view.phase === 'lobby') renderLobby();
      else renderGame();
      return renderCoach();
    }
    hideCoach();
    if (profileLoading) return renderLoading();
    if (!profile) return renderOnboarding();
    if (mm) return renderMatching();
    if (shopTab) return renderShop();
    renderHome();
  }

  // ---------- Shop ----------

  let shopTab = null; // null = shop closed, else 'trays' | 'emotes' | 'coins'

  function coinChip() {
    return `<span class="coins">🪙 <b>${profile.coins || 0}</b></span>`;
  }

  function traySwatch(id) {
    return `<div class="swatch tray skin-${id}"><div class="stack"><div class="stack-cards">${A.icon('sauce', 18)}${A.icon('basil', 18)}${A.icon('mozzarella', 18)}</div></div></div>`;
  }

  function renderShop() {
    const eq = (profile.equipped && profile.equipped.tray) || 'classic';
    const adsLeft = S.COIN_ADS_PER_DAY - (profile.coinAdsToday || 0);
    let body = '';
    if (shopTab === 'themes') {
      body = `<p class="note center">${tr('shop.themes.intro')}</p>
        ${S.themePacks().map(p => {
          const t = E.THEMES[p.theme];
          const owned = S.ownsTheme(profile, p.theme);
          const ings = Object.entries(T).filter(([, d]) => d.theme === p.theme);
          const specials = E.themeRecipes(p.theme).map(i => E.RECIPES[i]);
          const btn = owned ? `<span class="pill ok">✓ ${tr('shop.bought')}</span>`
            : isNative ? `<button class="btn primary" data-do="buyIap" data-id="${p.id}">${esc(iapPrices[p.id] || p.price)}</button>`
            : `<span class="pill">${tr('shop.inApp', { price: esc(p.price) })}</span>`;
          return `<div class="theme-card ${owned ? 'owned' : ''}">
            <div class="tc-banner" style="background-image:url(img/bg-${p.theme}-thumb.webp)"><span>${t.icon}</span><b>${esc(themeName(p.theme))}</b></div>
            <div class="tc-body">
              <div class="tc-label">${tr('shop.newIngredients')}</div>
              <div class="tc-ings">${ings.map(([type, d]) => `<span>${A.icon(d.layers[0], 30)}<small>${esc(ingName(type))}</small></span>`).join('')}</div>
              <div class="tc-label">${tr('shop.specials')}</div>
              ${specials.map(r => `<div class="tc-recipe"><b>${esc(tr('recipe.' + r.id))}</b><span>${r.layers.map(l => A.icon(l, 20)).join('')}</span></div>`).join('')}
              <div class="tc-foot">${btn}</div>
            </div>
          </div>`;
        }).join('')}`;
    } else if (shopTab === 'trays') {
      const lv = E.levelInfo(profile.xp).level;
      body = `<p class="note center">${tr('shop.trays.intro', { level: lv })}</p>
        <div class="shop-grid">${S.TRAYS.map(t => {
        const owned = S.ownsTray(profile, t.id, lv);
        const lockedBy = t.reward && lv < t.reward ? t.reward : t.level && lv < t.level && !owned ? t.level : 0;
        const btn = eq === t.id ? `<span class="pill ok">✓ ${tr('shop.used')}</span>`
          : owned ? `<button class="btn small" data-do="equipTray" data-id="${t.id}">${tr('shop.use')}</button>`
          : t.supporter ? `<span class="pill">⭐ ${tr('shop.supporterOnly')}</span>`
          : t.reward ? `<span class="pill">🏅 ${tr('shop.freeFromLevel', { level: t.reward })}</span>`
          : lockedBy ? `<span class="pill lock">🔒 ${tr('shop.fromLevel', { level: lockedBy })}</span>`
          : `<button class="btn small primary" data-do="buyItem" data-id="tray:${t.id}" ${profile.coins < t.price ? 'disabled' : ''}>🪙 ${t.price}</button>`;
        return `<div class="shop-item ${eq === t.id ? 'on' : ''} ${lockedBy ? 'locked' : ''}">${traySwatch(t.id)}<b>${esc(tr('tray.' + t.id))}</b>${btn}</div>`;
      }).join('')}</div>`;
    } else if (shopTab === 'emotes') {
      const groups = [{ pack: 'free', price: 0 }].concat(S.PACKS);
      body = groups.map(g => {
        const owned = S.ownsPack(profile, g.pack);
        const btn = owned ? `<span class="pill ok">✓ ${tr('shop.unlocked')}</span>`
          : g.supporter ? `<span class="pill">⭐ ${tr('shop.supporterOnly')}</span>`
          : `<button class="btn small primary" data-do="buyItem" data-id="pack:${g.id}" ${profile.coins < g.price ? 'disabled' : ''}>🪙 ${g.price}</button>`;
        return `<div class="emote-pack"><div class="ep-head"><b>${esc(g.id ? tr('pack.' + g.id) : tr('shop.free'))}</b>${btn}</div>
          <div class="ep-list">${S.EMOTES.filter(e => e.pack === g.pack).map(e => `<span class="emote-chip">${e.icon} ${esc(tr('emote.' + e.id))}</span>`).join('')}</div></div>`;
      }).join('');
    } else {
      const sup = S.IAP.find(p => p.supporter);
      body = `
        ${isNative ? `
          <button class="shop-video" data-do="adCoins" ${adsLeft <= 0 ? 'disabled' : ''}>
            <span>📺</span><span><b>${tr('shop.video', { coins: S.AD_COINS })}</b><small>${adsLeft > 0 ? tr(adsLeft > 1 ? 'shop.videosLeft.other' : 'shop.videosLeft.one', { n: adsLeft }) : tr('shop.videosTomorrow')}</small></span>
          </button>` : ''}
        <div class="shop-grid">${S.IAP.filter(p => !p.supporter).map(p => `
          <div class="shop-item coin-pack">${p.tag ? `<span class="tag">${tr('iap.tag.' + p.tag)}</span>` : ''}
            <div class="coin-big">🪙</div><b>${p.theme ? esc(themeName(p.theme)) : tr('iap.' + p.id)}</b>
            <button class="btn small primary" data-do="buyIap" data-id="${p.id}">${esc(iapPrices[p.id] || p.price)}</button>
          </div>`).join('')}</div>
        <div class="supporter-card ${profile.supporter ? 'on' : ''}">
          <img src="img/chef-cheer.png" alt="">
          <div>
            <h3>⭐ ${tr('shop.sup.title')}</h3>
            <ul>
              <li>${tr('shop.sup.perk1')}</li>
              <li>${tr('shop.sup.perk2')}</li>
              <li>${tr('shop.sup.perk3')}</li>
              <li>${tr('shop.sup.perk4', { coins: sup.coins })}</li>
            </ul>
            ${profile.supporter ? `<span class="pill ok">${tr('shop.sup.thanks')}</span>`
              : `<button class="btn primary" data-do="buyIap" data-id="${sup.id}">${tr('shop.sup.buy', { price: esc(iapPrices[sup.id] || sup.price) })}</button>`}
          </div>
        </div>
        ${!isNative ? `<p class="note center">${tr('shop.coinsInApp')}</p>` : ''}`;
    }
    app.innerHTML = `
      <div class="home shop">
        <div class="shop-top">
          <button class="tbtn" data-do="closeShop">← ${tr('shop.back')}</button>
          <h2>🛒 ${tr('shop.title')}</h2>
          ${coinChip()}
        </div>
        <div class="tabs">
          <button class="${shopTab === 'themes' ? 'on' : ''}" data-do="shopTab" data-id="themes">${tr('shop.tab.themes')}</button>
          <button class="${shopTab === 'trays' ? 'on' : ''}" data-do="shopTab" data-id="trays">${tr('shop.tab.trays')}</button>
          <button class="${shopTab === 'emotes' ? 'on' : ''}" data-do="shopTab" data-id="emotes">${tr('shop.tab.emotes')}</button>
          <button class="${shopTab === 'coins' ? 'on' : ''}" data-do="shopTab" data-id="coins">${tr('shop.tab.coins')}</button>
        </div>
        ${body}
        <p class="note center">${tr('shop.coinsInfo')}</p>
      </div>`;
  }

  async function shopPost(path, body) {
    try {
      profile = (await post(path, withProfile(body))).profile;
      render();
      return true;
    } catch (e) {
      if (!handleMissing(e)) toast(e.message);
      return false;
    }
  }

  const roomParam = () => (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  const privacyUrl = () => (SERVER ? CONFIG.publicUrl : '') + '/datenschutz.html';
  const legalLinks = () => `<div class="legal-links">
      <a class="link small" href="${esc(privacyUrl())}" target="_blank" rel="noopener">${tr('legal.privacy')}</a>
      <a class="link small" href="${esc(privacyUrl().replace('datenschutz', 'impressum'))}" target="_blank" rel="noopener">${tr('legal.imprint')}</a>
    </div>`;

  function renderJoining() {
    app.innerHTML = `<div class="home joining"><img class="chef-big bob" src="img/chef-wave.png" alt=""><h2>${tr('lobby.joining')}</h2><div class="mm-dots"><i></i><i></i><i></i></div></div>`;
  }

  function renderLoading() {
    app.innerHTML = `<div class="home"><img class="logo-img" src="img/logo.png" alt="Pizza Panic"><p class="wait">${tr('loader.preheat')}</p></div>`;
  }

  function renderOnboarding() {
    app.innerHTML = `
      <div class="home">
        <img class="logo-img" src="img/logo.png" alt="Pizza Panic">
        <p class="tagline">${tr('onboard.tagline')}</p>
        <div class="panel chef-panel">
          <img class="chef-peek" src="img/chef-wave.png" alt="">
          <h2>${tr('onboard.welcome')}</h2>
          <p class="note">${tr('onboard.ask')}</p>
          <input id="name" maxlength="18" autocomplete="nickname" value="${esc(localStorage.getItem(LS_NAME) || '')}" placeholder="${esc(tr('onboard.placeholder'))}">
          <button class="btn primary big" data-do="onboard">${tr('onboard.go')}</button>
        </div>
        <button class="link" data-do="lang">🌐 ${esc(I18n.LANGS[I18n.lang()])}</button>
        ${legalLinks()}
      </div>`;
  }

  function renderHome() {
    const info = E.levelInfo(profile.xp);
    const room = roomParam();
    app.innerHTML = `
      <div class="home">
        <img class="logo-img small" src="img/logo.png" alt="Pizza Panic">
        <div class="profile-card">
          <div class="pc-top">
            <div class="pc-lv">${levelBadge(info.level)}</div>
            <div class="pc-main">
              <div class="pc-name">${esc(profile.name)}${profile.supporter ? ` <span title="${esc(tr('profile.supporter'))}">⭐</span>` : ''} <button class="icon-btn" data-do="editName" aria-label="${esc(tr('profile.editName'))}">✏️</button></div>
              <div class="pc-title">${esc(tr(info.titleKey))}</div>
              ${xpBar(info)}
            </div>
          </div>
          <div class="pc-stats"><span>${tr('profile.games', { n: `<b>${profile.games}</b>` })}</span><span>${tr('profile.wins', { n: `<b>${profile.wins}</b>` })}</span><span class="spacer"></span>${coinChip()}</div>
        </div>
        ${room ? `
          <div class="invite">
            <p>${tr('home.invited', { code: `<b>${esc(room)}</b>` })}</p>
            <button class="btn primary big" data-do="joinInvite">${tr('home.joinInvite')}</button>
          </div>` : ''}
        ${!profile.tutorialDone ? `
          <div class="panel chef-panel tut-card">
            <img class="chef-peek" src="img/chef-point.png" alt="">
            <h3>${tr('home.tut.title')}</h3>
            <p>${tr('home.tut.text')}</p>
            <button class="btn primary" data-do="tutorial">🎓 ${tr('home.tut.start')}</button>
            <button class="link" data-do="skipTutorial">${tr('home.tut.skip')}</button>
          </div>` : ''}
        <div class="menu-buttons">
          <button class="mbtn quick" data-do="quick">
            <span class="mb-ico">⚡</span><span class="mb-txt"><b>${tr('quick.title')}</b><small>${tr('home.quick.sub')}</small></span>
          </button>
          <button class="mbtn friends" data-do="friends">
            <span class="mb-ico">👥</span><span class="mb-txt"><b>${tr('home.friends')}</b><small>${tr('home.friends.sub')}</small></span>
          </button>
          <button class="mbtn shopbtn" data-do="openShop">
            <span class="mb-ico">🛒</span><span class="mb-txt"><b>${tr('shop.title')}</b><small>${tr('home.shop.sub')}</small></span>
          </button>
        </div>
        <div class="home-links">
          <button class="link" data-do="rules">📖 ${tr('home.rules')}</button>
          ${profile.tutorialDone ? `<button class="link" data-do="tutorial">🎓 ${tr('home.tutorial')}</button>` : ''}
          <button class="link" data-do="levels">🏅 ${tr('home.levels')}</button>
          <button class="link" data-do="audio">${Snd.music || Snd.sfx ? '🔊' : '🔇'} ${tr('home.audio')}</button>
          <button class="link" data-do="lang">🌐 ${tr('lang.title')}</button>
        </div>
        ${legalLinks()}
      </div>`;
  }

  function renderMatching() {
    const st = mm.status || {};
    const lv = E.levelInfo(profile.xp).level;
    const secs = Math.floor((st.waited || 0) / 1000);
    app.innerHTML = `
      <div class="home matching">
        <img class="chef-big bob" src="img/chef-wave.png" alt="">
        <h2>${tr('mm.searching')}</h2>
        <p class="mm-range">${tr('mm.range', { from: Math.max(1, lv - (st.range || 2)), to: lv + (st.range || 2) })}</p>
        <div class="mm-dots"><i></i><i></i><i></i></div>
        <p class="note">${st.near > 1 ? tr(st.near > 2 ? 'mm.found.other' : 'mm.found.one', { n: st.near - 1 }) : tr('mm.nobody')} · ${secs}s</p>
        ${st.botsIn > 0 ? `<p class="note">${tr('mm.botsIn', { s: st.botsIn })}</p>` : ''}
        <button class="btn big" data-do="cancelQuick">${tr('btn.cancel')}</button>
      </div>`;
  }

  function friendsSheet() {
    openSheet(`<h2>👥 ${tr('friends.title')}</h2>
      <p class="note">${tr('friends.note')}</p>
      <button class="btn primary big" data-do="create">${tr('friends.create')}</button>
      <div class="or">${tr('friends.or')}</div>
      <div class="join-row">
        <input id="code" maxlength="4" placeholder="${esc(tr('friends.codePlaceholder'))}" value="${esc(roomParam())}" autocapitalize="characters">
        <button class="btn" data-do="join">${tr('friends.join')}</button>
      </div>`);
  }

  function nameSheet() {
    openSheet(`<h2>✏️ ${tr('profile.rename')}</h2>
      <input id="newName" maxlength="18" value="${esc(profile.name)}">
      <div class="btn-row" style="margin-top:12px"><button class="btn primary" data-do="saveName">${tr('profile.save')}</button></div>
      <hr class="sep">
      <h3>${tr('profile.delete')}</h3>
      <p class="note">${tr('profile.delete.note')}</p>
      <button class="btn danger" data-do="deleteProfile">🗑️ ${tr('profile.delete')}</button>`);
  }

  async function deleteProfile() {
    if (!confirm(tr('profile.delete.confirm'))) return;
    try {
      await post('/api/profile/delete', withProfile({}));
    } catch (e) {
      if (e.key !== 'err.profileMissing') return toast(e.message);
    }
    dropProfile();
    closeSheet();
    toast(tr('profile.deleted'));
    render();
  }

  function levelsSheet() {
    const info = E.levelInfo(profile.xp);
    openSheet(`<h2>🏅 ${tr('level.title')}</h2>
      <p>${tr('level.text')}</p>
      <ul class="titles">${E.TITLES.map(([l], i) => `<li class="${info.level >= l ? 'got' : ''}">${levelBadge(l)} ${esc(tr('title.' + i))}</li>`).join('')}</ul>`);
  }

  // ---------- Sprache wählen ----------

  function langSheet() {
    const cur = I18n.lang();
    openSheet(`<h2>🌐 ${tr('lang.title')}</h2>
      <div class="col">${Object.entries(I18n.LANGS).map(([code, name]) =>
        `<button class="btn ${code === cur ? 'primary' : ''}" data-do="setLang" data-id="${code}" lang="${code}">${esc(name)}${code === cur ? ' ✓' : ''}</button>`).join('')}</div>`);
  }

  function setLang(code) {
    I18n.setLang(code);
    try { localStorage.setItem(LS_LANG, I18n.lang()); } catch { /* ignore */ }
    applyLang();
    closeSheet();
    render(); // also redraws Luigi's bubble while the tutorial is running
  }

  function renderLobby() {
    const isHost = view.host === me();
    const n = view.players.length;
    app.innerHTML = `
      <div class="lobby">
        <img class="logo-img small" src="img/logo.png" alt="Pizza Panic">
        <div class="panel">
          <div class="code-box">
            <div class="code-label">${tr('lobby.code')}</div>
            <div class="code">${esc(view.code)}</div>
            <button class="btn" data-do="share">🔗 ${tr('lobby.share')}</button>
          </div>
          <h3>${tr('lobby.atTable', { n })}</h3>
          <ul class="plist">
            ${view.players.map((p, i) => `
              <li>
                <span class="dot ${p.connected ? 'on' : ''}"></span>
                ${levelBadge(p.level || 1)}
                <span class="pname">${esc(p.name)}${i === me() ? ` <small>${tr('lobby.you')}</small>` : ''}</span>
                ${i === view.host ? `<span class="badge">👑 ${tr('lobby.host')}</span>` : ''}
                ${p.isBot ? '<span class="badge">🤖</span>' : ''}
                ${isHost && i !== me() ? `<button class="x" data-do="kick" data-i="${i}" aria-label="${esc(tr('lobby.kick'))}">✕</button>` : ''}
              </li>`).join('')}
          </ul>
          <p class="note">${n <= 3 ? tr('lobby.goal.small') : tr('lobby.goal.big')}</p>
          ${themePickerHTML(isHost)}
          ${isHost ? `
            <div class="btn-row">
              <button class="btn" data-do="addBot" ${n >= 6 ? 'disabled' : ''}>🤖 ${tr('lobby.addBot')}</button>
              <button class="btn primary" data-do="start" ${n < 2 ? 'disabled' : ''}>${tr('lobby.start')}</button>
            </div>` : `<p class="wait">${tr('lobby.waitHost')}</p>`}
        </div>
        <div class="btn-row center">
          <button class="link" data-do="rules">📖 ${tr('home.rules')}</button>
          <button class="link" data-do="menu">📋 ${tr('lobby.menu')}</button>
          <button class="link danger" data-do="leave">${tr('lobby.leave')}</button>
        </div>
      </div>`;
  }

  // Host picks the table's theme (own packs only); locked packs lead to the shop.
  function themePickerHTML(isHost) {
    const cur = view.theme || null;
    if (!isHost) {
      return cur ? `<div class="theme-now">${E.THEMES[cur].icon} ${tr('lobby.themeNow', { name: `<b>${esc(themeName(cur))}</b>` })}</div>` : '';
    }
    const chips = [{ id: '', icon: '🍕', name: tr('theme.classic') }].concat(Object.entries(E.THEMES).map(([id, t]) => ({ id, ...t, name: themeName(id) })));
    return `<h3>${tr('quick.theme')}</h3>
      <div class="theme-chips">${chips.map(t => {
        const owned = !t.id || S.ownsTheme(profile, t.id);
        const on = (cur || '') === t.id;
        return `<button class="theme-chip ${on ? 'on' : ''} ${owned ? '' : 'locked'}" data-do="${owned ? 'setTheme' : 'themeShop'}" data-id="${t.id}"
          ${t.id ? `style="background-image:url(img/bg-${t.id}-thumb.webp)"` : ''}>
          <span>${t.icon}</span><b>${esc(t.name)}</b>${owned ? '' : '<i>🔒</i>'}</button>`;
      }).join('')}</div>`;
  }

  function miniCard(c, size) {
    const d = T[c.t];
    return `<div class="mc ${d.kind}" title="${esc(ingName(c.t))}">${A.cardArt(c.t, size)}</div>`;
  }

  // Ids of cards that were on a tray when the table was last drawn (for the pop-in animation).
  let trayCardsSeen = new Set();
  let trayCardsCode = null;
  function rememberTrayCards() {
    const g = game();
    if (!g) return;
    trayCardsSeen = new Set(g.players.flatMap(p => p.tray.flat().map(c => c.id)));
    trayCardsCode = view.code;
  }

  function trayHTML(p, pi, size, tg) {
    const g = game(), R = recipesOf(g);
    const stacks = p.tray.map((st, si) => {
      const done = E.completeRecipe(st, R) >= 0;
      const key = `${pi}:${si}`;
      // Cards that weren't on any tray in the last drawing pop in; a pizza that just got finished flashes once.
      const fresh = st.filter(c => !trayCardsSeen.has(c.id)).map(c => c.id);
      const justDone = done && fresh.length > 0;
      return `<div class="stack ${done ? 'done' : ''} ${justDone ? 'just-done' : ''} ${tg.has(key) ? 'target' : ''}" data-do="stack" data-p="${pi}" data-s="${si}">
        <div class="stack-cards">${st.map(c => fresh.includes(c.id) ? miniCard(c, size).replace('class="mc ', 'class="mc pop-in ') : miniCard(c, size)).join('')}</div>
        <div class="stack-label">${esc(stackLabel(st, R))}</div>
      </div>`;
    });
    if (tg.has(`${pi}:new`)) {
      stacks.push(`<div class="stack new target" data-do="stack" data-p="${pi}" data-s="new"><div class="stack-cards">＋</div><div class="stack-label">${tr('game.newPizza')}</div></div>`);
    }
    if (!stacks.length) stacks.push(`<div class="empty-tray">${tr('game.emptyTray')}</div>`);
    const skin = (view.players[pi] && view.players[pi].tray) || 'classic';
    return `<div class="tray skin-${esc(skin)}" data-tray="${pi}">${stacks.join('')}</div>`;
  }

  // Cards that just came into the hand fly in (after drawing at the end of a turn or stealing one).
  let handSeen = { code: null, ids: new Set() };
  function newHandIds() {
    const ids = myHand().map(c => c.id);
    if (handSeen.code !== view.code) handSeen = { code: view.code, ids: new Set(ids) };
    const fresh = ids.filter(id => !handSeen.ids.has(id));
    handSeen.ids = new Set(ids);
    return fresh;
  }

  // Always visible: who is playing right now, and for me how many of my 3 cards are used.
  function turnStripHTML(g) {
    if (g.winner != null) return '';
    if (myTurn()) {
      const slots = [0, 1, 2].map(i => `<i class="${i < g.played ? 'used' : ''}"></i>`).join('');
      const left = 3 - g.played;
      return `<div class="turn-strip mine"><span class="ts-icon">🍳</span><b>${tr('turn.yours')}</b><span class="ts-sub">${left > 0 ? tr(left > 1 ? 'turn.cardsLeft.other' : 'turn.cardsLeft.one', { n: left }) : tr('turn.done')}</span><span class="slots">${slots}</span></div>`;
    }
    const cur = g.players[g.current];
    return `<div class="turn-strip other"><span class="ts-icon">⏳</span>${tr('turn.strip.other', { name: `<b>${esc(cur.name)}</b>` })}<span class="think"><i></i><i></i><i></i></span>
      <span class="slots">${[0, 1, 2].map(i => `<i class="${i < g.played ? 'used' : ''}"></i>`).join('')}</span></div>`;
  }

  function handCard(c, deal) {
    const d = T[c.t];
    const sel = ui.sel === c.id;
    const twin = myTurn() && twinOf(c);
    const k = deal ? deal.indexOf(c.id) : -1;
    return `<button class="card ${d.kind} ${sel ? 'sel' : ''} ${k >= 0 ? 'deal-in' : ''}" ${k >= 0 ? `style="animation-delay:${k * 0.12}s"` : ''} data-do="card" data-id="${c.id}" data-t="${c.t}">
      <span class="corner">${twin ? '👯' : ''}</span>
      <span class="art">${A.cardArt(c.t, d.kind === 'act' ? 66 : [0, 66, 46, 34, 28, 24][d.layers.length])}</span>
      <span class="cname">${esc(ingName(c.t))}</span>
    </button>`;
  }

  // Always-visible menu: every ingredient already lying on my tray is ticked off.
  // Every pizza shows the best stack it could still become – a lone sauce ticks all four, the player decides
  // which one to build (the strict one-stack-per-pizza assignment would grey out the others and mislead).
  function menuStripHTML(tray, R) {
    return `<div class="menu-strip">${R.map(r => {
      const layers = E.RECIPES[r].layers;
      const done = tray.some(st => E.completeRecipe(st, [r]) === r);
      const have = done ? layers.length : Math.max(0, ...tray
        .filter(st => E.completeRecipe(st, R) < 0 && E.candidates(st, [r]).length)
        .map(st => E.layersOf(st).length));
      return `<div class="order ${done ? 'done' : ''}">
        <div class="order-name">${done ? '✅' : `${have}/${layers.length}`} ${esc(recipeName(r))}</div>
        <div class="order-row">${layers.map((l, i) =>
          `<span class="oi ${i < have ? 'got' : ''}">${A.icon(l, 22)}${i < have ? '<b>✓</b>' : ''}</span>`).join('')}</div>
      </div>`;
    }).join('')}</div>`;
  }

  function hintHTML() {
    const g = game();
    const cur = g.players[g.current];
    if (g.winner != null) return '';
    if (!myTurn()) {
      const sel = ui.sel && findCard(ui.sel);
      const extra = sel && T[sel.t].desc ? `<div class="sub">${esc(ingName(sel.t))}: ${esc(actDesc(sel.t))}</div>` : '';
      return `<div class="hint-text">⏳ ${tr(g.pending ? 'hint.otherDigging' : 'hint.other', { name: `<b>${esc(cur.name)}</b>` })}</div>${extra}`;
    }
    const played = `<span class="pill">${tr('hint.played', { n: g.played })}</span>`;
    const cancel = `<button class="btn ghost" data-do="cancel">${tr('btn.cancel')}</button>`;
    if (g.pending) {
      return `<div class="hint-text">🗑️ ${tr(ui.dig ? 'hint.digPicked' : 'hint.dig')}</div>
        <div class="btn-row"><button class="btn" data-do="digOpen">${tr('hint.digOpen')}</button></div>`;
    }
    if (ui.mode === 'burn') return `<div class="hint-text">🔥 ${tr('hint.burn')}</div><div class="btn-row">${cancel}</div>`;
    if (ui.mode === 'stealSrc') return `<div class="hint-text">✋ ${tr('hint.stealSrc')}</div><div class="btn-row">${cancel}</div>`;
    if (ui.mode === 'stealDst') return `<div class="hint-text">✋ ${tr('hint.stealDst')}</div><div class="btn-row">${cancel}</div>`;

    const c = ui.sel && findCard(ui.sel);
    if (!c) {
      const canEnd = g.played > 0 || !myHand().length;
      return `<div class="hint-text">🍳 ${tr('hint.yourTurn')} ${played}</div>
        <div class="btn-row"><button class="btn ${canEnd ? 'primary' : ''}" data-do="end" ${canEnd ? '' : 'disabled'}>${tr('hint.end')}</button></div>`;
    }
    const d = T[c.t];
    const pairBtn = canPair(c) ? `<button class="btn" data-do="pair">👯 ${tr('hint.pair')}</button>` : '';
    const discardBtn = `<button class="btn" data-do="discard">🗑️ ${tr('hint.discard')}</button>`;
    if (d.kind === 'ing') {
      const has = targets().size > 0;
      return `<div class="hint-text">${tr(has ? 'hint.place' : 'hint.noFit', { card: `<b>${esc(ingName(c.t))}</b>` })} ${played}</div>
        <div class="btn-row">${discardBtn}${pairBtn}${cancel}</div>`;
    }
    return `<div class="hint-text"><b>${A.ACTIONS[c.t]} ${esc(ingName(c.t))}</b>: ${esc(actDesc(c.t))} ${played}</div>
      <div class="btn-row"><button class="btn primary" data-do="play">${tr('hint.play')}</button>${discardBtn}${pairBtn}${cancel}</div>`;
  }

  function renderGame() {
    const g = game();
    const R = recipesOf(g);
    const tg = targets();
    if (trayCardsCode !== view.code) rememberTrayCards(); // entering a table: nothing pops in
    const mine = g.players[me()];
    const others = g.players.map((p, i) => ({ p, i })).filter(x => x.i !== me());
    // Order opponents in seating order starting after me.
    others.sort((a, b) => ((a.i - me() + g.players.length) % g.players.length) - ((b.i - me() + g.players.length) % g.players.length));
    const top = g.trash[g.trash.length - 1];
    const recent = g.log.slice(-2).reverse();

    app.innerHTML = `
      <div class="game">
        <header class="topbar">
          <button class="pile deck" data-do="noop" title="${esc(tr('game.deck'))}"><span class="back"></span><b>${g.deckCount}</b></button>
          <button class="pile trash" data-do="trash" title="${esc(tr('game.trash'))}">${top ? miniCard(top, 20) : '<span class="empty">🗑️</span>'}<b>${g.trash.length}</b></button>
          <div class="spacer"></div>
          ${view.kind !== 'tutorial' ? `<button class="tbtn" data-do="emotes" aria-label="${esc(tr('game.emotes'))}">💬</button>` : ''}
          <button class="tbtn" data-do="menu">📋 ${tr('game.menu')}</button>
          <button class="tbtn" data-do="more">⋯</button>
        </header>

        ${turnStripHTML(g)}

        <section class="opponents">
          ${others.map(({ p, i }) => `
            <div class="opp ${g.current === i ? 'active' : ''} ${view.players[i] && !view.players[i].connected ? 'offline' : ''}" data-player="${i}">
              <div class="opp-head">
                <span class="oname">${levelBadge((view.players[i] || {}).level || 1)} ${g.current === i ? '🍳 ' : ''}${esc(p.name)}${(view.players[i] || {}).supporter ? ' ⭐' : ''}</span>
                <span class="ometa"><span class="hc">${'<i></i>'.repeat(p.handCount)}</span> ✓${E.completedCount(p.tray, R)}/${R.length}</span>
              </div>
              ${trayHTML(p, i, 20, tg)}
            </div>`).join('')}
        </section>

        <button class="ticker" data-do="log">${recent.map((l, k) => `<div class="${k === 0 && l.n > lastLogN ? 'fresh' : ''}">${logText(l, true)}</div>`).join('')}</button>

        <section class="mytray ${myTurn() ? 'active' : ''}" data-player="${me()}">
          <div class="my-head"><b>${tr('game.myOrder')}</b><span>${tr('game.pizzasDone', { done: E.completedCount(mine.tray, R), total: R.length })}</span></div>
          ${menuStripHTML(mine.tray, R)}
          <div class="my-head sub"><b>${tr('game.myTray')}</b></div>
          ${trayHTML(mine, me(), 30, tg)}
        </section>

        <section class="hint">${hintHTML()}</section>

        <section class="hand ${myTurn() ? 'my-turn' : 'waiting'}">${(() => { const deal = newHandIds(); return myHand().map(c => handCard(c, deal)).join(''); })() || `<div class="empty-hand">${tr('game.emptyHand')}</div>`}</section>

        ${g.winner != null ? resultHTML(g) : ''}
      </div>`;
    animateResult();
    showEmotes();
    rememberTrayCards();
    if (g.log.length) lastLogN = Math.max(lastLogN, g.log[g.log.length - 1].n);
  }

  // ---------- Emotes ----------

  const emotesShown = new Set();

  function emoteSheet() {
    const list = profile ? S.ownedEmotes(profile) : S.EMOTES.filter(e => e.pack === 'free');
    const locked = S.EMOTES.length - list.length;
    openSheet(`<h2>💬 ${tr('game.emotes')}</h2>
      <div class="emote-grid">${list.map(e => `<button class="emote-btn" data-do="sendEmote" data-id="${e.id}"><span>${e.icon}</span>${esc(tr('emote.' + e.id))}</button>`).join('')}</div>
      ${locked ? `<p class="note center">${tr(locked > 1 ? 'game.moreEmotes.other' : 'game.moreEmotes.one', { n: locked })}</p>` : ''}`, 'ctx');
  }

  // Bubbles float over the panel of whoever sent the emote; each emote is shown once.
  function showEmotes() {
    for (const em of view.emotes || []) {
      const key = `${view.code}:${em.id}`;
      if (emotesShown.has(key)) continue;
      emotesShown.add(key);
      const e = S.EMOTES.find(x => x.id === em.e);
      const panel = app.querySelector(`[data-player="${em.p}"]`);
      if (!e || !panel) continue;
      const r = panel.getBoundingClientRect();
      const el = document.createElement('div');
      el.className = 'emote-bubble';
      el.innerHTML = `<span>${e.icon}</span>${esc(tr('emote.' + e.id))}`;
      el.style.left = `${Math.min(window.innerWidth - 170, Math.max(8, r.left + 12))}px`;
      el.style.top = `${Math.max(8, r.top + 4)}px`;
      document.body.appendChild(el);
      Snd.play('emote');
      setTimeout(() => el.remove(), 3200);
    }
  }

  function resultHTML(g) {
    const won = g.winner === me();
    const r = view.result;
    const levelUp = r && r.after.level > r.before.level;
    let buttons;
    if (view.kind === 'tutorial') {
      buttons = `<button class="btn primary big" data-do="home">${tr('result.toMenu')}</button>`;
    } else if (view.kind === 'quick') {
      buttons = `<button class="btn primary big" data-do="again">⚡ ${tr('result.next')}</button>
        <button class="link" data-do="home">${tr('result.menu')}</button>`;
    } else if (view.kind === 'bots') {
      buttons = `<button class="btn primary big" data-do="againBots">🤖 ${tr('result.againBots')}</button>
        <button class="link" data-do="home">${tr('result.menu')}</button>`;
    } else {
      buttons = `${view.host === me() ? `<button class="btn primary big" data-do="restart">${tr('result.again')}</button>` : `<p class="wait">${tr('result.waitHost')}</p>`}
        <button class="link" data-do="home">${tr('result.menu')}</button>`;
    }
    return `
      <div class="winner">
        <div class="winner-card">
          <img class="chef-result" src="img/${won ? 'chef-cheer' : 'chef-thumbs'}.png" alt="">
          <h2>${won ? tr('result.youWin') : tr('result.otherWins', { name: esc(g.players[g.winner].name) })}</h2>
          <p>${view.kind === 'tutorial' ? tr('result.tutDone')
            : won ? tr('result.wonText') : tr('result.lostText')}</p>
          ${r ? `
            <div class="xp-gain">
              <div class="xp-plus">+${r.xp} XP</div>
              <div class="xp-detail">${tr('result.xp.base')} · ${tr('result.xp.pizzas', { n: r.burgers })}${r.won ? ` · ${tr('result.xp.win')}` : ''}${r.bonus ? ` · ${tr('result.xp.tut', { n: r.bonus })}` : ''}</div>
              <div class="xp-row">${levelBadge(r.after.level)}
                <div class="xpbar big"><i data-from="${levelUp ? 0 : Math.round(r.before.into / r.before.need * 100)}" data-to="${Math.round(r.after.into / r.after.need * 100)}"></i><span>${r.after.into} / ${r.after.need} XP</span></div>
              </div>
              ${levelUp ? `<div class="level-up">⭐ ${tr('result.levelUp', { level: r.after.level })} <small>${esc(r.after.titleKey ? tr(r.after.titleKey) : r.after.title)}</small></div>
                ${S.unlockedBetween(r.before.level, r.after.level).map(t => `<div class="unlock">${traySwatch(t.id)}<span><b>${esc(tr('tray.' + t.id))}</b>${t.reward ? tr('result.unlock.gift') : tr('result.unlock.buy')}</span></div>`).join('')}` : ''}
              <div class="coin-gain">${tr('result.coins', { n: r.coins })}${r.doubled ? ' <span class="pill ok">×2</span>' : ''}</div>
            </div>
            ${!r.doubled && profile && (profile.supporter || (isNative && (profile.doublesToday || 0) < S.DOUBLES_PER_DAY)) ? `
              <button class="btn big double-btn" data-do="double">${profile && profile.supporter ? `⭐ ${tr('result.double')}` : `▶️ ${tr('result.doubleVideo')}`}</button>` : ''}` : ''}
          ${buttons}
        </div>
      </div>`;
  }

  // Fill the XP bar from the old to the new value once the result appears.
  let animatedFor = null;
  function animateResult() {
    const bar = app.querySelector('.xp-gain .xpbar i');
    if (!bar) return;
    const key = `${view.code}:${view.game.turn}`;
    if (animatedFor === key) { bar.style.width = bar.dataset.to + '%'; return; }
    animatedFor = key;
    bar.style.transition = 'none';
    bar.style.width = bar.dataset.from + '%';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bar.style.transition = '';
      bar.style.width = bar.dataset.to + '%';
    }));
  }

  // ---------- Animationen für Aktionskarten ----------
  // Attacks change the table in one go. To make them readable we remember where everything was before the
  // update, then fly copies of the moved cards from the old spot to the new one under a big banner.

  const fxLayer = document.getElementById('fx');
  const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FX_MS = 2600;
  let fxSeen = null; // { code, n }: newest log entry already animated
  let fxHidden = [];

  // Accusative with article ('acc.<type>'), for "… klaut dir den Mozzarella"; null if there is none.
  const accOrNull = type => (type && I18n.has('acc.' + type) ? accOf(type) : null);

  function snapshot() {
    const snap = { stacks: {}, trays: {}, players: {} };
    if (!game()) return snap;
    app.querySelectorAll('.stack[data-p]').forEach(el => {
      if (el.dataset.s === 'new') return;
      const cards = el.querySelectorAll('.mc');
      const top = cards[cards.length - 1];
      snap.stacks[`${el.dataset.p}:${el.dataset.s}`] = { el, r: el.getBoundingClientRect(), top, topR: top && top.getBoundingClientRect() };
    });
    app.querySelectorAll('.tray[data-tray]').forEach(el => { snap.trays[el.dataset.tray] = { el, r: el.getBoundingClientRect() }; });
    app.querySelectorAll('[data-player]').forEach(el => { snap.players[el.dataset.player] = el.getBoundingClientRect(); });
    const trash = app.querySelector('.pile.trash');
    if (trash) snap.trash = trash.getBoundingClientRect();
    const hand = app.querySelector('.hand');
    if (hand) snap.hand = hand.getBoundingClientRect();
    return snap;
  }

  // Log entries with an fx that arrived since the last update (never replays old ones after a reconnect).
  function freshFx() {
    const g = game();
    if (!g) return [];
    const last = g.log.length ? g.log[g.log.length - 1].n : 0;
    if (!fxSeen || fxSeen.code !== view.code || last < fxSeen.n) {
      fxSeen = { code: view.code, n: last };
      return [];
    }
    const out = g.log.filter(l => l.n > fxSeen.n && l.fx);
    fxSeen.n = last;
    return out;
  }

  const rectOf = el => el && el.getBoundingClientRect();
  const nameOf = p => game().players[p].name;
  const trayOf = p => (p === me() ? tr('fx.tray.mine') : tr('fx.tray.of', { name: nameOf(p) }));
  // Whole sentences per person: key + '.me' when I did it, key + '.other' (with {name}) otherwise.
  const byLine = (key, by, p) => tr(key + (by === me() ? '.me' : '.other'), { name: nameOf(by), ...(p || {}) });

  function clearFx() {
    fxLayer.getAnimations({ subtree: true }).forEach(a => a.cancel());
    fxLayer.innerHTML = '';
    fxHidden.forEach(el => { el.style.visibility = ''; });
    fxHidden = [];
  }

  function hideUntilLanded(el) {
    if (!el) return;
    el.style.visibility = 'hidden';
    fxHidden.push(el);
  }

  function land(el) {
    if (!el) return;
    el.style.visibility = '';
    el.classList.remove('fx-land');
    void el.offsetWidth;
    el.classList.add('fx-land');
  }

  function addFx(cls, rect, html) {
    const el = document.createElement('div');
    el.className = cls;
    if (rect) Object.assign(el.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
    if (html != null) el.innerHTML = html;
    fxLayer.appendChild(el);
    return el;
  }

  // Lift a copy of `node` at `from`, hold it up so everyone sees it, then fly it to `to`.
  function fly(node, from, to, opts) {
    opts = opts || {};
    const wrap = addFx('fx-fly', from);
    wrap.appendChild(node);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const s = opts.shrink ? 0.2 : Math.max(0.5, Math.min(1.8, Math.min(to.width / (from.width || 1), to.height / (from.height || 1))));
    const lift = 'translate(0px, -26px) scale(1.45) rotate(-5deg)';
    const end = `translate(${dx}px, ${dy}px) scale(${s}) rotate(${opts.shrink ? 25 : 0}deg)`;
    const frames = opts.burn ? [
      { transform: 'none', filter: 'none' },
      { transform: lift, filter: 'none', offset: 0.22 },
      { transform: lift, filter: 'brightness(.35) sepia(1) saturate(3)', offset: 0.6 },
      { transform: end, filter: 'brightness(.2)', opacity: 0 },
    ] : [
      { transform: 'none' },
      { transform: lift, offset: 0.22 },
      { transform: lift, offset: 0.45 },
      { transform: end, opacity: opts.shrink ? 0 : 1 },
    ];
    const a = wrap.animate(frames, { duration: opts.ms || 1800, delay: opts.delay || 250, easing: 'ease-in-out', fill: 'forwards' });
    return a.finished.then(() => wrap.remove(), () => {});
  }

  function banner(title, line, route, bad) {
    // In the tutorial the dimming would also grey out Luigi's speech bubble, so the banner shows without it.
    if (!tutActive()) addFx('fx-dim');
    addFx(`fx-banner ${bad ? 'bad' : ''}`, null,
      `<div class="fx-title">${title}</div><div class="fx-line">${esc(line)}</div>${route ? `<div class="fx-route">${esc(route)}</div>` : ''}`);
  }

  function ghost(rect) {
    return rect ? addFx('fx-ghost', rect) : null;
  }

  function shake(p) {
    const el = app.querySelector(`[data-player="${p}"]`);
    if (!el) return;
    el.classList.remove('fx-shake');
    void el.offsetWidth;
    el.classList.add('fx-shake');
  }

  function cleanCopy(el) {
    const c = el.cloneNode(true);
    c.classList.remove('target', 'coach-hl');
    c.style.visibility = '';
    return c;
  }

  function playFx(entry, snap) {
    clearFx();
    const fx = entry.fx;
    const g = game();
    const victimIsMe = (fx.from && fx.from.player === me() && fx.by !== me()) || (fx.k === 'pair' && fx.victim === me());
    if (victimIsMe && navigator.vibrate) navigator.vibrate([90, 60, 90]);
    setTimeout(clearFx, FX_MS + 300);

    if (fx.k === 'steal') {
      const what = fx.whole ? labelText(fx.label) : accOrNull(fx.cards[0]) || labelText(fx.label);
      banner(tr(victimIsMe ? 'fx.steal.title.victim' : fx.by === me() ? 'fx.steal.title.me' : 'fx.steal.title.other'),
        byLine('fx.steal', fx.by, { what }), `${trayOf(fx.from.player)} ➜ ${trayOf(fx.to.player)}`, victimIsMe);
      shake(fx.from.player);
      if (calm) return;
      const src = snap.stacks[`${fx.from.player}:${fx.from.stack}`];
      const dstEl = app.querySelector(stackSel(fx.to.player, fx.to.stack));
      if (!src || !dstEl) return;
      const g1 = ghost(fx.whole ? src.r : src.topR);
      const target = fx.whole ? dstEl : [...dstEl.querySelectorAll('.mc')].pop();
      hideUntilLanded(target);
      const node = cleanCopy(fx.whole ? src.el : src.top);
      fly(node, fx.whole ? src.r : src.topR, rectOf(target)).then(() => { if (g1) g1.remove(); land(target); });
      return;
    }

    if (fx.k === 'burn') {
      const what = (fx.cards.length === 1 && accOrNull(fx.cards[0])) || labelText(fx.label);
      banner(tr(victimIsMe ? 'fx.burn.title.victim' : fx.by === me() ? 'fx.burn.title.me' : 'fx.burn.title.other'),
        byLine('fx.burn', fx.by, { what }), `${trayOf(fx.from.player)} ➜ ${tr('fx.trash')}`, victimIsMe);
      shake(fx.from.player);
      if (calm) return;
      const src = snap.stacks[`${fx.from.player}:${fx.from.stack}`];
      const trash = app.querySelector('.pile.trash');
      if (!src || !trash) return;
      const g1 = ghost(src.r);
      const node = cleanCopy(src.el);
      const flame = document.createElement('div');
      flame.className = 'fx-flame';
      flame.textContent = '🔥';
      node.appendChild(flame);
      fly(node, src.r, rectOf(trash), { burn: true, shrink: true, ms: 2000 }).then(() => { if (g1) g1.remove(); land(trash); });
      return;
    }

    if (fx.k === 'swap') {
      const n = g.players.length;
      const mineFrom = fx.dir === 'next' ? (me() - 1 + n) % n : (me() + 1) % n;
      banner(tr('fx.swap.title'), byLine('fx.swap', fx.by),
        mineFrom === me() ? '' : tr('fx.swap.route', { name: g.players[mineFrom].name }), false);
      if (calm) return;
      for (let i = 0; i < n; i++) {
        const from = snap.trays[i];
        const to = (fx.dir === 'next' ? i + 1 : i - 1 + n) % n;
        const dstEl = app.querySelector(`.tray[data-tray="${to}"]`);
        if (!from || !dstEl || !from.el.querySelector('.stack')) continue;
        hideUntilLanded(dstEl);
        fly(cleanCopy(from.el), from.r, rectOf(dstEl), { ms: 1900 }).then(() => land(dstEl));
      }
      return;
    }

    if (fx.k === 'dig') {
      banner(tr('fx.dig.title'), byLine('fx.dig', fx.by, { what: accOrNull(fx.cards[0]) || '' }), `${tr('fx.trash')} ➜ ${trayOf(fx.by)}`, false);
      if (calm || !snap.trash) return;
      const dstEl = app.querySelector(stackSel(fx.to.player, fx.to.stack));
      const target = dstEl && [...dstEl.querySelectorAll('.mc')].pop();
      if (!target) return;
      hideUntilLanded(target);
      const node = document.createElement('div');
      node.innerHTML = miniCard({ t: fx.cards[0] }, 30);
      fly(node.firstElementChild, snap.trash, rectOf(target)).then(() => land(target));
      return;
    }

    if (fx.k === 'pair') {
      banner(tr(victimIsMe ? 'fx.pair.title.victim' : 'fx.pair.title'),
        byLine('fx.pair', fx.by, { card: ingName(fx.cards[0]) }),
        fx.by === me() ? tr('fx.pair.route.me', { name: nameOf(fx.victim) })
          : tr(fx.victim === me() ? 'fx.pair.route.fromYou' : 'fx.pair.route.other', { name: nameOf(fx.victim) }), victimIsMe);
      if (calm) return;
      const from = fx.victim === me() ? snap.hand : snap.players[fx.victim];
      const to = fx.by === me() ? rectOf(app.querySelector('.hand')) : rectOf(app.querySelector(`[data-player="${fx.by}"]`));
      if (!from || !to) return;
      const back = document.createElement('div');
      back.className = 'fx-back';
      const box = r => ({ left: r.left + r.width / 2 - 20, top: r.top + r.height / 2 - 28, width: 40, height: 56 });
      fly(back, box(from), box(to));
    }
  }

  // ---------- Tutorial (Luigi erklärt) ----------

  const coachEl = document.getElementById('coach');
  let tutStep = null;

  const LUIGI = 1; // seat of the tutorial cook (you always sit at 0)
  const handHasType = t => myHand().some(c => c.t === t);
  const selType = () => { const c = ui.sel && findCard(ui.sel); return c && c.t; };
  // Index of the stack on a tray whose layers are exactly `layers` (e.g. 'sauce,basil'), or -1.
  const stackOf = (p, layers) => game().players[p].tray.findIndex(st => E.layersOf(st).join(',') === layers);
  const mine = layers => stackOf(me(), layers);
  const luigis = layers => stackOf(LUIGI, layers);
  const myDone = () => E.completedCount(game().players[me()].tray, game().recipes);
  const stackSel = (p, s) => `.stack[data-p="${p}"][data-s="${s}"]`;

  // "Play this card on that spot": highlights the card first, then the one spot it may go to.
  // Texts are dictionary keys: `${key}.pick` (tap the card) and `${key}.put` (tap the spot).
  function placeStep(card, spot, key, done) {
    const pick = key + '.pick', put = key + '.put';
    return {
      when: () => myTurn(), done, skip: () => myTurn() && !handHasType(card),
      cards: [card], buttons: ['cancel'],
      spots: k => k === `${me()}:${spot()}`,
      target: () => (selType() === card ? stackSel(me(), spot()) : `.hand .card[data-t="${card}"]`),
      text: () => tr(selType() === card ? put : pick),
    };
  }

  // Action card in three moves: tap the card, tap "Ausspielen", tap the highlighted pizza(s).
  // texts = dictionary keys, one per stage.
  function actionStep(card, src, texts, done, dst) {
    const stage = () => (selType() !== card ? 0 : !ui.mode ? 1 : ui.mode === 'stealDst' ? 3 : 2);
    return {
      when: () => myTurn(), done, skip: () => myTurn() && !handHasType(card) && !ui.mode,
      cards: [card], buttons: ['play', 'cancel'],
      spots: k => (ui.mode === 'stealDst' ? k === dst() : k === src()),
      target: () => [`.hand .card[data-t="${card}"]`, '[data-do="play"]', `.stack[data-p="${src().replace(':', '"][data-s="')}"]`,
        dst ? `.stack[data-p="${dst().replace(':', '"][data-s="')}"]` : ''][stage()],
      text: () => tr(texts[stage()]),
    };
  }

  // Each step: text, highlight target, `when` (show only then), `done`/`skip` (auto-advance) or `next` (button).
  // While a step is shown only its `cards`, `spots` and `buttons` work, so the round runs exactly as explained.
  // The hands are fixed on the server (TUTORIAL_RIG / TUTORIAL_BOT_RIG), test/tutorial.js checks the same moves.
  const TUT = [
    { chef: 'wave', next: true, text: () => tr('tut.welcome') },
    { chef: 'point', target: '.menu-strip', next: true, text: () => tr('tut.order') },
    { chef: 'point', target: '.mytray .tray', next: true, text: () => tr('tut.tray') },
    placeStep('sauce', () => 'new', 'tut.sauce1',
      () => mine('sauce') >= 0 || mine('sauce,basil') >= 0),
    placeStep('basil', () => mine('sauce'), 'tut.basil',
      () => mine('sauce,basil') >= 0),
    placeStep('sauce', () => 'new', 'tut.sauce2',
      () => mine('sauce') >= 0 || !myTurn()),
    { chef: 'thumbs', target: '.opponents', next: true, text: () => tr('tut.turnOver') },
    { chef: 'point', target: '.opponents', next: true, when: () => myTurn(), skip: () => myTurn() && luigis('sauce,ham,mushroom') < 0,
      text: () => tr('tut.luigiStarted') },
    placeStep('mozzarella', () => mine('sauce,basil'), 'tut.mozza1',
      () => myDone() >= 1),
    { chef: 'cheer', target: '.menu-strip', next: true, when: () => myTurn(), text: () => tr('tut.firstPizza') },
    placeStep('ham', () => mine('sauce'), 'tut.ham',
      () => mine('sauce,ham') >= 0 || mine('sauce,ham,mushroom') >= 0),
    actionStep('steal', () => `${LUIGI}:${luigis('sauce,ham,mushroom')}`, ['tut.steal.0', 'tut.steal.1', 'tut.steal.2', 'tut.steal.3'],
      () => mine('sauce,ham,mushroom') >= 0 || !myTurn(), () => `${me()}:${mine('sauce,ham')}`),
    { chef: 'cheer', target: '.mytray .tray', next: true, text: () => tr('tut.stolen') },
    { chef: 'point', target: '.opponents', next: true, when: () => myTurn(), skip: () => myTurn() && luigis('sauce,ham,mushroom,mozzarella') < 0,
      text: () => tr('tut.luigiDone') },
    placeStep('mozzarella', () => mine('sauce,ham,mushroom'), 'tut.mozza2',
      () => myDone() >= 2),
    actionStep('burn', () => `${LUIGI}:${luigis('sauce,ham,mushroom,mozzarella')}`, ['tut.burn.0', 'tut.burn.1', 'tut.burn.2'],
      () => luigis('sauce,ham,mushroom,mozzarella') < 0 || !myTurn()),
    { chef: 'point', target: '[data-do="end"]', when: () => myTurn(), done: () => !myTurn(), cards: [], buttons: ['end'],
      text: () => tr('tut.endTurn') },
    { chef: 'point', target: '.trash', next: true, text: () => tr('tut.trash') },
    { chef: 'point', next: true, text: () => tr('tut.discard') },
    // ---- Zug 4: Kombi-Karten, Mülltaucher → Speciale ----
    { chef: 'wave', target: '.hand', next: true, when: () => myTurn(), skip: () => myTurn() && myDone() >= 3,
      text: () => tr('tut.combo') },
    placeStep('sauceSalami', () => 'new', 'tut.speciale',
      () => mine('sauce,salami') >= 0 || mine('sauce,salami,ham,mushroom') >= 0 || myDone() >= 3),
    placeStep('hamMushroom', () => mine('sauce,salami'), 'tut.hamMushroom',
      () => mine('sauce,salami,ham,mushroom') >= 0 || myDone() >= 3),
    digStep(),
    { chef: 'cheer', target: '.menu-strip', next: true,
      text: () => tr('tut.digDone') },
    { chef: 'point', next: true, text: () => tr('tut.swapPair') },
    // ---- Zug 5: Salami → Sieg ----
    { chef: 'point', target: '.menu-strip', next: true, when: () => myTurn(),
      text: () => tr('tut.lastPizza') },
    placeStep('sauceSalami', () => 'new', 'tut.sauceSalami2',
      () => mine('sauce,salami') >= 0 || mine('sauce,salami,pepper') >= 0),
    placeStep('pepper', () => mine('sauce,salami'), 'tut.pepper',
      () => mine('sauce,salami,pepper') >= 0),
    placeStep('mozzarella', () => mine('sauce,salami,pepper'), 'tut.mozza3',
      () => game().winner != null),
  ];

  // Mülltaucher in four moves: card → "Ausspielen" → pick the mozzarella in the trash window → tap the pizza.
  function digStep() {
    const stack = () => mine('sauce,salami,ham,mushroom');
    const stage = () => (game().pending ? (ui.mode === 'digPick' ? 3 : 2) : selType() === 'dig' ? 1 : 0);
    const texts = ['tut.dig.0', 'tut.dig.1', 'tut.dig.2', 'tut.dig.3'];
    return {
      when: () => myTurn(), done: () => myDone() >= 3, skip: () => myTurn() && !handHasType('dig') && !game().pending,
      cards: ['dig'], buttons: ['play', 'cancel'],
      spots: k => k === `${me()}:${stack()}`,
      target: () => ['.hand .card[data-t="dig"]', '[data-do="play"]', '', stackSel(me(), stack())][stage()],
      text: () => tr(texts[stage()]),
      digHint: () => tr(texts[2]),
    };
  }
  // The step currently shown (and therefore steering what may be tapped), or null.
  function tutActive() {
    const g = game();
    if (!view || view.kind !== 'tutorial' || !g || g.winner != null || tutStep == null) return null;
    const step = TUT[tutStep];
    if (!step || (step.when && !step.when())) return null;
    return step;
  }

  // Skip forward over steps whose goal is already reached.
  function tutAdvance() {
    const g = game();
    if (!view || view.kind !== 'tutorial' || !g || g.winner != null) return;
    if (tutStep == null) tutStep = Number(sessionStorage.getItem(LS_TUT + view.code)) || 0;
    const passed = s => (s.done && s.done()) || (s.skip && s.skip());
    while (tutStep < TUT.length && passed(TUT[tutStep])) tutStep++;
    sessionStorage.setItem(LS_TUT + view.code, tutStep);
  }

  // Taps that don't belong to the current step get a friendly nudge instead.
  function tutBlocks(kind, value) {
    const step = tutActive();
    if (!step || !myTurn()) return false;
    const list = kind === 'card' ? step.cards : step.buttons;
    const allowed = list ? list.includes(value) : !step.next;
    if (allowed) return false;
    toast(tr(step.next ? 'tut.nudge.next' : 'tut.nudge.do'));
    return true;
  }

  // Spotlight (everything else dimmed) and a bouncing arrow make clear what Luigi is talking about.
  const spotEl = document.createElement('div');
  spotEl.className = 'coach-spot hidden';
  const arrowEl = document.createElement('div');
  arrowEl.className = 'coach-arrow hidden';
  document.body.append(spotEl, arrowEl);

  function hideCoach() {
    coachEl.classList.add('hidden');
    coachEl.innerHTML = '';
    spotEl.classList.add('hidden');
    arrowEl.classList.add('hidden');
  }

  // Bubble right next to the highlighted area (below it if the area is in the upper half, else above).
  function placeCoach(target) {
    coachEl.style.top = coachEl.style.bottom = '';
    if (!target) {
      coachEl.className = 'coach mid';
      spotEl.classList.add('hidden');
      arrowEl.classList.add('hidden');
      return;
    }
    const r = target.getBoundingClientRect();
    const vh = window.innerHeight;
    const pad = 6;
    Object.assign(spotEl.style, {
      left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
    });
    spotEl.classList.remove('hidden');
    coachEl.className = 'coach anchored';
    const h = coachEl.offsetHeight;
    const gap = 48; // room for the arrow
    const below = r.top + r.height / 2 < vh / 2;
    let top = below ? r.bottom + gap : r.top - gap - h;
    top = Math.max(6, Math.min(vh - h - 6, top));
    coachEl.style.top = `${top}px`;
    const arrowTop = below ? r.bottom + 6 : r.top - 42;
    Object.assign(arrowEl.style, { left: `${Math.max(16, Math.min(window.innerWidth - 56, r.left + r.width / 2 - 20))}px`, top: `${arrowTop}px` });
    arrowEl.textContent = below ? '👆' : '👇';
    arrowEl.className = `coach-arrow ${below ? 'up' : 'down'}`;
  }

  let coachRaf = 0;
  window.addEventListener('scroll', () => {
    if (coachEl.classList.contains('hidden')) return;
    cancelAnimationFrame(coachRaf);
    coachRaf = requestAnimationFrame(() => {
      const sel = coachEl.dataset.target;
      placeCoach(sel ? app.querySelector(sel) : null);
    });
  }, { passive: true });

  function renderCoach() {
    document.querySelectorAll('.coach-hl').forEach(el => el.classList.remove('coach-hl'));
    const step = tutActive();
    if (!step || sheetKind) return hideCoach();
    const sel = typeof step.target === 'function' ? step.target() : step.target;
    const target = sel && app.querySelector(sel);
    if (target) target.classList.add('coach-hl');
    coachEl.dataset.target = target ? sel : '';
    coachEl.className = 'coach anchored';
    coachEl.innerHTML = `
      <img src="img/chef-${step.chef || 'point'}.png" alt="${esc(tr('tut.chefAlt'))}">
      <div class="coach-bubble">
        <div class="coach-text">${typeof step.text === 'function' ? step.text() : step.text}</div>
        <div class="coach-progress" title="${esc(tr('tut.progress', { n: tutStep + 1, total: TUT.length }))}"><i style="width:${Math.round((tutStep + 1) / TUT.length * 100)}%"></i></div>
        <div class="coach-foot">
          <button class="link small-link" data-do="coachSkip">${tr('tut.skip')}</button>
          ${step.next ? `<button class="btn primary small" data-do="coachNext">${tr('tut.next')}</button>` : `<span class="coach-todo">👆 ${tr('tut.yourMove')}</span>`}
        </div>
      </div>`;
    placeCoach(target);
  }

  // ---------- Sheets ----------

  // key: when the same sheet is already open (e.g. picking options in it), only its content is swapped –
  // no slide-in animation and the scroll position stays, so nothing jumps.
  function openSheet(html, kind, key) {
    const inner = `${(kind || 'info') === 'lock' ? '' : '<button class="sheet-x" data-do="closeSheet">✕</button>'}${html}`;
    const card = sheet.querySelector('.sheet-card');
    if (key && card && sheet.dataset.key === key && !sheet.classList.contains('hidden')) {
      const top = card.scrollTop;
      card.innerHTML = inner;
      card.scrollTop = top;
      return;
    }
    sheetKind = kind || 'info';
    sheet.dataset.key = key || '';
    sheet.innerHTML = `<div class="sheet-bg" data-do="${sheetKind === 'lock' ? 'noop' : 'closeSheet'}"></div>
      <div class="sheet-card">${inner}</div>`;
    sheet.classList.remove('hidden');
  }

  function closeSheet() {
    sheet.dataset.key = '';
    sheetKind = null;
    sheet.classList.add('hidden');
    sheet.innerHTML = '';
  }

  function menuSheet() {
    const g = game();
    const theme = g ? g.theme : view && view.theme;
    // In a game: exactly this round's menu. Before: the classic menu, or the specials of the chosen theme.
    const R = g ? g.recipes : theme ? E.themeRecipes(theme) : [0, 1, 2, 3];
    const tray = g ? g.players[me()].tray : [];
    openSheet(`<h2>${theme ? `${E.THEMES[theme].icon} ${esc(themeName(theme))}` : tr('menu.title')}</h2>
      <p class="note">${!g && theme ? tr('menu.themeNote') : tr('menu.note')}</p>
      <div class="menu-list">${R.map((i, k) => {
        const r = E.RECIPES[i];
        const done = tray.some(st => E.completeRecipe(st, [i]) === i);
        return `<div class="menu-item ${done ? 'done' : ''} ${r.theme ? 'special' : ''}">
          <div class="menu-name">${done ? '✅ ' : ''}${k + 1}. ${esc(recipeName(i))}${r.theme ? ` <span class="pill">${tr('menu.special')}</span>` : ''}${!g && !theme && i === 3 ? ` <small>${tr('menu.smallOnly')}</small>` : ''}</div>
          <div class="menu-row">${r.layers.map(l => A.icon(l, 34)).join('<span class="plus">+</span>')}</div>
        </div>`;
      }).join('')}</div>`);
  }

  function trashSheet() {
    const g = game();
    const list = g.trash.slice().reverse();
    openSheet(`<h2>🗑️ ${tr('sheet.trash.title', { n: list.length })}</h2>
      <p class="note">${tr('sheet.trash.note')}</p>
      <div class="card-grid">${list.map(c => `<div class="gcard ${T[c.t].kind}">${A.cardArt(c.t, 28)}<span>${esc(ingName(c.t))}</span></div>`).join('') || `<p>${tr('sheet.trash.empty')}</p>`}</div>`);
  }

  function digSheet() {
    const g = game();
    const opts = new Set(E.digOptions({ trash: g.trash, players: g.players.map(p => ({ tray: p.tray })), recipes: g.recipes }, me()).map(c => c.id));
    const list = g.trash.slice().reverse().filter(c => opts.has(c.id));
    // In the tutorial Luigi explains inside the window and points at the mozzarella.
    const tut = tutActive();
    const hint = tut && tut.digHint ? tut.digHint() : '';
    openSheet(`<h2>🗑️ ${tr('act.dig')}</h2>
      ${hint ? `<div class="sheet-coach"><img src="img/chef-point.png" alt=""><p>${hint}</p></div>`
        : `<p class="note">${tr('sheet.dig.note')}</p>`}
      <div class="card-grid">${list.map(c => `<button class="gcard ing pick ${hint && c.t === 'mozzarella' ? 'tut-pick' : ''}" data-do="digPick" data-id="${c.id}">${A.cardArt(c.t, 28)}<span>${esc(ingName(c.t))}</span></button>`).join('')}</div>`, 'lock');
  }

  function logSheet() {
    const g = game();
    openSheet(`<h2>${tr('sheet.log.title')}</h2><ol class="log">${g.log.slice().reverse().map(l => `<li>${logText(l, true)}</li>`).join('')}</ol>`);
  }

  function audioSheet() {
    openSheet(`<h2>🔊 ${tr('audio.title')}</h2>
      <div class="col">
        <button class="toggle ${Snd.music ? 'on' : ''}" data-do="toggleMusic"><span>🎵 ${tr('audio.music')}</span><i></i></button>
        <button class="toggle ${Snd.sfx ? 'on' : ''}" data-do="toggleSfx"><span>🔔 ${tr('audio.sfx')}</span><i></i></button>
      </div>`, 'info', 'audio');
  }

  function moreSheet() {
    openSheet(`<h2>${tr('sheet.more.title', { code: esc(view.code) })}</h2>
      <div class="col">
        <button class="btn" data-do="audio">🔊 ${tr('sheet.more.audio')}</button>
        <button class="btn" data-do="rules">📖 ${tr('sheet.more.rules')}</button>
        <button class="btn" data-do="log">📜 ${tr('sheet.more.log')}</button>
        <button class="btn" data-do="lang">🌐 ${tr('lang.title')}</button>
        <button class="btn" data-do="share">🔗 ${tr('sheet.more.share')}</button>
        <button class="btn danger" data-do="leave">${tr('lobby.leave')}</button>
      </div>`);
  }

  function rulesSheet() {
    openSheet(`<h2>📖 ${tr('rules.title')}</h2>
      <div class="rules">
        <p>${tr('rules.goal')}</p>
        <p>${tr('rules.turn')}</p>
        <ul>
          <li>${tr('rules.turn.place')}</li>
          <li>${tr('rules.turn.discard')}</li>
          <li>${tr('rules.turn.action')}</li>
        </ul>
        <p>${tr('rules.draw')}</p>
        <p>${tr('rules.order')}</p>
        <p>${tr('rules.combo')}</p>
        <h3>${tr('rules.actions')}</h3>
        <ul>
          <li>🔥 ${tr('rules.act.burn')}</li>
          <li>✋ ${tr('rules.act.steal')}</li>
          <li>🗑️ ${tr('rules.act.dig')}</li>
          <li>🔄 ${tr('rules.act.swap')}</li>
        </ul>
        <p>${tr('rules.pair')}</p>
        <p>${tr('rules.tip')}</p>
      </div>`);
  }

  // ---------- Toast ----------

  let toastTimer;
  function toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms || 2600);
  }

  // ---------- Zustand ----------

  // ---------- Sounds zu Spielereignissen ----------
  // Every new log entry gets one short sound; at the end of a game a fanfare (or a friendly "oh").
  const Snd = window.SmashSound;
  let soundSeen = { code: null, n: 0, won: false };

  function gameSounds() {
    const g = game();
    if (!g) return;
    if (soundSeen.code !== view.code) {
      soundSeen = { code: view.code, n: g.log.length ? g.log[g.log.length - 1].n : 0, won: g.winner != null };
      return;
    }
    const fresh = g.log.filter(l => l.n > soundSeen.n);
    if (fresh.length) soundSeen.n = fresh[fresh.length - 1].n;
    // Several things at once (bots are fast): play only the most important one.
    const pick = l => {
      const k = l.fx && l.fx.k;
      if (k === 'burn' || k === 'steal' || k === 'swap' || k === 'dig') return k;
      if (k === 'pair') return 'steal';
      if (l.k === 'log.done' || l.k === 'log.win') return 'complete';
      if (l.k === 'log.discard') return 'discard';
      if (l.k === 'log.place' || l.k === 'log.placeNew' || l.k === 'log.digPick') return 'place';
      return null;
    };
    const rank = ['place', 'discard', 'dig', 'swap', 'steal', 'burn', 'complete'];
    const best = fresh.map(pick).filter(Boolean).sort((a, b) => rank.indexOf(b) - rank.indexOf(a))[0];
    if (best && g.winner == null) Snd.play(best);
    if (g.winner != null && !soundSeen.won) {
      soundSeen.won = true;
      setTimeout(() => Snd.play(g.winner === me() ? 'win' : 'lose'), 300);
    }
  }

  function onView() {
    const g = game();
    if (!g || !myTurn()) {
      ui = freshUi();
      if (sheetKind === 'ctx' || sheetKind === 'lock') closeSheet();
    } else if (ui.sel && !findCard(ui.sel) && !ui.mode?.startsWith('dig')) {
      ui = freshUi();
    }
    if (g && myTurn() && g.pending && g.pending.type === 'dig' && !ui.dig && sheetKind !== 'lock') digSheet();
    if (g && !g.pending && sheetKind === 'lock') closeSheet();
    const mt = myTurn();
    if (mt && !wasMyTurn) {
      if (navigator.vibrate) navigator.vibrate(60);
      document.title = `🍕 ${tr('turn.yours')} – Pizza Panic`;
      Snd.play('turn');
    } else if (!mt) document.title = 'Pizza Panic';
    wasMyTurn = mt;
    gameSounds();
    if (view.phase === 'game') history.replaceState(null, '', '?room=' + view.code);
    const snap = snapshot();
    const turnChange = turnEvents();
    render();
    const fx = freshFx();
    if (fx.length) playFx(fx[fx.length - 1], snap);
    showOpponentMoves();
    if (turnChange) turnChange();
  }

  // ---------- Zugwechsel sichtbar machen ----------

  let turnSeen = { code: null, turn: 0, current: -1, hand: 0 };

  // Returns a function that shows the right banner(s) after the table is drawn.
  function turnEvents() {
    const g = game();
    if (!g) return null;
    const prev = turnSeen;
    turnSeen = { code: view.code, turn: g.turn, current: g.current, hand: myHand().length };
    if (prev.code !== view.code || g.winner != null || prev.turn === g.turn) return null;
    const mineNow = g.current === me();
    const wasMine = prev.current === me();
    const nextName = g.players[g.current].name;
    return () => {
      if (wasMine) {
        // My turn just ended (often automatically after the 3rd card): say so before the next player starts.
        turnBanner(tr('turn.over'), tr('turn.over.sub'), 'done');
        setTimeout(() => turnBanner(tr('turn.other', { name: nextName }), '', 'other'), 1300);
      } else if (mineNow) {
        turnBanner(tr('turn.yours'), tr('turn.yours.sub'), 'mine');
      } else {
        turnBanner(tr('turn.other', { name: nextName }), '', 'other');
      }
    };
  }

  // Not called banner(): that name belongs to the attack banners (playFx) and a second declaration would replace it.
  let bannerTimer = null;
  function turnBanner(title, sub, kind) {
    // In the tutorial Luigi already explains whose turn it is; the banner would only cover his speech bubble.
    if (view.kind === 'tutorial' && kind !== 'mine' && tutActive()) return;
    document.querySelectorAll('.turn-banner').forEach(el => el.remove());
    clearTimeout(bannerTimer);
    const el = document.createElement('div');
    el.className = `turn-banner ${kind}`;
    el.innerHTML = `${kind === 'mine' ? '<img src="img/chef-point.png" alt="">' : ''}<div><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
    document.body.appendChild(el);
    bannerTimer = setTimeout(() => el.remove(), kind === 'mine' ? 1900 : 1500);
  }

  // What opponents (and bots) just played appears briefly above their panel: "🍄 Pilze gelegt".
  let movesSeen = { code: null, n: 0 };

  function showOpponentMoves() {
    const g = game();
    if (!g) return;
    const last = g.log.length ? g.log[g.log.length - 1].n : 0;
    if (movesSeen.code !== view.code) { movesSeen = { code: view.code, n: last }; return; }
    const fresh = g.log.filter(l => l.n > movesSeen.n && !l.fx);
    movesSeen.n = last;
    fresh.forEach((l, k) => {
      const p = l.p || {};
      let chipKey, cls = '', what, t = null;
      if (l.k === 'log.place' || l.k === 'log.placeNew') { chipKey = 'chip.placed'; t = p.card; what = ingName(p.card); }
      else if (l.k === 'log.discard') { chipKey = 'chip.discarded'; cls = 'trash'; t = p.card; what = ingName(p.card); }
      else if (l.k === 'log.done') { chipKey = 'chip.done'; cls = 'done'; what = recipeName(p.recipe); }
      if (!chipKey) return;
      const who = g.players.findIndex(pl => pl.name === p.who);
      if (who < 0 || who === me()) return;
      const panel = app.querySelector(`.opp[data-player="${who}"]`);
      if (!panel) return;
      const icon = cls === 'done' ? '🍕' : t && T[t] ? A.cardArt(t, 22) : '';
      setTimeout(() => {
        const r = panel.getBoundingClientRect();
        const el = document.createElement('div');
        el.className = `move-chip ${cls}`;
        el.innerHTML = `${icon}<span>${tr(chipKey, { what: `<b>${esc(what)}</b>` })}</span>`;
        el.style.left = `${Math.min(window.innerWidth - 190, Math.max(6, r.left + 10))}px`;
        el.style.top = `${r.top + r.height - 18}px`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2300);
      }, k * 450);
    });
  }

  async function share() {
    const base = SERVER ? CONFIG.publicUrl : location.origin;
    const url = `${base}/?room=${view.code}`;
    const text = tr('share.text', { code: view.code });
    if (navigator.share) {
      try { await navigator.share({ title: 'Pizza Panic', text, url }); return; } catch { /* abgebrochen */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast(tr('share.copied'));
    } catch {
      toast(url);
    }
  }

  function joinByCode(code) {
    code = (code || '').trim().toUpperCase();
    if (code.length !== 4) return toast(tr('friends.codeLength'));
    joinTable('/api/join', { code });
  }

  async function saveName() {
    const name = (document.getElementById('newName').value || '').trim();
    if (!name) return toast(tr('profile.nameMissing'));
    try {
      profile = (await post('/api/profile/update', withProfile({ name }))).profile;
      localStorage.setItem(LS_NAME, name);
      closeSheet();
      render();
    } catch (e) {
      if (!handleMissing(e)) toast(e.message);
    }
  }

  function markTutorialDone() {
    if (profile) profile.tutorialDone = true;
    post('/api/profile/update', withProfile({ tutorialDone: true })).catch(() => {});
  }

  // ---------- Eingaben ----------

  function onStack(p, s) {
    const g = game();
    if (!myTurn()) return;
    const key = `${p}:${s}`;
    const tg = targets();
    const stackIdx = s === 'new' ? 'new' : Number(s);
    if (ui.mode === 'place' && tg.has(key)) return send({ type: 'place', cardId: ui.sel, stack: stackIdx });
    if (ui.mode === 'digPick' && tg.has(key)) return send({ type: 'digPick', cardId: ui.dig, stack: stackIdx });
    if (ui.mode === 'burn' && tg.has(key)) {
      const st = g.players[p].tray[stackIdx];
      const what = esc(stackLabel(st, g.recipes));
      openSheet(`<h2>🔥 ${tr('sheet.burn.title')}</h2>
        <div class="stack-preview">${st.map(c => miniCard(c, 30)).join('')}</div>
        <p>${p === me() ? tr('sheet.burn.own', { what }) : tr('sheet.burn.other', { what, name: esc(g.players[p].name) })}</p>
        <div class="btn-row"><button class="btn primary" data-do="burnYes" data-p="${p}" data-s="${stackIdx}">${tr('sheet.burn.yes')}</button><button class="btn ghost" data-do="closeSheet">${tr('btn.cancel')}</button></div>`, 'ctx');
      return;
    }
    if (ui.mode === 'stealSrc' && tg.has(key)) {
      const opts = stealOptions(p, stackIdx);
      const st = g.players[p].tray[stackIdx];
      const from = { player: p, stack: stackIdx };
      if (opts.whole.length && opts.top.length) {
        openSheet(`<h2>✋ ${tr('sheet.steal.title')}</h2>
          <div class="col">
            <button class="btn primary" data-do="stealMode" data-m="whole">${tr('sheet.steal.whole')}</button>
            <button class="btn" data-do="stealMode" data-m="top">${tr('sheet.steal.top', { card: esc(ingName(st[st.length - 1].t)) })}</button>
          </div>`, 'ctx');
        ui.steal = { from, mode: null };
        return;
      }
      ui.steal = { from, mode: opts.whole.length ? 'whole' : 'top' };
      ui.mode = 'stealDst';
      return render();
    }
    if (ui.mode === 'stealDst' && tg.has(key)) {
      return send({ type: 'steal', cardId: ui.sel, mode: ui.steal.mode, from: ui.steal.from, to: { player: p, stack: stackIdx } });
    }
  }

  function onCard(id) {
    const g = game();
    if (!myTurn()) {
      ui.sel = ui.sel === id ? null : id;
      return render();
    }
    if (g.pending) return digSheet();
    if (ui.sel !== id && tutBlocks('card', findCard(id).t)) return;
    if (ui.sel === id) {
      ui = freshUi();
      return render();
    }
    const c = findCard(id);
    ui = freshUi();
    ui.sel = id;
    if (T[c.t].kind === 'ing') ui.mode = 'place';
    render();
  }

  function onPlay() {
    const g = game();
    const c = findCard(ui.sel);
    if (!c) return;
    if (c.t === 'burn') {
      if (!g.players.some(p => p.tray.length)) return toast(tr('toast.nothingToBurn'));
      ui.mode = 'burn';
      return render();
    }
    if (c.t === 'steal') {
      if (!stealSources().length) return toast(tr('toast.nothingToSteal'));
      ui.mode = 'stealSrc';
      return render();
    }
    if (c.t === 'dig') return send({ type: 'dig', cardId: c.id });
    if (c.t === 'swap') {
      const n = g.players.length;
      const prev = g.players[(me() - 1 + n) % n].name;
      const next = g.players[(me() + 1) % n].name;
      openSheet(`<h2>${tr('fx.swap.title')}</h2>
        <p class="note">${tr('sheet.swap.note')}</p>
        <div class="col">
          <button class="btn" data-do="swapDir" data-d="next">${tr('sheet.swap.next')}<br><small>${tr('sheet.swap.get', { name: esc(prev) })}</small></button>
          <button class="btn" data-do="swapDir" data-d="prev">${tr('sheet.swap.prev')}<br><small>${tr('sheet.swap.get', { name: esc(next) })}</small></button>
        </div>`, 'ctx');
    }
  }

  function onPair() {
    const g = game();
    const c = findCard(ui.sel);
    const twin = twinOf(c);
    if (!twin) return;
    openSheet(`<h2>👯 ${tr('sheet.pair.title')}</h2>
      <p class="note">${tr('sheet.pair.note', { card: esc(ingName(c.t)) })}</p>
      <div class="col">${g.players.map((p, i) => i === me() || !p.handCount ? '' :
        `<button class="btn" data-do="pairTarget" data-i="${i}">${esc(p.name)} <small>(${tr(p.handCount > 1 ? 'sheet.pair.cards.other' : 'sheet.pair.cards.one', { n: p.handCount })})</small></button>`).join('')}</div>`, 'ctx');
  }

  async function click(e) {
    const el = e.target.closest('[data-do]');
    if (!el) return;
    const d = el.dataset;
    if (['end', 'discard', 'play', 'pair', 'cancel'].includes(d.do) && tutBlocks('button', d.do)) return;
    if (d.do === 'card') Snd.play('select');
    else if (el.matches('.btn, .mbtn, .tbtn, .seg button, .mode-card, .tabs button, .theme-chip, .emote-btn')) Snd.play('click');
    switch (d.do) {
      case 'onboard': return createProfile();
      case 'create': return joinTable('/api/create');
      case 'join': return joinByCode(document.getElementById('code')?.value);
      case 'joinInvite': return joinByCode(roomParam());
      case 'friends': return friendsSheet();
      case 'quick': return quickSheet();
      case 'quickReal':
        closeSheet();
        return startQuick();
      case 'botCfg':
        botCfg[d.key] = d.key === 'opponents' ? Number(d.id) : d.id;
        return quickSheet();
      case 'startBots': return startBots();
      case 'againBots':
        leaveTable(true);
        return startBots();
      case 'cancelQuick': return cancelQuick();
      case 'tutorial':
        tutStep = null;
        return joinTable('/api/tutorial');
      case 'skipTutorial':
        markTutorialDone();
        return render();
      case 'coachNext':
        tutStep++;
        return render();
      case 'coachSkip':
        if (!confirm(tr('tut.skip.confirm'))) return;
        tutStep = TUT.length;
        return render();
      case 'editName': return nameSheet();
      case 'saveName': return saveName();
      case 'deleteProfile': return deleteProfile();
      case 'levels': return levelsSheet();
      case 'audio': return audioSheet();
      case 'lang': return langSheet();
      case 'setLang': return setLang(d.id);
      case 'toggleMusic':
        Snd.setMusic(!Snd.music);
        return audioSheet();
      case 'toggleSfx':
        Snd.setSfx(!Snd.sfx);
        if (Snd.sfx) Snd.play('select');
        return audioSheet();
      case 'setTheme': return send({ type: 'setTheme', theme: d.id || null });
      case 'themeShop':
        // Locked pack in the lobby: leave the table view for the shop, the table stays open.
        toast(tr('toast.themeShop'));
        return;
      case 'openShop':
        shopTab = 'themes';
        window.scrollTo(0, 0);
        return render();
      case 'closeShop':
        shopTab = null;
        return render();
      case 'shopTab':
        shopTab = d.id;
        return render();
      case 'buyItem': {
        const ok = await shopPost('/api/shop/buy', { item: d.id });
        if (ok) celebrate(`🎉 ${tr('toast.unlocked')}`);
        return;
      }
      case 'equipTray': return shopPost('/api/shop/equip', { tray: d.id });
      case 'buyIap': return buyIap(d.id);
      case 'adCoins': return watchForCoins();
      case 'emotes': return emoteSheet();
      case 'sendEmote':
        closeSheet();
        return post('/api/action', { ...session, action: { type: 'emote', id: d.id } })
          .then(j => applyView(j.view))
          .catch(e => toast(e.message));
      case 'double': return doubleReward();
      case 'home': return leaveTable();
      case 'again':
        leaveTable(true);
        return startQuick();
      case 'rules': return rulesSheet();
      case 'menu': return menuSheet();
      case 'trash': return trashSheet();
      case 'log': return logSheet();
      case 'more': return moreSheet();
      case 'share': return share();
      case 'closeSheet':
        if (sheetKind === 'ctx' && ui.steal && !ui.steal.mode) ui = freshUi();
        closeSheet();
        return render();
      case 'addBot': return send({ type: 'addBot' });
      case 'start': return send({ type: 'start' });
      case 'restart': return send({ type: 'restart' });
      case 'kick': return send({ type: 'kick', target: Number(d.i) });
      case 'leave':
        if (!confirm(tr(game() && game().winner == null ? 'lobby.leave.confirmGame' : 'lobby.leave.confirm'))) return;
        return leaveTable();
      case 'card': return onCard(Number(d.id));
      case 'stack': return onStack(Number(d.p), d.s);
      case 'cancel':
        ui = freshUi();
        return render();
      case 'end': return send({ type: 'end' });
      case 'discard': return send({ type: 'discard', cardId: ui.sel });
      case 'play': return onPlay();
      case 'pair': return onPair();
      case 'pairTarget': {
        const c = findCard(ui.sel);
        return send({ type: 'pair', cardIds: [c.id, twinOf(c).id], target: Number(d.i) });
      }
      case 'burnYes': return send({ type: 'burn', cardId: ui.sel, target: { player: Number(d.p), stack: Number(d.s) } });
      case 'stealMode':
        ui.steal.mode = d.m;
        ui.mode = 'stealDst';
        closeSheet();
        return render();
      case 'swapDir': return send({ type: 'swap', cardId: ui.sel, dir: d.d });
      case 'digOpen': return digSheet();
      case 'digPick':
        ui = freshUi();
        ui.dig = Number(d.id);
        ui.mode = 'digPick';
        closeSheet();
        return render();
    }
  }

  app.addEventListener('click', click);
  sheet.addEventListener('click', click);
  coachEl.addEventListener('click', click);
  const onEnter = e => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'code') joinByCode(e.target.value);
    if (e.target.id === 'name') createProfile();
    if (e.target.id === 'newName') saveName();
  };
  app.addEventListener('keydown', onEnter);
  sheet.addEventListener('keydown', onEnter);

  // Android back button (in the app): close sheets / cancel the move first, only then leave the app.
  const capApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (capApp) {
    capApp.addListener('backButton', () => {
      if (sheetKind && sheetKind !== 'lock') {
        closeSheet();
        ui = freshUi();
        return render();
      }
      if (ui.sel || ui.mode) {
        ui = freshUi();
        return render();
      }
      if (shopTab && !session) {
        shopTab = null;
        return render();
      }
      capApp.minimizeApp();
    });
    // Reconnect when the app comes back from the background.
    capApp.addListener('resume', () => { if (session) connect(); });
  }

  wakeServer();
  loadProfile().then(recoverPurchases);
  loadIapPrices();
  if (session) connect();
  render();
})();
