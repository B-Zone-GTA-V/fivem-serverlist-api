// Builds a compact snapshot of the whole FiveM/RedM server list for the static site.
//
//   node scripts/build-data.js [outFile]
//
// Uses the same stream + protobuf decoder as the API (index.js), then writes
// site/data/servers.json, which the GitHub Pages site loads in the browser.

const fs = require('fs');
const path = require('path');
const { FrameReader } = require('../modules/frameReader');
const { fetcher } = require('../modules/utils/fetcher');
const { master } = require('../cfx/master');
const { Deferred } = require('../modules/utils/async');

const STREAM_URL = process.env.CFX_STREAM_URL || 'https://frontend.cfx-services.net/api/servers/streamRedir/';
const OUT_FILE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'site', 'data', 'servers.json'));

// Column order of every row in servers.json. The site reads this list, so new
// columns can be appended without breaking older clients.
const FIELDS = [
  'id', 'hostname', 'projectName', 'projectDesc', 'clients', 'maxClients',
  'locale', 'tags', 'iconVersion', 'upvotePower', 'burstPower', 'premium',
  'game', 'gametype', 'mapname', 'bannerDetail', 'bannerConnecting',
  'gameBuild', 'onesync', 'enhancedHostSupport', 'resourceCount', 'serverVersion',
  'discord', 'pureLevel', 'scriptHookAllowed', 'private',
  'iconUrl', 'peakPlayers',
];

const clip = (s, n) => {
  if (typeof s !== 'string') return '';
  s = s.trim();
  return s.length > n ? s.slice(0, n) : s;
};

const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u.trim()) ? clip(u, 400) : '');

const truthy = (v) => v === 'true' || v === '1' || v === 'on';

async function readStream() {
  const { body } = await fetcher.fetch(new Request(STREAM_URL));
  if (!body) throw new Error('Empty body from server list stream');

  const servers = new Map();
  const done = new Deferred();

  const reader = new FrameReader(
    body,
    (frame) => {
      try {
        const srv = master.Server.decode(frame);
        if (srv && srv.EndPoint && !servers.has(srv.EndPoint)) servers.set(srv.EndPoint, srv);
      } catch (e) {
        // skip malformed frame
      }
    },
    done.resolve,
  );
  reader.read();
  await done.promise;
  return [...servers.values()];
}

function toRow(srv) {
  const d = srv.Data || {};
  const v = d.vars || {};

  const hostname = clip(d.hostname, 300);
  if (!hostname) return null;

  const tags = clip(v.tags, 400)
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .filter((t, i, a) => a.indexOf(t) === i)
    .slice(0, 20)
    .join(',');

  const game = v.gamename === 'rdr3' ? 'redm' : 'fivem';

  const row = {
    id: srv.EndPoint,
    hostname,
    projectName: clip(v.sv_projectName, 200),
    projectDesc: clip(v.sv_projectDesc, 300),
    clients: d.clients | 0,
    maxClients: d.svMaxclients | 0,
    locale: clip(v.locale, 20),
    tags,
    iconVersion: d.iconVersion | 0,
    upvotePower: d.upvotePower | 0,
    burstPower: d.burstPower | 0,
    premium: clip(v.premium, 4),
    game,
    gametype: clip(d.gametype, 60),
    mapname: clip(d.mapname, 60),
    bannerDetail: safeUrl(v.banner_detail),
    bannerConnecting: safeUrl(v.banner_connecting),
    gameBuild: clip(v.sv_enforceGameBuild, 10),
    onesync: truthy(v.onesync_enabled) ? 1 : 0,
    enhancedHostSupport: d.enhancedHostSupport ? 1 : 0,
    resourceCount: Array.isArray(d.resources) ? d.resources.length : 0,
    serverVersion: clip(d.server, 80),
    discord: clip(v.Discord || v.discord, 120),
    pureLevel: clip(v.sv_pureLevel, 2),
    scriptHookAllowed: truthy(v.sv_scriptHookAllowed) ? 1 : 0,
    private: truthy(v.sv_private) ? 1 : 0,
    // CFX now hosts server icons on cfx-server-metadata and passes the URL as a var.
    iconUrl: safeUrl(v.icon_url),
    peakPlayers: parseInt(v.peak_players, 10) || 0,
  };

  return FIELDS.map((f) => row[f]);
}

async function main() {
  const started = Date.now();
  console.log('Fetching server list stream...');
  const servers = await readStream();
  console.log(`Decoded ${servers.length} servers in ${Date.now() - started}ms`);

  if (servers.length < 100) {
    throw new Error(`Only ${servers.length} servers decoded, refusing to publish a broken snapshot`);
  }

  const rows = servers.map(toRow).filter(Boolean);
  const iClients = FIELDS.indexOf('clients');
  rows.sort((a, b) => b[iClients] - a[iClients]);

  const out = {
    updatedAt: new Date().toISOString(),
    fields: FIELDS,
    servers: rows,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out));
  const players = rows.reduce((n, r) => n + r[iClients], 0);
  console.log(`Wrote ${rows.length} servers (${players} players) to ${OUT_FILE} (${(fs.statSync(OUT_FILE).size / 1e6).toFixed(1)} MB)`);

  // Record this sample for the per-server statistics (average / peak over time).
  if (process.env.HISTORY !== '0') {
    try { await require('./history').recordHistory(rows, FIELDS); }
    catch (e) { console.error('History update failed (site still deploys):', e); }
  }

  // Bust browser caches for CSS/JS changed since the last deploy.
  require('./stamp-assets').stamp();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
