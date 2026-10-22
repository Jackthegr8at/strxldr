import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};
export async function startAuditServer({
  buildDir = 'build',
  port = 4174
} = {}) {
  const root = path.resolve(buildDir);
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('UNRUN: build/index.html unavailable; run npm run build');
  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const target = path.resolve(root, '.' + pathname);
    if (target !== root && !target.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    let file = target;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      if (!path.extname(pathname) && req.headers.accept?.includes('text/html')) file = path.join(root, 'index.html');else {
        res.writeHead(404).end();
        return;
      }
    }
    res.writeHead(200, {
      'content-type': mime[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve, reject) => {
    server.once('error', e => reject(new Error(`UNRUN: loopback port ${port}: ${e.message}`)));
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => {
      server.close(e => e ? reject(e) : resolve());
      server.closeAllConnections();
    })
  };
}
