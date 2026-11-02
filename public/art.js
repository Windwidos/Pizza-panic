/* Zutaten- und Aktions-Grafiken als SVG. */
window.Art = (function () {
  const OUT = '#3a2a20';

  const S = `stroke="${OUT}" stroke-width="2"`;
  // Round slice with an inner ring, used for salami-like toppings.
  const slice = (fill, inner, dots) => `<circle cx="20" cy="20" r="15" fill="${fill}" ${S}/><circle cx="20" cy="20" r="11" fill="${inner}"/>${dots}`;
  const dots = (pts, r, fill) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`).join('');
  const leaf = (fill, vein) => `<path d="M8 32C6 18 16 6 33 6c1 16-9 28-25 26z" fill="${fill}" ${S} stroke-linejoin="round"/>
      <path d="M10 30C16 22 22 15 30 9M17 23l-1-6M22 18l5 1" stroke="${vein}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;

  const ICONS = {
    sauce: `<path d="M20 4c6 0 9 4 13 6 4 4 3 9 3 12 0 6-4 10-8 12-4 2-10 2-14 0-5-2-9-6-9-12 0-4 0-8 3-11 3-4 6-7 12-7z" fill="#D9342B" ${S}/>
      <path d="M11 15c3-3 6-4 9-4M27 26c-2 2-5 3-8 3" stroke="#F06A5A" stroke-width="2.4" fill="none" stroke-linecap="round"/>${dots([[24, 13], [14, 24], [26, 19]], 1.3, '#7BA34A')}`,
    mozzarella: `<ellipse cx="20" cy="21" rx="15" ry="13" fill="#FFFDF4" ${S}/><ellipse cx="16" cy="17" rx="6" ry="4" fill="#FFFFFF"/>
      <path d="M8 25c4 3 10 4 16 2" stroke="#E9DFC4" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    salami: slice('#B8322E', '#C9443D', dots([[15, 15], [24, 14], [20, 21], [14, 25], [26, 25]], 1.8, '#F3C7B5')),
    ham: `<path d="M6 12c6-6 22-7 28 0 3 5 1 15-4 19-6 4-16 4-21 0C4 27 3 17 6 12z" fill="#F29BA1" ${S}/>
      <path d="M9 14c6-4 16-4 22 0M10 25c5 3 14 3 19 0" stroke="#FCD3D3" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
    mushroom: `<path d="M5 20C5 11 12 6 20 6s15 5 15 14z" fill="#C79A6B" ${S} stroke-linejoin="round"/>
      <path d="M14 20h12v9c0 3-3 5-6 5s-6-2-6-5z" fill="#F4E6CF" ${S} stroke-linejoin="round"/>${dots([[13, 13], [21, 10], [27, 15]], 1.6, '#E8CDA6')}`,
    pepper: `<path d="M9 13c3-5 19-5 22 0 4 7 2 17-3 20-4 2-12 2-16 0-5-3-7-13-3-20z" fill="#3FA34D" ${S}/>
      <path d="M20 9V4M14 15c-1 5-1 11 1 15M26 15c1 5 1 11-1 15" stroke="${OUT}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M11 16c0 4 0 8 2 11" stroke="#7FD18A" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    basil: leaf('#3E9B45', '#21622A'),
    pineapple: `<path d="M8 10h24l-4 24H12z" fill="#F7CD3A" ${S} stroke-linejoin="round"/>
      <path d="M11 17l18 9M10 25l12 6M13 10l17 9M18 10l12 6M29 17l-18 9M30 25l-12 6M27 10l-17 9" stroke="#D9A21C" stroke-width="1.4"/>`,
    chicken: `<path d="M7 18c2-8 12-11 20-9 7 2 9 9 6 15-3 7-12 10-19 8-6-2-9-8-7-14z" fill="#E9A85A" ${S}/>
      <path d="M12 16c4-3 10-4 15-2M11 24c5 3 11 3 16 0" stroke="#B9732F" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    peperoni: `<path d="M10 30C6 22 10 10 22 7c5-1 9 1 10 3-2 1-4 2-5 5-2 7-8 14-17 15z" fill="#E8392B" ${S} stroke-linejoin="round"/>
      <path d="M31 10c1-3 3-5 5-6" stroke="#3E8C3A" stroke-width="3" stroke-linecap="round"/>
      <path d="M14 22c2-4 5-8 10-10" stroke="#FF8A7A" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    onion: `<circle cx="20" cy="20" r="15" fill="none" stroke="#8E3C78" stroke-width="5"/><circle cx="20" cy="20" r="9" fill="none" stroke="#B5579D" stroke-width="4"/>
      <circle cx="20" cy="20" r="15" fill="none" ${S} opacity="0.6"/>`,
    zucchini: `<circle cx="20" cy="20" r="15" fill="#3C7D3A" ${S}/><circle cx="20" cy="20" r="12" fill="#E4EDB0"/>
      ${dots([[20, 14], [25, 18], [23, 24], [17, 24], [15, 18]], 1.3, '#B9C982')}`,
    olive: `<ellipse cx="14" cy="20" rx="8" ry="10" fill="#2A2A2A" ${S}/><ellipse cx="14" cy="20" rx="3" ry="4" fill="#5C5C5C"/>
      <ellipse cx="27" cy="21" rx="8" ry="10" fill="#4E6B2C" ${S}/><ellipse cx="27" cy="21" rx="3" ry="4" fill="#C84B33"/>`,
    tuna: `<path d="M5 22c6-10 22-12 30-2-6 9-22 11-30 2z" fill="#C9A38A" ${S}/>
      <path d="M12 18c2 3 2 6 0 9M19 16c2 4 2 9 0 12M26 17c2 3 2 7 0 10" stroke="#9C735B" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
    shrimp: `<path d="M30 12c-6-6-20-4-22 8-1 8 6 13 13 12 4 0 6-3 5-5-1-3-5-2-7-3-3-2-2-7 2-8 4-1 7 1 9-4z" fill="#F7835A" ${S} stroke-linejoin="round"/>
      <path d="M12 17c3 1 4 4 3 7M17 12c2 2 2 5 1 7" stroke="#FFC0A3" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
    pear: `<path d="M20 6c4 0 5 5 5 8 0 3 8 6 8 13 0 6-6 9-13 9S7 33 7 27c0-7 8-10 8-13 0-3 1-8 5-8z" fill="#C9D85A" ${S}/>
      <path d="M20 6V2" stroke="#6B4A2A" stroke-width="2.4" stroke-linecap="round"/><path d="M21 4c3-2 6-1 7 0-2 2-5 2-7 0z" fill="#4E9B3E"/>`,
    gorgonzola: `<path d="M5 30L20 6l15 24z" fill="#F7F0D6" ${S} stroke-linejoin="round"/>
      ${dots([[17, 17], [22, 21], [14, 25], [26, 26], [20, 13]], 1.8, '#5F8FA8')}`,
  };

  const ACTIONS = { burn: '🔥', steal: '✋', dig: '🗑️', swap: '🔄' };

  // Painted illustrations (Figma AI, see art-src/); the SVGs above stay as fallback.
  const PAINTED = new Set(['burn', 'steal', 'dig', 'swap',
    'sauce', 'mozzarella', 'salami', 'ham', 'mushroom', 'pepper', 'basil',
    'pineapple', 'chicken', 'peperoni', 'onion', 'zucchini', 'olive', 'tuna', 'shrimp', 'pear', 'gorgonzola']);

  function img(name, size, label) {
    return `<img class="ico" src="img/${name}.png" width="${size}" height="${size}" alt="${label}" draggable="false">`;
  }

  // Every layer id is also a single-card type, so its name comes from the language file (ing.<id>).
  function icon(layer, size) {
    const label = I18n.t('ing.' + layer);
    if (PAINTED.has(layer)) return img(layer, size, label);
    return `<svg class="ico" viewBox="0 0 40 40" width="${size}" height="${size}" aria-label="${label}">${ICONS[layer]}</svg>`;
  }

  // Overlapping layer icons for a card (combo cards show several layers).
  function cardArt(t, size) {
    const def = SmashEngine.TYPES[t];
    if (def.kind === 'act') {
      return PAINTED.has(t) ? img(t, size, I18n.t('act.' + t)) : `<span class="act-ico" style="font-size:${size * 0.7}px">${ACTIONS[t]}</span>`;
    }
    const ls = def.layers;
    const step = ls.length > 3 ? size * 0.42 : size * 0.55;
    const w = size + step * (ls.length - 1);
    return `<span class="layers" style="width:${w}px;height:${size}px">${ls.map((l, i) =>
      `<span style="left:${i * step}px;z-index:${10 - i}">${icon(l, size)}</span>`).join('')}</span>`;
  }

  return { icon, cardArt, ACTIONS };
})();
