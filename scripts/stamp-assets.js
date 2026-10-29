// Cache-busting: rewrites the CSS/JS links in site/index.html to include a hash of
// each file's contents (e.g. assets/style.css?v=1a2b3c4d), so browsers fetch the new
// version right after a deploy instead of serving a stale cached copy.
//
//   node scripts/stamp-assets.js      (also run automatically by build-data.js)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SITE = path.join(__dirname, '..', 'site');
const INDEX = path.join(SITE, 'index.html');
const ASSETS = ['config.js', 'assets/app.js', 'assets/style.css', 'assets/logo.svg', 'assets/live-worker.js'];

function stamp() {
  let html = fs.readFileSync(INDEX, 'utf8');
  const before = html;
  for (const rel of ASSETS) {
    const file = path.join(SITE, rel);
    if (!fs.existsSync(file)) continue;
    const hash = crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex').slice(0, 8);
    const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`(["'])${escaped}(\\?v=[0-9a-f]*)?\\1`, 'g'), `$1${rel}?v=${hash}$1`);
  }
  if (html !== before) fs.writeFileSync(INDEX, html);
  console.log(html !== before ? 'Stamped asset versions in index.html' : 'Asset versions already up to date');
}

module.exports = { stamp };
if (require.main === module) stamp();
