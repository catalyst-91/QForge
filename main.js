'use strict';
const { app, BrowserWindow, ipcMain, dialog, protocol, Menu, screen, session, shell, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const dgram = require('dgram');
const osc = require('./lib/osc');
const { handleRequest } = require('./lib/protocol');
const { DmxSender } = require('./lib/dmx');
const { RemoteServer } = require('./lib/remote');
const dns = require('dns');
const { exec } = require('child_process');
const appctl = require('./lib/appctl');
const telnet = require('./lib/telnet');

const SRC = path.join(__dirname, 'src');
const SHOW_EXT = 'qforge';
const isMac = process.platform === 'darwin';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Windows: use the WinRT MIDI backend so Bluetooth LE MIDI devices show up alongside USB ones
if (process.platform === 'win32') app.commandLine.appendSwitch('enable-features', 'MidiManagerWinrt');

protocol.registerSchemesAsPrivileged([{
  scheme: 'qp',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
}]);

let mainWin = null;
let smWin = null;
let dirty = false;
let forceClose = false;
let pendingOpenPath = null;
const videoWins = new Map();   // frameName -> BrowserWindow
const videoPrefs = new Map();  // frameName -> { displayId, fullscreen }
let oscIn = null;
let oscOut = null;
const USER = () => app.getPath('userData');
const RECOVERY = () => path.join(USER(), 'recovery.qforge');
const PREFS = () => path.join(USER(), 'prefs.json');
const LOGDIR = () => path.join(USER(), 'logs');

function readPrefs() { try { return JSON.parse(fs.readFileSync(PREFS(), 'utf8')); } catch { return {}; } }
function writePrefs(p) { try { fs.mkdirSync(USER(), { recursive: true }); fs.writeFileSync(PREFS(), JSON.stringify(p, null, 2)); } catch { /* ignore */ } }

function send(ch, ...args) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(ch, ...args);
}

// ---------------------------------------------------------------- windows
function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1480, height: 940, minWidth: 1100, minHeight: 680,
    title: 'QForge', backgroundColor: '#07080c', show: false,
    icon: path.join(__dirname, 'src', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  mainWin.once('ready-to-show', () => mainWin.show());
  mainWin.loadURL('qp://app/index.html');

  mainWin.webContents.setWindowOpenHandler(({ frameName }) => {
    if (frameName.startsWith('qforge-video')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          title: 'QForge Output', backgroundColor: '#000000', autoHideMenuBar: true,
          width: 960, height: 540, show: true,
          webPreferences: { backgroundThrottling: false },
        },
      };
    }
    return { action: 'deny' };
  });

  mainWin.webContents.on('did-create-window', (win, details) => {
    const name = details.frameName;
    if (!name.startsWith('qforge-video')) return;
    videoWins.set(name, win);
    win.setMenu(null);
    win.once('ready-to-show', () => placeVideoWindow(name));
    setTimeout(() => placeVideoWindow(name), 150);
    win.on('closed', () => { videoWins.delete(name); send('video:closed', name); });
  });

  mainWin.on('close', (e) => {
    if (!dirty || forceClose) return;
    e.preventDefault();
    const r = dialog.showMessageBoxSync(mainWin, {
      type: 'question', buttons: ['Save', "Don't Save", 'Cancel'], defaultId: 0, cancelId: 2,
      message: 'Save changes to this show before closing?',
      detail: 'Your changes will be lost if you don\'t save them.',
    });
    if (r === 0) send('menu', 'save-and-close');
    else if (r === 1) { forceClose = true; mainWin.close(); }
  });

  mainWin.on('closed', () => {
    for (const w of videoWins.values()) if (!w.isDestroyed()) w.close();
    if (smWin && !smWin.isDestroyed()) smWin.close();
    try { fs.unlinkSync(RECOVERY()); } catch { /* clean exit: no recovery needed */ }
    mainWin = null;
  });
}

function pickDisplay(prefs) {
  const all = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  return all.find((d) => d.id === prefs.displayId) || all.find((d) => d.id !== primary.id) || primary;
}

function setFull(win, on) {
  if (isMac) win.setSimpleFullScreen(on); else win.setFullScreen(on);
}

function placeVideoWindow(name) {
  const win = videoWins.get(name);
  if (!win || win.isDestroyed()) return;
  const prefs = videoPrefs.get(name) || { displayId: null, fullscreen: true };
  const d = pickDisplay(prefs);
  const isFull = isMac ? win.isSimpleFullScreen() : win.isFullScreen();
  if (isFull) setFull(win, false);
  if (prefs.ndi) {
    // NDI capture mode: a plain window with an exact content size, ready for NDI Screen Capture / Scan Converter
    win.setContentSize(Number(prefs.width) || 1920, Number(prefs.height) || 1080);
    const b = win.getBounds();
    win.setPosition(d.workArea.x + Math.max(0, Math.round((d.workArea.width - b.width) / 2)), d.workArea.y + Math.max(0, Math.round((d.workArea.height - b.height) / 2)));
  } else if (prefs.fullscreen) {
    win.setBounds(d.bounds);
    setFull(win, true);
  } else {
    const w = Math.round(d.workArea.width * 0.5);
    const h = Math.round((w * 9) / 16);
    win.setBounds({
      x: d.workArea.x + Math.round((d.workArea.width - w) / 2),
      y: d.workArea.y + Math.round((d.workArea.height - h) / 2), width: w, height: h,
    });
  }
  if (prefs.title) win.setTitle(prefs.title);
}

// ---------------------------------------------------------------- show files
function forEachList(data, fn) {
  if (Array.isArray(data.cues)) fn(data.cues);
  for (const l of data.lists || []) fn(l.cues);
  if (Array.isArray(data.cart)) fn(data.cart);
}

function resolveMedia(data, dir) {
  const walk = (list) => {
    for (const c of list || []) {
      if (c.file && !fs.existsSync(c.file) && c.fileRel) {
        const cand = path.resolve(dir, c.fileRel);
        if (fs.existsSync(cand)) c.file = cand;
      }
      if (Array.isArray(c.children)) walk(c.children);
    }
  };
  forEachList(data, walk);
  return data;
}

function relativizeMedia(data, dir) {
  const walk = (list) => {
    for (const c of list || []) {
      if (c.file && path.isAbsolute(c.file)) c.fileRel = path.relative(dir, c.file).split(path.sep).join('/');
      if (Array.isArray(c.children)) walk(c.children);
    }
  };
  forEachList(data, walk);
  return data;
}

function readShow(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return { path: filePath, data: resolveMedia(data, path.dirname(filePath)) };
}

// ---------------------------------------------------------------- version history (last 20 saves per show)
const HISTDIR = (showPath) => path.join(USER(), 'history', path.basename(showPath, path.extname(showPath)).replace(/[\\/:*?"<>|]+/g, '_') + '-' + require('crypto').createHash('md5').update(showPath).digest('hex').slice(0, 6));
function snapshotHistory(target) {
  try {
    if (!fs.existsSync(target)) return;
    const dir = HISTDIR(target);
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    fs.copyFileSync(target, path.join(dir, `${stamp}.${SHOW_EXT}`));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(`.${SHOW_EXT}`)).sort();
    while (files.length > 20) fs.unlinkSync(path.join(dir, files.shift()));
  } catch { /* history is best-effort */ }
}
ipcMain.handle('history:list', (_e, showPath) => {
  if (!showPath) return [];
  try {
    const dir = HISTDIR(showPath);
    return fs.readdirSync(dir).filter((f) => f.endsWith(`.${SHOW_EXT}`)).sort().reverse()
      .map((f) => { const st = fs.statSync(path.join(dir, f)); return { file: path.join(dir, f), time: st.mtimeMs, size: st.size }; });
  } catch { return []; }
});
ipcMain.handle('history:read', (_e, file, showPath) => {
  try { const data = JSON.parse(fs.readFileSync(file, 'utf8')); return { data: resolveMedia(data, path.dirname(showPath || file)) }; } catch (err) { return { error: err.message }; }
});

// ---------------------------------------------------------------- recordings
ipcMain.handle('rec:save', async (_e, { name, bytes, showPath }) => {
  try {
    const base = showPath ? path.join(path.dirname(showPath), 'Recordings') : path.join(app.getPath('documents'), 'QForge Recordings');
    fs.mkdirSync(base, { recursive: true });
    let file = path.join(base, name);
    const ext = path.extname(name), stem = path.basename(name, ext);
    for (let n = 2; fs.existsSync(file); n++) file = path.join(base, `${stem} (${n})${ext}`);
    fs.writeFileSync(file, Buffer.from(bytes));
    return { ok: true, path: file };
  } catch (err) { return { ok: false, error: err.message }; }
});

// ---------------------------------------------------------------- IPC
ipcMain.handle('show:open', async () => {
  const r = await dialog.showOpenDialog(mainWin, {
    title: 'Open Show', properties: ['openFile'],
    filters: [{ name: 'QForge Show', extensions: [SHOW_EXT, 'json'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  try { return readShow(r.filePaths[0]); } catch (err) { return { error: err.message }; }
});

ipcMain.handle('show:read', async (_e, filePath) => {
  try { return readShow(filePath); } catch (err) { return { error: err.message }; }
});

ipcMain.handle('show:save', async (_e, { path: filePath, data, saveAs }) => {
  let target = filePath;
  if (!target || saveAs) {
    const r = await dialog.showSaveDialog(mainWin, {
      title: 'Save Show', defaultPath: target || `${data.name || 'Untitled'}.${SHOW_EXT}`,
      filters: [{ name: 'QForge Show', extensions: [SHOW_EXT] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    target = r.filePath;
  }
  try {
    relativizeMedia(data, path.dirname(target));
    snapshotHistory(target);
    fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true, path: target };
  } catch (err) { return { ok: false, error: err.message }; }
});

// Export a self-contained package: <dest>/<Name> Package/<Name>.qforge + Media/ (all media copied)
ipcMain.handle('show:export-package', async (_e, { data }) => {
  const r = await dialog.showOpenDialog(mainWin, {
    title: 'Choose where to create the show package', properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
  const safe = String(data.name || 'Untitled').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Untitled';
  let pkgDir = path.join(r.filePaths[0], `${safe} Package`);
  for (let n = 2; fs.existsSync(pkgDir); n++) pkgDir = path.join(r.filePaths[0], `${safe} Package ${n}`);
  const mediaDir = path.join(pkgDir, 'Media');
  try {
    fs.mkdirSync(mediaDir, { recursive: true });
    const copied = new Map();
    const used = new Set();
    const missing = [];
    const walk = (list) => {
      for (const c of list || []) {
        if (c.file) {
          if (!copied.has(c.file)) {
            if (fs.existsSync(c.file)) {
              const ext = path.extname(c.file);
              const base = path.basename(c.file, ext);
              let name = base + ext;
              for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})${ext}`;
              used.add(name.toLowerCase());
              fs.copyFileSync(c.file, path.join(mediaDir, name));
              copied.set(c.file, path.join(mediaDir, name));
            } else { missing.push(c.file); copied.set(c.file, null); }
          }
          const dest = copied.get(c.file);
          if (dest) { c.file = dest; c.fileRel = `Media/${path.basename(dest)}`; }
        }
        if (Array.isArray(c.children)) walk(c.children);
      }
    };
    forEachList(data, walk);
    const showPath = path.join(pkgDir, `${safe}.${SHOW_EXT}`);
    fs.writeFileSync(showPath, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true, path: showPath, dir: pkgDir, copied: [...copied.values()].filter(Boolean).length, missing };
  } catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('file:export-text', async (_e, { name, text, ext, label }) => {
  const r = await dialog.showSaveDialog(mainWin, { title: `Export ${label || ext}`, defaultPath: name, filters: [{ name: label || ext, extensions: [ext] }] });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try { fs.writeFileSync(r.filePath, text, 'utf8'); return { ok: true, path: r.filePath }; } catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('show:launch-file', () => { const p = pendingOpenPath; pendingOpenPath = null; return p; });

ipcMain.handle('media:choose', async (_e, kind) => {
  const filters = {
    audio: [{ name: 'Audio', extensions: ['wav', 'mp3', 'aif', 'aiff', 'flac', 'ogg', 'm4a', 'aac', 'opus'] }],
    video: [{ name: 'Video & Images', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'png', 'jpg', 'jpeg', 'gif', 'webp'] }],
  }[kind] || [];
  const r = await dialog.showOpenDialog(mainWin, { properties: ['openFile', 'multiSelections'], filters: [...filters, { name: 'All Files', extensions: ['*'] }] });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('media:exists', (_e, paths) => (paths || []).map((p) => { try { return fs.existsSync(p); } catch { return false; } }));
ipcMain.handle('media:reveal', (_e, p) => { if (p) shell.showItemInFolder(p); });

ipcMain.handle('displays:list', () => {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: `${d.label || `Display ${i + 1}`} — ${d.size.width}×${d.size.height}${d.id === primary ? ' (primary)' : ''}`,
  }));
});

ipcMain.handle('video:place', (_e, prefs) => {
  const name = prefs.frame || 'qforge-video';
  videoPrefs.set(name, { ...(videoPrefs.get(name) || {}), ...prefs });
  placeVideoWindow(name);
  return true;
});

ipcMain.handle('osc:listen', (_e, port) => new Promise((resolve) => {
  if (oscIn) { try { oscIn.close(); } catch { /* ignore */ } oscIn = null; }
  if (!port) return resolve({ ok: true, port: 0 });
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  let settled = false;
  sock.on('message', (msg, rinfo) => {
    try { for (const m of osc.decode(msg)) send('osc:message', { ...m, from: rinfo.address }); } catch { /* bad packet */ }
  });
  sock.on('error', (err) => {
    if (!settled) { settled = true; resolve({ ok: false, error: err.message }); }
    try { sock.close(); } catch { /* ignore */ }
    if (oscIn === sock) oscIn = null;
  });
  sock.bind(port, () => { settled = true; oscIn = sock; resolve({ ok: true, port }); });
}));

function getOscOut() {
  return new Promise((resolve) => {
    if (oscOut) return resolve(oscOut);
    const s = dgram.createSocket('udp4');
    s.bind(() => { try { s.setBroadcast(true); } catch { /* ignore */ } oscOut = s; resolve(s); });
  });
}

ipcMain.handle('osc:send', async (_e, { host, port, address, args }) => {
  try {
    const sock = await getOscOut();
    const buf = osc.encode(address, args || []);
    return await new Promise((resolve) => sock.send(buf, Number(port), host || '127.0.0.1', (err) => resolve(err ? { ok: false, error: err.message } : { ok: true })));
  } catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.on('app:dirty', (_e, v) => { dirty = !!v; if (mainWin && isMac) mainWin.setDocumentEdited(dirty); });
ipcMain.on('app:title', (_e, t) => { if (mainWin) mainWin.setTitle(t); });
ipcMain.on('edit:native', (e, cmd) => {
  const wc = e.sender;
  if (['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'].includes(cmd)) wc[cmd]();
});
ipcMain.on('app:close-now', () => { forceClose = true; if (mainWin) mainWin.close(); });


// ---------------------------------------------------------------- autosave / crash recovery
ipcMain.handle('recovery:save', (_e, { data, path: showPath }) => {
  try {
    fs.mkdirSync(USER(), { recursive: true });
    fs.writeFileSync(RECOVERY(), JSON.stringify({ savedAt: Date.now(), path: showPath || null, data }));
    return true;
  } catch { return false; }
});
ipcMain.handle('recovery:get', () => {
  try { const r = JSON.parse(fs.readFileSync(RECOVERY(), 'utf8')); return r && r.data ? r : null; } catch { return null; }
});
ipcMain.handle('recovery:clear', () => { try { fs.unlinkSync(RECOVERY()); } catch { /* none */ } return true; });

// ---------------------------------------------------------------- relink missing media
function scanFolder(dir, wanted, found, depth = 0, budget = { n: 60000 }) {
  if (depth > 12 || budget.n <= 0) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (--budget.n <= 0) return;
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') scanFolder(full, wanted, found, depth + 1, budget); }
    else {
      const key = e.name.toLowerCase();
      if (wanted.has(key) && !found.has(key)) found.set(key, full);
    }
  }
}
ipcMain.handle('media:relink', async (_e, names) => {
  const r = await dialog.showOpenDialog(mainWin, { title: 'Choose a folder to search for missing media', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const wanted = new Set((names || []).map((n) => String(n).toLowerCase()));
  const found = new Map();
  scanFolder(r.filePaths[0], wanted, found);
  return Object.fromEntries(found);
});

// ---------------------------------------------------------------- network helpers
ipcMain.handle('net:lookup', (_e, host) => new Promise((resolve) => {
  if (!host) return resolve({ ok: false, error: 'no host' });
  dns.lookup(host, (err, address) => resolve(err ? { ok: false, error: err.code || err.message } : { ok: true, address }));
}));

// ---------------------------------------------------------------- show log
ipcMain.on('log:append', (_e, line) => {
  try {
    fs.mkdirSync(LOGDIR(), { recursive: true });
    const d = new Date();
    const f = path.join(LOGDIR(), `qforge-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.log`);
    fs.appendFileSync(f, line + '\n');
  } catch { /* ignore */ }
});
ipcMain.handle('log:folder', () => { fs.mkdirSync(LOGDIR(), { recursive: true }); shell.openPath(LOGDIR()); });

// ---------------------------------------------------------------- DMX (Art-Net / sACN)
const dmx = new DmxSender();
ipcMain.on('dmx:send', (_e, { proto, host, universe, data }) => { dmx.set(proto, host, universe, data); });

// ---------------------------------------------------------------- script cues (opt-in per machine)
ipcMain.handle('script:status', () => !!readPrefs().allowScripts);
ipcMain.handle('script:allow', (_e, on) => {
  const p = readPrefs();
  if (on) {
    const r = dialog.showMessageBoxSync(mainWin, {
      type: 'warning', buttons: ['Allow script cues', 'Cancel'], defaultId: 1, cancelId: 1,
      message: 'Allow script cues on this computer?',
      detail: 'Script cues can run shell commands and send web requests. Only allow this if you trust every show file you open on this machine.',
    });
    if (r !== 0) return !!p.allowScripts;
  }
  p.allowScripts = !!on; writePrefs(p);
  return p.allowScripts;
});
ipcMain.handle('script:run', async (_e, s) => {
  if (!readPrefs().allowScripts) return { ok: false, error: 'Script cues are disabled on this computer (Settings → Scripts)' };
  if (s.mode === 'http') {
    try {
      const headers = {};
      String(s.headers || '').split(/\r?\n/).forEach((l) => { const i = l.indexOf(':'); if (i > 0) headers[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
      const method = (s.method || 'GET').toUpperCase();
      const res = await fetch(s.url, { method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : s.body || undefined, signal: AbortSignal.timeout(10000) });
      return { ok: res.ok, status: res.status, error: res.ok ? null : `HTTP ${res.status}` };
    } catch (err) { return { ok: false, error: err.message }; }
  }
  return new Promise((resolve) => {
    exec(s.command, { timeout: 30000, windowsHide: true }, (err, stdout, stderr) => {
      resolve(err ? { ok: false, error: (stderr || err.message).toString().slice(0, 300) } : { ok: true, output: String(stdout).slice(0, 300) });
    });
  });
});

// ---------------------------------------------------------------- printable cue sheet (PDF)
ipcMain.handle('print:pdf', async (_e, { html, name }) => {
  const r = await dialog.showSaveDialog(mainWin, { title: 'Save cue sheet PDF', defaultPath: name || 'Cue sheet.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdf = await win.webContents.printToPDF({ landscape: true, printBackground: true, pageSize: 'A4', margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } });
    fs.writeFileSync(r.filePath, pdf);
    shell.openPath(r.filePath);
    return { ok: true, path: r.filePath };
  } catch (err) { return { ok: false, error: err.message }; } finally { win.destroy(); }
});

// ---------------------------------------------------------------- camera permission (macOS)
ipcMain.handle('media:camera-access', async () => {
  if (!isMac) return true;
  try { return await systemPreferences.askForMediaAccess('camera'); } catch { return false; }
});

// ---------------------------------------------------------------- web remote + stage manager view
const remote = new RemoteServer({
  root: path.join(SRC, 'remote'),
  assets: path.join(SRC, 'assets'),
  onCommand: (cmd, arg, from) => send('remote:cmd', cmd, arg, from),
  onCollabPush: (msg) => send('collab:incoming', msg),
});
// ---- collaboration: host side
// ---------------------------------------------------------------- app control / telnet / screenshots
ipcMain.handle('app:control', (_e, req) => appctl.control(req || {}));
ipcMain.handle('telnet:send', (_e, req) => telnet.send(req || {}));
function defaultShotDir() { return path.join(app.getPath('pictures'), 'QForge Screenshots'); }
ipcMain.handle('shot:default-dir', () => defaultShotDir());
ipcMain.handle('dialog:folder', async (_e, { title, defaultPath } = {}) => {
  const r = await dialog.showOpenDialog(mainWin, { title: title || 'Choose folder', defaultPath, properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('output:screenshot', async (_e, { frame, dir, label }) => {
  const win = videoWins.get(frame);
  if (!win || win.isDestroyed()) return { ok: false, error: 'That output is not open' };
  try {
    const img = await win.webContents.capturePage();
    const folder = dir || defaultShotDir();
    fs.mkdirSync(folder, { recursive: true });
    const d = new Date(); const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
    const safe = String(label || 'Output').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60);
    let file = path.join(folder, `QForge ${safe} ${stamp}.png`);
    for (let i = 2; fs.existsSync(file); i++) file = path.join(folder, `QForge ${safe} ${stamp} (${i}).png`);
    fs.writeFileSync(file, img.toPNG());
    return { ok: true, file };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('shot:open-folder', (_e, dir) => { const f = dir || defaultShotDir(); fs.mkdirSync(f, { recursive: true }); shell.openPath(f); });

ipcMain.on('collab:publish', (_e, payload) => remote.collabPublish(payload));
ipcMain.handle('collab:presence', (_e, p) => remote.collabPresence(p));
// ---- collaboration: joining another QForge (proxied here so the secure app page can reach plain http)
const http = require('http');
let collabReq = null;
ipcMain.handle('collab:fetch', async (_e, { url, method, body, pin }) => {
  try {
    const r = await fetch(url, { method: method || 'GET', headers: { 'Content-Type': 'application/json', 'X-QForge-Pin': pin || '' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    const txt = await r.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = { error: txt.slice(0, 200) }; }
    return { ok: r.ok, status: r.status, data };
  } catch (err) { return { ok: false, status: 0, data: { error: err.message } }; }
});
ipcMain.handle('collab:listen', (_e, { url, pin }) => {
  if (collabReq) { try { collabReq.destroy(); } catch { /* ignore */ } collabReq = null; }
  if (!url) return { ok: true };
  const u = new URL(url); u.searchParams.set('pin', pin || '');
  const req = http.get(u, (res) => {
    if (res.statusCode !== 200) { send('collab:event', { type: 'error', error: res.statusCode === 403 ? 'Wrong PIN' : `Host answered ${res.statusCode}` }); res.resume(); return; }
    send('collab:event', { type: 'open' });
    res.setEncoding('utf8');
    let buf = '';
    res.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        let ev = 'message', data = '';
        for (const line of chunk.split('\n')) { if (line.startsWith('event:')) ev = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); }
        if (data) { try { send('collab:event', { type: ev, data: JSON.parse(data) }); } catch { /* bad chunk */ } }
      }
    });
    res.on('end', () => { if (collabReq === req) send('collab:event', { type: 'closed' }); });
  });
  req.on('error', (err) => { if (collabReq === req) send('collab:event', { type: 'error', error: err.message }); });
  collabReq = req;
  return { ok: true };
});
let remoteOpts = null;
ipcMain.handle('remote:start', async (_e, opts) => {
  remoteOpts = opts;
  if (!opts || !opts.enabled) { remote.stop(); return { ok: true, running: false }; }
  const r = await remote.start(opts);
  return { ...r, running: r.ok };
});
ipcMain.on('remote:publish', (_e, state) => remote.publish(state));
ipcMain.handle('sm:open', async () => {
  if (!remote.running) {
    const r = await remote.start({ ...(remoteOpts || {}), port: (remoteOpts && remoteOpts.port) || 8080, localOnly: true });
    if (!r.ok) return r;
  }
  const pin = remoteOpts && remoteOpts.pin ? `&pin=${encodeURIComponent(remoteOpts.pin)}` : '';
  const url = `http://127.0.0.1:${remote.port}/?view=sm${pin}`;
  if (smWin && !smWin.isDestroyed()) { smWin.focus(); return { ok: true }; }
  smWin = new BrowserWindow({ width: 1100, height: 700, title: 'QForge — Stage Manager', backgroundColor: '#07080c', autoHideMenuBar: true, icon: path.join(SRC, 'assets', 'icon.png') });
  smWin.setMenu(null);
  smWin.loadURL(url);
  smWin.on('closed', () => { smWin = null; });
  return { ok: true };
});

// ---------------------------------------------------------------- menu
function buildMenu() {
  const m = (label, cmd, accelerator) => ({ label, accelerator, click: () => send('menu', cmd) });
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        m('New Show', 'new', 'CmdOrCtrl+N'), m('Open Show…', 'open', 'CmdOrCtrl+O'), { type: 'separator' },
        m('Save', 'save', 'CmdOrCtrl+S'), m('Save As…', 'save-as', 'CmdOrCtrl+Shift+S'), { type: 'separator' },
        m('Import Cues from Show…', 'import', 'CmdOrCtrl+Shift+I'),
        m('Export Show Package (with media)…', 'export-package', 'CmdOrCtrl+Shift+E'),
        m('Export Cue List (CSV)…', 'export-csv'), m('Print Cue Sheet (PDF)…', 'export-pdf', 'CmdOrCtrl+Shift+P'), { type: 'separator' },
        m('Version History…', 'history'), m('Relink Missing Media…', 'relink'), m('Pre-flight Check…', 'preflight', 'CmdOrCtrl+Shift+K'), m('Show Log…', 'log'), { type: 'separator' },
        m('Settings…', 'settings', 'CmdOrCtrl+,'), { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        m('Undo', 'undo', 'CmdOrCtrl+Z'), m('Redo', 'redo', isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y'), { type: 'separator' },
        m('Cut', 'cut', 'CmdOrCtrl+X'), m('Copy', 'copy', 'CmdOrCtrl+C'), m('Paste', 'paste', 'CmdOrCtrl+V'),
        m('Duplicate', 'duplicate', 'CmdOrCtrl+D'), m('Select All', 'select-all', 'CmdOrCtrl+A'), { type: 'separator' },
        m('Group Selected Cues', 'group', 'CmdOrCtrl+G'), m('Ungroup', 'ungroup', 'CmdOrCtrl+Shift+G'), { type: 'separator' },
        m('Find…', 'find', 'CmdOrCtrl+F'), m('Find & Replace…', 'replace', 'CmdOrCtrl+H'), m('Renumber Selected…', 'renumber', 'CmdOrCtrl+Shift+R'), { type: 'separator' },
        m('Save Cue as Default for its Type', 'save-template'), m('Normalise Loudness of Selected Audio', 'normalize'), { type: 'separator' },
        m('Lock Show (Show Mode)', 'lock', 'CmdOrCtrl+L'),
      ],
    },
    {
      label: 'Cues',
      submenu: [
        m('New Audio Cue', 'add:audio', 'CmdOrCtrl+1'), m('New Video Cue', 'add:video', 'CmdOrCtrl+2'),
        m('New Group Cue', 'add:group', 'CmdOrCtrl+3'), m('New Fade Cue', 'add:fade', 'CmdOrCtrl+4'),
        m('New Stop / Devamp Cue', 'add:stop', 'CmdOrCtrl+5'), m('New Start Cue', 'add:start', 'CmdOrCtrl+6'),
        m('New Go To Cue', 'add:goto', 'CmdOrCtrl+7'), m('New Wait Cue', 'add:wait', 'CmdOrCtrl+8'),
        m('New Memo Cue', 'add:memo', 'CmdOrCtrl+9'), m('New MIDI Cue', 'add:midi', 'CmdOrCtrl+0'),
        m('New OSC Cue', 'add:osc', 'CmdOrCtrl+Shift+0'), { type: 'separator' },
        m('New Text / Titles Cue', 'add:text'), m('New Camera / Live Input Cue', 'add:camera'), m('New Mic / Line Input Cue', 'add:mic'), m('New Timecode Cue', 'add:timecode'),
        m('New Light (Art-Net / sACN) Cue', 'add:light'), m('New Script Cue', 'add:script'),
        m('New App Control Cue (Spotify / Apple Music)', 'add:app'), m('New MA Lighting Cue (OSC / Telnet / MSC)', 'add:ma'), { type: 'separator' },
        m('New Cue List', 'list-new'),
      ],
    },
    {
      label: 'Playback',
      submenu: [
        m('GO  (Space)', 'go'), m('Stop All / Panic  (Esc)', 'panic'),
        m('Pause All', 'pause-all', 'CmdOrCtrl+P'), m('Resume All', 'resume-all', 'CmdOrCtrl+R'), { type: 'separator' },
        m('Toggle Video Outputs', 'video-toggle', 'CmdOrCtrl+Shift+V'), m('Show / Hide Cart Wall', 'cart-toggle', 'CmdOrCtrl+K'),
        m('Stage Manager View', 'sm-open', 'CmdOrCtrl+Shift+M'), { type: 'separator' },
        m('Start / Stop Show Timer', 'timer-toggle', 'CmdOrCtrl+T'), m('Reset Show Timer', 'timer-reset'), { type: 'separator' },
        m('Rehearsal Mode (mute outputs)', 'rehearsal', 'CmdOrCtrl+Shift+H'), m('Record Input…', 'record'), m('Show Statistics…', 'stats'),
        m('Script View', 'script-toggle', 'CmdOrCtrl+J'), { type: 'separator' },
        m('Take Manual Crossfade', 'xfade-take', 'CmdOrCtrl+Shift+X'), m('Black Out Video Outputs', 'blackout', 'CmdOrCtrl+B'),
        m('Screenshot Video Outputs', 'screenshot', 'CmdOrCtrl+Alt+S'),
      ],
    },
    {
      label: 'View',
      submenu: [
        m('Preview Monitor', 'panel:preview', 'CmdOrCtrl+Alt+1'), m('Program Monitor (output)', 'panel:program', 'CmdOrCtrl+Alt+2'), m('Now Playing', 'panel:active', 'CmdOrCtrl+Alt+3'),
        m('Hide / Show Right Panel', 'panel:all', 'CmdOrCtrl+Alt+0'), { type: 'separator' },
        m('Waveforms in Cue List', 'wave:list'), m('Waveforms in Now Playing', 'wave:active'), { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools' }],
    },
    { label: 'Help', submenu: [m('Keyboard Shortcuts', 'shortcuts', 'CmdOrCtrl+/')] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------- lifecycle
const fileArg = process.argv.find((a) => a.toLowerCase().endsWith(`.${SHOW_EXT}`));
if (fileArg) pendingOpenPath = fileArg;

app.on('open-file', (e, p) => {
  e.preventDefault();
  if (mainWin) send('menu', 'open-path', p); else pendingOpenPath = p;
});

app.whenReady().then(() => {
  protocol.handle('qp', (request) => handleRequest(request, SRC));
  const allowed = new Set(['midi', 'midiSysex', 'media', 'speaker-selection', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.has(perm)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => allowed.has(perm));
  buildMenu();
  createMainWindow();
  screen.on('display-added', () => send('displays:changed'));
  screen.on('display-removed', () => send('displays:changed'));
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { remote.stop(); dmx.close(); telnet.closeAll(); });
