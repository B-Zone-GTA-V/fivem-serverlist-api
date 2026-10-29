// Live server list, straight from Cfx.re — the same stream the official server browser reads.
// Runs in a Web Worker so decoding ~30k servers never blocks the page.
// Posts { type: 'done', data } in the exact shape of data/servers.json, or { type: 'error' }.

/* eslint-disable no-restricted-globals */
const STREAM_URL = 'https://frontend.cfx-services.net/api/servers/streamRedir/';

// Must match FIELDS in scripts/build-data.js.
const FIELDS = [
  'id', 'hostname', 'projectName', 'projectDesc', 'clients', 'maxClients',
  'locale', 'tags', 'iconVersion', 'upvotePower', 'burstPower', 'premium',
  'game', 'gametype', 'mapname', 'bannerDetail', 'bannerConnecting',
  'gameBuild', 'onesync', 'enhancedHostSupport', 'resourceCount', 'serverVersion',
  'discord', 'pureLevel', 'scriptHookAllowed', 'private',
  'iconUrl', 'peakPlayers',
];

const utf8 = new TextDecoder('utf-8');

// ---- minimal protobuf reader for master.Server / master.ServerData (see cfx/master.js)
function varint(buf, st) {
  let lo = 0, shift = 0, b;
  do {
    b = buf[st.p++];
    if (shift < 28) lo |= (b & 0x7f) << shift;
    else if (shift === 28) lo |= (b & 0x0f) << 28;
    shift += 7;
  } while (b & 0x80 && shift < 70);
  return lo; // low 32 bits, signed — what int32 fields need
}
function skip(buf, st, wire) {
  if (wire === 0) varint(buf, st);
  else if (wire === 1) st.p += 8;
  else if (wire === 2) { const n = varint(buf, st) >>> 0; st.p += n; }
  else if (wire === 5) st.p += 4;
  else throw new Error('bad wire type ' + wire);
}
function str(buf, st) {
  const n = varint(buf, st) >>> 0;
  const s = utf8.decode(buf.subarray(st.p, st.p + n));
  st.p += n;
  return s;
}

function decodeData(buf, st, end) {
  const d = { vars: {}, resources: 0 };
  while (st.p < end) {
    const tag = varint(buf, st) >>> 0, f = tag >>> 3, w = tag & 7;
    switch (f) {
      case 1: d.svMaxclients = varint(buf, st); break;
      case 2: d.clients = varint(buf, st); break;
      case 4: d.hostname = str(buf, st); break;
      case 5: d.gametype = str(buf, st); break;
      case 6: d.mapname = str(buf, st); break;
      case 8: d.resources++; skip(buf, st, w); break;
      case 9: d.server = str(buf, st); break;
      case 11: d.iconVersion = varint(buf, st); break;
      case 12: { // map<string,string> vars
        const len = varint(buf, st) >>> 0, e = st.p + len;
        let k = '', v = '';
        while (st.p < e) {
          const t = varint(buf, st) >>> 0;
          if ((t >>> 3) === 1) k = str(buf, st);
          else if ((t >>> 3) === 2) v = str(buf, st);
          else skip(buf, st, t & 7);
        }
        st.p = e;
        if (k) d.vars[k] = v;
        break;
      }
      case 16: d.enhancedHostSupport = varint(buf, st) !== 0; break;
      case 17: d.upvotePower = varint(buf, st); break;
      case 19: d.burstPower = varint(buf, st); break;
      default: skip(buf, st, w);
    }
  }
  st.p = end;
  return d;
}

function decodeServer(buf) {
  const st = { p: 0 };
  let id = '', data = null;
  while (st.p < buf.length) {
    const tag = varint(buf, st) >>> 0, f = tag >>> 3, w = tag & 7;
    if (f === 1) id = str(buf, st);
    else if (f === 2) { const n = varint(buf, st) >>> 0; data = decodeData(buf, st, st.p + n); }
    else skip(buf, st, w);
  }
  return id && data ? { id, d: data } : null;
}

// ---- same row mapping as scripts/build-data.js
const clip = (s, n) => (typeof s === 'string' ? (s = s.trim(), s.length > n ? s.slice(0, n) : s) : '');
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u.trim()) ? clip(u, 400) : '');
const truthy = (v) => v === 'true' || v === '1' || v === 'on';

function toRow({ id, d }) {
  const v = d.vars;
  const hostname = clip(d.hostname, 300);
  if (!hostname) return null;
  const tags = clip(v.tags, 400).split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    .filter((t, i, a) => a.indexOf(t) === i).slice(0, 20).join(',');
  const row = {
    id, hostname,
    projectName: clip(v.sv_projectName, 200), projectDesc: clip(v.sv_projectDesc, 300),
    clients: d.clients | 0, maxClients: d.svMaxclients | 0, locale: clip(v.locale, 20), tags,
    iconVersion: d.iconVersion | 0, upvotePower: d.upvotePower | 0, burstPower: d.burstPower | 0,
    premium: clip(v.premium, 4), game: v.gamename === 'rdr3' ? 'redm' : 'fivem',
    gametype: clip(d.gametype, 60), mapname: clip(d.mapname, 60),
    bannerDetail: safeUrl(v.banner_detail), bannerConnecting: safeUrl(v.banner_connecting),
    gameBuild: clip(v.sv_enforceGameBuild, 10), onesync: truthy(v.onesync_enabled) ? 1 : 0,
    enhancedHostSupport: d.enhancedHostSupport ? 1 : 0, resourceCount: d.resources,
    serverVersion: clip(d.server, 80), discord: clip(v.Discord || v.discord, 120),
    pureLevel: clip(v.sv_pureLevel, 2), scriptHookAllowed: truthy(v.sv_scriptHookAllowed) ? 1 : 0,
    private: truthy(v.sv_private) ? 1 : 0, iconUrl: safeUrl(v.icon_url),
    peakPlayers: parseInt(v.peak_players, 10) || 0,
  };
  return FIELDS.map((k) => row[k]);
}

// ---- length-prefixed frame reader (same format as modules/frameReader.js)
async function run(url) {
  const res = await fetch(url || STREAM_URL, { cache: 'no-store' });
  if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
  const reader = res.body.getReader();
  const seen = new Set();
  const rows = [];
  let pending = new Uint8Array(0);

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    let buf;
    if (pending.length) { buf = new Uint8Array(pending.length + value.length); buf.set(pending); buf.set(value, pending.length); }
    else buf = value;

    let p = 0;
    while (buf.length - p >= 4) {
      const len = (buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16) | (buf[p + 3] << 24)) >>> 0;
      if (len > 65535) throw new Error('frame too large');
      if (buf.length - p - 4 < len) break;
      const frame = buf.subarray(p + 4, p + 4 + len);
      p += 4 + len;
      try {
        const srv = decodeServer(frame);
        if (srv && !seen.has(srv.id)) { seen.add(srv.id); const r = toRow(srv); if (r) rows.push(r); }
      } catch { /* skip malformed frame */ }
    }
    pending = buf.slice(p);
  }

  if (rows.length < 100) throw new Error('only ' + rows.length + ' servers');
  return { updatedAt: new Date().toISOString(), live: true, fields: FIELDS, servers: rows };
}

self.onmessage = async (e) => {
  try {
    const data = await run(e.data && e.data.url);
    self.postMessage({ type: 'done', data });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
