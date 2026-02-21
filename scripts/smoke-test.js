// Minimal smoke test: checks API /health and fetches a public status page slug if provided
const http = require('http');
const https = require('https');
const url = require('url');

function get(target) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(target);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(target, (res) => {
      const { statusCode } = res;
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const api = process.env.API_BASE || 'http://127.0.0.1:4000';
  try {
    console.log('Checking API health at', api + '/health');
    const h = await get(api + '/health');
    if (h.statusCode !== 200) throw new Error('API /health returned ' + h.statusCode);
    console.log('API healthy');
    const slug = process.env.PUBLIC_SLUG;
    if (slug) {
      const pub = api + '/v1/public/status-page/' + slug;
      console.log('Fetching public status page at', pub);
      const p = await get(pub);
      if (p.statusCode !== 200) throw new Error('Public status page returned ' + p.statusCode);
      if (!p.body || p.body.length < 50) throw new Error('Public page body too small');
      console.log('Public page OK');
    } else {
      console.log('No PUBLIC_SLUG provided — skipping public page check');
    }
    process.exit(0);
  } catch (e) {
    console.error('Smoke test failed:', e.message);
    process.exit(3);
  }
})();
