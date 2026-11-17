'use strict';
// Updates from GitHub releases for QForge, QForge Output and QForge Stage Manager.
// Checks the latest release, downloads this computer's installer (verified against GitHub's checksum) and installs
// it when the user says so — never in the middle of a show. Works without Apple code signing: on macOS the app
// bundle is swapped in place by a small script after the app quits; on Windows the installer runs silently.
const { app, net, dialog, shell, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const REPO = 'catalyst-91/QForge';
const CHECK_EVERY = 6 * 3600e3;

const parseVer = (v) => String(v || '').replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map((n) => parseInt(n, 10) || 0);
const newer = (a, b) => { const x = parseVer(a), y = parseVer(b); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return false; };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function plainNotes(md) {
  return String(md || '').replace(/\r/g, '').replace(/^#+\s*/gm, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^\s*[-*]\s+/gm, '• ').replace(/\|.*\|\n?/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

class Updater {
  // assetPrefix: the start of this app's installer names in a release, e.g. 'QForge', 'QForge.Output'
  // isBusy(): resolves true while something is playing (QForge) — the install prompt waits until it's quiet
  constructor({ assetPrefix, displayName, isBusy, log }) {
    this.prefix = assetPrefix; this.name = displayName || app.getName();
    this.isBusy = isBusy || (async () => false);
    this.log = log || ((m) => console.log(`[update] ${m}`));
    this.dir = path.join(app.getPath('userData'), 'updates');
    this.cfgFile = path.join(this.dir, 'settings.json');
    this.state = { status: 'idle' };   // idle | checking | available | downloading | ready | error
    this.pending = null;               // { file, version, relaunch } — installed when the app quits
    this.timer = null;
  }
  get cfg() { try { return { auto: true, skip: '', ...JSON.parse(fs.readFileSync(this.cfgFile, 'utf8')) }; } catch { return { auto: true, skip: '' }; } }
  setCfg(patch) { try { fs.mkdirSync(this.dir, { recursive: true }); fs.writeFileSync(this.cfgFile, JSON.stringify({ ...this.cfg, ...patch })); } catch { /* ignore */ } }

  // ---- menu items to add to the app menu (macOS) or Help menu (Windows)
  menuItems() {
    return [
      { label: 'Check for Updates…', click: () => this.check({ manual: true }) },
      { label: 'Check for Updates Automatically', type: 'checkbox', checked: this.cfg.auto, click: (mi) => { this.setCfg({ auto: mi.checked }); if (mi.checked) this.check(); } },
    ];
  }

  start() {
    this.cleanOld();
    app.on('will-quit', () => this.installOnQuit());
    setTimeout(() => { if (this.cfg.auto) this.check(); }, 20000);
    this.timer = setInterval(() => { if (this.cfg.auto && ['idle', 'error'].includes(this.state.status)) this.check(); }, CHECK_EVERY);
  }

  pickAsset(assets) {
    const osName = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : null;
    if (!osName) return null;
    // an Intel build running on Apple silicon (Rosetta) moves to the native build
    const arch = process.platform === 'darwin' && (process.arch === 'arm64' || app.runningUnderARM64Translation) ? 'arm64' : 'x64';
    const ext = osName === 'mac' ? 'dmg' : 'exe';
    const re = new RegExp(`^${esc(this.prefix)}-(\\d+\\.\\d+\\.\\d+)-${osName}-${arch}\\.${ext}$`);
    return assets.find((a) => re.test(a.name)) || null;
  }

  async check({ manual = false } = {}) {
    if (['checking', 'downloading'].includes(this.state.status)) { if (manual) this.info('An update check is already running.'); return; }
    if (this.state.status === 'ready' && this.pending) { if (manual) this.promptInstall(); return; }
    this.state = { status: 'checking' };
    try {
      const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
      const rel = await r.json();
      const version = String(rel.tag_name || '').replace(/^v/i, '');
      const asset = this.pickAsset(rel.assets || []);
      if (!newer(version, app.getVersion()) || !asset) {
        this.state = { status: 'idle', checked: Date.now() };
        this.log(`up to date (${app.getVersion()}, latest ${version || '?'})`);
        if (manual) this.info(`${this.name} ${app.getVersion()} is the latest version.`);
        return;
      }
      this.state = { status: 'available', version, asset, notes: plainNotes(rel.body), url: rel.html_url };
      this.log(`version ${version} is available`);
      if (!manual && this.cfg.skip === version) return;
      if (manual) {
        const { response } = await this.ask(`${this.name} ${version} is available`, `You have ${app.getVersion()}.\n\n${this.trimNotes(this.state.notes)}`, ['Download and install', 'Later', 'Skip this version']);
        if (response === 1) return;
        if (response === 2) { this.setCfg({ skip: version }); return; }
      }
      await this.download(manual);
    } catch (e) {
      this.state = { status: 'error', error: e.message };
      this.log(`check failed: ${e.message}`);
      if (manual) this.info(`Couldn’t check for updates: ${e.message}`, 'warning');
    }
  }

  async download(manual) {
    const { asset, version } = this.state;
    fs.mkdirSync(this.dir, { recursive: true });
    const file = path.join(this.dir, asset.name);
    // already downloaded earlier?
    if (fs.existsSync(file) && fs.statSync(file).size === asset.size && (await this.verify(file, asset))) return this.ready(file, version, manual);
    this.state = { ...this.state, status: 'downloading', got: 0 };
    const part = `${file}.part`;
    try {
      const r = await net.fetch(asset.browser_download_url);
      if (!r.ok || !r.body) throw new Error(`download failed (${r.status})`);
      const out = fs.createWriteStream(part);
      const reader = r.body.getReader();
      let got = 0; let lastUi = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!out.write(Buffer.from(value))) await new Promise((res) => out.once('drain', res));
        got += value.length;
        if (Date.now() - lastUi > 400) { lastUi = Date.now(); this.progress(asset.size ? got / asset.size : 2); }
      }
      await new Promise((res, rej) => out.end((err) => (err ? rej(err) : res())));
      this.progress(-1);
      if (asset.size && fs.statSync(part).size !== asset.size) throw new Error('the download was incomplete');
      if (!(await this.verify(part, asset))) throw new Error('the download didn’t match GitHub’s checksum');
      fs.renameSync(part, file);
      this.ready(file, version, manual);
    } catch (e) {
      this.progress(-1);
      try { fs.rmSync(part, { force: true }); } catch { /* ignore */ }
      this.state = { status: 'error', error: e.message };
      this.log(`download failed: ${e.message}`);
      if (manual) this.info(`The update couldn’t be downloaded: ${e.message}`, 'warning');
    }
  }

  async verify(file, asset) {
    const m = String(asset.digest || '').match(/^sha256:([0-9a-f]{64})$/i);
    if (!m) return true;   // older releases have no checksum
    const h = crypto.createHash('sha256');
    await new Promise((res, rej) => fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', res).on('error', rej));
    return h.digest('hex').toLowerCase() === m[1].toLowerCase();
  }

  ready(file, version, manual) {
    this.state = { ...this.state, status: 'ready', file, version };
    this.pending = { file, version, relaunch: false, armed: false };
    this.log(`version ${version} downloaded`);
    this.whenQuiet(() => this.promptInstall(), manual);
  }

  // wait until nothing is playing before asking (re-checks every 30 s)
  async whenQuiet(fn, now) {
    if (now || !(await this.isBusy().catch(() => false))) return fn();
    setTimeout(() => this.whenQuiet(fn, false), 30000);
  }

  async promptInstall() {
    if (!this.pending) return;
    const v = this.pending.version;
    const { response } = await this.ask(`${this.name} ${v} is ready to install`,
      `${this.trimNotes(this.state.notes)}\n\nInstalling takes a few seconds, then ${this.name} opens again.`,
      ['Restart and install', 'Install when I quit', 'Skip this version']);
    if (response === 0) { this.pending.relaunch = true; this.pending.armed = true; app.quit(); }
    else if (response === 1) { this.pending.armed = true; }
    else { this.setCfg({ skip: v }); this.pending = null; this.state = { status: 'idle' }; }
  }

  // runs as the app quits (after any “save changes?” question has been answered)
  installOnQuit() {
    const p = this.pending;
    if (!p || !p.armed || !fs.existsSync(p.file)) return;
    this.pending = null;
    try {
      if (process.platform === 'win32') this.installWindows(p);
      else if (process.platform === 'darwin') this.installMac(p);
    } catch (e) { this.log(`install failed: ${e.message}`); }
  }

  installWindows(p) {
    const dir = path.dirname(process.execPath);
    const args = ['/S', '--updated', ...(p.relaunch ? ['--force-run'] : []), `/D=${dir}`];   // /D must be last, unquoted
    spawn(p.file, args, { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
    this.log(`running installer ${path.basename(p.file)} ${args.join(' ')}`);
  }

  appBundle() { return path.resolve(process.execPath, '..', '..', '..'); }   // …/QForge.app

  canReplaceBundle() {
    const b = this.appBundle();
    if (!b.endsWith('.app') || b.includes('/AppTranslocation/') || b.startsWith('/Volumes/')) return false;
    try { fs.accessSync(path.dirname(b), fs.constants.W_OK); fs.accessSync(b, fs.constants.W_OK); return true; } catch { return false; }
  }

  installMac(p) {
    const bundle = this.appBundle();
    if (!this.canReplaceBundle()) {
      // can't swap it ourselves (e.g. run from Downloads/the disk image, or no permission): open the installer
      shell.openPath(p.file);
      return;
    }
    const script = path.join(os.tmpdir(), `qforge-update-${process.pid}.sh`);
    const logf = path.join(this.dir, 'install.log');
    fs.writeFileSync(script, `#!/bin/bash
# QForge updater: waits for the app to quit, then replaces it with the new version from the disk image
PID="$1"; DMG="$2"; TARGET="$3"; REOPEN="$4"
exec >>"${logf}" 2>&1
echo "---- $(date) update $TARGET from $DMG"
for i in $(seq 1 300); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
MNT="$(mktemp -d /tmp/qforge-update.XXXXXX)"
if ! hdiutil attach -nobrowse -noautoopen -noverify -mountpoint "$MNT" "$DMG"; then echo "attach failed"; open "$DMG"; exit 1; fi
SRC="$(find "$MNT" -maxdepth 1 -name '*.app' -print -quit)"
OK=0
if [ -n "$SRC" ] && ditto "$SRC" "$TARGET.updating"; then
  rm -rf "$TARGET.previous" && mv "$TARGET" "$TARGET.previous" && mv "$TARGET.updating" "$TARGET" && OK=1
  if [ "$OK" = 1 ]; then rm -rf "$TARGET.previous"; else mv "$TARGET.previous" "$TARGET" 2>/dev/null; fi
  xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null
fi
rm -rf "$TARGET.updating"
hdiutil detach "$MNT" -quiet || hdiutil detach "$MNT" -force -quiet
rmdir "$MNT" 2>/dev/null
if [ "$OK" = 1 ]; then echo "updated"; [ "$REOPEN" = 1 ] && open "$TARGET"; else echo "update failed — opening the disk image"; open "$DMG"; fi
rm -f "$0"
`, { mode: 0o755 });
    spawn('/bin/bash', [script, String(process.pid), p.file, bundle, p.relaunch ? '1' : '0'], { detached: true, stdio: 'ignore' }).unref();
    this.log(`update script started for ${bundle}`);
  }

  cleanOld() {
    try {
      for (const f of fs.readdirSync(this.dir)) {
        const m = f.match(/-(\d+\.\d+\.\d+)-/);
        if ((m && !newer(m[1], app.getVersion())) || f.endsWith('.part')) fs.rmSync(path.join(this.dir, f), { force: true });
      }
    } catch { /* no folder yet */ }
  }

  // ---- UI helpers
  win() { return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows().find((w) => w.isVisible() && w.getOpacity() > 0) || null; }
  progress(v) { for (const w of BrowserWindow.getAllWindows()) { try { if (w.isVisible() && w.getOpacity() > 0) w.setProgressBar(v); } catch { /* ignore */ } } }
  trimNotes(n) { const t = String(n || '').trim(); return t.length > 700 ? `${t.slice(0, 700).replace(/\s+\S*$/, '')}…` : t || 'Bug fixes and improvements.'; }
  ask(message, detail, buttons) { const w = this.win(); const o = { type: 'info', message, detail, buttons, defaultId: 0, cancelId: 1, noLink: true }; return w ? dialog.showMessageBox(w, o) : dialog.showMessageBox(o); }
  info(message, type = 'info') { const w = this.win(); const o = { type, message, buttons: ['OK'] }; return w ? dialog.showMessageBox(w, o) : dialog.showMessageBox(o); }
}

module.exports = { Updater, newer, plainNotes };
