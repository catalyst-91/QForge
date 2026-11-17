'use strict';
// Shared main process for the QForge companion apps (Stage Manager, Output).
// Each app's main.js calls this with its kind and name.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow, ipcMain, screen, Menu, powerSaveBlocker, shell } = require('electron');
const { Updater } = require('./updater.js');

module.exports = function startClient({ kind, title }) {
  // display nodes live on the local network: use real IPs in WebRTC and allow autoplay
  app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.setName(title);

  const stateFile = () => path.join(app.getPath('userData'), 'windows.json');
  const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return { windows: [1] }; } };
  const saveState = (st) => { try { fs.writeFileSync(stateFile(), JSON.stringify(st)); } catch { /* ignore */ } };
  const wins = new Map();       // window number -> BrowserWindow
  const awake = new Map();      // window number -> powerSaveBlocker id
  let quitting = false;
  let updater = null;

  function persist() { if (!quitting) saveState({ windows: [...wins.keys()].sort((a, b) => a - b) }); }

  function createWindow(n) {
    if (!n) { n = 1; while (wins.has(n)) n++; }
    const win = new BrowserWindow({
      width: 1180, height: 760, minWidth: 640, minHeight: 420,
      backgroundColor: '#05060a', title: n > 1 ? `${title} ${n}` : title,
      icon: path.join(__dirname, '..', 'build', 'icon.png'),
      autoHideMenuBar: true,
      // not sandboxed: the preload loads the NDI® bridge (a native module); the page stays isolated
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, nodeIntegration: false, backgroundThrottling: false },
    });
    wins.set(n, win);
    win.loadFile(path.join(__dirname, 'index.html'), { query: { kind, n: String(n) } });
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'Escape') { e.preventDefault(); win.webContents.send('client:menu'); }
      if (input.key === 'F11') { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
    });
    // links clicked inside the stage manager view open in the browser, never inside the app
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    win.on('closed', () => {
      wins.delete(n);
      if (awake.has(n)) { powerSaveBlocker.stop(awake.get(n)); awake.delete(n); }
      persist();
    });
    persist();
    return win;
  }

  const fromEvent = (e) => { for (const [n, w] of wins) if (w.webContents === e.sender) return { n, win: w }; return {}; };

  // NDI® out: the window captures itself
  // capture of what this window renders (Chromium tab capture), not the screen
  ipcMain.handle('client:source-id', (e) => { const { win } = fromEvent(e); return win && !win.isDestroyed() ? win.webContents.getMediaSourceId(e.sender) : null; });
  ipcMain.handle('client:net', () => {
    const addrs = [];
    for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) addrs.push({ address: a.address, netmask: a.netmask });
    return { hostname: os.hostname(), addresses: addrs, version: app.getVersion(), platform: process.platform };
  });
  ipcMain.handle('client:displays', () => screen.getAllDisplays().map((d, i) => ({
    id: d.id, label: `${d.label || `Display ${i + 1}`} — ${d.size.width}×${d.size.height}${d.id === screen.getPrimaryDisplay().id ? ' (main)' : ''}`, primary: d.id === screen.getPrimaryDisplay().id,
  })));
  ipcMain.handle('client:place', (e, { displayId, fullscreen }) => {
    const { win } = fromEvent(e); if (!win) return false;
    const d = screen.getAllDisplays().find((x) => String(x.id) === String(displayId));
    if (d) {
      if (win.isFullScreen()) win.setFullScreen(false);
      const b = d.workArea;
      win.setBounds({ x: b.x + 40, y: b.y + 40, width: Math.min(1180, b.width - 80), height: Math.min(760, b.height - 80) });
    }
    if (fullscreen != null) setTimeout(() => { if (!win.isDestroyed()) win.setFullScreen(!!fullscreen); }, d ? 150 : 0);
    return true;
  });
  ipcMain.handle('client:fullscreen', (e, on) => { const { win } = fromEvent(e); if (!win) return false; win.setFullScreen(on == null ? !win.isFullScreen() : !!on); return win.isFullScreen(); });
  ipcMain.handle('client:login-item', (_e, on) => {
    if (on != null && process.platform !== 'linux') app.setLoginItemSettings({ openAtLogin: !!on });
    return process.platform === 'linux' ? null : app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle('client:awake', (e, on) => {
    const { n } = fromEvent(e); if (!n) return;
    if (on && !awake.has(n)) awake.set(n, powerSaveBlocker.start('prevent-display-sleep'));
    if (!on && awake.has(n)) { powerSaveBlocker.stop(awake.get(n)); awake.delete(n); }
  });
  ipcMain.handle('client:new-window', () => { createWindow(); });
  ipcMain.handle('client:title', (e, t) => { const { win } = fromEvent(e); if (win) win.setTitle(String(t || title)); });

  function buildMenu() {
    const isMac = process.platform === 'darwin';
    const send = (ch) => { const w = BrowserWindow.getFocusedWindow(); if (w) w.webContents.send(ch); };
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(isMac ? [{ label: app.name, submenu: [
        { role: 'about' }, ...updater.menuItems(), { type: 'separator' },
        { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' },
      ] }] : []),
      { label: 'File', submenu: [
        { label: kind === 'output' ? 'New Display Window' : 'New Window', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
        { label: 'Connection Settings…', accelerator: 'CmdOrCtrl+,', click: () => send('client:menu') },
        { type: 'separator' }, isMac ? { role: 'close' } : { role: 'quit' },
      ] },
      { label: 'View', submenu: [{ role: 'togglefullscreen' }, { label: 'Reconnect', accelerator: 'CmdOrCtrl+R', click: () => send('client:reconnect') }, { type: 'separator' }, { role: 'toggleDevTools' }] },
      { role: 'windowMenu' },
      ...(isMac ? [] : [{ label: 'Help', submenu: [...updater.menuItems(), { type: 'separator' }, { role: 'about' }] }]),
    ]));
  }

  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.whenReady().then(() => {
    const { session } = require('electron');
    const allowed = new Set(['fullscreen', 'media', 'speaker-selection']);
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.has(perm)));
    // lets the sound-output list show real device names
    session.defaultSession.setPermissionCheckHandler((_wc, perm) => allowed.has(perm) || perm === 'speaker-selection');
    app.setAboutPanelOptions({ applicationName: title, applicationVersion: app.getVersion(), copyright: '© Booth Productions', credits: 'NDI® is a registered trademark of Vizrt NDI AB. https://ndi.video' });
    updater = new Updater({ assetPrefix: title.replace(/ /g, '.'), displayName: title });
    updater.start();
    buildMenu();
    const st = readState();
    const list = Array.isArray(st.windows) && st.windows.length ? st.windows : [1];
    for (const n of list.slice(0, 8)) createWindow(n);
    app.on('activate', () => { if (!wins.size) createWindow(1); });
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
};
