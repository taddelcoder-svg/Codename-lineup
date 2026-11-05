'use strict';
// Codename: Lineup – kleiner Server ohne Abhängigkeiten.
// Liefert das Spiel aus. Später kommt hier der Koop per WebSocket dazu.
// Start: node server.js – hört auf PORT (Render setzt die Variable, sonst 10000).
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 10000;
const ROOT = __dirname;
const TYPEN = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};
// Nur diese Dateien und Ordner werden ausgeliefert (nicht server.js, package.json usw.)
const ERLAUBT = new Set(['/index.html']);
const ORDNER = ['/fonts/'];

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok\n'); }
  if (url === '/') url = '/index.html';
  const datei = path.normalize(path.join(ROOT, url));
  const ok = datei.startsWith(ROOT + path.sep) && (ERLAUBT.has(url) || ORDNER.some(o => url.startsWith(o)));
  if (!ok) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nicht gefunden\n'); }
  fs.readFile(datei, (fehler, inhalt) => {
    if (fehler) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nicht gefunden\n'); }
    const typ = TYPEN[path.extname(datei)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': typ, 'Cache-Control': url.startsWith('/fonts/') ? 'public, max-age=604800' : 'no-cache' });
    res.end(inhalt);
  });
});
server.listen(PORT, () => console.log('Codename: Lineup läuft auf Port ' + PORT));
