import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
export const phase = 7;
test('local Vercel route simulation preserves every built precache/static path and cache category', () => {
  const {routes} = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const resolve = url => {
    for (const rule of routes) {
      const regex = new RegExp(`^(?:${rule.src})$`);
      if (regex.test(url)) return {dest:url.replace(regex, rule.dest), headers:rule.headers ?? {}};
    }
    assert.fail(`No route for ${url}`);
  };
  const sw = fs.readFileSync('build/sw.js', 'utf8');
  const precache = [...sw.matchAll(/\burl:["']([^"']+)["']/g)].map(match => '/' + match[1].replace(/^\//,''));
  assert.ok(precache.length > 20, 'actual generated precache URLs parsed');
  const manifest = JSON.parse(fs.readFileSync('build/manifest.json', 'utf8'));
  const staticPaths = new Set([...precache, '/storex_logo.svg', '/logo_512_t2.png', '/manifest.json', '/sw.js',
    ...manifest.icons.map(icon => '/' + icon.src.replace(/^\//,'')),
    ...manifest.screenshots.map(item => item.src),
    ...fs.readdirSync('build').filter(name => /^workbox-.*\.js$/.test(name)).map(name => '/'+name),
    ...fs.readdirSync('build/assets').map(name => '/assets/'+name)]);
  const report = [];
  for (const url of staticPaths) {
    assert.ok(fs.existsSync(path.join('build',url)), `built static file ${url} exists`);
    const result = resolve(url);
    assert.equal(result.dest,url, `${url} retains its complete path/extension`);
    const cache = result.headers['cache-control'] ?? result.headers['Cache-Control'] ?? '';
    if(url === '/sw.js') assert.match(cache,/max-age=0.*must-revalidate/);
    else if (/^\/workbox-|^\/assets\/.+-[^/]+\.(js|css)$/.test(url)) assert.match(cache,/max-age=31536000.*immutable/);
    else assert.doesNotMatch(cache,/immutable/,`nonfingerprinted ${url} must revalidate`);
    report.push({url,...result});
  }
  assert.equal(resolve('/api/synthetic/path').dest,'/api/synthetic/path');
  assert.equal(resolve('/bridge').dest,'/index.html');
  assert.equal(resolve('/').dest,'/index.html');
  fs.writeFileSync('plan/audit-evidence/phase7-hosting-routes.json',JSON.stringify({scope:'Local configuration simulation only; actual Vercel hosting UNRUN',report},null,2));
});
