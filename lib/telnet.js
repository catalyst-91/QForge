'use strict';
// Persistent Telnet connections for console command lines (grandMA2: port 30000, needs
// Login "user" "password" first). One socket per host:port, re-opened on demand.
const net = require('net');

const conns = new Map();

function open(host, port, user, password) {
  const key = `${host}:${port}`;
  let c = conns.get(key);
  if (c && !c.dead) return c;
  c = { key, sock: null, ready: null, dead: false, user, password, last: '' };
  c.ready = new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port, timeout: 5000 });
    c.sock = sock;
    let settled = false;
    const done = (err) => { if (settled) return; settled = true; if (err) { c.dead = true; reject(err); } else resolve(); };
    sock.setKeepAlive(true, 10000);
    sock.on('connect', () => {
      sock.setTimeout(0);
      // wait briefly for the banner, then log in (if a user is set)
      setTimeout(() => {
        if (user) sock.write(`Login "${String(user).replace(/"/g, '')}" "${String(password || '').replace(/"/g, '')}"\r\n`);
        setTimeout(() => done(), user ? 250 : 0);
      }, 300);
    });
    sock.on('data', (d) => { c.last = String(d).slice(-400); });
    sock.on('timeout', () => { sock.destroy(); done(new Error(`No answer from ${key}`)); });
    sock.on('error', (e) => { c.dead = true; done(e); });
    sock.on('close', () => { c.dead = true; conns.delete(key); });
  });
  conns.set(key, c);
  return c;
}

async function send({ host, port, user, password, command }) {
  if (!host) return { ok: false, error: 'No console IP set' };
  port = Number(port) || 30000;
  try {
    let c = open(host, port, user, password);
    if (c.user !== user || c.password !== password) { try { c.sock.destroy(); } catch { /* ignore */ } conns.delete(c.key); c = open(host, port, user, password); }
    await c.ready;
    for (const line of String(command).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) c.sock.write(`${line}\r\n`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Telnet ${host}:${port} — ${e.code === 'ECONNREFUSED' ? 'connection refused (is Telnet login enabled on the console?)' : e.message}` };
  }
}

function closeAll() { for (const c of conns.values()) { try { c.sock.destroy(); } catch { /* ignore */ } } conns.clear(); }

module.exports = { send, closeAll };
