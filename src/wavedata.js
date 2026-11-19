'use strict';
// Waveform data shared by every waveform view: min/max peak blocks, clipping detection, and the soundtrack
// of video files (decoded once, kept only as peaks so long videos don't hold their audio in memory).
window.QP = window.QP || {};

QP.CLIP_LEVEL = 0.999;   // |sample| at or above this (≈ −0.01 dBFS) after the cue's level is counted as clipping

// min/max per channel in 256-sample blocks (cached on the buffer)
QP.waveMinMax = (buf) => {
  if (buf._mm) return buf._mm;
  const B = 256, n = Math.ceil(buf.length / B), chans = [];
  for (let c = 0; c < Math.min(buf.numberOfChannels, 8); c++) {
    const d = buf.getChannelData(c), mm = new Float32Array(n * 2);
    for (let b = 0; b < n; b++) {
      let lo = 1, hi = -1;
      const s1 = Math.min(d.length, (b + 1) * B);
      for (let s = b * B; s < s1; s++) { const v = d[s]; if (v < lo) lo = v; if (v > hi) hi = v; }
      mm[b * 2] = lo; mm[b * 2 + 1] = hi;
    }
    chans.push(mm);
  }
  buf._mm = { B, n, chans };
  return buf._mm;
};

// loudest sample per block across all channels, and the file's overall peak
QP.waveAbs = (buf) => {
  if (buf._abs) return buf._abs;
  const mm = QP.waveMinMax(buf);
  const abs = new Float32Array(mm.n);
  let peak = 0;
  for (const ch of mm.chans) {
    for (let b = 0; b < mm.n; b++) { const v = Math.max(-ch[b * 2], ch[b * 2 + 1]); if (v > abs[b]) abs[b] = v; }
  }
  for (let b = 0; b < mm.n; b++) if (abs[b] > peak) peak = abs[b];
  buf._abs = { abs, peak, B: mm.B, sr: buf.sampleRate };
  return buf._abs;
};

// where the file clips once the cue's level is applied: { peakDb, gainDb, regions: [[t0, t1]…], count, headroomDb }
QP.waveClips = (buf, levelDb = 0) => {
  if (!buf) return null;
  const a = QP.waveAbs(buf);
  const g = Math.pow(10, (Number(levelDb) || 0) / 20);
  const key = g.toFixed(4);
  buf._clips = buf._clips || {};
  if (buf._clips[key]) return buf._clips[key];
  const thr = QP.CLIP_LEVEL / g, bs = a.B / a.sr, regions = [];
  for (let b = 0; b < a.abs.length; b++) {
    if (a.abs[b] < thr) continue;
    const t0 = b * bs, t1 = t0 + bs;
    const last = regions[regions.length - 1];
    if (last && t0 - last[1] < 0.05) last[1] = t1; else regions.push([t0, t1]);
  }
  const peakDb = a.peak > 0 ? 20 * Math.log10(a.peak) : -Infinity;
  const res = { peakDb, gainDb: Number(levelDb) || 0, outPeakDb: peakDb + (Number(levelDb) || 0), headroomDb: -(peakDb + (Number(levelDb) || 0)), regions, count: regions.length };
  buf._clips[key] = res;
  return res;
};
// is anything between t0 and t1 clipping at this gain (fast, for drawing)
QP.clipBetween = (buf, t0, t1, g) => {
  const a = QP.waveAbs(buf), bs = a.B / a.sr, thr = QP.CLIP_LEVEL / g;
  const b0 = Math.max(0, Math.floor(t0 / bs)), b1 = Math.min(a.abs.length - 1, Math.ceil(t1 / bs));
  for (let b = b0; b <= b1; b++) if (a.abs[b] >= thr) return true;
  return false;
};

// a small stand-in for an AudioBuffer that keeps only the peak data (used for video soundtracks)
QP.liteWave = (buf, peaksFn) => {
  QP.waveAbs(buf);
  return {
    lite: true, duration: buf.duration, sampleRate: buf.sampleRate, numberOfChannels: Math.min(buf.numberOfChannels, 8), length: buf.length,
    _mm: buf._mm, _abs: buf._abs, peaks: peaksFn ? peaksFn(buf, 1600) : null,
  };
};

// ---- soundtracks of video files
QP.VideoWaves = class VideoWaves {
  constructor({ ctx, url, peaks, maxBytes = 1.5e9 }) {
    this.ctx = ctx; this.url = url; this.peaks = peaks; this.maxBytes = maxBytes;
    this.cache = new Map(); this.failed = new Map(); this.loading = new Map();
    this.queue = Promise.resolve();
    this.onLoaded = () => {};
  }
  get(path) { return this.cache.get(path) || null; }
  error(path) { return this.failed.get(path) || null; }
  load(path) {
    if (!path) return Promise.reject(new Error('No file'));
    if (this.cache.has(path)) return Promise.resolve(this.cache.get(path));
    if (this.failed.has(path)) return Promise.reject(new Error(this.failed.get(path)));
    if (this.loading.has(path)) return this.loading.get(path);
    // one video at a time: decoding a long soundtrack takes memory while it runs
    const p = this.queue.then(async () => {
      const res = await fetch(this.url(path));
      if (!res.ok) throw new Error(`Cannot read file (${res.status})`);
      const len = Number(res.headers.get('content-length')) || 0;
      if (len > this.maxBytes) throw new Error('File too large for a waveform');
      const ab = await res.arrayBuffer();
      let buf;
      try { buf = await this.ctx().decodeAudioData(ab); } catch { throw new Error('No soundtrack in this file'); }
      const lite = QP.liteWave(buf, this.peaks);
      this.cache.set(path, lite);
      this.onLoaded(path, lite);
      return lite;
    });
    this.loading.set(path, p);
    this.queue = p.catch(() => {});
    p.then(() => this.loading.delete(path), (e) => { this.loading.delete(path); this.failed.set(path, e.message); });
    return p;
  }
};
