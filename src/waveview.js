'use strict';
// QLab-style waveform editor: per-channel lanes, zoom & scroll, time ruler, overview strip,
// draggable start/end trims, fade-in/out handles, markers, load-to-time and live playheads.
window.QP = window.QP || {};

QP.WaveView = class WaveView {
  /**
   * opts: cue, buffer(), set(key, value), runs(), position(run), loadTime(), setLoadTime(t|null),
   *       seek(t), locked(), fmt(t), onCommit(), split(), preview(fromTime)
   */
  constructor(opts) {
    this.o = opts;
    this.state = opts.state || {};      // persisted per cue: { view, follow }
    if (this.state.follow == null) this.state.follow = true;
    this.hoverT = null;
    this.el = this.build();
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(this.main);
    requestAnimationFrame(() => this.draw());
  }

  get view() { return this.state.view || null; }
  set view(v) { this.state.view = v; }
  get follow() { return this.state.follow; }
  set follow(v) { this.state.follow = v; }

  // ---------------------------------------------------------------- peak data (min/max per channel, 256-sample blocks)
  static minmax(buf) {
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
  }

  // ---------------------------------------------------------------- DOM
  build() {
    const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const root = mk('div', 'wv');
    const bar = mk('div', 'wv-bar');
    const btn = (label, title, fn, cls = '') => { const b = mk('button', `wv-btn ${cls}`, label); b.title = title; b.addEventListener('click', fn); b.addEventListener('mousedown', (e) => e.preventDefault()); return b; };
    this.readout = mk('span', 'wv-read');
    this.followBtn = btn('Follow', 'Keep the playhead in view while playing', () => { this.follow = !this.follow; this.followBtn.classList.toggle('on', this.follow); }, this.follow ? 'on' : '');
    bar.append(
      btn('−', 'Zoom out (or mouse wheel)', () => this.zoom(1.6)),
      btn('+', 'Zoom in (or mouse wheel)', () => this.zoom(1 / 1.6)),
      btn('Fit', 'Show the whole file', () => { this.view = null; this.draw(); }),
      btn('Trim', 'Zoom to the start–end region', () => this.zoomToTrim()),
      this.followBtn,
      mk('span', 'wv-sep'),
      btn('▶ From start', 'Preview from the start time (plays to the preview output)', () => this.o.preview(null)),
      btn('▶ From load point', 'Preview from the yellow load-to-time marker', () => this.o.preview(this.o.loadTime())),
      mk('span', 'wv-spacer'),
      this.readout);
    this.main = mk('canvas', 'wv-main');
    this.over = mk('canvas', 'wv-over');
    this.help = mk('div', 'wv-help', 'Drag green/red flags to trim · drag the ◢ ◣ handles for fades · Alt-click: add/remove marker (drag to move) · Shift-click: load to time / jump · wheel: zoom · Shift-wheel or drag: scroll · double-click: fit');
    root.append(bar, this.main, this.over, this.help);
    this.bindMain();
    this.bindOverview();
    return root;
  }

  // ---------------------------------------------------------------- geometry
  dur() { const b = this.o.buffer(); return b ? b.duration : 0; }
  vis() { const d = this.dur(); if (!this.view) return [0, d]; return this.view; }
  setView(t0, t1) {
    const d = this.dur(); if (!d) return;
    let span = Math.max(0.02, Math.min(d, t1 - t0));
    t0 = QP.clamp(t0, 0, d - span);
    this.view = span >= d - 1e-6 ? null : [t0, t0 + span];
    this.draw();
  }
  zoom(f, aroundT) {
    const [a, b] = this.vis();
    const c = aroundT ?? (a + b) / 2, span = (b - a) * f;
    this.setView(c - (c - a) * f, c - (c - a) * f + span);
  }
  zoomToTrim() {
    const { s, e } = this.trim(); const pad = (e - s) * 0.04;
    this.setView(s - pad, e + pad);
  }
  trim() {
    const c = this.o.cue, d = this.dur();
    const s = QP.clamp(Number(c.start) || 0, 0, d), e = Number(c.end) > 0 ? QP.clamp(Number(c.end), 0, d) : d;
    return { s, e };
  }
  xOf(t, W) { const [a, b] = this.vis(); return ((t - a) / (b - a)) * W; }
  tOf(x, W) { const [a, b] = this.vis(); return a + (x / W) * (b - a); }

  // ---------------------------------------------------------------- drawing
  draw() {
    const cv = this.main, b = this.o.buffer();
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#080a10'; g.fillRect(0, 0, W, H);
    if (!b) {
      g.fillStyle = '#5b6379'; g.font = '13px sans-serif'; g.textAlign = 'center';
      g.fillText(this.o.cue.file ? 'Loading waveform…' : 'No audio file', W / 2, H / 2);
      this.drawOverview(); return;
    }
    const c = this.o.cue, d = b.duration;
    const RULER = 20, top = RULER, laneH = H - RULER;
    const mm = WaveView.minmax(b);
    const lanes = Math.min(mm.chans.length, 4);
    const lh = laneH / lanes;
    const [v0, v1] = this.vis();
    const { s, e } = this.trim();
    // ruler
    this.drawRuler(g, W, RULER, v0, v1);
    // lanes
    const spp = (v1 - v0) / W;                // seconds per pixel
    const sppSamples = spp * b.sampleRate;
    for (let L = 0; L < lanes; L++) {
      const y0 = top + L * lh, mid = y0 + lh / 2, amp = lh / 2 - 3;
      g.fillStyle = L % 2 ? '#0a0d15' : '#090b12'; g.fillRect(0, y0, W, lh);
      g.strokeStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.moveTo(0, mid + 0.5); g.lineTo(W, mid + 0.5);
      for (const db of [-6, -12]) { const k = Math.pow(10, db / 20) * amp; g.moveTo(0, mid - k + 0.5); g.lineTo(W, mid - k + 0.5); g.moveTo(0, mid + k + 0.5); g.lineTo(W, mid + k + 0.5); }
      g.stroke();
      const data = b.getChannelData(L), cm = mm.chans[L];
      for (let x = 0; x < W; x++) {
        const t0 = v0 + x * spp, t1 = t0 + spp;
        let lo = 1, hi = -1;
        if (sppSamples >= mm.B) {
          const b0 = Math.max(0, Math.floor((t0 * b.sampleRate) / mm.B)), b1 = Math.min(mm.n - 1, Math.ceil((t1 * b.sampleRate) / mm.B));
          for (let k = b0; k <= b1; k++) { if (cm[k * 2] < lo) lo = cm[k * 2]; if (cm[k * 2 + 1] > hi) hi = cm[k * 2 + 1]; }
        } else {
          const s0 = Math.max(0, Math.floor(t0 * b.sampleRate)), s1 = Math.min(data.length - 1, Math.ceil(t1 * b.sampleRate));
          for (let k = s0; k <= s1; k++) { const v = data[k]; if (v < lo) lo = v; if (v > hi) hi = v; }
        }
        if (hi < lo) continue;
        const inTrim = t1 >= s && t0 <= e;
        const hue = 190 + ((t0 / d) * 110);
        g.fillStyle = inTrim ? `hsl(${hue},85%,62%)` : 'rgba(120,128,150,.35)';
        const yA = mid - hi * amp, yB = mid - lo * amp;
        g.fillRect(x, yA, 1, Math.max(1, yB - yA));
      }
      if (lanes > 1) { g.fillStyle = '#5b6379'; g.font = '10px sans-serif'; g.textAlign = 'left'; g.fillText(lanes === 2 ? ['L', 'R'][L] : String(L + 1), 4, y0 + 12); }
      if (L) { g.fillStyle = '#1b2030'; g.fillRect(0, y0, W, 1); }
    }
    // dim outside trim
    const xs = this.xOf(s, W), xe = this.xOf(e, W);
    g.fillStyle = 'rgba(4,5,9,.55)';
    if (xs > 0) g.fillRect(0, top, xs, laneH);
    if (xe < W) g.fillRect(xe, top, W - xe, laneH);
    // fades (envelope line)
    const fi = Math.max(0, Number(c.fadeIn) || 0), fo = Math.max(0, Number(c.fadeOut) || 0);
    g.strokeStyle = '#facc15'; g.lineWidth = 1.5; g.beginPath();
    const yTop = top + 4, yBot = top + laneH - 4;
    const env = (t) => { let v = 1; if (fi > 0 && t < s + fi) v = Math.min(v, (t - s) / fi); if (fo > 0 && t > e - fo) v = Math.min(v, (e - t) / fo); return QP.clamp(v, 0, 1); };
    const xa = Math.max(0, xs), xb = Math.min(W, xe);
    for (let x = xa; x <= xb; x += 2) { const t = this.tOf(x, W); const v = env(t); const y = yBot - (yBot - yTop) * (v * v * (3 - 2 * v)); if (x === xa) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke(); g.lineWidth = 1;
    this.handles = [];
    const fadeHandle = (t, kind) => {
      const x = this.xOf(t, W); if (x < -10 || x > W + 10) return;
      g.fillStyle = '#facc15'; g.beginPath();
      if (kind === 'fadeIn') { g.moveTo(x, yTop); g.lineTo(x - 7, yTop); g.lineTo(x, yTop + 7); } else { g.moveTo(x, yTop); g.lineTo(x + 7, yTop); g.lineTo(x, yTop + 7); }
      g.fill(); this.handles.push({ kind, x, y: yTop + 3 });
    };
    fadeHandle(s + fi, 'fadeIn');
    fadeHandle(e - fo, 'fadeOut');
    // markers
    (c.markers || []).forEach((m, i) => {
      const x = this.xOf(m, W); if (x < -10 || x > W + 10) return;
      g.fillStyle = '#f97316'; g.fillRect(x - 0.75, top, 1.5, laneH);
      g.beginPath(); g.moveTo(x, H); g.lineTo(x - 6, H - 9); g.lineTo(x + 6, H - 9); g.fill();
      g.font = '700 9.5px sans-serif'; g.textAlign = 'left'; g.fillText(String(i + 1), x + 4, top + laneH - 12);
      this.handles.push({ kind: 'marker', i, x, y: H - 5 });
    });
    // trim flags
    const flag = (x, color, label, kind) => {
      g.fillStyle = color; g.fillRect(x - 1, top, 2, laneH);
      g.beginPath(); g.moveTo(x, top); g.lineTo(kind === 'start' ? x + 22 : x - 22, top); g.lineTo(kind === 'start' ? x + 22 : x - 22, top + 13); g.lineTo(x, top + 13); g.fill();
      g.fillStyle = '#05060a'; g.font = '700 9px sans-serif'; g.textAlign = kind === 'start' ? 'left' : 'right';
      g.fillText(label, kind === 'start' ? x + 3 : x - 3, top + 10);
      this.handles.push({ kind, x, y: top + 7 });
    };
    if (xs >= -2 && xs <= W + 2) flag(xs, '#34d399', 'IN', 'start');
    if (xe >= -2 && xe <= W + 2) flag(xe, '#f43f5e', 'OUT', 'end');
    // loop badge
    if (Number(c.playCount) !== 1 && xe > 40 && xe <= W + 2) { g.fillStyle = '#22d3ee'; g.font = '700 10px sans-serif'; g.textAlign = 'right'; g.fillText(`⟲ ${Number(c.playCount) === 0 ? '∞' : '×' + c.playCount}`, xe - 4, top + laneH - 6); }
    // load-to-time
    const lt = this.o.loadTime();
    if (lt != null) { const x = this.xOf(lt, W); g.fillStyle = '#facc15'; g.fillRect(x - 1, top, 2, laneH); g.beginPath(); g.moveTo(x - 6, top); g.lineTo(x + 6, top); g.lineTo(x, top + 9); g.fill(); }
    // playheads
    let follow = null;
    for (const r of this.o.runs()) {
      const p = this.o.position(r); if (p == null) continue;
      const x = this.xOf(p, W);
      if (x >= -2 && x <= W + 2) { g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 6; g.fillRect(x - 0.75, top, 1.5, laneH); g.shadowBlur = 0; }
      follow = p;
    }
    if (follow != null && this.follow && this.view && !this.dragging) {
      const [a, bb] = this.view, span = bb - a;
      if (follow < a || follow > bb - span * 0.08) this.setView(follow - span * 0.15, follow - span * 0.15 + span);
    }
    // hover line
    if (this.hoverT != null && !this.dragging) { const x = this.xOf(this.hoverT, W); g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x, top, 1, laneH); }
    this.readout.textContent = `${this.hoverT != null ? `cursor ${this.o.fmt(this.hoverT)} · ` : ''}in ${this.o.fmt(s)} · out ${this.o.fmt(e)} · length ${this.o.fmt(e - s)} · file ${this.o.fmt(d)}${this.view ? ` · zoom ×${(d / (v1 - v0)).toFixed(1)}` : ''}`;
    this.drawOverview();
  }
  drawRuler(g, W, Hr, v0, v1) {
    g.fillStyle = '#0d1018'; g.fillRect(0, 0, W, Hr);
    g.fillStyle = '#1f2433'; g.fillRect(0, Hr - 1, W, 1);
    const span = v1 - v0;
    const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const step = steps.find((st) => (st / span) * W >= 70) || 600;
    g.fillStyle = '#8a93ab'; g.strokeStyle = '#2a3042'; g.font = '10px sans-serif'; g.textAlign = 'left';
    for (let t = Math.ceil(v0 / step) * step; t <= v1; t += step) {
      const x = ((t - v0) / span) * W;
      g.fillRect(x, Hr - 7, 1, 6);
      const lbl = step < 1 ? `${this.o.fmt(t)}` : this.o.fmt(Math.round(t));
      g.fillText(lbl, x + 3, 12);
      for (let k = 1; k < 5; k++) { const xx = x + ((step / 5) * k / span) * W; if (xx < W) g.fillRect(xx, Hr - 4, 1, 3); }
    }
  }
  drawOverview() {
    const cv = this.over, b = this.o.buffer();
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#06070b'; g.fillRect(0, 0, W, H);
    if (!b) return;
    const pk = b.peaks, d = b.duration;
    g.fillStyle = 'rgba(99,102,241,.55)';
    for (let x = 0; x < W; x++) { const v = pk[Math.floor((x / W) * pk.length)] || 0; const hh = Math.max(0.5, v * (H / 2 - 1)); g.fillRect(x, H / 2 - hh, 1, hh * 2); }
    const { s, e } = this.trim();
    g.fillStyle = 'rgba(4,5,9,.6)'; g.fillRect(0, 0, (s / d) * W, H); g.fillRect((e / d) * W, 0, W - (e / d) * W, H);
    for (const r of this.o.runs()) { const p = this.o.position(r); if (p != null) { g.fillStyle = '#fff'; g.fillRect((p / d) * W, 0, 1, H); } }
    const [v0, v1] = this.vis();
    g.strokeStyle = '#22d3ee'; g.lineWidth = 1.5;
    g.strokeRect((v0 / d) * W + 0.75, 0.75, Math.max(3, ((v1 - v0) / d) * W - 1.5), H - 1.5);
    g.lineWidth = 1;
  }

  // ---------------------------------------------------------------- interaction
  bindMain() {
    const cv = this.main;
    const pos = (ev) => { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top, W: r.width }; };
    const hit = (p) => {
      let best = null, bd = 8;
      for (const h of this.handles || []) {
        const dx = Math.abs(h.x - p.x), dy = Math.abs(h.y - p.y);
        const near = (h.kind === 'start' || h.kind === 'end') ? dx : (dx + (dy > 14 ? 99 : 0));
        if (near < bd) { bd = near; best = h; }
      }
      return best;
    };
    cv.addEventListener('mousemove', (ev) => {
      const p = pos(ev);
      if (!this.o.buffer()) return;
      this.hoverT = this.tOf(p.x, p.W);
      const h = hit(p);
      cv.style.cursor = this.o.locked() ? 'default' : h ? (h.kind === 'marker' ? 'grab' : 'ew-resize') : 'crosshair';
      if (!this.dragging) this.draw();
    });
    cv.addEventListener('mouseleave', () => { this.hoverT = null; this.draw(); });
    cv.addEventListener('dblclick', () => { this.view = null; this.draw(); });
    cv.addEventListener('wheel', (ev) => {
      if (!this.o.buffer()) return;
      ev.preventDefault();
      const p = pos(ev);
      if (ev.shiftKey || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) {
        const [a, b] = this.vis(); const dt = ((ev.deltaX || ev.deltaY) / p.W) * (b - a);
        this.setView(a + dt, b + dt);
      } else this.zoom(Math.pow(1.0015, ev.deltaY), this.tOf(p.x, p.W));
    }, { passive: false });
    cv.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      const h = hit(pos(ev));
      if (h && h.kind === 'marker' && !this.o.locked()) { const mk = [...(this.o.cue.markers || [])]; mk.splice(h.i, 1); this.o.set('markers', mk); this.o.onCommit(); }
    });
    cv.addEventListener('mousedown', (ev) => {
      const b = this.o.buffer(); if (!b || ev.button !== 0) return;
      ev.preventDefault();
      const p = pos(ev), t = this.tOf(p.x, p.W), c = this.o.cue, d = b.duration;
      const round = (v) => Math.round(v * 1000) / 1000;
      if (ev.shiftKey) {
        const runs = this.o.runs();
        if (runs.length) this.o.seek(t);
        else { const lt = this.o.loadTime(); this.o.setLoadTime(lt != null && Math.abs(lt - t) < (this.vis()[1] - this.vis()[0]) * 0.01 ? null : round(t)); }
        this.draw(); this.o.onCommit(); return;
      }
      if (ev.altKey && !this.o.locked()) {
        const span = this.vis()[1] - this.vis()[0];
        const mk = [...(c.markers || [])];
        const near = mk.findIndex((m) => Math.abs(m - t) < span * 0.008);
        if (near >= 0) mk.splice(near, 1); else mk.push(round(t));
        this.o.set('markers', mk.sort((x, y) => x - y)); this.draw(); this.o.onCommit(); return;
      }
      const h = this.o.locked() ? null : hit(p);
      const startX = p.x, [va, vb] = this.vis();
      this.dragging = true;
      const move = (mv) => {
        const q = pos(mv), tt = QP.clamp(this.tOf(q.x, q.W), 0, d);
        const { s, e } = this.trim();
        if (!h) { const dt = ((startX - q.x) / q.W) * (vb - va); if (this.view) this.setView(va + dt, vb + dt); return; }
        if (h.kind === 'start') this.o.set('start', round(Math.min(tt, e - 0.02)));
        else if (h.kind === 'end') { const v = Math.max(tt, s + 0.02); this.o.set('end', v >= d - 0.005 ? 0 : round(v)); }
        else if (h.kind === 'fadeIn') this.o.set('fadeIn', round(QP.clamp(tt - s, 0, e - s)));
        else if (h.kind === 'fadeOut') this.o.set('fadeOut', round(QP.clamp(e - tt, 0, e - s)));
        else if (h.kind === 'marker') { const mk = [...(c.markers || [])]; mk[h.i] = round(tt); this.o.set('markers', mk); }
        this.draw();
      };
      const up = () => {
        window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
        this.dragging = false;
        if (h && h.kind === 'marker') this.o.set('markers', [...(c.markers || [])].sort((x, y) => x - y));
        if (h) this.o.onCommit();
        this.draw();
      };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    });
  }
  bindOverview() {
    const cv = this.over;
    const go = (ev) => {
      const d = this.dur(); if (!d) return;
      const r = cv.getBoundingClientRect();
      const t = QP.clamp((ev.clientX - r.left) / r.width, 0, 1) * d;
      const [a, b] = this.vis(), span = b - a;
      if (span >= d - 1e-6) return;
      this.setView(t - span / 2, t + span / 2);
    };
    cv.addEventListener('mousedown', (ev) => {
      ev.preventDefault(); go(ev);
      const move = (m) => go(m);
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    });
  }
  destroy() { this.ro.disconnect(); }
};
