'use strict';
// Output surfaces: one window per surface (screen / projector) with layers, corner-pin warping,
// edge blending, test pattern and identify overlays.
window.QP = window.QP || {};

QP.homography = (w, h, pts) => {
  // map (0,0),(w,0),(w,h),(0,h) -> pts[0..3] ; returns CSS matrix3d()
  const src = [[0, 0], [w, 0], [w, h], [0, h]];
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = pts[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  // Gaussian elimination
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [B[c], B[p]] = [B[p], B[c]];
    const d = A[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / d;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      B[r] -= f * B[c];
    }
  }
  const [a, b, c, d, e, f, g, hh] = B.map((v, i) => v / A[i][i]);
  return `matrix3d(${a},${d},0,${g},${b},${e},0,${hh},0,0,1,0,${c},${f},0,1)`;
};

QP.OutputManager = class OutputManager {
  constructor(getSettings) {
    this.getSettings = getSettings;
    this.wins = new Map(); // surfaceId -> window
    this.onClosed = () => {};
    this.onWarpChange = () => {};
  }
  surfaces() { const s = this.getSettings().surfaces; return s && s.length ? s : [{ id: 'main', name: 'Main output' }]; }
  surface(id) { const all = this.surfaces(); return all.find((s) => s.id === id) || all[0]; }
  liveSurface(id) { const s = this.surface(id); const w = this.wins.get(s.id); return w && !w.closed ? w : null; }
  // ---- mapping editors (run inside the output window)
  async editCorners(id, onChange) {
    const { win } = await this.ensure(id);
    const s = this.surface(id);
    if (!s.corners) s.corners = QP.UNIT.map((p) => [...p]);
    return QP.pointEditor(win, {
      points: s.corners, lines: () => [[0, 1], [1, 2], [2, 3], [3, 0]],
      help: `Corner-pin “${s.name}” · drag corners · arrows nudge (Shift = more) · Tab = next corner · Enter = done`,
      onChange: (pts, commit) => { s.corners = pts; this.apply(s.id); if (commit && onChange) onChange(); },
    });
  }
  async editMesh(id, onChange) {
    const { win } = await this.ensure(id);
    const s = this.surface(id);
    if (!s.mesh) s.mesh = QP.newMesh(4, 3, s);
    const m = s.mesh;
    const lines = () => { const L = []; for (let j = 0; j < m.rows; j++) for (let i = 0; i < m.cols; i++) { const k = j * m.cols + i; if (i < m.cols - 1) L.push([k, k + 1]); if (j < m.rows - 1) L.push([k, k + m.cols]); } return L; };
    return QP.pointEditor(win, {
      points: m.pts, lines,
      help: `Mesh warp “${s.name}” (${m.cols}×${m.rows}) · drag points · arrows nudge · Tab = next point · Enter = done`,
      onChange: (pts, commit) => { m.pts = pts; this.apply(s.id); if (commit && onChange) onChange(); },
    });
  }
  async drawMask(id, onDone) {
    const { win } = await this.ensure(id);
    const s = this.surface(id);
    QP.polygonDrawer(win, { onDone: (pts) => { if (pts) { if (!s.masks) s.masks = []; s.masks.push({ id: Math.random().toString(36).slice(2, 9), name: `Mask ${s.masks.length + 1}`, points: pts, feather: 0, invert: false, enabled: true }); this.apply(s.id); } onDone(pts); } });
  }
  async editMask(id, maskId, onChange) {
    const { win } = await this.ensure(id);
    const s = this.surface(id);
    const m = (s.masks || []).find((x) => x.id === maskId); if (!m) return null;
    return QP.pointEditor(win, {
      points: m.points, lines: () => m.points.map((_, i) => [i, (i + 1) % m.points.length]), color: '#f97316',
      help: `Edit ${m.name} · drag points · Enter = done`,
      onChange: (pts, commit) => { m.points = pts; this.apply(s.id); if (commit && onChange) onChange(); },
    });
  }
  async editCueQuad(cue, onChange) {
    const { win } = await this.ensure(cue.surface);
    if (!cue.geo) cue.geo = {};
    const pts = (cue.geo.corners && cue.geo.corners.length === 4 ? cue.geo.corners : QP.cueQuad(cue)).map((p) => [...p]);
    return QP.pointEditor(win, {
      points: pts, lines: () => [[0, 1], [1, 2], [2, 3], [3, 0]], color: '#d946ef',
      help: `Corner-pin cue ${cue.number || ''} ${cue.name || ''} · drag its corners · Enter = done`,
      onChange: (p, commit) => { cue.geo.corners = p.map((x) => [...x]); onChange(commit); },
    });
  }
  frameName(s) { return s === this.surfaces()[0] ? 'qforge-video' : `qforge-video-${s.id}`; }
  isOpen(id) { const s = this.surface(id); const w = this.wins.get(s.id); return !!(w && !w.closed); }
  anyOpen() { return this.surfaces().some((s) => this.isOpen(s.id)); }
  async ensure(id) {
    const s = this.surface(id);
    let w = this.wins.get(s.id);
    if (!w || w.closed) {
      w = window.open('video.html', this.frameName(s), 'popup,width=960,height=540');
      if (!w) throw new Error('Output window was blocked');
      this.wins.set(s.id, w);
      w.__placed = false;
      const poll = setInterval(() => { if (w.closed) { clearInterval(poll); if (this.wins.get(s.id) === w) { this.wins.delete(s.id); this.onClosed(s.id); } } }, 500);
    }
    const t0 = performance.now();
    while (!(w.document && w.document.getElementById('stage'))) {
      if (performance.now() - t0 > 5000) throw new Error('Output window did not load');
      await new Promise((r) => setTimeout(r, 30));
    }
    if (!w.__placed) {
      w.__placed = true;
      w.document.title = `QForge — ${s.name || 'Output'}`;
      await QP.platform.placeVideo(this.placement(s));
      w.addEventListener('resize', () => this.apply(s.id));
    }
    this.apply(s.id);
    return { doc: w.document, stage: w.document.getElementById('stage'), win: w };
  }
  async openAll() { for (const s of this.surfaces()) await this.ensure(s.id); }
  closeAll() { for (const w of this.wins.values()) if (!w.closed) w.close(); this.wins.clear(); }
  placement(s) {
    const ndi = !!s.ndi;
    const [nw, nh] = String(s.ndiSize || '1920x1080').split('x').map(Number);
    return { frame: this.frameName(s), displayId: s.display ?? null, fullscreen: ndi ? false : s.fullscreen !== false, title: ndi ? `QForge virtual output - ${s.name || 'Output'}` : `QForge — ${s.name || 'Output'}`, ndi, width: nw || 1920, height: nh || 1080 };
  }
  async place(id) {
    const s = this.surface(id);
    if (this.isOpen(s.id)) { await QP.platform.placeVideo(this.placement(s)); const w = this.wins.get(s.id); if (w) w.document.title = this.placement(s).title; }
  }
  apply(id) {
    const s = this.surface(id);
    const w = this.wins.get(s.id);
    if (!w || w.closed || !w.document.body) return;
    const doc = w.document;
    doc.body.style.background = s.bg || this.getSettings().videoBg || '#000';
    const stage = doc.getElementById('stage');
    const W = w.innerWidth, H = w.innerHeight;
    const c = s.corners;
    // GPU mesh-warp mode
    const wantGL = s.mapMode === 'mesh';
    if (wantGL && !w.__gl) { try { w.__gl = new QP.GLMesh(w, s, this.getSettings); } catch (e) { console.error(e); } }
    if (!wantGL && w.__gl) { w.__gl.destroy(); w.__gl = null; }
    if (w.__gl) w.__gl.s = s;
    for (const el of stage.children) if (el._cue) QP.applyGeo(el, el._cue);
    QP.drawMasks(doc, s);
    if (w.__gl) {
      stage.style.transform = '';
    } else if (c && c.length === 4) {
      stage.style.transformOrigin = '0 0';
      stage.style.transform = QP.homography(W, H, c.map(([x, y]) => [x * W, y * H]));
    } else stage.style.transform = '';
    // edge blend overlays
    let bl = doc.getElementById('blend');
    if (!bl) { bl = doc.createElement('div'); bl.id = 'blend'; bl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9000'; doc.body.appendChild(bl); }
    bl.textContent = '';
    const b = s.blend || {};
    const gamma = Number(b.gamma) || 2.2;
    const ramp = (dir) => {
      const stops = [];
      for (let i = 0; i <= 10; i++) { const x = i / 10; const a = 1 - Math.pow(x, 1 / gamma); stops.push(`rgba(0,0,0,${a.toFixed(3)}) ${(x * 100).toFixed(0)}%`); }
      return `linear-gradient(${dir}, ${stops.join(',')})`;
    };
    const side = (k, css, dir) => { const v = Number(b[k]) || 0; if (v > 0) { const d = doc.createElement('div'); d.style.cssText = `position:absolute;${css.replace('$', v + '%')};background:${ramp(dir)}`; bl.appendChild(d); } };
    side('left', 'left:0;top:0;bottom:0;width:$', 'to right');
    side('right', 'right:0;top:0;bottom:0;width:$', 'to left');
    side('top', 'top:0;left:0;right:0;height:$', 'to bottom');
    side('bottom', 'bottom:0;left:0;right:0;height:$', 'to top');
  }

  // ---- test pattern / identify
  async testPattern(id, on) {
    const { doc, win } = await this.ensure(id);
    const s = this.surface(id);
    let cv = doc.getElementById('testpattern');
    if (!on) { if (cv) cv.remove(); return; }
    if (!cv) { cv = doc.createElement('canvas'); cv.id = 'testpattern'; cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:8000'; doc.getElementById('stage').appendChild(cv); }
    const W = cv.width = win.innerWidth * (win.devicePixelRatio || 1), H = cv.height = win.innerHeight * (win.devicePixelRatio || 1);
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
    bars.forEach((col, i) => { g.fillStyle = col; g.fillRect((i * W) / 7, H * 0.62, W / 7 + 1, H * 0.2); });
    for (let i = 0; i < 8; i++) { const v = Math.round((i / 7) * 255); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect((i * W) / 8, H * 0.82, W / 8 + 1, H * 0.18); }
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = Math.max(1, W / 1920);
    const step = Math.round(Math.min(W, H) / 12);
    for (let x = 0; x <= W; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H * 0.62); g.stroke(); }
    for (let y = 0; y <= H * 0.62; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.strokeStyle = '#fff'; g.lineWidth = Math.max(2, W / 600);
    g.beginPath(); g.arc(W / 2, H * 0.36, Math.min(W, H) * 0.24, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W, H * 0.62); g.moveTo(W, 0); g.lineTo(0, H * 0.62); g.stroke();
    g.strokeStyle = '#d946ef'; g.strokeRect(g.lineWidth, g.lineWidth, W - g.lineWidth * 2, H - g.lineWidth * 2);
    g.fillStyle = '#fff'; g.font = `700 ${Math.round(H / 14)}px sans-serif`; g.textAlign = 'center';
    g.fillText(s.name || 'Output', W / 2, H * 0.36 - H / 40);
    g.font = `${Math.round(H / 26)}px sans-serif`;
    g.fillText(`${Math.round(win.innerWidth * (win.devicePixelRatio || 1))} × ${Math.round(win.innerHeight * (win.devicePixelRatio || 1))}`, W / 2, H * 0.36 + H / 20);
  }
  async identify(id) {
    const { doc } = await this.ensure(id);
    const s = this.surface(id);
    const d = doc.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:9500;font:800 12vh sans-serif;color:#fff;background:rgba(99,102,241,.55);text-shadow:0 0 30px #000';
    d.textContent = s.name || 'Output';
    doc.body.appendChild(d);
    setTimeout(() => d.remove(), 3000);
  }

  // ---- interactive corner-pin editing inside the output window
  async warpEdit(id, on) {
    const { doc, win } = await this.ensure(id);
    const s = this.surface(id);
    let ov = doc.getElementById('warpedit');
    if (!on) { if (ov) ov.remove(); doc.body.style.cursor = ''; return; }
    if (ov) return;
    if (!s.corners) s.corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
    doc.body.style.cursor = 'default';
    ov = doc.createElement('div'); ov.id = 'warpedit';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9800;cursor:default';
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(svgNS, 'svg'); svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%');
    const poly = doc.createElementNS(svgNS, 'polygon'); poly.setAttribute('fill', 'none'); poly.setAttribute('stroke', '#22d3ee'); poly.setAttribute('stroke-width', '2');
    svg.appendChild(poly); ov.appendChild(svg);
    const help = doc.createElement('div');
    help.style.cssText = 'position:absolute;left:50%;top:20px;transform:translateX(-50%);background:rgba(0,0,0,.75);color:#fff;font:14px sans-serif;padding:8px 14px;border-radius:8px;border:1px solid #22d3ee';
    help.textContent = 'Drag the corners to warp this output · arrow keys nudge the last corner · finish in QForge Settings';
    ov.appendChild(help);
    const handles = s.corners.map((_, i) => {
      const hnd = doc.createElement('div');
      hnd.style.cssText = 'position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:3px solid #d946ef;background:rgba(217,70,239,.25);cursor:move';
      ov.appendChild(hnd);
      return hnd;
    });
    let active = 0;
    const draw = () => {
      const W = win.innerWidth, H = win.innerHeight;
      handles.forEach((hnd, i) => { hnd.style.left = `${s.corners[i][0] * W}px`; hnd.style.top = `${s.corners[i][1] * H}px`; hnd.style.borderColor = i === active ? '#22d3ee' : '#d946ef'; });
      poly.setAttribute('points', s.corners.map(([x, y]) => `${x * W},${y * H}`).join(' '));
      this.apply(s.id);
    };
    handles.forEach((hnd, i) => hnd.addEventListener('mousedown', (e) => {
      e.preventDefault(); active = i;
      const move = (m) => { s.corners[i] = [QP.clamp(m.clientX / win.innerWidth, -0.5, 1.5), QP.clamp(m.clientY / win.innerHeight, -0.5, 1.5)]; draw(); };
      const up = () => { win.removeEventListener('mousemove', move); win.removeEventListener('mouseup', up); this.onWarpChange(s.id); };
      win.addEventListener('mousemove', move); win.addEventListener('mouseup', up);
    }));
    win.addEventListener('keydown', (e) => {
      if (!doc.getElementById('warpedit')) return;
      const d = e.shiftKey ? 0.01 : 0.001;
      const k = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
      if (k) { e.preventDefault(); s.corners[active] = [s.corners[active][0] + k[0], s.corners[active][1] + k[1]]; draw(); this.onWarpChange(s.id); }
      if (e.key === 'Tab') { e.preventDefault(); active = (active + 1) % 4; draw(); }
    });
    doc.body.appendChild(ov);
    draw();
  }
};
