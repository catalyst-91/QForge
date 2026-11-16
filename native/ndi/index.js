'use strict';
// NDI® for QForge apps. Runs in a preload script (Node side), loads the native bridge and the NDI
// runtime only when first used, and hands out plain numeric ids so it can cross contextBridge.
// NDI® is a registered trademark of Vizrt NDI AB — https://ndi.video
const fs = require('fs');
const path = require('path');

// folders that may hold qforge_ndi.node and a bundled runtime: installed app, then a source checkout
function bundleDirs(resourcesPath, appRoot) {
  return [
    resourcesPath && path.join(resourcesPath, 'ndi'),
    appRoot && path.join(appRoot, 'native', 'ndi', 'dist'),
    appRoot && path.join(appRoot, 'native', 'ndi', 'build', 'Release'),
    path.join(__dirname, 'dist'),
    path.join(__dirname, 'build', 'Release'),
  ].filter(Boolean);
}

function libraryCandidates(dirs) {
  const out = [];
  const add = (p) => { if (p && !out.includes(p)) out.push(p); };
  const name = process.platform === 'darwin' ? 'libndi.dylib' : process.platform === 'win32' ? 'Processing.NDI.Lib.x64.dll' : 'libndi.so.6';
  // Windows: an installed NDI Runtime first (kept up to date by NDI); elsewhere the copy bundled with the app first
  if (process.platform === 'win32' && process.env.NDI_RUNTIME_DIR_V6) add(path.join(process.env.NDI_RUNTIME_DIR_V6, name));
  for (const d of dirs) add(path.join(d, name));
  if (process.env.NDI_RUNTIME_DIR_V6) add(path.join(process.env.NDI_RUNTIME_DIR_V6, name));
  if (process.platform === 'darwin') {
    add('/Library/NDI SDK for Apple/lib/macOS/libndi.dylib');
    add('/usr/local/lib/libndi.dylib');
  } else if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    add(path.join(pf, 'NDI', 'NDI 6 Runtime', 'v6', name));
    add(path.join(pf, 'NDI', 'NDI 6 Tools', 'Runtime', name));
    add(path.join(pf, 'NDI', 'NDI 6 SDK', 'Bin', 'x64', name));
  } else {
    add('/usr/lib/libndi.so.6'); add('/usr/local/lib/libndi.so.6'); add('/usr/lib/x86_64-linux-gnu/libndi.so.6');
  }
  return out;
}

module.exports = function createNdi({ resourcesPath, appRoot } = {}) {
  let native = null; let state = null;
  const senders = new Map(); const receivers = new Map(); let nextId = 1;

  function init() {
    if (state) return state;
    const dirs = bundleDirs(resourcesPath, appRoot);
    const addon = dirs.map((d) => path.join(d, 'qforge_ndi.node')).find((p) => { try { return fs.existsSync(p); } catch { return false; } });
    if (!addon) return (state = { ok: false, error: 'NDI support isn’t included in this build' });
    try { native = require(addon); } catch (e) { return (state = { ok: false, error: `NDI bridge failed to load: ${e.message}` }); }
    const libs = libraryCandidates(dirs).filter((p) => { try { return fs.existsSync(p); } catch { return false; } });
    if (!libs.length) {
      return (state = { ok: false, error: process.platform === 'win32' ? 'NDI Runtime not installed — install NDI Tools or the NDI 6 Runtime from ndi.video' : 'NDI runtime not found — install NDI Tools from ndi.video' });
    }
    let last = 'NDI runtime could not be loaded';
    for (const lib of libs) {
      const r = native.load(lib);
      if (r && r.ok) return (state = { ok: true, version: r.version, library: lib });
      last = (r && r.error) || last;
    }
    return (state = { ok: false, error: last });
  }
  const ready = () => init().ok;

  return {
    status: () => ({ ...init() }),
    find: (waitMs = 0, extraIps = '') => (ready() ? native.findSources(Math.max(0, Math.min(5000, Number(waitMs) || 0)), String(extraIps || '')) : []),

    // ---- sending
    createSender(name) {
      if (!ready()) throw new Error(state.error);
      const id = nextId++;
      senders.set(id, native.senderCreate(String(name || 'QForge').slice(0, 120)));
      return id;
    },
    sendVideo(id, data, w, h, stride, fourcc, fpsN, fpsD) {
      const s = senders.get(id); if (!s) return false;
      const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
      native.senderVideo(s, u8, w, h, stride, String(fourcc || 'BGRA'), fpsN || 30000, fpsD || 1001);
      return true;
    },
    sendAudio(id, planar, channels, samples, rate) {
      const s = senders.get(id); if (!s) return false;
      const f32 = planar instanceof Float32Array ? planar : new Float32Array(planar);
      native.senderAudio(s, f32, channels, samples, rate || 48000);
      return true;
    },
    connections: (id) => { const s = senders.get(id); return s ? native.senderConnections(s) : 0; },
    destroySender(id) { const s = senders.get(id); if (s) { senders.delete(id); native.senderDestroy(s); } },

    // ---- receiving: onVideo(ArrayBuffer RGBA, w, h)  onAudio(Float32Array interleaved, channels, rate)
    receive(source, opts, onVideo, onAudio) {
      if (!ready()) throw new Error(state.error);
      const o = opts || {};
      const id = nextId++;
      const r = native.receiverCreate(String(source && source.name || source), { url: String(source && source.url || o.url || ''), lowBandwidth: !!o.lowBandwidth, audio: !!(o.audio && onAudio) },
        (buf, w, h) => { try { onVideo(buf, w, h); } catch { /* page went away */ } },
        (f32, ch, rate) => { try { onAudio && onAudio(f32, ch, rate); } catch { /* ignore */ } });
      receivers.set(id, r);
      return id;
    },
    receiving: (id) => { const r = receivers.get(id); return r ? native.receiverConnected(r) : false; },
    stopReceive(id) { const r = receivers.get(id); if (r) { receivers.delete(id); native.receiverDestroy(r); } },

    closeAll() {
      for (const id of [...senders.keys()]) this.destroySender(id);
      for (const id of [...receivers.keys()]) this.stopReceive(id);
    },
  };
};
