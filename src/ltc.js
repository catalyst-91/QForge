'use strict';
// Timecode: SMPTE LTC audio generator, MIDI Timecode generator and MTC reader.
window.QP = window.QP || {};

QP.TC = (() => {
  const FPS = {
    '24': { base: 24, exact: 24, df: false, mtc: 0 },
    '25': { base: 25, exact: 25, df: false, mtc: 1 },
    '29.97df': { base: 30, exact: 30000 / 1001, df: true, mtc: 2 },
    '30': { base: 30, exact: 30, df: false, mtc: 3 },
  };
  const info = (fps) => FPS[String(fps)] || FPS['25'];

  function framesToTC(n, fps) {
    const I = info(fps);
    n = Math.max(0, Math.floor(n));
    if (I.df) {
      const D = Math.floor(n / 17982), M = n % 17982;
      n += 18 * D + (M > 2 ? 2 * Math.floor((M - 2) / 1798) : 0);
    }
    const b = I.base;
    return { h: Math.floor(n / (b * 3600)) % 24, m: Math.floor(n / (b * 60)) % 60, s: Math.floor(n / b) % 60, f: n % b };
  }
  function tcToFrames(tc, fps) {
    const I = info(fps), b = I.base;
    let n = ((tc.h * 60 + tc.m) * 60 + tc.s) * b + tc.f;
    if (I.df) { const tm = tc.h * 60 + tc.m; n -= 2 * (tm - Math.floor(tm / 10)); }
    return n;
  }
  function parse(str, fps) {
    const p = String(str || '').trim().split(/[:;.]/).map((x) => parseInt(x, 10) || 0);
    while (p.length < 4) p.unshift(0);
    const [h, m, s, f] = p.slice(-4);
    return tcToFrames({ h, m, s, f: Math.min(f, info(fps).base - 1) }, fps);
  }
  function format(n, fps) {
    const t = framesToTC(n, fps);
    const pad = (v) => String(v).padStart(2, '0');
    return `${pad(t.h)}:${pad(t.m)}:${pad(t.s)}${info(fps).df ? ';' : ':'}${pad(t.f)}`;
  }

  // ---------------------------------------------------------------- LTC bits
  function ltcBits(tc, fps) {
    const I = info(fps);
    const bits = new Uint8Array(80);
    const put = (start, len, val) => { for (let i = 0; i < len; i++) bits[start + i] = (val >> i) & 1; };
    put(0, 4, tc.f % 10); put(8, 2, Math.floor(tc.f / 10));
    bits[10] = I.df ? 1 : 0;
    put(16, 4, tc.s % 10); put(24, 3, Math.floor(tc.s / 10));
    put(32, 4, tc.m % 10); put(40, 3, Math.floor(tc.m / 10));
    put(48, 4, tc.h % 10); put(56, 2, Math.floor(tc.h / 10));
    const sync = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1];
    for (let i = 0; i < 16; i++) bits[64 + i] = sync[i];
    const polBit = I.base === 25 ? 59 : 27;
    let zeros = 0;
    for (let i = 0; i < 80; i++) if (!bits[i]) zeros++;
    if (zeros % 2) bits[polBit] = 1;
    return bits;
  }

  // ---------------------------------------------------------------- LTC generator (Web Audio)
  class LTCGen {
    constructor(ctx, dest, { fps, startFrame, levelDb }) {
      this.ctx = ctx; this.fps = String(fps); this.I = info(fps);
      this.startFrame = startFrame; this.sr = ctx.sampleRate;
      this.spb = this.sr / (this.I.exact * 80);   // samples per bit
      this.gain = ctx.createGain();
      this.gain.gain.value = QP.dbToGain(levelDb ?? -10);
      this.gain.connect(dest);
      this.sources = [];
      this.sample = 0; this.level = 1; this.lastBit = -1; this.lastHalf = 0; this.y = 0;
      this.frameBitsIdx = -1; this.frameBits = null;
    }
    start() { this.t0 = this.ctx.currentTime + 0.06; this.next = this.t0; this.tick(); }
    currentFrame() { return this.startFrame + Math.max(0, Math.floor((this.ctx.currentTime - this.t0) * this.I.exact)); }
    chunk(seconds) {
      const n = Math.round(seconds * this.sr);
      const buf = this.ctx.createBuffer(1, n, this.sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++, this.sample++) {
        const t = this.sample / this.spb;
        const bit = Math.floor(t);
        const half = t - bit >= 0.5 ? 1 : 0;
        const fi = Math.floor(bit / 80);
        if (fi !== this.frameBitsIdx) { this.frameBitsIdx = fi; this.frameBits = ltcBits(framesToTC(this.startFrame + fi, this.fps), this.fps); }
        if (bit !== this.lastBit) { this.level = -this.level; this.lastBit = bit; this.lastHalf = 0; }
        if (half && !this.lastHalf) { this.lastHalf = 1; if (this.frameBits[bit % 80]) this.level = -this.level; }
        this.y += (this.level - this.y) * 0.55;   // gentle rise time
        d[i] = this.y * 0.9;
      }
      return buf;
    }
    tick() {
      if (this.stopped) return;
      while (this.next < this.ctx.currentTime + 0.4) {
        const buf = this.chunk(0.25);
        const src = this.ctx.createBufferSource();
        src.buffer = buf; src.connect(this.gain); src.start(this.next);
        this.next += buf.duration;
        this.sources.push(src);
        src.onended = () => { this.sources = this.sources.filter((s) => s !== src); };
      }
    }
    stop() {
      this.stopped = true;
      for (const s of this.sources) { try { s.stop(); s.disconnect(); } catch { /* ignore */ } }
      try { this.gain.disconnect(); } catch { /* ignore */ }
    }
  }

  // ---------------------------------------------------------------- MTC generator (Web MIDI)
  class MTCGen {
    constructor(output, { fps, startFrame }) {
      this.out = output; this.fps = String(fps); this.I = info(fps); this.startFrame = startFrame;
      this.qf = 1000 / (this.I.exact * 4); // ms per quarter frame
    }
    start() {
      this.t0 = performance.now() + 40;
      this.nextT = this.t0; this.piece = 0; this.seqFrame = this.startFrame;
      const t = framesToTC(this.startFrame, this.fps);
      try { this.out.send([0xf0, 0x7f, 0x7f, 0x01, 0x01, (this.I.mtc << 5) | t.h, t.m, t.s, t.f, 0xf7], this.t0 - 5); } catch { /* ignore */ }
      this.tick();
    }
    currentFrame() { return this.startFrame + Math.max(0, Math.floor(((performance.now() - this.t0) / 1000) * this.I.exact)); }
    tick() {
      if (this.stopped) return;
      while (this.nextT < performance.now() + 120) {
        if (this.piece === 0) this.tc = framesToTC(this.seqFrame, this.fps);
        const t = this.tc, p = this.piece;
        const nib = [t.f & 15, t.f >> 4, t.s & 15, t.s >> 4, t.m & 15, t.m >> 4, t.h & 15, (t.h >> 4) | (this.I.mtc << 1)][p];
        try { this.out.send([0xf1, (p << 4) | nib], this.nextT); } catch { /* ignore */ }
        this.piece = (p + 1) % 8;
        if (this.piece === 0) this.seqFrame += 2;
        this.nextT += this.qf;
      }
    }
    stop() { this.stopped = true; }
  }

  // ---------------------------------------------------------------- MTC reader
  class MTCReader {
    constructor() { this.parts = new Array(8).fill(0); this.last = null; this.onUpdate = () => {}; }
    feed(d) {
      if (d[0] === 0xf1 && d.length >= 2) {
        const p = d[1] >> 4, v = d[1] & 15;
        this.parts[p] = v;
        if (p === 7) {
          const P = this.parts;
          const rate = (P[7] >> 1) & 3;
          const fps = ['24', '25', '29.97df', '30'][rate];
          const tc = { f: P[0] | (P[1] << 4), s: P[2] | (P[3] << 4), m: P[4] | (P[5] << 4), h: P[6] | ((P[7] & 1) << 4) };
          this.set(tcToFrames(tc, fps) + 2, fps);
        }
        return true;
      }
      if (d[0] === 0xf0 && d[1] === 0x7f && d[3] === 0x01 && d[4] === 0x01 && d.length >= 10) {
        const rate = (d[5] >> 5) & 3;
        const fps = ['24', '25', '29.97df', '30'][rate];
        this.set(tcToFrames({ h: d[5] & 31, m: d[6], s: d[7], f: d[8] }, fps), fps);
        return true;
      }
      return false;
    }
    set(frames, fps) { this.last = { frames, fps, at: performance.now() }; this.onUpdate(this.last); }
    current() {
      if (!this.last) return null;
      const age = performance.now() - this.last.at;
      if (age > 400) return { ...this.last, stale: true };
      return { frames: this.last.frames + Math.floor((age / 1000) * info(this.last.fps).exact), fps: this.last.fps, stale: false };
    }
  }

  return { FPS, info, framesToTC, tcToFrames, parse, format, ltcBits, LTCGen, MTCGen, MTCReader };
})();
