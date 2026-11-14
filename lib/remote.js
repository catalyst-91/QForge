'use strict';
// Web remote server: serves the remote UI, streams live show state with Server-Sent Events
// and accepts control commands (PIN protected). No dependencies.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

class RemoteServer {
  constructor({ root, assets, onCommand, onCollabPush, onRtcSignal }) {
    this.onRtcSignal = onRtcSignal || (() => {});
    // network displays (QForge Output app): one SSE stream per display for WebRTC signalling
    this.rtcClients = new Map();
    this.info = { name: os.hostname(), version: '', show: '', rtc: false, surfaces: [] };
    this.root = root;          // folder with index.html, remote.js, remote.css
    this.assets = assets;      // folder with logo/icon
    this.onCommand = onCommand;
    this.onCollabPush = onCollabPush || (() => {});
    // collaboration: the host publishes the show here; joined QForge machines read / push / subscribe
    this.collab = { enabled: false, version: 0, json: null, from: '' };
    this.collabClients = new Set();
    this.presence = new Map();
    this.server = null;
    this.clients = new Set();
    this.state = { ok: false };
    this.stateJson = '{"ok":false}';
    this.pin = '';
    this.viewPin = false;
    this.port = 0;
    this.host = '0.0.0.0';
  }
  addresses() {
    const out = [];
    for (const list of Object.values(os.networkInterfaces())) {
      for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
    return out;
  }
  start({ port, pin, viewPin, localOnly }) {
    return new Promise((resolve) => {
      this.stop();
      this.pin = String(pin || '');
      this.viewPin = !!viewPin;
      this.host = localOnly ? '127.0.0.1' : '0.0.0.0';
      const srv = http.createServer((req, res) => this.handle(req, res));
      srv.on('error', (err) => resolve({ ok: false, error: err.message }));
      srv.listen(Number(port) || 8080, this.host, () => {
        this.server = srv;
        this.port = srv.address().port;
        this.heartbeat = setInterval(() => { for (const c of [...this.clients, ...this.collabClients, ...this.rtcClients.values()]) c.write(': ping\n\n'); this.collabPresence(null); }, 5000);
        resolve({ ok: true, port: this.port, addresses: localOnly ? ['127.0.0.1'] : this.addresses() });
      });
    });
  }
  stop() {
    clearInterval(this.heartbeat);
    for (const c of this.clients) { try { c.end(); } catch { /* ignore */ } }
    this.clients.clear();
    for (const c of this.collabClients) { try { c.end(); } catch { /* ignore */ } }
    this.collabClients.clear();
    for (const c of this.rtcClients.values()) { try { c.end(); } catch { /* ignore */ } }
    this.rtcClients.clear();
    if (this.server) { try { this.server.close(); } catch { /* ignore */ } }
    this.server = null;
  }
  get running() { return !!this.server; }
  collabPublish({ version, show, from, enabled }) {
    if (enabled != null) this.collab.enabled = !!enabled;
    if (show !== undefined) { this.collab.version = version; this.collab.json = JSON.stringify(show); this.collab.from = from || ''; }
    this.collabBroadcast('show', `{"version":${this.collab.version},"from":${JSON.stringify(this.collab.from)},"show":${this.collab.json || 'null'}}`);
  }
  collabPresence(p) {
    if (p && p.id) this.presence.set(p.id, { ...p, t: Date.now() });
    const now = Date.now();
    for (const [k, v] of this.presence) if (now - v.t > 7000) this.presence.delete(k);
    this.collabBroadcast('presence', JSON.stringify([...this.presence.values()]));
    return [...this.presence.values()];
  }
  collabBroadcast(event, data) {
    const msg = `event: ${event}\ndata: ${data}\n\n`;
    for (const c of this.collabClients) { try { c.write(msg); } catch { /* ignore */ } }
  }
  setInfo(info) { this.info = { ...this.info, ...info }; }
  rtcSend(id, msg) {
    const c = this.rtcClients.get(id);
    if (!c) return false;
    try { c.write(`event: rtc\ndata: ${JSON.stringify(msg)}\n\n`); return true; } catch { return false; }
  }
  publish(state) {
    this.state = state;
    this.stateJson = JSON.stringify(state);
    const msg = `data: ${this.stateJson}\n\n`;
    for (const c of this.clients) { try { c.write(msg); } catch { /* ignore */ } }
  }
  pinOk(req, url) {
    if (!this.pin) return true;
    const given = req.headers['x-qforge-pin'] || url.searchParams.get('pin') || '';
    return given === this.pin;
  }
  send(res, code, body, type = 'application/json') {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(body);
  }
  handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-QForge-Pin', 'Access-Control-Allow-Methods': 'GET, POST' });
      return res.end();
    }
    if (p === '/api/info') return this.send(res, 200, JSON.stringify({ app: 'QForge', pinRequired: !!this.pin, viewPin: this.viewPin, name: this.info.name, version: this.info.version, show: this.info.show, rtc: !!this.info.rtc, surfaces: this.info.surfaces || [] }));
    // ---- network displays: WebRTC signalling between the QForge Output app and this host
    if (p === '/rtc/events' || p === '/api/rtc/signal') {
      if (!this.info.rtc) return this.send(res, 404, '{"error":"network outputs are turned off on this QForge"}');
      if (!this.pinOk(req, url)) return this.send(res, 403, '{"error":"pin"}');
      if (p === '/rtc/events') {
        const id = String(url.searchParams.get('id') || '').slice(0, 64);
        if (!id) return this.send(res, 400, '{"error":"id"}');
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
        res.write('retry: 2000\nevent: hello\ndata: {}\n\n');
        const old = this.rtcClients.get(id); if (old) { try { old.end(); } catch { /* ignore */ } }
        this.rtcClients.set(id, res);
        req.on('close', () => { if (this.rtcClients.get(id) === res) { this.rtcClients.delete(id); this.onRtcSignal({ type: 'bye', from: id }); } });
        return undefined;
      }
      if (req.method !== 'POST') return this.send(res, 405, '{"error":"method"}');
      let body = '';
      req.on('data', (d) => { body += d; if (body.length > 2e5) req.destroy(); });
      req.on('end', () => {
        try {
          const msg = JSON.parse(body || '{}');
          if (!msg.from || !['offer', 'bye'].includes(msg.type)) return this.send(res, 400, '{"error":"bad signal"}');
          msg.address = req.socket.remoteAddress;
          this.onRtcSignal(msg);
          this.send(res, 200, '{"ok":true}');
        } catch { this.send(res, 400, '{"error":"json"}'); }
      });
      return undefined;
    }
    if (p === '/api/state') {
      if (this.viewPin && !this.pinOk(req, url)) return this.send(res, 403, '{"error":"pin"}');
      return this.send(res, 200, this.stateJson);
    }
    if (p === '/events') {
      if (this.viewPin && !this.pinOk(req, url)) return this.send(res, 403, '{"error":"pin"}');
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
      res.write(`retry: 2000\ndata: ${this.stateJson}\n\n`);
      this.clients.add(res);
      req.on('close', () => this.clients.delete(res));
      return undefined;
    }
    // ---- collaboration (control PIN required for everything)
    if (p.startsWith('/api/collab') || p === '/collab/events') {
      if (!this.collab.enabled) return this.send(res, 404, '{"error":"collaboration is not enabled on this host"}');
      if (!this.pinOk(req, url)) return this.send(res, 403, '{"error":"pin"}');
      if (p === '/collab/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
        res.write(`retry: 2000\nevent: show\ndata: {"version":${this.collab.version},"from":${JSON.stringify(this.collab.from)},"show":${this.collab.json || 'null'}}\n\n`);
        res.write(`event: presence\ndata: ${JSON.stringify([...this.presence.values()])}\n\n`);
        this.collabClients.add(res);
        req.on('close', () => this.collabClients.delete(res));
        return undefined;
      }
      if (p === '/api/collab/show') return this.send(res, 200, `{"version":${this.collab.version},"from":${JSON.stringify(this.collab.from)},"show":${this.collab.json || 'null'}}`);
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (d) => { body += d; if (body.length > 50e6) req.destroy(); });
        req.on('end', () => {
          try {
            const msg = JSON.parse(body || '{}');
            if (p === '/api/collab/push') { this.onCollabPush(msg); return this.send(res, 200, '{"ok":true}'); }
            if (p === '/api/collab/presence') { const list = this.collabPresence(msg); return this.send(res, 200, JSON.stringify(list)); }
            return this.send(res, 404, '{"error":"unknown"}');
          } catch { return this.send(res, 400, '{"error":"json"}'); }
        });
        return undefined;
      }
      return this.send(res, 404, '{"error":"unknown"}');
    }
    if (p === '/api/cmd' && req.method === 'POST') {
      if (!this.pinOk(req, url)) return this.send(res, 403, '{"error":"pin"}');
      let body = '';
      req.on('data', (d) => { body += d; if (body.length > 1e5) req.destroy(); });
      req.on('end', () => {
        try {
          const msg = JSON.parse(body || '{}');
          if (!msg.cmd || typeof msg.cmd !== 'string') return this.send(res, 400, '{"error":"cmd"}');
          this.onCommand(msg.cmd, msg.arg, req.socket.remoteAddress);
          this.send(res, 200, '{"ok":true}');
        } catch { this.send(res, 400, '{"error":"json"}'); }
      });
      return undefined;
    }
    // static files
    let file;
    if (p === '/' || p === '/index.html') file = path.join(this.root, 'index.html');
    else if (p.startsWith('/assets/')) file = path.join(this.assets, path.basename(p));
    else file = path.join(this.root, path.basename(p));
    fs.readFile(file, (err, data) => {
      if (err) return this.send(res, 404, 'Not found', 'text/plain');
      this.send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
    });
    return undefined;
  }
}

module.exports = { RemoteServer };
