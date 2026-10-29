(() => {
  'use strict';

  const CFG = Object.assign({
    name: 'Masterlist',
    dataUrl: 'data/servers.json',
    refreshSeconds: 300,
    liveServerApi: 'https://frontend.cfx-services.net/api/servers/single/',
    iconUrl: (id, v) => `https://servers-live.fivem.net/servers/icon/${id}/${v}.png`,
    pageSize: 60,
  }, window.SITE_CONFIG || {});

  const $app = document.getElementById('app');
  const $totals = document.getElementById('totals');
  const $updated = document.getElementById('updatedAt');
  document.getElementById('brandName').textContent = CFG.name;

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
    globe: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/></svg>',
  };

  const PREMIUM = { pt: 'Platinum', au: 'Gold', ag: 'Silver' };
  const PREMIUM_RANK = { pt: 3, au: 2, ag: 1 };

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
  }

  async function loadData() {
    const res = await fetch(CFG.dataUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    hydrate(await res.json());
    renderTotals();
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
        list: ['all', 'supporters', 'favorites'].includes(p.get('list')) ? p.get('list') : 'all',
        game: p.get('game') === 'redm' ? 'redm' : (p.get('game') === 'fivem' ? 'fivem' : state.game),
        q: p.get('q') || '',
        sort: ['players', 'boosts', 'name', 'country'].includes(p.get('sort')) ? p.get('sort') : 'players',
        dir: p.get('dir') === 'asc' ? 'asc' : (p.get('dir') === 'desc' ? 'desc' : (p.get('sort') === 'name' || p.get('sort') === 'country' ? 'asc' : 'desc')),
        country: arr('country').map((c) => c.toUpperCase()),
        tag: arr('tag'),
        lang: arr('lang'),
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

  function setState(patch) {
    state = { ...state, ...patch };
    store.set('game', state.game);
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
    if (state.list === 'supporters') list = list.filter((s) => s.premium);
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
  function iconHtml(s, cls = 'icon') {
    const letter = esc((s.plain.match(/[a-z0-9]/i) || ['?'])[0].toUpperCase());
    if (!s.iconVersion) return `<div class="${cls}">${letter}</div>`;
    return `<div class="${cls}" data-letter="${letter}"><img loading="lazy" alt="" src="${esc(CFG.iconUrl(s.id, s.iconVersion))}" onerror="this.parentNode.textContent=this.parentNode.dataset.letter"></div>`;
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

  function featuredHtml(list) {
    const picks = list
      .filter((s) => s.premium && s.clients > 0)
      .sort((a, b) => (PREMIUM_RANK[b.premium] || 0) - (PREMIUM_RANK[a.premium] || 0) || !!b.bannerDetail - !!a.bannerDetail || b.clients - a.clients)
      .slice(0, 10)
      .sort((a, b) => b.clients - a.clients);
    if (!picks.length) return '';
    return `<section class="featured">
      <div class="featured-head"><h2>Featured supporters</h2><small>Servers backing the platform</small></div>
      <div class="featured-row">${picks.map((s) => {
        const banner = safeUrl(s.bannerDetail) || safeUrl(s.bannerConnecting);
        const iconSrc = s.iconVersion ? CFG.iconUrl(s.id, s.iconVersion) : '';
        const bg = banner ? `<img class="bg" src="${esc(banner)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()">`
          : iconSrc ? `<img class="bg blur" src="${esc(iconSrc)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()">` : '';
        return `<a class="fcard" href="#/servers/detail/${encodeURIComponent(s.id)}">
          ${bg}<span class="badge ${esc(s.premium)}">${PREMIUM[s.premium] || ''}</span>
          <div class="body">${iconHtml(s)}<div style="min-width:0">
            <div class="name">${colorize(s.projectName || s.hostname)}</div>
            <div class="meta">${flag(s.country)}<span>${ICON.user} ${fmt(s.clients)} / ${fmt(s.maxClients)}</span>${s.upvotePower ? `<span>${ICON.rocket} ${fmt(s.upvotePower)}</span>` : ''}</div>
          </div></div></a>`;
      }).join('')}</div></section>`;
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
          <div class="active-filters" id="activeFilters"></div>
          <div id="featured"></div>
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

    const pristine = state.list === 'all' && !state.q && !state.country.length && !state.tag.length && !state.lang.length;
    document.getElementById('featured').innerHTML = pristine ? featuredHtml(facetBase) : '';

    const prev = shown;
    shown = 0;
    document.getElementById('rows').innerHTML = '';
    renderMore(keepCount ? Math.max(prev, CFG.pageSize) : CFG.pageSize);
    renderFacets();
    renderActiveFilters();
    document.title = `${state.list === 'supporters' ? 'Supporters' : state.list === 'favorites' ? 'Favorites' : 'Servers'} · ${CFG.name}`;
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
    $totals.innerHTML = `<span><b>${fmt(players)}</b> players</span><span><b>${fmt(list.length)}</b> servers</span>`;
    $updated.textContent = updatedAt ? `Data updated ${updatedAt.toLocaleString()}` : '';
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
    const iconSrc = s.iconVersion ? CFG.iconUrl(s.id, s.iconVersion) : '';
    const tags = s.tagList;
    const fav = favorites.has(s.id);
    const scheme = s.game === 'redm' ? 'redm' : 'fivem';
    const joinCode = `cfx.re/join/${s.id}`;
    const players = Array.isArray(d.players) ? d.players.slice().sort((a, b) => (a.id || 0) - (b.id || 0)) : null;
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
      d.ownerName ? ['Owner', d.ownerProfile && safeUrl(d.ownerProfile) ? `<a href="${esc(d.ownerProfile)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(d.ownerName)}</a>` : esc(d.ownerName)] : null,
      (vars.Discord || vars.discord || s.discord) ? ['Discord', esc(vars.Discord || vars.discord || s.discord)] : null,
    ].filter(Boolean);

    $app.innerHTML = `<div class="detail">
      <a class="back" href="#/">${ICON.back} All servers</a>
      <div class="hero">
        <div style="overflow:hidden;position:relative">
          ${banner ? `<div class="banner"><img src="${esc(banner)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.parentNode.classList.add('blur');this.remove()"></div>`
            : `<div class="banner blur">${iconSrc ? `<img src="${esc(iconSrc)}" alt="" style="width:100%;height:100%;object-fit:cover">` : ''}</div>`}
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
            <div class="stat"><div class="k">Boosts</div><div class="v" style="color:${s.upvotePower ? 'var(--accent)' : 'inherit'}">${ICON.rocket} ${fmt(d.upvotePower ?? s.upvotePower)}</div></div>
            <div class="stat"><div class="k">Country</div><div class="v" style="font-size:16px">${flag(s.country)} ${esc(s.country ? countryName(s.country) : 'Unknown')}</div></div>
            <div class="stat"><div class="k">Resources</div><div class="v">${fmt(resources ? resources.length : s.resourceCount)}</div></div>
          </div>

          ${tags.length ? `<div class="section"><h2>Tags</h2><div class="res-list">${tags.map((t) => `<a class="chip" href="#/?tag=${encodeURIComponent(t)}${s.game === 'redm' ? '&game=redm' : ''}">${esc(t)}</a>`).join('')}</div></div>` : ''}

          <div class="section"><h2>Players <span class="n">${players ? fmt(players.length) : ''}</span></h2>
            <div id="playersBox">${players
              ? (players.length ? `<div class="player-list">${players.map((p) => `<div class="player"><span class="pn">${esc(p.name)}</span><span class="pp">${fmt(p.ping)} ms</span></div>`).join('')}</div>` : '<div class="note">Nobody is online right now.</div>')
              : live === false ? '<div class="note">The live player list could not be loaded from this site (the CFX API blocked the request). Player counts above come from the latest snapshot.</div>'
              : '<div class="skeleton" style="width:60%"></div>'}</div>
          </div>

          ${resources && resources.length ? `<div class="section"><h2>Resources <span class="n">${fmt(resources.length)}</span></h2><div class="res-list">${resources.map((r) => `<span class="chip">${esc(r)}</span>`).join('')}</div></div>` : ''}
        </div>

        <aside>
          <div class="panel">
            <h3>Connect</h3>
            <div class="note">Open FiveM and press F8, then paste:</div>
            <div class="connect-box"><code>connect ${esc(joinCode)}</code><button id="copyBtn">Copy</button></div>
            <a class="btn" style="width:100%;justify-content:center;margin-top:10px" href="https://${esc(joinCode)}" target="_blank" rel="noopener">Open ${esc(joinCode)}</a>
          </div>
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
    document.getElementById('copyBtn').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      navigator.clipboard?.writeText(`connect ${joinCode}`).then(() => { btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = 'Copy'), 1500); }, () => {});
    });
  }

  let liveToken = 0;
  async function loadLive(id, snap) {
    const token = ++liveToken;
    let live = false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(CFG.liveServerApi + encodeURIComponent(id), { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) live = await res.json();
    } catch { live = false; }
    if (token !== liveToken || parseHash().id !== id) return;

    if (snap) { drawDetail(snap, live || false); return; }
    if (live && live.Data) {
      // Server isn't in the snapshot (new or filtered) — build a minimal record from live data.
      const d = live.Data, v = d.vars || {};
      const [lang, region] = String(v.locale || '').split(/[-_]/);
      const s = {
        id, hostname: d.hostname || id, projectName: v.sv_projectName || '', projectDesc: v.sv_projectDesc || '',
        clients: d.clients || 0, maxClients: d.svMaxclients || d.sv_maxclients || 0, locale: v.locale || '',
        tags: v.tags || '', iconVersion: d.iconVersion || 0, upvotePower: d.upvotePower || 0, premium: v.premium || '',
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
    setState({ game: b.dataset.game, country: [], tag: [], lang: [] });
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
    if (CFG.refreshSeconds > 0) {
      setInterval(async () => {
        try {
          await loadData();
          if (parseHash().view === 'list' && document.getElementById('rows')) updateList(true);
        } catch { /* keep current data */ }
      }, CFG.refreshSeconds * 1000);
    }
  }

  boot();
})();
