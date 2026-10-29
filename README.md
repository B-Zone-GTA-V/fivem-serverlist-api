# fivem-serverlist-api
Fetch data from the server list without all the hazzle.

## Why?
It's simple. [Cfx](https://cfx.re/) doesn't provide an 'easy to use' API for their server list.

## Disclaimer
#### Legal Notice
This project is intended for educational and informational purposes only. It is not affiliated with, endorsed, or sponsored by any third-party entities mentioned or referenced in the code. The data accessed and processed by this project is sourced from publicly available endpoints and is used in compliance with fair use principles.

#### Attribution
This project utilizes source code from the [CitizenFX/FiveM](https://github.com/citizenfx/fivem) repository. Specific code sections adapted from the [./ext/cfx-ui](https://github.com/citizenfx/fivem/tree/master/ext/cfx-ui/) module. I extend my gratitude to the CitizenFX Collective and the original authors for their contributions and the resources they provide.

#### License
This project is licensed under the MIT License. Portions of the codebase are adapted from the [CitizenFX/FiveM](https://github.com/citizenfx/fivem) project, which is licensed under the terms provided in the [CitizenFX/FiveM License](https://github.com/citizenfx/fivem/blob/master/code/LICENSE). Please review the CitizenFX license for more information regarding the terms and conditions of use.

#### Contact
For any legal questions or concerns regarding this project or its usage, please contact me (the author) at zuntiedev@gmail.com.
<br>

## Masterlist website (GitHub Pages)

`site/` is a static clone of the FiveM server browser: every server sorted by player count (ties broken by boosts, then name), country / language / tag filters, search, server icons, favorites, and a detail page per server with banner, connect button, owner details and resources.

### How it works
- `scripts/build-data.js` reads the CFX server stream with the same decoder the API uses (`cfx/master.js` + `FrameReader`) and writes a compact snapshot to `site/data/servers.json`.
- `.github/workflows/pages.yml` runs that script every 10 minutes (and on every push), then deploys `site/` to GitHub Pages. If CFX can't be reached on a run, it re-publishes the previous snapshot.
- In the browser, the site then loads the full list live from Cfx.re (the same stream the official site uses), decoded in a Web Worker (`site/assets/live-worker.js`). The snapshot is shown first and is the fallback if Cfx.re refuses. Turn this off with `liveList: false` in `site/config.js`.
- The detail page also asks the live CFX API for the player list. If the browser blocks that request, it shows the snapshot data instead.

### Server statistics
Each server page has a **Statistics** panel with average and peak players for the last 24 hours, 48 hours, 1 week, 1 month and 1 year, plus a chart and insights: prime-time average, busiest hour and weekday, growth vs. the previous week, slots usage and 30-day uptime.
- Every build run (`scripts/build-data.js`) records one player-count sample per online server via `scripts/history.js`.
- Data is kept in hourly buckets for 14 days and daily buckets for a year (plus a count of collection runs, used for uptime), stored in `site/data/history/<shard>.json` (256 shards; a server page loads only its own shard).
- Between runs the history lives in the Actions cache (see `pages.yml`). If the cache is ever empty, it is restored from the published site.
- Stats only cover the time since tracking started, so 1 month / 1 year fill in gradually.

### Deploy
1. Push this repo to GitHub.
2. Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Open **Actions → Build & deploy masterlist → Run workflow** (or just push to `main`).
4. The site appears at `https://<user>.github.io/<repo>/`.

> GitHub pauses scheduled workflows on repos with no activity for 60 days. Re-enable it from the Actions tab if that happens.

### Run locally
```sh
npm install
npm run build:data   # fetch the server list into site/data/servers.json
npm run preview      # http://localhost:8080
```

### Customize
After editing files in `site/`, run `npm run stamp` (or `npm run build:data`, which does it too) so `index.html` points at the new versions and browsers don't keep a stale cached copy. The GitHub Action also does this on every deploy.

Edit `site/config.js` for the site name, refresh interval and API URLs. Colours are CSS variables at the top of `site/assets/style.css` (`--accent`, `--bg`, …).

### Search syntax
| Query | Meaning |
| :-- | :-- |
| `drift city` | name / description / tags contain both words |
| `-zombie` | exclude servers matching `zombie` |
| `tag:esx` | has a tag containing `esx` |
| `locale:pl` | locale or country matches `pl` |
| `players:100` | at least 100 players online |
| `"los santos"` | exact phrase |

### Filters in the URL
Every view is a shareable link, e.g. `#/?country=DE,PL&tag=roleplay&hideEmpty=1&sort=boosts`. Server pages are `#/servers/detail/<join code>`.

## API Reference

### Fetch Servers by Locale

```http
GET /fetchServersByLocale/:locale
```

| Parameter | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `locale`  | `string` | **Required**. The locale to filter servers by |

#### Example

```sh
curl https://fivem-sl-api.onrender.com/fetchServersByLocale/en-US
```

---

### Fetch Server by EndPoint

```http
GET /fetchServerByEndPoint/:endpoint
```

| Parameter | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `endpoint`| `string` | **Required**. The endpoint of the server |

#### Example

```sh
curl https://fivem-sl-api.onrender.com/fetchServerByEndPoint/3lamjz
```

---

### Fetch All Servers

```http
GET /fetchServers
```

#### Example

```sh
curl https://fivem-sl-api.onrender.com/fetchServers
```
