'use strict';
// Platform bridge: Electron preload API when available, otherwise a browser fallback
// (useful for quick testing in Chrome — OSC and file paths need the desktop app).
window.QP = window.QP || {};

QP.platform = window.qplay || (() => {
  const names = new Map(); // blob url -> original file name
  const pickFiles = (accept, multiple) => new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.multiple = multiple;
    inp.onchange = () => resolve([...inp.files]);
    inp.click();
  });
  const register = (file) => { const url = URL.createObjectURL(file); names.set(url, file.name); return url; };
  return {
    isElectron: false,
    platform: 'browser',
    async openShow() {
      const [f] = await pickFiles('.qforge,.json', false);
      if (!f) return null;
      try { return { path: f.name, data: JSON.parse(await f.text()) }; } catch (e) { return { error: e.message }; }
    },
    async readShow() { return { error: 'Not available in browser mode' }; },
    async saveShow(path, data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      const name = String(path || data.name || 'Untitled').replace(/.*[\\/]/, '').replace(/\.qforge$/i, '') + '.qforge';
      a.href = URL.createObjectURL(blob); a.download = name; a.click();
      return { ok: true, path: name };
    },
    async exportPackage() { return { ok: false, error: 'Show packages need the desktop app' }; },
    async exportText(name, text, ext) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name.endsWith('.' + ext) ? name : `${name}.${ext}`; a.click();
      return { ok: true, path: a.download };
    },
    async launchFile() { return null; },
    async chooseMedia(kind) {
      const accept = kind === 'audio' ? 'audio/*' : kind === 'video' ? 'video/*,image/*' : '';
      return (await pickFiles(accept, true)).map(register);
    },
    async filesExist(paths) { return paths.map(() => true); },
    async reveal() {},
    pathForFile: register,
    mediaUrl: (p) => p,
    nameOf: (p) => names.get(p) || String(p || '').split(/[\\/]/).pop(),
    async listDisplays() { return [{ id: 0, label: 'Browser pop-up window' }]; },
    async placeVideo() { return true; },
    async oscListen() { return { ok: false, error: 'OSC needs the desktop app' }; },
    async oscSend() { return { ok: false, error: 'OSC needs the desktop app' }; },
    onOsc() {}, onMenu() {}, onVideoClosed() {}, onDisplaysChanged() {},
    async saveRecovery(data, path) { try { localStorage.setItem('qforge.recovery', JSON.stringify({ savedAt: Date.now(), path, data })); } catch { /* full */ } return true; },
    async getRecovery() { try { return JSON.parse(localStorage.getItem('qforge.recovery') || 'null'); } catch { return null; } },
    async clearRecovery() { localStorage.removeItem('qforge.recovery'); return true; },
    async relink() { return null; },
    async lookup(host) { return host ? { ok: true } : { ok: false, error: 'no host' }; },
    logAppend() {},
    async openLogFolder() {},
    dmxSend() {},
    async scriptStatus() { return false; },
    async scriptAllow() { return false; },
    async scriptRun() { return { ok: false, error: 'Script cues need the desktop app' }; },
    async printPdf(html) { const w = window.open('', '_blank'); if (!w) return { ok: false, error: 'Pop-up blocked' }; w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); return { ok: true, path: 'print dialog' }; },
    async cameraAccess() { return true; },
    async remoteStart() { return { ok: false, running: false, error: 'The web remote needs the desktop app' }; },
    remotePublish() {},
    onRemoteCmd() {},
    async openStageManager() { return { ok: false, error: 'Stage manager view needs the desktop app' }; },
    async historyList() { return []; },
    async historyRead() { return { error: 'Version history needs the desktop app' }; },
    async saveRecording(name, bytes) { const f = new File([bytes], name, { type: 'audio/webm' }); return { ok: true, path: register(f) }; },
    collabPublish() {}, async collabPresence() { return []; }, onCollabIncoming() {},
    async collabFetch({ url, method, body, pin }) {
      try {
        const r = await fetch(url, { method: method || 'GET', headers: { 'Content-Type': 'application/json', 'X-QForge-Pin': pin || '' }, body: body ? JSON.stringify(body) : undefined });
        return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) };
      } catch (e) { return { ok: false, status: 0, data: { error: e.message } }; }
    },
    _collabCb: null, _collabEs: null,
    async collabListen({ url, pin }) {
      if (this._collabEs) { this._collabEs.close(); this._collabEs = null; }
      if (!url) return { ok: true };
      const es = new EventSource(`${url}${url.includes('?') ? '&' : '?'}pin=${encodeURIComponent(pin || '')}`);
      const cb = (ev) => this._collabCb && this._collabCb(ev);
      es.onopen = () => cb({ type: 'open' });
      es.addEventListener('show', (e) => cb({ type: 'show', data: JSON.parse(e.data) }));
      es.addEventListener('presence', (e) => cb({ type: 'presence', data: JSON.parse(e.data) }));
      es.onerror = () => cb({ type: 'error', error: 'connection lost — retrying' });
      this._collabEs = es;
      return { ok: true };
    },
    onCollabEvent(cb) { this._collabCb = cb; },
    rtcToClient() {}, rtcSetInfo() {}, onRtcSignal() {}, async outputSourceId() { return null; },
    async appControl() { return { ok: false, error: 'App control needs the desktop app' }; },
    async telnetSend() { return { ok: false, error: 'Telnet needs the desktop app' }; },
    async screenshot() { return { ok: false, error: 'browser' }; },
    async screenshotDir() { return 'Downloads'; },
    async openShotFolder() {},
    async chooseFolder() { return null; },
    setDirty() {},
    setTitle(t) { document.title = t; },
    closeNow() { window.close(); },
  };
})();
