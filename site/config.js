// Site settings — edit these to rebrand the masterlist.
window.SITE_CONFIG = {
  // Name shown in the header and the browser tab.
  name: 'Masterlist',

  // Snapshot produced by scripts/build-data.js (refreshed by GitHub Actions).
  dataUrl: 'data/servers.json',

  // How often an open tab re-downloads the snapshot (seconds).
  refreshSeconds: 120,

  // Live single-server endpoint used on the detail page for players/resources.
  // If the browser blocks it (CORS), the page falls back to snapshot data.
  liveServerApi: 'https://frontend.cfx-services.net/api/servers/single/',

  // Server icon CDN used by the official list.
  iconUrl: (id, version) => `https://servers-live.fivem.net/servers/icon/${id}/${version}.png`,

  // Rows rendered per "page" while scrolling.
  pageSize: 60,

  // Join codes (cfx.re/join/<code>) of servers pinned in a banner at the top of "All servers".
  pinnedServers: ['zjv8ko4'], // B-Zone V Romania

  // Pinned servers ask Cfx.re for live player counts this often (seconds). 0 = off.
  pinnedLiveSeconds: 60,
};
