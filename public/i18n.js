/* Pizza Panic – Sprachen. Texte liegen je Sprache in public/lang/<code>.js und werden per Schlüssel abgerufen:
   I18n.t('home.play', { name: 'Lena' }) → Platzhalter {name} wird ersetzt. Fehlt ein Text, gilt Deutsch, dann der Schlüssel.
   Werte dürfen HTML enthalten (<b> …); Platzhalter mit Nutzereingaben muss der Aufrufer selbst escapen. */
(function (root, factory) {
  const I = factory();
  if (typeof module === 'object' && module.exports) module.exports = I;
  else root.I18n = I;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LANGS = { de: 'Deutsch', en: 'English', fr: 'Français', es: 'Español', it: 'Italiano' };
  const DICT = {};
  let cur = 'de';

  function add(lang, dict) {
    DICT[lang] = Object.assign(DICT[lang] || {}, dict);
  }

  // First supported language from the device list (e.g. navigator.languages), otherwise English.
  function detect(list) {
    for (const l of list || []) {
      const k = String(l || '').slice(0, 2).toLowerCase();
      if (LANGS[k]) return k;
    }
    return 'en';
  }

  function setLang(l) {
    if (LANGS[l]) cur = l;
    return cur;
  }

  function fill(s, p) {
    return p ? s.replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? p[k] : m)) : s;
  }

  function raw(key, lang) {
    const l = lang || cur;
    if (DICT[l] && DICT[l][key] != null) return DICT[l][key];
    if (DICT.de && DICT.de[key] != null) return DICT.de[key];
    return null;
  }

  // Arrays (e.g. the loading lines) come back as they are.
  function t(key, p) {
    const v = raw(key);
    if (v == null) return key;
    return Array.isArray(v) ? v : fill(v, p);
  }

  // Numbers in the language's format (1.250 / 1,250 / 1 250).
  function num(n) {
    const loc = { de: 'de-DE', en: 'en-GB', fr: 'fr-FR', es: 'es-ES', it: 'it-IT' }[cur];
    try { return Number(n).toLocaleString(loc); } catch { return String(n); }
  }

  return { LANGS, DICT, add, detect, setLang, lang: () => cur, t, has: key => raw(key) != null, num };
});
