// Player-count history for the "Statistics" panel (average / peak over 24h, 48h, 1 week,
// 1 month, 1 year). Every build run records one sample per online server:
//
//   hourly buckets for the last 14 days  →  24h / 48h / 1 week + 2-week insights
//   daily  buckets for the last 366 days →  1 month / 1 year
//
// Every shard also stores how many collection runs happened per hour/day (hr/dr),
// which turns "samples where the server was in the list" into an uptime percentage.
//
// Each bucket keeps sum, peak and sample count, so averages stay exact even when
// GitHub runs the job at irregular intervals.
//
// Storage: site/data/history/<shard>.json (256 shards, published with the site).
// Between runs the folder is restored from the Actions cache; if the cache is gone,
// the published shards are downloaded back from GitHub Pages.

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'site', 'data', 'history');
const HOURS = 336;          // 14 days
const DAYS = 366;           // 1 year (+ today)
const SHARDS = 256;
const MIN_PLAYERS_TO_TRACK = 1; // start tracking a server once it has this many players

// Same hash as shardOf() in site/assets/app.js — keep them identical.
function shardOf(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ((h >>> 0) % SHARDS).toString(16).padStart(2, '0');
}

const nulls = (n) => new Array(n).fill(null);

// ---------- (de)serialisation: arrays are stored with leading nulls trimmed
function expand(start, arr, len) {
  const out = nulls(len);
  if (!Array.isArray(arr)) return out;
  for (let i = 0; i < arr.length && start + i < len; i++) out[start + i] = arr[i];
  return out;
}
function trim(arr) {
  let s = 0;
  while (s < arr.length && arr[s] === null) s++;
  return [s, arr.slice(s)];
}
// Move an array aligned to oldBase onto newBase (drops buckets that fell out of the window).
function shift(arr, oldBase, newBase, len) {
  const d = newBase - oldBase;
  if (d === 0) return arr;
  const out = nulls(len);
  for (let i = 0; i < len; i++) { const j = i + d; if (j >= 0 && j < len) out[i] = arr[j]; }
  return out;
}

function readRuns(json, hb, db) {
  return {
    hr: json && json.hr ? shift(expand(json.hr0 || 0, json.hr, HOURS), json.hb, hb, HOURS) : nulls(HOURS),
    dr: json && json.dr ? shift(expand(json.dr0 || 0, json.dr, DAYS), json.db, db, DAYS) : nulls(DAYS),
  };
}

function readShard(json, hb, db) {
  const servers = new Map();
  if (!json || !json.s) return servers;
  for (const [id, r] of Object.entries(json.s)) {
    const e = {
      first: r.first || Date.now(),
      hs: shift(expand(r.h0 || 0, r.hs, HOURS), json.hb, hb, HOURS),
      hp: shift(expand(r.h0 || 0, r.hp, HOURS), json.hb, hb, HOURS),
      hn: shift(expand(r.h0 || 0, r.hn, HOURS), json.hb, hb, HOURS),
      ds: shift(expand(r.d0 || 0, r.ds, DAYS), json.db, db, DAYS),
      dp: shift(expand(r.d0 || 0, r.dp, DAYS), json.db, db, DAYS),
      dn: shift(expand(r.d0 || 0, r.dn, DAYS), json.db, db, DAYS),
    };
    servers.set(id, e);
  }
  return servers;
}

function writeShard(servers, hb, db, updatedAt, runs) {
  const s = {};
  for (const [id, e] of servers) {
    const [h0, hs] = trim(e.hs);
    const [d0, ds] = trim(e.ds);
    s[id] = {
      first: e.first,
      h0, hs, hp: e.hp.slice(h0), hn: e.hn.slice(h0),
      d0, ds, dp: e.dp.slice(d0), dn: e.dn.slice(d0),
    };
  }
  const [hr0, hr] = trim(runs.hr);
  const [dr0, dr] = trim(runs.dr);
  return JSON.stringify({ v: 2, updatedAt, hb, db, hr0, hr, dr0, dr, s });
}

// ---------- restore previous state (cache folder → GitHub Pages → empty)
function pagesBaseUrl() {
  if (process.env.PAGES_BASE_URL) return process.env.PAGES_BASE_URL.replace(/\/$/, '');
  const repo = process.env.GITHUB_REPOSITORY; // "Owner/repo"
  if (!repo) return '';
  const [owner, name] = repo.split('/');
  return name.toLowerCase() === `${owner.toLowerCase()}.github.io`
    ? `https://${owner.toLowerCase()}.github.io`
    : `https://${owner.toLowerCase()}.github.io/${name}`;
}

async function restoreFromPages() {
  const base = pagesBaseUrl();
  if (!base) return 0;
  fs.mkdirSync(DIR, { recursive: true });
  const ids = Array.from({ length: SHARDS }, (_, i) => i.toString(16).padStart(2, '0'));
  let got = 0;
  for (let i = 0; i < ids.length; i += 16) {
    await Promise.all(ids.slice(i, i + 16).map(async (sh) => {
      try {
        const res = await fetch(`${base}/data/history/${sh}.json`, { cache: 'no-store' });
        if (!res.ok) return;
        const text = await res.text();
        JSON.parse(text); // validate
        fs.writeFileSync(path.join(DIR, `${sh}.json`), text);
        got++;
      } catch { /* missing shard = no history yet */ }
    }));
  }
  return got;
}

// ---------- main entry: record one sample for every server in `rows`
async function recordHistory(rows, fields, now = Date.now()) {
  const iId = fields.indexOf('id');
  const iClients = fields.indexOf('clients');
  const hourNow = Math.floor(now / 3600000);
  const dayNow = Math.floor(now / 86400000);
  const hb = hourNow - (HOURS - 1);
  const db = dayNow - (DAYS - 1);

  const haveLocal = fs.existsSync(DIR) && fs.readdirSync(DIR).some((f) => f.endsWith('.json'));
  if (!haveLocal) {
    const n = await restoreFromPages();
    console.log(n ? `History: restored ${n} shards from GitHub Pages` : 'History: starting fresh');
  }
  fs.mkdirSync(DIR, { recursive: true });

  // group current samples by shard
  const samples = new Map();
  for (const r of rows) {
    const id = r[iId];
    const sh = shardOf(id);
    if (!samples.has(sh)) samples.set(sh, []);
    samples.get(sh).push([id, r[iClients] | 0]);
  }

  let tracked = 0, bytes = 0;
  const updatedAt = new Date(now).toISOString();
  for (let i = 0; i < SHARDS; i++) {
    const sh = i.toString(16).padStart(2, '0');
    const file = path.join(DIR, `${sh}.json`);
    let json = null;
    try { json = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* new shard */ }
    const servers = readShard(json, hb, db);
    const runs = readRuns(json, hb, db);
    runs.hr[HOURS - 1] = (runs.hr[HOURS - 1] || 0) + 1;
    runs.dr[DAYS - 1] = (runs.dr[DAYS - 1] || 0) + 1;

    for (const [id, clients] of samples.get(sh) || []) {
      let e = servers.get(id);
      if (!e) {
        if (clients < MIN_PLAYERS_TO_TRACK) continue;
        e = { first: now, hs: nulls(HOURS), hp: nulls(HOURS), hn: nulls(HOURS), ds: nulls(DAYS), dp: nulls(DAYS), dn: nulls(DAYS) };
        servers.set(id, e);
      }
      const h = HOURS - 1, d = DAYS - 1;
      e.hs[h] = (e.hs[h] || 0) + clients; e.hn[h] = (e.hn[h] || 0) + 1; e.hp[h] = Math.max(e.hp[h] ?? 0, clients);
      e.ds[d] = (e.ds[d] || 0) + clients; e.dn[d] = (e.dn[d] || 0) + 1; e.dp[d] = Math.max(e.dp[d] ?? 0, clients);
    }

    // forget servers with no players at all in the whole year window
    for (const [id, e] of servers) {
      if (!e.dp.some((v) => v > 0) && !e.hp.some((v) => v > 0)) servers.delete(id);
    }

    const out = writeShard(servers, hb, db, updatedAt, runs);
    fs.writeFileSync(file, out);
    tracked += servers.size;
    bytes += out.length;
  }
  console.log(`History: ${tracked} servers tracked, ${(bytes / 1e6).toFixed(1)} MB across ${SHARDS} shards`);
}

module.exports = { recordHistory, restoreFromPages, shardOf, HOURS, DAYS };
