(() => {
  'use strict';

  const CFG = Object.assign({
    name: 'Masterlist',
    dataUrl: 'data/servers.json',
    refreshSeconds: 300,
    liveServerApi: 'https://frontend.cfx-services.net/api/servers/single/',
    iconUrl: (id, v) => `https://servers-live.fivem.net/servers/icon/${id}/${v}.png`,
    pageSize: 60,
    pinnedServers: [],
    pinnedLiveSeconds: 60,
    liveList: true,
    liveStreamUrl: '',
  }, window.SITE_CONFIG || {});

  const $app = document.getElementById('app');
  const $totals = document.getElementById('totals');
  const $updated = document.getElementById('updatedAt');
  document.getElementById('brandName').textContent = CFG.name;
  const $footBrand = document.getElementById('footBrand');
  if ($footBrand) $footBrand.textContent = CFG.name;

  // ---------------------------------------------------------------- helpers
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n || 0).toLocaleString('en-US');
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // FiveM ^0-^9 colour codes + GTA ~x~ codes
  const stripCodes = (s) => String(s || '').replace(/\^[0-9]/g, '').replace(/~[a-zA-Z]~/g, '').trim();
  function colorize(s) {
    s = String(s || '').replace(/~[a-zA-Z]~/g, '');
    const parts = s.split(/\^([0-9])/);
    let html = esc(parts[0]);
    for (let i = 1; i < parts.length; i += 2) {
      if (parts[i + 1]) html += `<span class="c${parts[i]}">${esc(parts[i + 1])}</span>`;
    }
    return html.trim() || esc(stripCodes(s));
  }

  const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : '');

  // Vars that are engine settings rather than owner-provided details.
  const HIDDEN_VARS = /^(sv_|onesync|gamename|locale|tags|premium|banner_|icon_url|peak_players|txAdmin|activitypub|game_build|gametype|mapname|enhancedHostSupport)/i;
  function linkify(v) {
    v = String(v).trim();
    if (/^https?:\/\/\S+$/i.test(v)) return `<a href="${esc(v)}" target="_blank" rel="noopener nofollow" style="color:var(--accent)">${esc(v.replace(/^https?:\/\//, ''))}</a>`;
    if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v)) return `<a href="https://${esc(v)}" target="_blank" rel="noopener nofollow" style="color:var(--accent)">${esc(v)}</a>`;
    return colorize(v);
  }

  const regionNames = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
  const langNames = (() => { try { return new Intl.DisplayNames(['en'], { type: 'language' }); } catch { return null; } })();
  const countryName = (cc) => { if (!cc) return 'Unknown'; try { return regionNames?.of(cc) || cc; } catch { return cc; } };
  const languageName = (l) => { if (!l) return ''; try { return langNames?.of(l) || l; } catch { return l; } };
  const flag = (cc) => (cc ? `<span class="fi fi-${esc(cc.toLowerCase())}"></span>` : `<span class="fi">${ICON.globe}</span>`);

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  const ICON = {
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    user: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6z"/></svg>',
    rocket: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c3.5 2 6 6 6 10l-2.5 3h-7L6 12c0-4 2.5-8 6-10zm0 6.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM8 17h8l-1.5 4h-5z"/></svg>',
    star: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.5 2.9 6.2 6.6.7-5 4.5 1.4 6.6L12 17.2l-5.9 3.3 1.4-6.6-5-4.5 6.6-.7z"/></svg>',
    starO: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 2.5 2.9 6.2 6.6.7-5 4.5 1.4 6.6L12 17.2l-5.9 3.3 1.4-6.6-5-4.5 6.6-.7z"/></svg>',
    arrowDown: '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M1 3h8L5 8z"/></svg>',
    arrowUp: '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M1 7h8L5 2z"/></svg>',
    back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 18 9 12l6-6"/></svg>',
    filter: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 5h18M6 12h12M10 19h4"/></svg>',
    play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>',
    pin: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 3l5 5-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z"/></svg>',
    chart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/></svg>',
    globe: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/></svg>',
  };

  const PREMIUM = { pt: 'Platinum', au: 'Gold', ag: 'Silver' };

  // ------------------------------------------------------------------ data
  let ALL = [];
  let BY_ID = new Map();
  let updatedAt = null;

  function hydrate(json) {
    const f = json.fields;
    const idx = Object.fromEntries(f.map((k, i) => [k, i]));
    const list = new Array(json.servers.length);
    for (let i = 0; i < json.servers.length; i++) {
      const r = json.servers[i];
      const o = {};
      for (const k in idx) o[k] = r[idx[k]];
      const display = o.projectName || o.hostname;
      o.plain = stripCodes(display) || o.id;
      o.sortName = o.plain.toLowerCase().replace(/^[^a-z0-9]+/, '');
      const [lang, region] = String(o.locale || '').split(/[-_]/);
      o.lang = lang && lang !== 'root' ? lang.toLowerCase() : '';
      o.country = region && region.toUpperCase() !== 'AQ' && /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : '';
      o.tagList = o.tags ? o.tags.split(',') : [];
      o.blob = `${o.plain} ${stripCodes(o.hostname)} ${stripCodes(o.projectDesc)} ${o.tags} ${o.id} ${o.gametype} ${o.mapname}`.toLowerCase();
      o.full = o.maxClients > 0 && o.clients >= o.maxClients;
      list[i] = o;
    }
    ALL = list;
    BY_ID = new Map(list.map((s) => [s.id, s]));
    updatedAt = json.updatedAt ? new Date(json.updatedAt) : null;
    // Re-apply live numbers we fetched after this snapshot was built.
    for (const [id, o] of LIVE) {
      if (updatedAt && o.at < updatedAt.getTime()) { LIVE.delete(id); continue; }
      patchServer(BY_ID.get(id), o);
    }
  }

  // ---- live numbers (from the single-server endpoint) layered over the snapshot
  const LIVE = new Map();
  function patchServer(s, o) {
    if (!s || !o) return;
    s.clients = o.clients; s.maxClients = o.maxClients || s.maxClients; s.upvotePower = o.upvotePower ?? s.upvotePower;
    s.full = s.maxClients > 0 && s.clients >= s.maxClients;
  }
  function applyLive(id, live) {
    const d = live && live.Data;
    if (!d || typeof d.clients !== 'number') return false;
    const o = { at: Date.now(), clients: d.clients, maxClients: d.svMaxclients ?? d.sv_maxclients, upvotePower: d.upvotePower };
    LIVE.set(id, o);
    patchServer(BY_ID.get(id), o);
    return true;
  }
  async function fetchLive(id) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(CFG.liveServerApi + encodeURIComponent(id), { signal: ctrl.signal, cache: 'no-store' });
      return res.ok ? await res.json() : null;
    } catch { return null; } finally { clearTimeout(t); }
  }

  let isLive = false;
  async function loadData() {
    const res = await fetch(CFG.dataUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    // Never replace newer live-stream data with an older snapshot.
    if (updatedAt && json.updatedAt && Date.parse(json.updatedAt) <= updatedAt.getTime()) return false;
    hydrate(json);
    isLive = false;
    renderTotals();
    return true;
  }

  // Full live list from Cfx.re, decoded in a Web Worker (assets/live-worker.js).
  let liveRunning = false;
  // Cfx.re's stream sometimes refuses other websites (CORS). After a failure, wait before
  // trying again (remembered across reloads) so the console isn't flooded with errors.
  const LIVE_BACKOFF_MS = 15 * 60 * 1000;
  const liveBlockedUntil = () => { try { return +sessionStorage.getItem('liveBlockedUntil') || 0; } catch { return 0; } };
  function loadLiveList() {
    if (liveRunning || !CFG.liveList || typeof Worker === 'undefined' || Date.now() < liveBlockedUntil()) return Promise.resolve(false);
    liveRunning = true;
    return new Promise((resolve) => {
      let w;
      const finish = (ok) => {
        liveRunning = false;
        try { w && w.terminate(); } catch { /* ignore */ }
        try { if (ok) sessionStorage.removeItem('liveBlockedUntil'); else sessionStorage.setItem('liveBlockedUntil', String(Date.now() + LIVE_BACKOFF_MS)); } catch { /* ignore */ }
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), 90000);
      try {
        const src = document.querySelector('meta[name="live-worker"]')?.content || 'assets/live-worker.js';
        w = new Worker(src);
      } catch { clearTimeout(timer); finish(false); return; }
      w.onmessage = (e) => {
        clearTimeout(timer);
        if (e.data?.type === 'done') { hydrate(e.data.data); isLive = true; renderTotals(); finish(true); }
        else finish(false);
      };
      w.onerror = () => { clearTimeout(timer); finish(false); };
      w.postMessage({ url: CFG.liveStreamUrl || '' });
    });
  }

  // ----------------------------------------------------------------- state
  const DEFAULTS = { list: 'all', game: 'fivem', q: '', sort: 'players', dir: 'desc', country: [], tag: [], lang: [], hideEmpty: false, hideFull: false };
  let state = { ...DEFAULTS, game: store.get('game', 'fivem') };
  let favorites = new Set(store.get('favorites', []));

  function parseHash() {
    const h = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = h.split('?');
    const p = new URLSearchParams(qs || '');
    const m = path.match(/^\/servers\/detail\/([^/]+)/);
    if (m) return { view: 'detail', id: decodeURIComponent(m[1]) };
    const arr = (k) => (p.get(k) ? p.get(k).split(',').filter(Boolean) : []);
    return {
      view: 'list',
      state: {
        list: ['all', 'favorites'].includes(p.get('list')) ? p.get('list') : 'all',
        game: p.get('game') === 'redm' ? 'redm' : (p.get('game') === 'fivem' ? 'fivem' : state.game),
        q: p.get('q') || '',
        sort: ['players', 'boosts', 'name', 'country'].includes(p.get('sort')) ? p.get('sort') : 'players',
        dir: p.get('dir') === 'asc' ? 'asc' : (p.get('dir') === 'desc' ? 'desc' : (p.get('sort') === 'name' || p.get('sort') === 'country' ? 'asc' : 'desc')),
        // Filters missing from the URL come from the last visit (saved in localStorage).
        country: p.has('country') ? arr('country').map((c) => c.toUpperCase()) : savedFilters().country,
        tag: p.has('tag') ? arr('tag') : savedFilters().tag,
        lang: p.has('lang') ? arr('lang') : savedFilters().lang,
        hideEmpty: p.get('hideEmpty') === '1',
        hideFull: p.get('hideFull') === '1',
      },
    };
  }

  function stateToHash(s) {
    const p = new URLSearchParams();
    if (s.list !== 'all') p.set('list', s.list);
    if (s.game !== 'fivem') p.set('game', s.game);
    if (s.q) p.set('q', s.q);
    if (s.sort !== 'players') p.set('sort', s.sort);
    const defDir = s.sort === 'name' || s.sort === 'country' ? 'asc' : 'desc';
    if (s.dir !== defDir) p.set('dir', s.dir);
    if (s.country.length) p.set('country', s.country.join(','));
    if (s.tag.length) p.set('tag', s.tag.join(','));
    if (s.lang.length) p.set('lang', s.lang.join(','));
    if (s.hideEmpty) p.set('hideEmpty', '1');
    if (s.hideFull) p.set('hideFull', '1');
    const qs = p.toString().replace(/%2C/g, ',');
    return '#/' + (qs ? '?' + qs : '');
  }

  function savedFilters() {
    const f = store.get('filters', {});
    const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x).slice(0, 50) : []);
    return { country: list(f.country), tag: list(f.tag), lang: list(f.lang) };
  }

  function saveFilters() {
    store.set('filters', { country: state.country, tag: state.tag, lang: state.lang });
  }

  function setState(patch) {
    state = { ...state, ...patch };
    store.set('game', state.game);
    saveFilters();
    history.replaceState(null, '', stateToHash(state));
    updateList();
  }

  // ------------------------------------------------------------- filtering
  function parseQuery(q) {
    const terms = [], not = [], tags = [], locales = [];
    let minPlayers = null;
    const re = /(-?)(?:(\w+):)?(?:"([^"]+)"|(\S+))/g;
    let m;
    while ((m = re.exec(q))) {
      const neg = m[1] === '-';
      const key = (m[2] || '').toLowerCase();
      const val = (m[3] || m[4] || '').toLowerCase();
      if (!val) continue;
      if (key === 'tag') tags.push([neg, val]);
      else if (key === 'locale' || key === 'country' || key === 'lang') locales.push([neg, val]);
      else if (key === 'players' && /^\d+$/.test(val)) minPlayers = +val;
      else if (key) (neg ? not : terms).push(`${key}:${val}`);
      else (neg ? not : terms).push(val);
    }
    return { terms, not, tags, locales, minPlayers };
  }

  function baseSet() {
    let list = ALL.filter((s) => s.game === state.game);
    if (state.list === 'favorites') list = list.filter((s) => favorites.has(s.id));
    return list;
  }

  function applyFilters(list, skip = '') {
    const pq = parseQuery(state.q);
    const countries = new Set(state.country);
    const tags = state.tag;
    const langs = new Set(state.lang);
    return list.filter((s) => {
      if (state.hideEmpty && s.clients === 0) return false;
      if (state.hideFull && s.full) return false;
      if (skip !== 'country' && countries.size && !countries.has(s.country || '--')) return false;
      if (skip !== 'lang' && langs.size && !langs.has(s.lang || '--')) return false;
      if (skip !== 'tag' && tags.length && !tags.every((t) => s.tagList.includes(t))) return false;
      if (pq.minPlayers !== null && s.clients < pq.minPlayers) return false;
      for (const t of pq.terms) if (!s.blob.includes(t)) return false;
      for (const t of pq.not) if (s.blob.includes(t)) return false;
      for (const [neg, t] of pq.tags) { const has = s.tagList.some((x) => x.includes(t)); if (has === neg) return false; }
      for (const [neg, l] of pq.locales) {
        const has = (s.locale || '').toLowerCase().includes(l) || (s.country && countryName(s.country).toLowerCase().includes(l));
        if (has === neg) return false;
      }
      return true;
    });
  }

  // Same tie-breaking the official list uses: players → boosts → name.
  const cmpName = (a, b) => (a.sortName < b.sortName ? -1 : a.sortName > b.sortName ? 1 : 0);
  const SORTERS = {
    players: (a, b) => (b.clients - a.clients) || (b.upvotePower - a.upvotePower) || cmpName(a, b),
    boosts: (a, b) => (b.upvotePower - a.upvotePower) || (b.clients - a.clients) || cmpName(a, b),
    name: (a, b) => cmpName(a, b) || (b.clients - a.clients),
    country: (a, b) => {
      const ca = a.country ? countryName(a.country) : '￿', cb = b.country ? countryName(b.country) : '￿';
      return (ca < cb ? -1 : ca > cb ? 1 : 0) || (b.clients - a.clients);
    },
  };
  const DEFAULT_DIR = { players: 'desc', boosts: 'desc', name: 'asc', country: 'asc' };

  function sortList(list) {
    const fn = SORTERS[state.sort] || SORTERS.players;
    const flip = state.dir !== DEFAULT_DIR[state.sort];
    return list.sort(flip ? (a, b) => fn(b, a) : fn);
  }

  function facetCounts(list, keyFn) {
    const m = new Map();
    for (const s of list) for (const k of keyFn(s)) m.set(k, (m.get(k) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }

  // ------------------------------------------------------------- rendering
  // CFX now publishes each server's icon as the `icon_url` var (cfx-server-metadata host).
  // Older servers may still only have an iconVersion on the legacy icon CDN.
  function iconSrc(s) {
    return safeUrl(s.iconUrl) || (s.iconVersion ? CFG.iconUrl(s.id, s.iconVersion) : '');
  }

  function iconHtml(s, cls = 'icon') {
    const letter = esc((s.plain.match(/[a-z0-9]/i) || ['?'])[0].toUpperCase());
    const src = iconSrc(s);
    if (!src) return `<div class="${cls}">${letter}</div>`;
    return `<div class="${cls}" data-letter="${letter}"><img loading="lazy" alt="" referrerpolicy="no-referrer" src="${esc(src)}" onerror="this.parentNode.textContent=this.parentNode.dataset.letter"></div>`;
  }

  function rowHtml(s) {
    const pct = s.maxClients ? Math.min(100, (s.clients / s.maxClients) * 100) : 0;
    const name = s.projectName || s.hostname;
    const desc = s.projectName ? (s.projectDesc || stripCodes(s.hostname)) : s.projectDesc;
    const fav = favorites.has(s.id);
    return `<a class="row${s.premium ? ' premium ' + esc(s.premium) : ''}" href="#/servers/detail/${encodeURIComponent(s.id)}">
      ${iconHtml(s)}
      <div class="title">
        <div class="name">${s.premium && PREMIUM[s.premium] ? `<span class="badge ${esc(s.premium)}">${PREMIUM[s.premium]}</span>` : ''}<span class="txt">${colorize(name)}</span></div>
        ${desc ? `<div class="desc">${colorize(desc)}</div>` : ''}
        ${s.tagList.length ? `<div class="row-tags">${s.tagList.slice(0, 6).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="country" title="${esc(s.locale)}">${flag(s.country)}<span>${esc(s.country ? countryName(s.country) : 'Unknown')}</span></div>
      <div class="players">
        <div class="num">${ICON.user}${fmt(s.clients)}<small>/ ${fmt(s.maxClients)}</small></div>
        <div class="bar"><i class="${s.full ? 'full' : ''}${s.clients ? '' : ' empty'}" style="width:${pct.toFixed(1)}%"></i></div>
      </div>
      <div class="boosts${s.upvotePower ? ' has' : ''}" title="Boosts">${ICON.rocket}${fmt(s.upvotePower)}</div>
      <button class="fav${fav ? ' on' : ''}" data-fav="${esc(s.id)}" title="${fav ? 'Remove from favorites' : 'Add to favorites'}">${fav ? ICON.star : ICON.starO}</button>
    </a>`;
  }

  // Pinned project banner(s) — always first on "All servers", whatever the sort or filters.
  function renderPinned() {
    const $p = document.getElementById('pinned');
    if (!$p) return;
    const ids = state.list === 'all' ? (CFG.pinnedServers || []) : [];
    $p.innerHTML = ids.map((id) => BY_ID.get(id)).filter(Boolean).map((s) => {
      const banner = safeUrl(s.bannerDetail) || safeUrl(s.bannerConnecting);
      const icon = iconSrc(s);
      const pct = s.maxClients ? Math.min(100, (s.clients / s.maxClients) * 100) : 0;
      const bg = banner ? `<img class="pin-bg" src="${esc(banner)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">`
        : icon ? `<img class="pin-bg blur" src="${esc(icon)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
      const join = `cfx.re/join/${s.id}`;
      return `<a class="pinned" href="#/servers/detail/${encodeURIComponent(s.id)}">
        ${bg}<div class="pin-shade"></div>
        <span class="pin-label">${ICON.pin} Pinned</span>
        <div class="pin-body">
          ${iconHtml(s)}
          <div class="pin-text">
            <div class="pin-name">${s.premium && PREMIUM[s.premium] ? `<span class="badge ${esc(s.premium)}">${PREMIUM[s.premium]}</span>` : ''}<span>${colorize(s.projectName || s.hostname)}</span></div>
            ${s.projectDesc ? `<div class="pin-desc">${colorize(s.projectDesc)}</div>` : ''}
            <div class="pin-meta">
              <span>${flag(s.country)} ${esc(s.country ? countryName(s.country) : 'Unknown')}</span>
              <span>${ICON.user} <b>${fmt(s.clients)}</b> / ${fmt(s.maxClients)}</span>
              ${s.upvotePower ? `<span class="boost">${ICON.rocket} ${fmt(s.upvotePower)}</span>` : ''}
            </div>
            <div class="bar"><i class="${s.full ? 'full' : ''}" style="width:${pct.toFixed(1)}%"></i></div>
          </div>
          <span class="btn primary pin-connect" data-connect="${s.game === 'redm' ? 'redm' : 'fivem'}://connect/${esc(join)}">${ICON.play} Connect</span>
        </div>
      </a>`;
    }).join('');
  }

  let currentList = [];
  let shown = 0;
  let observer = null;

  function renderListShell() {
    $app.innerHTML = `
      <div class="layout">
        <aside class="sidebar" id="sidebar">
          <div class="panel">
            <h3>Show</h3>
            <label class="toggle"><span>Hide empty servers</span><input type="checkbox" id="hideEmpty"><span class="sw"></span></label>
            <label class="toggle"><span>Hide full servers</span><input type="checkbox" id="hideFull"><span class="sw"></span></label>
          </div>
          <div class="panel">
            <h3>Country <button data-clear="country">Clear</button></h3>
            <input class="mini-search" id="countrySearch" placeholder="Find a country">
            <div class="facet-list" id="countryFacets"></div>
          </div>
          <div class="panel">
            <h3>Language <button data-clear="lang">Clear</button></h3>
            <div class="facet-list" id="langFacets"></div>
          </div>
          <div class="panel">
            <h3>Tags <button data-clear="tag">Clear</button></h3>
            <input class="mini-search" id="tagSearch" placeholder="Find a tag">
            <div class="tag-cloud" id="tagFacets"></div>
          </div>
          <button class="btn primary filters-btn" id="closeFilters" style="justify-content:center">Show results</button>
        </aside>
        <section>
          <div class="toolbar">
            <label class="search" id="searchBox">${ICON.search}
              <input id="q" type="text" placeholder="Search servers, tags or locale:pl, tag:rp, -word" autocomplete="off" spellcheck="false">
              <button class="clear" id="clearQ" title="Clear">${ICON.x}</button>
            </label>
            <button class="btn filters-btn" id="openFilters">${ICON.filter} Filters</button>
          </div>
          <div id="pinned"></div>
          <div class="active-filters" id="activeFilters"></div>
          <div class="list">
            <div class="list-head">
              <span></span>
              <button data-sort="name">Server <i></i></button>
              <button data-sort="country" class="col-country"><span>Country</span> <i></i></button>
              <button data-sort="players" class="r">Players <i></i></button>
              <button data-sort="boosts" class="r">Boosts <i></i></button>
              <span></span>
            </div>
            <div id="rows"></div>
            <div class="list-foot" id="listFoot"></div>
          </div>
        </section>
      </div>`;

    const $q = document.getElementById('q');
    const $box = document.getElementById('searchBox');
    $q.value = state.q;
    $box.classList.toggle('has-value', !!state.q);
    const onQ = debounce(() => setState({ q: $q.value.trim() }), 140);
    $q.addEventListener('input', () => { $box.classList.toggle('has-value', !!$q.value); onQ(); });
    document.getElementById('clearQ').addEventListener('click', (e) => { e.preventDefault(); $q.value = ''; $box.classList.remove('has-value'); setState({ q: '' }); $q.focus(); });

    document.getElementById('hideEmpty').addEventListener('change', (e) => setState({ hideEmpty: e.target.checked }));
    document.getElementById('hideFull').addEventListener('change', (e) => setState({ hideFull: e.target.checked }));
    document.getElementById('openFilters').addEventListener('click', () => document.body.classList.add('filters-open'));
    document.getElementById('closeFilters').addEventListener('click', () => document.body.classList.remove('filters-open'));
    document.getElementById('countrySearch').addEventListener('input', renderFacets);
    document.getElementById('tagSearch').addEventListener('input', renderFacets);

    $app.querySelectorAll('[data-clear]').forEach((b) => b.addEventListener('click', () => setState({ [b.dataset.clear]: [] })));
    $app.querySelectorAll('.list-head [data-sort]').forEach((b) => b.addEventListener('click', () => {
      const sort = b.dataset.sort;
      const dir = state.sort === sort ? (state.dir === 'asc' ? 'desc' : 'asc') : DEFAULT_DIR[sort];
      setState({ sort, dir });
    }));

    $app.addEventListener('click', onListClick);

    const sentinel = document.getElementById('listFoot');
    observer = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) renderMore(); }, { rootMargin: '800px' });
    observer.observe(sentinel);
  }

  function onListClick(e) {
    const con = e.target.closest('[data-connect]');
    if (con) { e.preventDefault(); e.stopPropagation(); location.href = con.dataset.connect; return; }
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      e.preventDefault(); e.stopPropagation();
      toggleFav(fav.dataset.fav);
      const on = favorites.has(fav.dataset.fav);
      fav.classList.toggle('on', on);
      fav.innerHTML = on ? ICON.star : ICON.starO;
      return;
    }
    const facet = e.target.closest('[data-facet]');
    if (facet) {
      const key = facet.dataset.facet, val = facet.dataset.value;
      const cur = new Set(state[key]);
      cur.has(val) ? cur.delete(val) : cur.add(val);
      setState({ [key]: [...cur] });
      return;
    }
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      const [key, val] = [rm.dataset.remove, rm.dataset.value];
      if (key === 'q') { setState({ q: '' }); document.getElementById('q').value = ''; }
      else if (key === 'hideEmpty' || key === 'hideFull') setState({ [key]: false });
      else setState({ [key]: state[key].filter((x) => x !== val) });
    }
  }

  function toggleFav(id) {
    favorites.has(id) ? favorites.delete(id) : favorites.add(id);
    store.set('favorites', [...favorites]);
  }

  let facetBase = [];
  function renderFacets() {
    const cq = (document.getElementById('countrySearch')?.value || '').toLowerCase();
    const tq = (document.getElementById('tagSearch')?.value || '').toLowerCase();

    const countries = facetCounts(applyFilters(facetBase, 'country'), (s) => [s.country || '--']);
    const selC = new Set(state.country);
    document.getElementById('countryFacets').innerHTML = countries
      .map(([cc, n]) => ({ cc, n, name: cc === '--' ? 'Unknown' : countryName(cc) }))
      .filter((c) => !cq || c.name.toLowerCase().includes(cq) || c.cc.toLowerCase() === cq)
      .sort((a, b) => selC.has(b.cc) - selC.has(a.cc) || b.n - a.n)
      .map((c) => `<button class="facet${selC.has(c.cc) ? ' on' : ''}" data-facet="country" data-value="${esc(c.cc)}">${flag(c.cc === '--' ? '' : c.cc)}<span class="lbl">${esc(c.name)}</span><span class="count">${fmt(c.n)}</span></button>`)
      .join('') || '<div class="note">No matches</div>';

    const langs = facetCounts(applyFilters(facetBase, 'lang'), (s) => [s.lang || '--']);
    const selL = new Set(state.lang);
    document.getElementById('langFacets').innerHTML = langs.slice(0, 40)
      .sort((a, b) => selL.has(b[0]) - selL.has(a[0]) || b[1] - a[1])
      .map(([l, n]) => `<button class="facet${selL.has(l) ? ' on' : ''}" data-facet="lang" data-value="${esc(l)}"><span class="lbl">${esc(l === '--' ? 'Not set' : languageName(l))}</span><span class="count">${fmt(n)}</span></button>`)
      .join('');

    const tags = facetCounts(applyFilters(facetBase, 'tag'), (s) => s.tagList);
    const selT = new Set(state.tag);
    const tagItems = tags.filter(([t]) => !tq || t.includes(tq));
    const top = [...state.tag.map((t) => [t, (tags.find((x) => x[0] === t) || [t, 0])[1]]), ...tagItems.filter(([t]) => !selT.has(t)).slice(0, 40)];
    document.getElementById('tagFacets').innerHTML = top
      .map(([t, n]) => `<button class="chip${selT.has(t) ? ' on' : ''}" data-facet="tag" data-value="${esc(t)}" title="${fmt(n)} servers">${esc(t)}</button>`)
      .join('') || '<div class="note">No matches</div>';
  }

  function renderActiveFilters() {
    const chips = [];
    const chip = (key, val, label) => `<button class="chip" data-remove="${key}" data-value="${esc(val)}">${label} <span>${ICON.x}</span></button>`;
    if (state.q) chips.push(chip('q', '', `“${esc(state.q)}”`));
    state.country.forEach((c) => chips.push(chip('country', c, `${flag(c === '--' ? '' : c)} ${esc(c === '--' ? 'Unknown' : countryName(c))}`)));
    state.lang.forEach((l) => chips.push(chip('lang', l, esc(l === '--' ? 'No language' : languageName(l)))));
    state.tag.forEach((t) => chips.push(chip('tag', t, '#' + esc(t))));
    if (state.hideEmpty) chips.push(chip('hideEmpty', '', 'Not empty'));
    if (state.hideFull) chips.push(chip('hideFull', '', 'Not full'));
    document.getElementById('activeFilters').innerHTML = chips.join('');
  }

  function updateList(keepCount = false) {
    if (!document.getElementById('rows')) renderListShell();

    document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.list === state.list));
    document.querySelectorAll('#gameSwitch button').forEach((b) => b.classList.toggle('active', b.dataset.game === state.game));
    document.getElementById('hideEmpty').checked = state.hideEmpty;
    document.getElementById('hideFull').checked = state.hideFull;
    const $q = document.getElementById('q');
    if (document.activeElement !== $q && $q.value !== state.q) $q.value = state.q;

    $app.querySelectorAll('.list-head [data-sort]').forEach((b) => {
      const on = b.dataset.sort === state.sort;
      b.classList.toggle('sorted', on);
      b.querySelector('i').innerHTML = on ? (state.dir === 'asc' ? ICON.arrowUp : ICON.arrowDown) : '';
    });

    facetBase = baseSet();
    currentList = sortList(applyFilters(facetBase));

    const prev = shown;
    shown = 0;
    document.getElementById('rows').innerHTML = '';
    renderMore(keepCount ? Math.max(prev, CFG.pageSize) : CFG.pageSize);
    renderFacets();
    renderActiveFilters();
    renderPinned();
    document.title = `${state.list === 'favorites' ? 'Favorites' : 'Servers'} · ${CFG.name}`;
  }

  function renderMore(count = CFG.pageSize) {
    const $rows = document.getElementById('rows');
    const $foot = document.getElementById('listFoot');
    if (!$rows) return;
    if (!currentList.length) {
      $rows.innerHTML = state.list === 'favorites' && !favorites.size
        ? '<div class="empty-state"><b>No favorites yet</b>Star a server to pin it here.</div>'
        : '<div class="empty-state"><b>No servers found</b>Try removing a filter or changing your search.</div>';
      $foot.textContent = '';
      return;
    }
    const next = currentList.slice(shown, shown + count);
    if (next.length) $rows.insertAdjacentHTML('beforeend', next.map(rowHtml).join(''));
    shown += next.length;
    const players = currentList.reduce((n, s) => n + s.clients, 0);
    $foot.textContent = shown < currentList.length
      ? `Showing ${fmt(shown)} of ${fmt(currentList.length)} servers…`
      : `${fmt(currentList.length)} servers · ${fmt(players)} players`;
  }

  function renderTotals() {
    const list = ALL.filter((s) => s.game === state.game);
    const players = list.reduce((n, s) => n + s.clients, 0);
    const age = updatedAt ? Math.max(0, Math.round((Date.now() - updatedAt.getTime()) / 60000)) : null;
    $totals.innerHTML = `<span><b>${fmt(players)}</b> players</span><span><b>${fmt(list.length)}</b> servers</span>`
      + (age !== null ? `<span class="${isLive ? 'live-dot' : ''}" title="${isLive ? 'Live from Cfx.re' : 'Snapshot'} · ${esc(updatedAt.toLocaleString())}">${isLive ? 'Live · ' : ''}Updated ${age < 1 ? 'just now' : age + ' min ago'}</span>` : '');
    if ($updated) $updated.textContent = updatedAt ? `Data updated ${updatedAt.toLocaleString()}` : '';
  }

  // ---------------------------------------------------------------- detail
  async function renderDetail(id) {
    if (observer) { observer.disconnect(); observer = null; }
    $app.removeEventListener('click', onListClick);
    document.body.classList.remove('filters-open');
    document.querySelectorAll('#tabs a').forEach((a) => a.classList.remove('active'));
    window.scrollTo(0, 0);

    const s = BY_ID.get(id);
    if (!s) {
      $app.innerHTML = `<div class="detail"><a class="back" href="#/">${ICON.back} All servers</a>
        <div class="empty-state"><b>Server not found</b>It may be offline or not listed right now.</div>
        <div id="live"></div></div>`;
      loadLive(id, null);
      return;
    }
    drawDetail(s, null);
    loadLive(id, s);
  }

  function drawDetail(s, live) {
    const d = live?.Data || {};
    const vars = d.vars || {};
    const clients = d.clients ?? s.clients;
    const max = d.svMaxclients ?? d.sv_maxclients ?? s.maxClients;
    const name = vars.sv_projectName || s.projectName || d.hostname || s.hostname;
    const desc = vars.sv_projectDesc || s.projectDesc || (s.projectName ? stripCodes(s.hostname) : '');
    const banner = safeUrl(vars.banner_detail) || safeUrl(s.bannerDetail) || safeUrl(vars.banner_connecting) || safeUrl(s.bannerConnecting);
    if (safeUrl(vars.icon_url)) s = { ...s, iconUrl: vars.icon_url };
    const icon = iconSrc(s);
    const tags = s.tagList;
    const peak = parseInt(vars.peak_players, 10) || s.peakPlayers || 0;
    const fav = favorites.has(s.id);
    const scheme = s.game === 'redm' ? 'redm' : 'fivem';
    const joinCode = `cfx.re/join/${s.id}`;
    const resources = Array.isArray(d.resources) ? d.resources.slice().sort() : null;
    document.title = `${stripCodes(name)} · ${CFG.name}`;

    const info = [
      ['Join code', esc(joinCode)],
      ['Game', s.game === 'redm' ? 'RedM' : 'FiveM'],
      ['Locale', esc(s.locale || '—') + (s.lang ? ` (${esc(languageName(s.lang))})` : '')],
      ['Game type', esc(vars.gametype || d.gametype || s.gametype || '—')],
      ['Map', esc(vars.mapname || d.mapname || s.mapname || '—')],
      ['OneSync', (vars.onesync_enabled ?? (s.onesync ? 'true' : 'false')) === 'true' ? 'Enabled' : 'Disabled'],
      ['Game build', esc(vars.sv_enforceGameBuild || s.gameBuild || 'Default')],
      ['Pure level', esc(vars.sv_pureLevel || s.pureLevel || '0')],
      ['Resources', fmt(resources ? resources.length : s.resourceCount)],
      ['Server', esc(d.server || s.serverVersion || '—')],
      vars.sv_enforceSteamAuth === 'true' ? ['Steam required', 'Yes'] : null,
    ].filter(Boolean);

    // Custom vars the owner publishes (Website, Discord, Instagram, Uptime, …), like the official "Details" box.
    const details = Object.entries(vars)
      .filter(([k, v]) => v && !HIDDEN_VARS.test(k) && String(v).length < 300)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k.replace(/_/g, ' '), linkify(v)]);
    if (!details.length && s.discord) details.push(['Discord', linkify(s.discord)]);

    const owner = d.ownerName ? `<div class="owner">
        ${safeUrl(d.ownerAvatar) ? `<img src="${esc(d.ownerAvatar)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
        ${safeUrl(d.ownerProfile) ? `<a href="${esc(d.ownerProfile)}" target="_blank" rel="noopener">${esc(d.ownerName)}</a>` : `<span>${esc(d.ownerName)}</span>`}
      </div>` : '';

    $app.innerHTML = `<div class="detail">
      <a class="back" href="#/">${ICON.back} All servers</a>
      <div class="hero">
        <div style="overflow:hidden;position:relative">
          ${banner ? `<div class="banner"><img src="${esc(banner)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.parentNode.classList.add('blur');this.remove()"></div>`
            : `<div class="banner blur">${icon ? `<img src="${esc(icon)}" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover">` : ''}</div>`}
          <div class="shade"></div>
        </div>
        <div class="head">
          ${iconHtml(s)}
          <div style="min-width:0">
            ${s.premium && PREMIUM[s.premium] ? `<span class="badge ${esc(s.premium)}">${PREMIUM[s.premium]} supporter</span>` : ''}
            <h1>${colorize(name)}</h1>
            ${desc ? `<div class="sub">${colorize(desc)}</div>` : ''}
          </div>
          <div class="actions">
            <button class="btn" id="favBtn">${fav ? ICON.star : ICON.starO} ${fav ? 'Favorited' : 'Favorite'}</button>
            <a class="btn primary" href="${scheme}://connect/${esc(joinCode)}">${ICON.play} Connect</a>
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <div>
          <div class="stats">
            <div class="stat"><div class="k">Players</div><div class="v">${fmt(clients)}<small style="color:var(--text-3);font-weight:400;font-size:14px">/ ${fmt(max)}</small></div></div>
            <div class="stat"><div class="k">Peak (24h)</div><div class="v">${peak ? fmt(peak) : '—'}</div></div>
            <div class="stat"><div class="k">Boosts</div><div class="v" style="color:${s.upvotePower ? 'var(--accent)' : 'inherit'}">${ICON.rocket} ${fmt(d.upvotePower ?? s.upvotePower)}</div></div>
            <div class="stat"><div class="k">Country</div><div class="v" style="font-size:16px">${flag(s.country)} ${esc(s.country ? countryName(s.country) : 'Unknown')}</div></div>
          </div>

          <div class="section stats-panel" id="statsBox"></div>

          ${tags.length ? `<div class="section"><h2>Tags</h2><div class="res-list">${tags.map((t) => `<a class="chip" href="#/?tag=${encodeURIComponent(t)}${s.game === 'redm' ? '&game=redm' : ''}">${esc(t)}</a>`).join('')}</div></div>` : ''}

          ${live === undefined || live === null ? '<div class="section"><div class="skeleton" style="width:50%"></div></div>' : ''}
          ${live === false ? '<div class="section note">Cfx.re didn\'t answer for owner, resources and links just now. Player counts above are from the latest snapshot. <button class="chip" id="retryLive" style="margin-left:6px">Retry</button></div>' : ''}

          ${resources && resources.length ? `<div class="section"><h2>Resources <span class="n">${fmt(resources.length)}</span></h2><div class="res-list" id="resList">${resources.map((r, i) => `<span class="chip"${i >= 24 ? ' hidden' : ''}>${esc(r)}</span>`).join('')}${resources.length > 24 ? `<button class="chip show-all" id="showAllRes">Show all ${fmt(resources.length)}</button>` : ''}</div></div>` : ''}
        </div>

        <aside>
          <div class="panel">
            <h3>Connect</h3>
            <div class="note">Open FiveM and press F8, then paste:</div>
            <div class="connect-box"><code>connect ${esc(joinCode)}</code><button id="copyBtn">Copy</button></div>
            <a class="btn" style="width:100%;justify-content:center;margin-top:10px" href="https://${esc(joinCode)}" target="_blank" rel="noopener">Open ${esc(joinCode)}</a>
          </div>
          ${owner || details.length ? `<div class="panel" style="margin-top:14px">
            <h3>Details</h3>
            ${owner}
            ${details.length ? `<div class="kv">${details.map(([k, v]) => `<div><span>${esc(k)}</span><span>${v}</span></div>`).join('')}</div>` : ''}
          </div>` : ''}
          <div class="panel" style="margin-top:14px">
            <h3>Server info</h3>
            <div class="kv">${info.map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join('')}</div>
          </div>
        </aside>
      </div>
    </div>`;

    document.getElementById('favBtn').addEventListener('click', (e) => {
      toggleFav(s.id);
      const on = favorites.has(s.id);
      e.currentTarget.innerHTML = `${on ? ICON.star : ICON.starO} ${on ? 'Favorited' : 'Favorite'}`;
    });
    renderStats(s.id, max, serverTz(s));
    document.getElementById('retryLive')?.addEventListener('click', () => { drawDetail(s, null); loadLive(s.id, BY_ID.get(s.id) || null); });
    document.getElementById('showAllRes')?.addEventListener('click', (e) => {
      document.querySelectorAll('#resList [hidden]').forEach((el) => (el.hidden = false));
      e.currentTarget.remove();
    });
    document.getElementById('copyBtn').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      navigator.clipboard?.writeText(`connect ${joinCode}`).then(() => { btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = 'Copy'), 1500); }, () => {});
    });
  }

  // ------------------------------------------------------------- server time zones
  // Statistics use the server's own clock (from its country), so everyone sees the same
  // prime time / busiest hour / weekday. Countries with several zones use the main one.
  const COUNTRY_TZ = {
    RO: 'Europe/Bucharest', MD: 'Europe/Chisinau', DE: 'Europe/Berlin', FR: 'Europe/Paris', GB: 'Europe/London', IE: 'Europe/Dublin',
    NL: 'Europe/Amsterdam', BE: 'Europe/Brussels', LU: 'Europe/Luxembourg', ES: 'Europe/Madrid', PT: 'Europe/Lisbon', IT: 'Europe/Rome',
    CH: 'Europe/Zurich', AT: 'Europe/Vienna', PL: 'Europe/Warsaw', CZ: 'Europe/Prague', SK: 'Europe/Bratislava', HU: 'Europe/Budapest',
    SI: 'Europe/Ljubljana', HR: 'Europe/Zagreb', RS: 'Europe/Belgrade', BA: 'Europe/Sarajevo', ME: 'Europe/Podgorica', MK: 'Europe/Skopje',
    AL: 'Europe/Tirane', XK: 'Europe/Belgrade', BG: 'Europe/Sofia', GR: 'Europe/Athens', CY: 'Asia/Nicosia', TR: 'Europe/Istanbul',
    UA: 'Europe/Kyiv', BY: 'Europe/Minsk', RU: 'Europe/Moscow', LT: 'Europe/Vilnius', LV: 'Europe/Riga', EE: 'Europe/Tallinn',
    FI: 'Europe/Helsinki', SE: 'Europe/Stockholm', NO: 'Europe/Oslo', DK: 'Europe/Copenhagen', IS: 'Atlantic/Reykjavik', MT: 'Europe/Malta',
    GE: 'Asia/Tbilisi', AM: 'Asia/Yerevan', AZ: 'Asia/Baku', KZ: 'Asia/Almaty', IL: 'Asia/Jerusalem', PS: 'Asia/Gaza', LB: 'Asia/Beirut',
    JO: 'Asia/Amman', SY: 'Asia/Damascus', IQ: 'Asia/Baghdad', SA: 'Asia/Riyadh', AE: 'Asia/Dubai', QA: 'Asia/Qatar', KW: 'Asia/Kuwait',
    BH: 'Asia/Bahrain', OM: 'Asia/Muscat', YE: 'Asia/Aden', IR: 'Asia/Tehran', EG: 'Africa/Cairo', LY: 'Africa/Tripoli', TN: 'Africa/Tunis',
    DZ: 'Africa/Algiers', MA: 'Africa/Casablanca', ZA: 'Africa/Johannesburg', NG: 'Africa/Lagos', KE: 'Africa/Nairobi', IN: 'Asia/Kolkata',
    PK: 'Asia/Karachi', BD: 'Asia/Dhaka', TH: 'Asia/Bangkok', VN: 'Asia/Ho_Chi_Minh', MY: 'Asia/Kuala_Lumpur', SG: 'Asia/Singapore',
    ID: 'Asia/Jakarta', PH: 'Asia/Manila', CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong', TW: 'Asia/Taipei', JP: 'Asia/Tokyo', KR: 'Asia/Seoul',
    AU: 'Australia/Sydney', NZ: 'Pacific/Auckland', US: 'America/New_York', CA: 'America/Toronto', MX: 'America/Mexico_City',
    BR: 'America/Sao_Paulo', AR: 'America/Argentina/Buenos_Aires', CL: 'America/Santiago', CO: 'America/Bogota', PE: 'America/Lima',
    VE: 'America/Caracas', UY: 'America/Montevideo', PY: 'America/Asuncion', BO: 'America/La_Paz', EC: 'America/Guayaquil',
    DO: 'America/Santo_Domingo', PR: 'America/Puerto_Rico', CR: 'America/Costa_Rica', PA: 'America/Panama', GT: 'America/Guatemala',
  };
  function serverTz(s) {
    const cc = s && s.country;
    let tz = cc && COUNTRY_TZ[cc];
    if (!tz && cc) {
      try { const z = new Intl.Locale('und-' + cc).getTimeZones?.() || new Intl.Locale('und-' + cc).timeZones; if (z && z.length) tz = z[0]; } catch { /* ignore */ }
    }
    try { if (tz) { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } } catch { /* invalid zone */ }
    return 'UTC';
  }
  const zoneFmt = new Map();
  function zoned(t, tz) { // hour (0-23) and weekday (0=Sun) of timestamp t in zone tz
    if (!zoneFmt.has(tz)) zoneFmt.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: 'numeric', weekday: 'short' }));
    const parts = zoneFmt.get(tz).formatToParts(new Date(t));
    const hour = +parts.find((p) => p.type === 'hour').value % 24;
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((p) => p.type === 'weekday').value);
    return { hour, wd };
  }
  function tzLabel(tz) {
    try {
      const n = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName');
      return n ? n.value.replace('GMT', 'UTC') : tz;
    } catch { return tz; }
  }

  // ------------------------------------------------------------- statistics
  // History shards are written by scripts/history.js (same hash, same layout).
  const STATS_SHARDS = 256;
  const H_LEN = 336, D_LEN = 366;
  function shardOf(id) {
    let h = 0x811c9dc5;
    for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return ((h >>> 0) % STATS_SHARDS).toString(16).padStart(2, '0');
  }
  const RANGES = [
    { key: '24h', label: '24 hours', unit: 'h', n: 24 },
    { key: '48h', label: '48 hours', unit: 'h', n: 48 },
    { key: '1w', label: '1 week', unit: 'h', n: 168 },
    { key: '1m', label: '1 month', unit: 'd', n: 30 },
    { key: '1y', label: '1 year', unit: 'd', n: 366 },
  ];
  const statsCache = new Map();
  let statsRange = store.get('statsRange', '24h');

  async function getHistory(id) {
    const c = statsCache.get(id);
    if (c && Date.now() - c.at < 120000) return c;
    try {
      const res = await fetch(`data/history/${shardOf(id)}.json`, { cache: 'no-cache' });
      const json = res.ok ? await res.json() : null;
      const r = json && json.s && json.s[id];
      const out = { at: Date.now(), entry: r || null, json };
      statsCache.set(id, out);
      return out;
    } catch { return { at: Date.now(), entry: null }; }
  }

  // Expand one server's trimmed arrays into full timelines of buckets.
  function timeline(h, unit) {
    const e = h.entry, j = h.json;
    const hourly = unit === 'h';
    const fileLen = hourly ? (j.v >= 2 ? 336 : 168) : D_LEN;
    const len = hourly ? H_LEN : D_LEN;
    const base = (hourly ? j.hb : j.db) + fileLen - len; // align so the last bucket is "now"
    const start = hourly ? e.h0 : e.d0;
    const S = hourly ? e.hs : e.ds, P = hourly ? e.hp : e.dp, N = hourly ? e.hn : e.dn;
    const runs = hourly ? j.hr : j.dr, r0 = hourly ? (j.hr0 || 0) : (j.dr0 || 0);
    const step = hourly ? 3600000 : 86400000;
    const off = fileLen - len;
    const out = [];
    for (let i = 0; i < len; i++) {
      const fi = i + off, k = fi - start, rk = fi - r0;
      const n = k >= 0 && k < (N || []).length ? N[k] || 0 : 0;
      out.push({
        t: (base + i) * step, n,
        sum: n ? S[k] : 0, peak: n ? P[k] : null, avg: n ? S[k] / n : null,
        runs: runs && rk >= 0 && rk < runs.length ? runs[rk] || 0 : 0,
      });
    }
    return out;
  }

  const agg = (pts) => pts.reduce((a, p) => ({ sum: a.sum + p.sum, n: a.n + p.n, peak: Math.max(a.peak, p.peak || 0) }), { sum: 0, n: 0, peak: 0 });
  const avgOf = (pts) => { const a = agg(pts); return a.n ? a.sum / a.n : null; };

  function insights(h, maxSlots, tz) {
    const hours = timeline(h, 'h');              // 14 days, hourly
    const days = timeline(h, 'd');               // 366 days, daily
    const week = hours.slice(-168), prevWeek = hours.slice(-336, -168), twoWeeks = hours;
    // prime time: 18:00–23:59 in the server's time zone, last 7 days
    const prime = avgOf(week.filter((p) => zoned(p.t, tz).hour >= 18));
    // busiest hour of day / weekday over 2 weeks (server's time zone)
    const byHour = Array.from({ length: 24 }, () => []), byDay = Array.from({ length: 7 }, () => []);
    twoWeeks.forEach((p) => { if (p.n) { const z = zoned(p.t, tz); byHour[z.hour].push(p); byDay[z.wd].push(p); } });
    const best = (groups) => { let bi = -1, bv = -1; groups.forEach((g, i) => { const v = avgOf(g); if (v !== null && v > bv) { bv = v; bi = i; } }); return bi; };
    // Require enough history before naming a "busiest" hour/day — a few hours of data
    // would just name the hour tracking started.
    const coveredHours = twoWeeks.filter((p) => p.n);
    const daysSpan = coveredHours.length ? (coveredHours[coveredHours.length - 1].t - coveredHours[0].t) / 86400000 : 0;
    const hoursOfDay = byHour.filter((g) => g.length).length;
    const weekdays = byDay.filter((g) => g.length).length;
    const bh = daysSpan >= 3 && hoursOfDay >= 20 ? best(byHour) : -1;
    const bd = weekdays === 7 ? best(byDay) : -1;
    const primeDays = new Set(week.filter((p) => p.n && zoned(p.t, tz).hour >= 18).map((p) => Math.floor(p.t / 86400000))).size;
    // growth: last 7 days vs the 7 days before
    const a = avgOf(week), b = avgOf(prevWeek);
    const enoughPrev = prevWeek.filter((p) => p.n).length >= 24 && week.filter((p) => p.n).length >= 24;
    const growth = a !== null && b ? ((a - b) / b) * 100 : null;
    // slots usage: 7-day average / max slots
    const slots = a !== null && maxSlots && week.filter((p) => p.n).length >= 6 ? (a / maxSlots) * 100 : null;
    // uptime: samples where the server was listed / collection runs, last 30 days since tracking began
    const firstDay = Math.floor(h.entry.first / 86400000) * 86400000;
    const month = days.slice(-30).filter((p) => p.t >= firstDay && p.runs);
    const up = month.reduce((x, p) => ({ n: x.n + Math.min(p.n, p.runs), r: x.r + p.runs }), { n: 0, r: 0 });
    const uptime = up.r >= 12 ? (up.n / up.r) * 100 : null;
    return { prime: primeDays >= 1 ? prime : null, bh, bd, growth: enoughPrev ? growth : null, slots, uptime, trackedDays: daysSpan };
  }

  const ICONS = {
    prime: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2 19c0-3 2.7-5 6-5s6 2 6 5zM14.5 14.2c.5-.1 1-.2 1.5-.2 3.3 0 6 2 6 5h-6.2c0-1.9-.5-3.5-1.3-4.8z"/></svg>',
    time: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M5 3 2 6M19 3l3 3"/></svg>',
    day: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><rect x="13" y="14" width="4" height="3" fill="currentColor" stroke="none"/></svg>',
    growth: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>',
    slots: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 13h3M8 16h6"/></svg>',
    uptime: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01"/></svg>',
  };
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function insightCard(icon, color, value, label) {
    return `<div class="insight"><span class="ic" style="background:${color}">${ICONS[icon]}</span><div><div class="iv">${value}</div><div class="il">${label}</div></div></div>`;
  }

  function insightsHtml(h, maxSlots, tz) {
    const x = insights(h, maxSlots, tz);
    const wait = (txt) => `<span class="na">Collecting…</span><span class="na-why">${txt}</span>`;
    const pct = (v, sign, why) => (v === null || !isFinite(v) ? wait(why) : `${sign && v > 0 ? '+' : ''}${v.toFixed(2)}%`);
    const hourLabel = x.bh < 0 ? wait('ready after ~3 days') : new Date(Date.UTC(2000, 0, 1, x.bh)).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
    return `<div class="insights">
      <div class="insight-col">
        ${insightCard('prime', '#e8467c', x.prime === null ? wait('ready after the first evening (18:00)') : fmt(Math.round(x.prime)), 'Prime time player average<br><small>18:00–24:00 server time, last 7 days</small>')}
        ${insightCard('time', '#a259d9', hourLabel, 'Most players time<br><small>Last 2 weeks</small>')}
        ${insightCard('day', '#8bc34a', x.bd < 0 ? wait('ready after 7 days') : WEEKDAYS[x.bd], 'Most players weekday<br><small>Last 2 weeks</small>')}
      </div>
      <div class="insight-col">
        ${insightCard('growth', '#ff6b3d', `<span class="${x.growth > 0 ? 'up' : x.growth < 0 ? 'down' : ''}">${pct(x.growth, true, 'ready after 8 days')}</span>`, 'Player count growth<br><small>Last 7 days vs. week before</small>')}
        ${insightCard('slots', '#2fa8f0', pct(x.slots, false, 'ready after ~6 hours'), 'Slots usage<br><small>7-day average / max slots</small>')}
        ${insightCard('uptime', '#26a69a', pct(x.uptime, false, 'ready after ~2 hours'), 'Server uptime<br><small>Last 30 days</small>')}
      </div>
    </div>`;
  }

  function chartSvg(pts, unit, tz) {
    const W = 600, H = 220, PL = 4, PR = 4;
    const top = Math.max(1, ...pts.map((p) => p.peak || 0));
    const nice = (v) => { const m = Math.pow(10, Math.floor(Math.log10(v))); const f = v / m; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * m; };
    const stepY = nice(top / 4), max = Math.ceil(top / stepY) * stepY || 1;
    const x = (i) => (pts.length < 2 ? W / 2 : PL + (i * (W - PL - PR)) / (pts.length - 1));
    const y = (v) => H - 8 - (v / max) * (H - 16);
    const segs = (key) => {
      const out = []; let cur = [];
      pts.forEach((p, i) => { if (p[key] === null) { if (cur.length) out.push(cur); cur = []; } else cur.push([x(i), y(p[key])]); });
      if (cur.length) out.push(cur);
      return out;
    };
    const line = (key) => segs(key).map((sg) => (sg.length === 1 ? `M${sg[0][0] - 1.5},${sg[0][1]}L${sg[0][0] + 1.5},${sg[0][1]}` : 'M' + sg.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join('L'))).join('');
    const dots = (key, cls) => (pts.length <= 72 ? pts.map((p, i) => (p[key] === null ? '' : `<circle cx="${x(i).toFixed(1)}" cy="${y(p[key]).toFixed(1)}" r="2.6" class="${cls}"/>`)).join('') : '');
    const ticks = []; for (let v = stepY; v <= max + 1e-9; v += stepY) ticks.push(v);
    const grid = ticks.map((v) => `<line x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="g"/>`).join('');
    const labels = ticks.map((v) => `<span style="top:${(y(v) / H) * 100}%">${fmt(Math.round(v))}</span>`).join('');
    const fmtT = (t) => (unit === 'h'
      ? new Date(t).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz })
      : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }));
    return `<div class="chart-legend top"><span class="lg avg"></span>Average player count <span class="lg peak"></span>Peak player count</div>
    <div class="chart" data-unit="${unit}" data-tz="${esc(tz)}">
      <div class="chart-y">${labels}</div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${grid}
        <path d="${line('avg')}" class="l avg"/><path d="${line('peak')}" class="l peak"/>
        <line class="cursor" x1="0" x2="0" y1="0" y2="${H}" style="display:none"/>
      </svg>
      <svg class="dots" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${dots('avg', 'd-avg')}${dots('peak', 'd-peak')}</svg>
      <div class="chart-tip" style="display:none"></div>
      <div class="chart-x"><span>${esc(fmtT(pts[0].t))}</span>${pts.length > 4 ? `<span>${esc(fmtT(pts[Math.floor(pts.length / 2)].t))}</span>` : ''}<span>${unit === 'h' ? 'Now' : 'Today'}</span></div>
      <script type="application/json">${JSON.stringify(pts.map((p) => [p.t, p.avg === null ? null : Math.round(p.avg), p.peak]))}</script>
    </div>`;
  }

  async function renderStats(id, maxSlots, tz) {
    const box = document.getElementById('statsBox');
    if (!box) return;
    const h = await getHistory(id);
    if (!document.getElementById('statsBox') || parseHash().id !== id) return;
    const head = `<h2>${ICON.chart} Statistics</h2><div class="range-tabs">${RANGES.map((r) => `<button data-range="${r.key}" class="${r.key === statsRange ? 'on' : ''}">${r.label}</button>`).join('')}</div>`;
    if (!h.entry || !h.json) {
      box.innerHTML = head + '<div class="note">No statistics for this server yet. History is recorded every time the list refreshes, so averages and peaks appear here once it has been online with players.</div>';
    } else {
      const r = RANGES.find((x) => x.key === statsRange) || RANGES[0];
      let pts = timeline(h, r.unit).slice(-r.n);
      const firstIdx = pts.findIndex((p) => p.n);
      const clipped = firstIdx > 0;
      if (clipped) pts = pts.slice(firstIdx); // tracking began inside this range: chart from that point
      const tot = agg(pts);
      const covered = pts.filter((p) => p.n).length;
      const ago = Math.max(1, Math.round((Date.now() - h.entry.first) / 60000));
      const agoTxt = ago < 90 ? `${ago} min` : ago < 2880 ? `${Math.round(ago / 60)} hours` : `${Math.round(ago / 1440)} days`;
      const since = new Date(h.entry.first).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      const collecting = `<div class="collecting"><span class="collect-ic">${ICON.chart}</span><div><b>Collecting data for this server</b>
        <span>Tracking started ${esc(agoTxt)} ago. A new sample is added every time the list updates (about every 10 minutes), so the ${r.unit === 'h' ? 'hourly' : 'daily'} chart fills in over time.</span></div></div>`;
      box.innerHTML = head + (covered < 2 ? collecting + (tot.n ? `<div class="range-summary"><span>Average so far <b>${fmt(Math.round(tot.sum / tot.n))}</b></span><span>Peak so far <b>${fmt(tot.peak)}</b></span></div>` : '') : `
        ${chartSvg(pts, r.unit, tz)}
        <div class="range-summary">
          <span>Average <b>${fmt(Math.round(tot.sum / tot.n))}</b></span><span>Peak <b>${fmt(tot.peak)}</b></span>
          <span class="muted">Times in server time (${esc(tzLabel(tz))})</span>
          ${clipped ? `<span class="muted">Tracked since ${esc(since)} — this range is still filling in</span>` : ''}
        </div>`)
        + insightsHtml(h, maxSlots, tz);
    }
    box.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
      statsRange = b.dataset.range; store.set('statsRange', statsRange); renderStats(id, maxSlots, tz);
    }));
    wireChart(box.querySelector('.chart'));
  }

  function wireChart(el) {
    if (!el) return;
    const data = JSON.parse(el.querySelector('script').textContent);
    const tip = el.querySelector('.chart-tip'), cur = el.querySelector('.cursor'), svg = el.querySelector('svg');
    const unit = el.dataset.unit, step = unit === 'h' ? 3600000 : 86400000, tz = el.dataset.tz || 'UTC';
    const hm = (t) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: tz });
    const move = (clientX) => {
      const rect = svg.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const i = Math.round(f * (data.length - 1));
      const [t, avg, peak] = data[i];
      const x = data.length < 2 ? 300 : 4 + (i * 592) / (data.length - 1);
      cur.setAttribute('x1', x); cur.setAttribute('x2', x); cur.style.display = '';
      const when = unit === 'h'
        ? `${new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz })}, ${hm(t)} – ${hm(t + step)}`
        : new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
      tip.innerHTML = `<b>${esc(when)}</b>${avg === null ? '<span>No data</span>'
        : `<span><i class="sq avg"></i>Average player count: <b>${fmt(avg)}</b></span><span><i class="sq peak"></i>Peak player count: <b>${fmt(peak)}</b></span>`}`;
      tip.style.display = '';
      const left = (x / 600) * rect.width;
      tip.style.left = Math.min(Math.max(left, 110), rect.width - 110) + 'px';
    };
    svg.addEventListener('mousemove', (e) => move(e.clientX));
    svg.addEventListener('touchmove', (e) => move(e.touches[0].clientX), { passive: true });
    svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; cur.style.display = 'none'; });
  }

  let liveToken = 0;
  async function loadLive(id, snap) {
    const token = ++liveToken;
    const stillHere = () => token === liveToken && parseHash().id === id;
    let live = false;
    // CFX occasionally rejects a request (rate limiting); those rejections carry no CORS
    // headers, so they surface as network errors. Retry a few times before giving up.
    for (const wait of [0, 1500, 4000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      if (!stillHere()) return;
      const r = await fetchLive(id);
      if (r) { live = r; break; }
    }
    if (live && live.Data) {
      applyLive(id, live);
      renderTotals();
      try { sessionStorage.setItem('live:' + id, JSON.stringify({ at: Date.now(), live })); } catch { /* ignore */ }
    } else {
      // Fall back to the last good live response from this browser session (≤ 30 min old).
      try {
        const c = JSON.parse(sessionStorage.getItem('live:' + id) || 'null');
        if (c && Date.now() - c.at < 30 * 60 * 1000) live = c.live;
      } catch { /* ignore */ }
    }
    if (!stillHere()) return;

    if (snap) { drawDetail(snap, live || false); return; }
    if (live && live.Data) {
      // Server isn't in the snapshot (new or filtered) — build a minimal record from live data.
      const d = live.Data, v = d.vars || {};
      const [lang, region] = String(v.locale || '').split(/[-_]/);
      const s = {
        id, hostname: d.hostname || id, projectName: v.sv_projectName || '', projectDesc: v.sv_projectDesc || '',
        clients: d.clients || 0, maxClients: d.svMaxclients || d.sv_maxclients || 0, locale: v.locale || '',
        tags: v.tags || '', iconVersion: d.iconVersion || 0, iconUrl: v.icon_url || '', peakPlayers: parseInt(v.peak_players, 10) || 0, upvotePower: d.upvotePower || 0, premium: v.premium || '',
        game: v.gamename === 'rdr3' ? 'redm' : 'fivem', resourceCount: (d.resources || []).length,
      };
      s.plain = stripCodes(s.projectName || s.hostname);
      s.lang = lang && lang !== 'root' ? lang : '';
      s.country = region && region.toUpperCase() !== 'AQ' ? region.toUpperCase() : '';
      s.tagList = s.tags.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
      drawDetail(s, live);
    }
  }

  // ---------------------------------------------------------------- router
  function route() {
    if (!ALL.length) return;
    const r = parseHash();
    if (r.view === 'detail') {
      renderDetail(r.id);
    } else {
      const wasDetail = !document.getElementById('rows');
      state = { ...state, ...r.state };
      store.set('game', state.game);
      updateList();
      if (wasDetail) window.scrollTo(0, 0);
      renderTotals();
    }
  }

  window.addEventListener('hashchange', route);

  document.querySelectorAll('#gameSwitch button').forEach((b) => b.addEventListener('click', () => {
    if (parseHash().view === 'detail') { state.game = b.dataset.game; location.hash = stateToHash(state); return; }
    setState({ game: b.dataset.game });
    renderTotals();
  }));

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
      const q = document.getElementById('q');
      if (q) { e.preventDefault(); q.focus(); }
    }
  });

  async function boot() {
    try {
      await loadData();
    } catch (e) {
      $app.innerHTML = `<div class="empty-state"><b>Could not load the server list</b>${esc(e.message)}. The data snapshot may not have been built yet — run the GitHub Action once.</div>`;
      return;
    }
    route();

    const onList = () => parseHash().view === 'list' && document.getElementById('rows');
    let lastLoad = Date.now();
    // Prefer the live stream; fall back to the GitHub Actions snapshot if Cfx.re refuses.
    async function refreshSnapshot() {
      lastLoad = Date.now();
      let ok = await loadLiveList();
      if (!ok) { try { ok = await loadData(); } catch { ok = false; } }
      if (ok && onList()) updateList(true);
    }
    // Pinned servers get live numbers straight from Cfx.re, so they never lag behind.
    async function refreshPinned() {
      if (document.hidden || !onList() || state.list !== 'all') return;
      let changed = false;
      for (const id of CFG.pinnedServers || []) if (applyLive(id, await fetchLive(id))) changed = true;
      // Redraw the whole list (not just the card) so the server's row and its position match.
      if (changed && onList()) { updateList(true); renderTotals(); }
    }
    // Swap the snapshot for live data right after the first paint.
    refreshSnapshot();
    if (CFG.refreshSeconds > 0) setInterval(() => { if (!document.hidden) refreshSnapshot(); }, CFG.refreshSeconds * 1000);
    if (CFG.pinnedLiveSeconds > 0) { refreshPinned(); setInterval(refreshPinned, CFG.pinnedLiveSeconds * 1000); }
    setInterval(() => { if (!document.hidden) renderTotals(); }, 60000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - lastLoad > 60000) { refreshSnapshot(); refreshPinned(); }
    });
  }

  boot();
})();
