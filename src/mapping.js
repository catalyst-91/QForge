'use strict';
// Video mapping: per-cue geometry (position / size / rotation / crop / corner-pin), per-surface
// mesh warp rendered on the GPU (WebGL), polygon masks, and on-output point editors.
window.QP = window.QP || {};

// ------------------------------------------------------------------ helpers
QP.homographyMatrix = (src, dst) => {
  // 3x3 projective transform mapping 4 src points -> 4 dst points
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [B[c], B[p]] = [B[p], B[c]];
    const d = A[c][c] || 1e-12;
    for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / d; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; B[r] -= f * B[c]; }
  }
  const h = B.map((v, i) => v / A[i][i]);
  return (x, y) => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };
};
QP.UNIT = [[0, 0], [1, 0], [1, 1], [0, 1]];

// geometry of a visual cue -> 4 corners in normalised surface coordinates (TL, TR, BR, BL)
QP.cueQuad = (c) => {
  const g = c.geo || {};
  if (Array.isArray(g.corners) && g.corners.length === 4) return g.corners;
  const w = (Number(g.w ?? 100) / 100) * (Number(g.scale ?? 100) / 100), hh = (Number(g.h ?? 100) / 100) * (Number(g.scale ?? 100) / 100);
  const cx = 0.5 + Number(g.x || 0) / 100, cy = 0.5 + Number(g.y || 0) / 100;
  const a = (Number(g.rot || 0) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return [[-w / 2, -hh / 2], [w / 2, -hh / 2], [w / 2, hh / 2], [-w / 2, hh / 2]].map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos]);
};
QP.hasGeo = (c) => {
  const g = c.geo || {};
  return !!((g.corners && g.corners.length === 4) || Number(g.x) || Number(g.y) || (g.w != null && Number(g.w) !== 100) || (g.h != null && Number(g.h) !== 100) || (g.scale != null && Number(g.scale) !== 100) || Number(g.rot) || Number(g.cropL) || Number(g.cropT) || Number(g.cropR) || Number(g.cropB));
};

// apply a cue's geometry to its DOM layer (used when the surface is in simple / corner-pin mode)
QP.applyGeo = (el, c) => {
  if (!el) return;
  const win = el.ownerDocument.defaultView;
  const W = win.innerWidth, H = win.innerHeight;
  const g = c.geo || {};
  el._cue = c;
  const crop = [g.cropT, g.cropR, g.cropB, g.cropL].map((v) => `${QP.clamp(Number(v) || 0, 0, 100)}%`);
  el.style.clipPath = crop.some((v) => v !== '0%') ? `inset(${crop.join(' ')})` : '';
  const full = () => { Object.assign(el.style, { left: '0', top: '0', right: '0', bottom: '0', width: '100%', height: '100%' }); };
  if (!QP.hasGeo(c)) { full(); el.style.transformOrigin = '50% 50%'; el.style.transform = c.mirror ? 'scaleX(-1)' : ''; return; }
  if (Array.isArray(g.corners) && g.corners.length === 4) {
    // corner-pin: project the full-surface box onto the 4 corners
    full();
    el.style.transformOrigin = '0 0';
    el.style.transform = QP.homography(W, H, g.corners.map(([x, y]) => [x * W, y * H])) + (c.mirror ? ` matrix(-1,0,0,1,${W},0)` : '');
    return;
  }
  // box mode: a real box so "fit" (contain / cover / stretch) works inside it, then rotate
  const k = Number(g.scale ?? 100) / 100;
  const w = (Number(g.w ?? 100) / 100) * k, hh = (Number(g.h ?? 100) / 100) * k;
  const cx = 0.5 + Number(g.x || 0) / 100, cy = 0.5 + Number(g.y || 0) / 100;
  Object.assign(el.style, { left: `${(cx - w / 2) * 100}%`, top: `${(cy - hh / 2) * 100}%`, right: 'auto', bottom: 'auto', width: `${w * 100}%`, height: `${hh * 100}%` });
  el.style.transformOrigin = '50% 50%';
  el.style.transform = `rotate(${Number(g.rot || 0)}deg)${c.mirror ? ' scaleX(-1)' : ''}`;
};

// ------------------------------------------------------------------ masks (2D overlay, works in every mode)
QP.drawMasks = (doc, s) => {
  let cv = doc.getElementById('masks');
  const masks = (s.masks || []).filter((m) => m.points && m.points.length >= 3 && m.enabled !== false);
  if (!masks.length) { if (cv) cv.remove(); return; }
  const win = doc.defaultView, dpr = win.devicePixelRatio || 1;
  if (!cv) { cv = doc.createElement('canvas'); cv.id = 'masks'; cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:8900'; doc.body.appendChild(cv); }
  const W = Math.round(win.innerWidth * dpr), H = Math.round(win.innerHeight * dpr);
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  for (const m of masks) {
    g.save();
    g.filter = Number(m.feather) > 0 ? `blur(${Number(m.feather) * dpr}px)` : 'none';
    g.fillStyle = '#000';
    g.beginPath();
    if (m.invert) { g.rect(-W, -H, W * 3, H * 3); }
    m.points.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * H) : g.moveTo(x * W, y * H)));
    g.closePath();
    g.fill(m.invert ? 'evenodd' : 'nonzero');
    g.restore();
  }
};

// ------------------------------------------------------------------ GPU mesh-warp compositor
QP.GLMesh = class GLMesh {
  constructor(win, surface, getSettings) {
    this.win = win; this.s = surface; this.getSettings = getSettings;
    const doc = win.document;
    this.cv = doc.createElement('canvas');
    this.cv.id = 'glout';
    this.cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:8500;pointer-events:none;background:#000';
    doc.body.appendChild(this.cv);
    const gl = this.gl = this.cv.getContext('webgl', { alpha: false, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL is not available for mesh warping');
    const vs = 'attribute vec2 p; attribute vec2 t; varying vec2 v; void main(){ v=t; gl_Position=vec4(p.x*2.0-1.0, 1.0-p.y*2.0, 0.0, 1.0); }';
    const fs = 'precision mediump float; varying vec2 v; uniform sampler2D s; uniform float a; uniform vec4 crop; void main(){ if(v.x<crop.x||v.y<crop.y||v.x>crop.z||v.y>crop.w) discard; vec4 c=texture2D(s,v); gl_FragColor=vec4(c.rgb, c.a*a); }';
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
    const pr = this.prog = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
    this.loc = { p: gl.getAttribLocation(pr, 'p'), t: gl.getAttribLocation(pr, 't'), a: gl.getUniformLocation(pr, 'a'), crop: gl.getUniformLocation(pr, 'crop'), s: gl.getUniformLocation(pr, 's') };
    this.buf = gl.createBuffer();
    this.texCache = new WeakMap();
    this.fbo = null; this.fboTex = null; this.fw = 0; this.fh = 0;
    this.running = true;
    const loop = () => { if (!this.running) return; try { this.frame(); } catch (e) { /* keep going */ } this.raf = win.requestAnimationFrame(loop); };
    this.raf = win.requestAnimationFrame(loop);
  }
  destroy() { this.running = false; try { this.win.cancelAnimationFrame(this.raf); } catch { /* ignore */ } this.cv.remove(); }
  tex(src) {
    const gl = this.gl;
    let t = this.texCache.get(src);
    if (!t) {
      t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.texCache.set(src, t);
    }
    gl.bindTexture(gl.TEXTURE_2D, t);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); } catch { return null; }
    return t;
  }
  drawTris(verts, tex, alpha, crop = [0, 0, 1, 1]) {
    const gl = this.gl, L = this.loc;
    gl.useProgram(this.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(L.p); gl.vertexAttribPointer(L.p, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(L.t); gl.vertexAttribPointer(L.t, 2, gl.FLOAT, false, 16, 8);
    gl.uniform1f(L.a, alpha); gl.uniform4f(L.crop, crop[0], crop[1], crop[2], crop[3]); gl.uniform1i(L.s, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / 4);
  }
  // subdivided quad: position via `pos(u,v)`, texture via `uv(u,v)`
  grid(pos, uv, n = 12) {
    const out = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n, v0 = j / n, v1 = (j + 1) / n;
      const P = [[u0, v0], [u1, v0], [u1, v1], [u0, v0], [u1, v1], [u0, v1]];
      for (const [u, v] of P) { const [x, y] = pos(u, v); const [s, t] = uv(u, v); out.push(x, y, s, t); }
    }
    return out;
  }
  textSnapshot(el) {
    // text layers are DOM; render them to an image via SVG foreignObject for the GPU path
    const key = `${el._inner ? el._inner.textContent : ''}|${this.win.innerWidth}x${this.win.innerHeight}`;
    if (el._snapKey === key || el._snapBusy) return el._snap || null;
    el._snapBusy = true;
    const W = this.win.innerWidth, H = this.win.innerHeight;
    const clone = el.cloneNode(true);
    clone.style.opacity = '1'; clone.style.transform = ''; clone.style.clipPath = '';
    Object.assign(clone.style, { left: '0', top: '0', right: '0', bottom: '0', width: '100%', height: '100%' });
    const html = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${W}px;height:${H}px">${html}</div></foreignObject></svg>`;
    const img = new this.win.Image();
    img.onload = () => {
      const cv = el._snapCanvas || (el._snapCanvas = this.win.document.createElement('canvas'));
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d'); g.clearRect(0, 0, W, H); g.drawImage(img, 0, 0);
      el._snap = cv; el._snapKey = key; el._snapBusy = false;
    };
    img.onerror = () => { el._snapBusy = false; el._snapKey = key; };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return el._snap || null;
  }
  frame() {
    const gl = this.gl, win = this.win, dpr = win.devicePixelRatio || 1;
    const W = Math.max(2, Math.round(win.innerWidth * dpr)), H = Math.max(2, Math.round(win.innerHeight * dpr));
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    if (!this.fbo || this.fw !== W || this.fh !== H) {
      if (this.fbo) { gl.deleteFramebuffer(this.fbo); gl.deleteTexture(this.fboTex); }
      this.fboTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTex, 0);
      this.fw = W; this.fh = H;
    }
    // ---- pass 1: composite layers into the framebuffer (in flat surface space)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, W, H);
    const bg = (this.s.bg || '#000000').replace('#', '');
    gl.clearColor(parseInt(bg.substr(0, 2), 16) / 255 || 0, parseInt(bg.substr(2, 2), 16) / 255 || 0, parseInt(bg.substr(4, 2), 16) / 255 || 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const stage = win.document.getElementById('stage');
    const layers = [...stage.children].filter((e) => e.classList.contains('layer') || e.id === 'testpattern')
      .sort((a, b) => (Number(a.style.zIndex) || 0) - (Number(b.style.zIndex) || 0));
    const A = W / H;
    for (const el of layers) {
      const op = el.id === 'testpattern' ? 1 : Number(el.style.opacity || 1);
      if (op <= 0.001) continue;
      let src = el, sw = 0, sh = 0;
      if (el.tagName === 'VIDEO') { if (el.readyState < 2) continue; sw = el.videoWidth; sh = el.videoHeight; }
      else if (el.tagName === 'IMG') { if (!el.complete || !el.naturalWidth) continue; sw = el.naturalWidth; sh = el.naturalHeight; }
      else if (el.tagName === 'CANVAS') { sw = el.width; sh = el.height; }
      else { src = this.textSnapshot(el); if (!src) continue; sw = src.width; sh = src.height; }
      if (!sw || !sh) continue;
      const tex = this.tex(src); if (!tex) continue;
      const c = el._cue || {};
      const fit = el.tagName === 'DIV' || el.id === 'testpattern' ? 'fill' : (c.fit || 'contain');
      // fitted rectangle inside the unit square + texture window for "cover"
      let rx = 0, ry = 0, rw = 1, rh = 1, u0 = 0, v0 = 0, u1 = 1, v1 = 1;
      const qd = QP.cueQuad(c);
      const boxA = A * (Math.hypot((qd[1][0] - qd[0][0]), (qd[1][1] - qd[0][1])) / Math.max(1e-6, Math.hypot((qd[3][0] - qd[0][0]), (qd[3][1] - qd[0][1]))));
      const sa = sw / sh;
      if (fit === 'contain') { if (sa > boxA) { rh = boxA / sa; ry = (1 - rh) / 2; } else { rw = sa / boxA; rx = (1 - rw) / 2; } }
      else if (fit === 'cover') { if (sa > boxA) { const k = boxA / sa; u0 = (1 - k) / 2; u1 = u0 + k; } else { const k = sa / boxA; v0 = (1 - k) / 2; v1 = v0 + k; } }
      const Hm = QP.homographyMatrix(QP.UNIT, qd);
      const g = c.geo || {};
      const crop = [QP.clamp(Number(g.cropL) || 0, 0, 100) / 100, QP.clamp(Number(g.cropT) || 0, 0, 100) / 100, 1 - QP.clamp(Number(g.cropR) || 0, 0, 100) / 100, 1 - QP.clamp(Number(g.cropB) || 0, 0, 100) / 100];
      const verts = this.grid((u, v) => Hm(rx + u * rw, ry + v * rh), (u, v) => [u0 + u * (u1 - u0), v0 + v * (v1 - v0)], 10);
      const mirrored = !!c.mirror;
      if (mirrored) for (let k = 2; k < verts.length; k += 4) verts[k] = 1 - verts[k];
      this.drawTris(verts, tex, op, [crop[0] * (u1 - u0) + u0, crop[1] * (v1 - v0) + v0, u0 + crop[2] * (u1 - u0), v0 + crop[3] * (v1 - v0)]);
    }
    // ---- pass 2: draw the framebuffer through the warp mesh to the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);
    const m = QP.meshOf(this.s);
    const verts = [];
    const pt = (i, j) => m.pts[j * m.cols + i];
    const bil = (a, b, c2, d, u, v) => [(1 - u) * (1 - v) * a[0] + u * (1 - v) * b[0] + u * v * c2[0] + (1 - u) * v * d[0], (1 - u) * (1 - v) * a[1] + u * (1 - v) * b[1] + u * v * c2[1] + (1 - u) * v * d[1]];
    for (let j = 0; j < m.rows - 1; j++) for (let i = 0; i < m.cols - 1; i++) {
      const a = pt(i, j), b = pt(i + 1, j), c2 = pt(i + 1, j + 1), d = pt(i, j + 1);
      const su = i / (m.cols - 1), sv = j / (m.rows - 1), du = 1 / (m.cols - 1), dv = 1 / (m.rows - 1);
      verts.push(...this.grid((u, v) => bil(a, b, c2, d, u, v), (u, v) => [su + u * du, 1 - (sv + v * dv)], 8));
    }
    this.drawTris(verts, this.fboTex, 1);
  }
};

// mesh of a surface (falls back to its corner-pin, or the identity)
QP.meshOf = (s) => {
  const m = s.mesh;
  if (m && m.pts && m.pts.length === m.cols * m.rows) return m;
  const c = s.corners && s.corners.length === 4 ? s.corners : QP.UNIT;
  return { cols: 2, rows: 2, pts: [c[0], c[1], c[3], c[2]] };
};
QP.newMesh = (cols, rows, from) => {
  const base = from && from.corners && from.corners.length === 4 ? from.corners : QP.UNIT;
  const Hm = QP.homographyMatrix(QP.UNIT, base);
  const pts = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) pts.push(Hm(i / (cols - 1), j / (rows - 1)));
  return { cols, rows, pts };
};

// ------------------------------------------------------------------ on-output editors
QP.pointEditor = (win, { points, lines, closed, color = '#22d3ee', help, onChange, onDone }) => {
  // generic draggable-point overlay inside an output window
  const doc = win.document;
  const old = doc.getElementById('qf-editor'); if (old) old._close();
  const ov = doc.createElement('div'); ov.id = 'qf-editor';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9800;cursor:default';
  doc.body.style.cursor = 'default';
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg'); svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none');
  ov.appendChild(svg);
  const tip = doc.createElement('div');
  tip.style.cssText = 'position:absolute;left:50%;top:18px;transform:translateX(-50%);background:rgba(0,0,0,.8);color:#fff;font:14px sans-serif;padding:8px 14px;border-radius:8px;border:1px solid ' + color + ';pointer-events:none;white-space:nowrap';
  tip.textContent = help;
  ov.appendChild(tip);
  let active = 0, handles = [];
  const W = () => win.innerWidth, H = () => win.innerHeight;
  const draw = () => {
    while (svg.firstChild) svg.firstChild.remove();
    for (const [a, b] of lines()) {
      const l = doc.createElementNS(ns, 'line');
      l.setAttribute('x1', points[a][0] * W()); l.setAttribute('y1', points[a][1] * H()); l.setAttribute('x2', points[b][0] * W()); l.setAttribute('y2', points[b][1] * H());
      l.setAttribute('stroke', color); l.setAttribute('stroke-width', '1.5'); l.setAttribute('opacity', '.85');
      svg.appendChild(l);
    }
    handles.forEach((hd) => hd.remove());
    handles = points.map((p, i) => {
      const hd = doc.createElement('div');
      hd.style.cssText = `position:absolute;left:${p[0] * W()}px;top:${p[1] * H()}px;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;border:2px solid ${i === active ? '#fff' : color};background:${i === active ? color : 'rgba(0,0,0,.4)'};cursor:move`;
      hd.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation(); active = i; draw();
        const mv = (m) => { points[i] = [QP.clamp(m.clientX / W(), -0.5, 1.5), QP.clamp(m.clientY / H(), -0.5, 1.5)]; draw(); onChange(points); };
        const up = () => { win.removeEventListener('mousemove', mv); win.removeEventListener('mouseup', up); onChange(points, true); };
        win.addEventListener('mousemove', mv); win.addEventListener('mouseup', up);
      });
      ov.appendChild(hd);
      return hd;
    });
  };
  const key = (e) => {
    const d = e.shiftKey ? 0.01 : 0.001;
    const k = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
    if (k && points[active]) { e.preventDefault(); points[active] = [points[active][0] + k[0], points[active][1] + k[1]]; draw(); onChange(points, true); }
    else if (e.key === 'Tab') { e.preventDefault(); active = (active + (e.shiftKey ? points.length - 1 : 1)) % points.length; draw(); }
    else if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); close(); }
  };
  const close = () => { win.removeEventListener('keydown', key); ov.remove(); doc.body.style.cursor = ''; if (onDone) onDone(); };
  ov._close = close;
  win.addEventListener('keydown', key);
  win.addEventListener('resize', draw);
  doc.body.appendChild(ov);
  draw();
  win.focus();
  return { close, redraw: draw };
};
QP.polygonDrawer = (win, { color = '#f97316', onDone }) => {
  // click to add mask points; Enter / double-click to finish; Esc to cancel
  const doc = win.document;
  const pts = [];
  const ov = doc.createElement('div'); ov.id = 'qf-editor';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9800;cursor:crosshair';
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg'); svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none');
  const poly = doc.createElementNS(ns, 'polygon'); poly.setAttribute('fill', 'rgba(249,115,22,.25)'); poly.setAttribute('stroke', color); poly.setAttribute('stroke-width', '2');
  svg.appendChild(poly); ov.appendChild(svg);
  const tip = doc.createElement('div');
  tip.style.cssText = 'position:absolute;left:50%;top:18px;transform:translateX(-50%);background:rgba(0,0,0,.8);color:#fff;font:14px sans-serif;padding:8px 14px;border-radius:8px;border:1px solid ' + color;
  tip.textContent = 'Click to add mask points · Enter or double-click to finish · Esc to cancel';
  ov.appendChild(tip);
  const draw = () => poly.setAttribute('points', pts.map(([x, y]) => `${x * win.innerWidth},${y * win.innerHeight}`).join(' '));
  const finish = (ok) => { win.removeEventListener('keydown', key); ov.remove(); onDone(ok && pts.length >= 3 ? pts : null); };
  ov.addEventListener('click', (e) => { pts.push([e.clientX / win.innerWidth, e.clientY / win.innerHeight]); draw(); });
  ov.addEventListener('dblclick', (e) => { e.preventDefault(); pts.pop(); finish(true); });
  const key = (e) => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); else if (e.key === 'Backspace') { pts.pop(); draw(); } };
  win.addEventListener('keydown', key);
  doc.body.appendChild(ov);
  win.focus();
};
