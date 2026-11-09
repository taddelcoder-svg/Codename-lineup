'use strict';
// Codename: Lineup – kleiner Server ohne Abhängigkeiten.
// Liefert das Spiel aus und vermittelt unter /ws Koop-Räume per WebSocket.
// Der Host (wer den Raum erstellt) rechnet das Spiel, der Server reicht Eingaben und Spielstände nur weiter.
// Start: node server.js – hört auf PORT (Render setzt die Variable, sonst 10000).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  let url;
  try { url = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) { url = '/'; }
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

/* ---------------- WebSocket (RFC 6455, nur Text-Nachrichten) ---------------- */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_NACHRICHT = 256 * 1024;

function rahmen(opcode, nutzlast) {
  const n = nutzlast.length;
  let kopf;
  if (n < 126) { kopf = Buffer.alloc(2); kopf[1] = n; }
  else if (n < 65536) { kopf = Buffer.alloc(4); kopf[1] = 126; kopf.writeUInt16BE(n, 2); }
  else { kopf = Buffer.alloc(10); kopf[1] = 127; kopf.writeBigUInt64BE(BigInt(n), 2); }
  kopf[0] = 0x80 | opcode;
  return Buffer.concat([kopf, nutzlast]);
}

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if ((req.url || '').split('?')[0] !== '/ws' || !key) { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  const c = neuerClient(sock);
  let puffer = Buffer.alloc(0), teile = [];
  sock.on('data', (d) => {
    puffer = Buffer.concat([puffer, d]);
    while (puffer.length >= 2) {
      const fin = puffer[0] & 0x80, op = puffer[0] & 0x0f, maskiert = puffer[1] & 0x80;
      let len = puffer[1] & 0x7f, pos = 2;
      if (len === 126) { if (puffer.length < 4) return; len = puffer.readUInt16BE(2); pos = 4; }
      else if (len === 127) { if (puffer.length < 10) return; len = Number(puffer.readBigUInt64BE(2)); pos = 10; }
      if (len > MAX_NACHRICHT) { sock.destroy(); return; }
      const maske = maskiert ? 4 : 0;
      if (puffer.length < pos + maske + len) return;
      const m = maskiert ? puffer.slice(pos, pos + 4) : null;
      const daten = Buffer.from(puffer.slice(pos + maske, pos + maske + len));
      if (m) for (let i = 0; i < daten.length; i++) daten[i] ^= m[i & 3];
      puffer = puffer.slice(pos + maske + len);
      if (op === 8) { try { sock.write(rahmen(8, Buffer.alloc(0))); } catch (e) {} sock.end(); return; }
      if (op === 9) { try { sock.write(rahmen(10, daten)); } catch (e) {} continue; }
      if (op === 10) { c.lebt = true; continue; }
      if (op === 1 || op === 0) {
        teile.push(daten);
        if (fin) { const text = Buffer.concat(teile).toString('utf8'); teile = []; let o; try { o = JSON.parse(text); } catch (e) { continue; } if (o && typeof o === 'object') nachricht(c, o); }
      }
    }
  });
  sock.on('close', () => weg(c));
  sock.on('error', () => weg(c));
});

/* ---------------- Koop-Räume ---------------- */
let naechsteId = 1;
const clients = new Set();
const raeume = new Map();
const MAX_SPIELER = 4;
const AGENTEN = ['matteo', 'timo', 'omar', 'julian', 'felix', 'mo', 'damon', 'sinan', 'leon', 'moritz', 'ecki', 'philipp', 'saro', 'matti', 'paul'];

function neuerClient(sock) { const c = { id: naechsteId++, sock, name: 'Agent', agent: 'matteo', skin: '', up: {}, rank: 1, raum: null, lebt: true, offen: true }; clients.add(c); return c; }
function senden(c, o) { if (!c.offen) return; try { c.sock.write(rahmen(1, Buffer.from(JSON.stringify(o)))); } catch (e) {} }
function sauber(t, n) { return String(t || '').replace(/[<>&"]/g, '').trim().slice(0, n) || 'Agent'; }
function upVon(u) {
  const o = {};
  if (u && typeof u === 'object') Object.keys(u).slice(0, 16).forEach((k) => { if (/^[a-z]{1,10}$/.test(k)) { const v = Math.round(+u[k] || 0); o[k] = v < 0 ? 0 : v > 10 ? 10 : v; } });
  return o;
}
function profil(c, o) {
  c.name = sauber(o.name, 16);
  c.agent = AGENTEN.indexOf(o.agent) >= 0 ? o.agent : 'matteo';
  c.skin = /^[a-z]{1,12}$/.test(o.skin || '') ? o.skin : '';
  c.up = upVon(o.up);
  c.rank = Math.max(1, Math.min(200, Math.round(+o.rank || 1)));
}
function code() {
  const z = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) { let s = ''; for (let i = 0; i < 4; i++) s += z[Math.floor(Math.random() * z.length)]; if (!raeume.has(s)) return s; }
}
function lobby(r) {
  const o = { t: 'lobby', code: r.code, host: r.host.id, laeuft: r.laeuft, mission: r.mission, spieler: r.spieler.map((c) => ({ id: c.id, name: c.name, agent: c.agent, skin: c.skin })) };
  r.spieler.forEach((c) => senden(c, o));
}
function verlassen(c) {
  const r = c.raum; if (!r) return;
  c.raum = null;
  r.spieler = r.spieler.filter((x) => x !== c);
  if (r.host === c) {
    r.spieler.forEach((x) => { x.raum = null; senden(x, { t: 'host_weg' }); });
    raeume.delete(r.code);
    return;
  }
  if (r.laeuft) senden(r.host, { t: 'weg', id: c.id });
  lobby(r);
}
function weg(c) {
  if (!c.offen) return;
  c.offen = false; clients.delete(c);
  verlassen(c);
  try { c.sock.destroy(); } catch (e) {}
}

function nachricht(c, o) {
  const r = c.raum;
  switch (o.t) {
    case 'erstellen': {
      verlassen(c); profil(c, o);
      const neu = { code: code(), host: c, spieler: [c], laeuft: false, mission: 1 };
      raeume.set(neu.code, neu); c.raum = neu;
      senden(c, { t: 'du', id: c.id }); lobby(neu);
      break;
    }
    case 'beitreten': {
      const ziel = raeume.get(String(o.code || '').toUpperCase().trim());
      if (!ziel) return senden(c, { t: 'fehler', text: 'Diesen Raum gibt es nicht.' });
      if (ziel.laeuft) return senden(c, { t: 'fehler', text: 'Dort läuft gerade ein Einsatz – gleich nochmal versuchen.' });
      if (ziel.spieler.length >= MAX_SPIELER) return senden(c, { t: 'fehler', text: 'Der Raum ist voll (höchstens 4 Agenten).' });
      verlassen(c); profil(c, o);
      ziel.spieler.push(c); c.raum = ziel;
      senden(c, { t: 'du', id: c.id }); lobby(ziel);
      break;
    }
    case 'verlassen': verlassen(c); senden(c, { t: 'raus' }); break;
    case 'wahl': if (r) { profil(c, o); lobby(r); } break;
    case 'mission': if (r && r.host === c && !r.laeuft) { r.mission = Math.max(1, Math.min(999, Math.round(+o.mission || 1))); lobby(r); } break;
    case 'start': {
      if (!r || r.host !== c || r.laeuft) return;
      if (r.spieler.length < 2) return senden(c, { t: 'fehler', text: 'Warte, bis mindestens ein Freund im Raum ist.' });
      r.laeuft = true;
      r.mission = Math.max(1, Math.min(999, Math.round(+o.mission || r.mission || 1)));
      const seed = Math.floor(Math.random() * 1e9);
      const spieler = r.spieler.map((x) => ({ id: x.id, name: x.name, agent: x.agent, skin: x.skin, up: x.up, rank: x.rank }));
      r.spieler.forEach((x) => senden(x, { t: 'start', mission: r.mission, seed, host: r.host.id, spieler }));
      lobby(r);
      break;
    }
    case 'ende': if (r && r.host === c) { r.laeuft = false; lobby(r); } break;
    // Weiterreichen: Gast -> Host (Eingaben), Host -> ein Gast oder alle Gäste (Spielstand)
    case 'an_host': if (r && r.laeuft && r.host !== c) senden(r.host, { t: 'von', id: c.id, d: o.d }); break;
    case 'an': if (r && r.host === c) { const z = r.spieler.find((x) => x.id === o.id); if (z && z !== c) senden(z, { t: 'daten', d: o.d }); } break;
    case 'an_alle': if (r && r.host === c) r.spieler.forEach((x) => { if (x !== c) senden(x, { t: 'daten', d: o.d }); }); break;
  }
}

// Alle 25 Sekunden anpingen, damit Render die Verbindung nicht kappt; Tote aufräumen
setInterval(() => {
  clients.forEach((c) => {
    if (!c.lebt) return weg(c);
    c.lebt = false;
    try { c.sock.write(rahmen(9, Buffer.alloc(0))); } catch (e) { weg(c); }
  });
}, 25000);

server.listen(PORT, () => console.log('Codename: Lineup läuft auf Port ' + PORT));
