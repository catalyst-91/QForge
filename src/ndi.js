'use strict';
// NDI® in the page: send QForge outputs as NDI sources, and turn received NDI frames into a
// MediaStream / sound. The native work happens in the preload (window.qplay.ndi / window.client.ndi).
// NDI® is a registered trademark of Vizrt NDI AB — https://ndi.video
window.QP = window.QP || {};

QP.NDI_Q = { '720p30': [1280, 720, 30], '1080p25': [1920, 1080, 25], '1080p30': [1920, 1080, 30], '1080p50': [1920, 1080, 50], '1080p60': [1920, 1080, 60], '2160p30': [3840, 2160, 30] };
QP.ndiVersion = (v) => { const m = String(v || '').match(/(\d+\.\d+\.\d+)/); return m ? `NDI® ${m[1]}` : String(v || 'NDI®'); };
QP.ndiRate = (fps) => [Math.round(fps * 1000), fps === 25 || fps === 50 ? 1000 : 1001];

// ---------------------------------------------------------------- receive: picture
// Draws RGBA frames into a canvas; .stream is a live MediaStream of it (for <video>, keyers, recording).
QP.NdiPicture = class NdiPicture {
  constructor(doc = document, fps = 60) {
    this.canvas = doc.createElement('canvas');
    this.canvas.width = 16; this.canvas.height = 9;
    this.g = this.canvas.getContext('2d', { alpha: true, desynchronized: true });
    this.stream = this.canvas.captureStream(fps);
    this.frames = 0; this.w = 0; this.h = 0; this.last = 0;
  }
  draw(buf, w, h) {
    if (!w || !h) return;
    if (w !== this.canvas.width || h !== this.canvas.height) { this.canvas.width = w; this.canvas.height = h; }
    this.g.putImageData(new ImageData(new Uint8ClampedArray(buf, 0, w * h * 4), w, h), 0, 0);
    this.frames++; this.w = w; this.h = h; this.last = performance.now();
  }
  stop() { for (const t of this.stream.getTracks()) t.stop(); }
};

// ---------------------------------------------------------------- receive: sound
// Plays interleaved float packets into an AudioNode with a small jitter buffer.
QP.NdiAudioPlayer = class NdiAudioPlayer {
  constructor(ctx, destination, { latency = 0.08 } = {}) {
    this.ctx = ctx; this.latency = latency;
    this.gain = ctx.createGain(); this.gain.connect(destination || ctx.destination);
    this.next = 0;
  }
  set volume(v) { this.gain.gain.value = v; }
  push(f32, channels, rate) {
    const ch = Math.max(1, channels | 0); const n = Math.floor(f32.length / ch);
    if (!n) return;
    const buf = this.ctx.createBuffer(ch, n, rate || 48000);
    for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] = f32[i * ch + c]; }
    const now = this.ctx.currentTime;
    // (re)start the queue when it ran dry or drifted too far ahead
    if (this.next < now + 0.005 || this.next > now + this.latency * 4) this.next = now + this.latency;
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.connect(this.gain);
    src.start(this.next); this.next += buf.duration;
  }
  stop() { try { this.gain.disconnect(); } catch { /* ignore */ } }
};

// ---------------------------------------------------------------- send
// One NDI sender per output; each pulls frames from a capture of that output (and optionally the main mix).
QP.NdiOut = class NdiOut {
  // ndi: preload API; getVideo(surfaceId) -> MediaStream; getAudio() -> MediaStreamTrack|null
  constructor({ ndi, getVideo, getAudio, log, onChange, quality }) {
    this.ndi = ndi; this.getVideo = getVideo; this.getAudio = getAudio;
    this.log = log || (() => {}); this.onChange = onChange || (() => {});
    this.quality = quality || (() => QP.NDI_Q['1080p30']);
    this.outs = new Map();   // surfaceId -> { id, name, track, atrack, stop, frames, error, connections }
    this.poll = setInterval(() => this.refresh(), 2000);
  }
  get active() { return this.outs.size; }
  wantsAudio() { return [...this.outs.values()].some((o) => o.atrack); }
  list() { return [...this.outs.entries()].map(([surface, o]) => ({ surface, name: o.name, connections: o.connections || 0, frames: o.frames, error: o.error || '' })); }
  refresh() {
    let changed = false;
    for (const o of this.outs.values()) {
      const n = this.ndi.connections(o.id);
      if (n !== o.connections) { o.connections = n; changed = true; }
    }
    if (changed) this.onChange();
  }
  async start(surface, name, withSound) {
    if (this.outs.has(surface)) await this.stop(surface);
    const o = { name, surface, withSound, frames: 0, connections: 0, stopped: false };
    this.outs.set(surface, o);
    try {
      o.id = this.ndi.createSender(name);
      const vs = await this.getVideo(surface);
      if (o.stopped) { vs.getTracks().forEach((t) => t.stop()); return; }
      o.track = vs.getVideoTracks()[0];
      if (!o.track) throw new Error('no picture from that output');
      this.pumpVideo(o);
      if (withSound) { const a = this.getAudio(); if (a) { o.atrack = a; this.pumpAudio(o); } }
      this.log(`NDI output “${name}” is on air`);
    } catch (e) {
      o.error = e.message; this.log(`NDI output “${name}” failed: ${e.message}`);
    }
    this.onChange();
  }
  async pumpVideo(o) {
    const reader = new MediaStreamTrackProcessor({ track: o.track }).readable.getReader();
    o.vreader = reader;
    const [, , fps] = this.quality();
    const [fn, fd] = QP.ndiRate(fps);
    let buf = null; let lastSent = 0; let lastArgs = null;
    // window captures only deliver frames when the picture changes: repeat the last one so new receivers see it
    o.repeat = setInterval(() => { if (lastArgs && performance.now() - lastSent > 900) { this.ndi.sendVideo(o.id, ...lastArgs); lastSent = performance.now(); } }, 500);
    while (!o.stopped) {
      let r;
      try { r = await reader.read(); } catch { break; }
      if (r.done) break;
      const f = r.value;
      try {
        const vr = f.visibleRect || { x: 0, y: 0, width: f.displayWidth, height: f.displayHeight };
        const w = vr.width & ~1, h = vr.height & ~1;
        const rect = { x: vr.x, y: vr.y, width: w, height: h };
        let fmt = f.format; let layout; let size; let stride;
        if (fmt === 'NV12') { layout = [{ offset: 0, stride: w }, { offset: w * h, stride: w }]; size = w * h * 1.5; stride = w; }
        else if (fmt === 'I420') { layout = [{ offset: 0, stride: w }, { offset: w * h, stride: w / 2 }, { offset: w * h * 1.25, stride: w / 2 }]; size = w * h * 1.5; stride = w; }
        else if (['BGRA', 'BGRX', 'RGBA', 'RGBX'].includes(fmt)) { layout = [{ offset: 0, stride: w * 4 }]; size = w * h * 4; stride = w * 4; }
        else { fmt = 'RGBA'; layout = [{ offset: 0, stride: w * 4 }]; size = w * h * 4; stride = w * 4; }
        if (!buf || buf.byteLength !== size) buf = new Uint8Array(size);
        const opts = { rect, layout };
        if (fmt !== f.format) opts.format = 'RGBA';
        await f.copyTo(buf, opts);
        lastArgs = [buf, w, h, stride, fmt, fn, fd];
        this.ndi.sendVideo(o.id, ...lastArgs);
        lastSent = performance.now(); o.frames++;
      } catch (e) {
        if (!o.error) { o.error = e.message; this.onChange(); }
      } finally { f.close(); }
    }
    clearInterval(o.repeat);
    // the capture ended on its own (output window closed or moved): try again shortly
    if (!o.stopped && this.outs.get(o.surface) === o) {
      o.error = 'output window closed — retrying'; this.onChange();
      setTimeout(() => { if (!o.stopped && this.outs.get(o.surface) === o) this.start(o.surface, o.name, o.withSound); }, 3000);
    }
  }
  async pumpAudio(o) {
    const reader = new MediaStreamTrackProcessor({ track: o.atrack }).readable.getReader();
    o.areader = reader;
    while (!o.stopped) {
      let r;
      try { r = await reader.read(); } catch { break; }
      if (r.done) break;
      const a = r.value;
      try {
        const ch = a.numberOfChannels, n = a.numberOfFrames;
        const out = new Float32Array(ch * n);
        for (let i = 0; i < ch; i++) a.copyTo(out.subarray(i * n, (i + 1) * n), { planeIndex: i, format: 'f32-planar' });
        this.ndi.sendAudio(o.id, out, ch, n, a.sampleRate);
      } catch { /* skip this packet */ } finally { a.close(); }
    }
  }
  async stop(surface) {
    const o = this.outs.get(surface); if (!o) return;
    o.stopped = true; this.outs.delete(surface);
    clearInterval(o.repeat);
    for (const rd of [o.vreader, o.areader]) { try { await rd.cancel(); } catch { /* ignore */ } }
    for (const t of [o.track, o.atrack]) { try { t && t.stop(); } catch { /* ignore */ } }
    if (o.id != null) { try { this.ndi.destroySender(o.id); } catch { /* ignore */ } }
    this.log(`NDI output “${o.name}” stopped`);
    this.onChange();
  }
  async stopAll() { for (const s of [...this.outs.keys()]) await this.stop(s); }
};
