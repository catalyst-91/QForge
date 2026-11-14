'use strict';
// QForge keyer: green/blue-screen (chroma) key, luma key and background removal for
// video, camera and image layers. Renders the source through a WebGL shader onto a canvas
// that takes the layer's place in the output window.
window.QP = window.QP || {};

QP.hexToRgb = (hex) => {
  const s = String(hex || '#00ff00').replace('#', '');
  return [0, 2, 4].map((i) => (parseInt(s.substr(i, 2), 16) || 0) / 255);
};
QP.keyActive = (c) => !!(c && c.key && c.key.mode && c.key.mode !== 'off');

// Background removal for still images: flood-fill from the borders through pixels close to the
// border colour, then feather the edge. Works best on plain / studio backgrounds.
QP.removeBackground = (img, opts = {}) => {
  const maxW = 2048;
  const sw = img.naturalWidth || img.videoWidth || img.width, sh = img.naturalHeight || img.videoHeight || img.height;
  const k = Math.min(1, maxW / Math.max(sw, sh));
  const W = Math.max(1, Math.round(sw * k)), H = Math.max(1, Math.round(sh * k));
  const cv = (img.ownerDocument || document).createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  const id = g.getImageData(0, 0, W, H), d = id.data;
  // reference colour: median of the border pixels (per channel)
  const border = [];
  const step = Math.max(1, Math.floor((W + H) / 400));
  for (let x = 0; x < W; x += step) border.push((x) * 4, ((H - 1) * W + x) * 4);
  for (let y = 0; y < H; y += step) border.push((y * W) * 4, (y * W + W - 1) * 4);
  const med = [0, 1, 2].map((ch) => { const v = border.map((i) => d[i + ch]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; });
  const ref = opts.color ? QP.hexToRgb(opts.color).map((v) => v * 255) : med;
  const tol = (Number(opts.tolerance ?? 18) / 100) * 441;   // % of max RGB distance
  const dist = (i) => Math.hypot(d[i] - ref[0], d[i + 1] - ref[1], d[i + 2] - ref[2]);
  const bg = new Uint8Array(W * H);
  const q = new Int32Array(W * H); let qh = 0, qt = 0;
  const push = (p) => { if (!bg[p] && dist(p * 4) <= tol) { bg[p] = 1; q[qt++] = p; } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (qh < qt) {
    const p = q[qh++], x = p % W;
    if (x > 0) push(p - 1); if (x < W - 1) push(p + 1);
    if (p >= W) push(p - W); if (p < W * (H - 1)) push(p + W);
  }
  // alpha mask + feather (two box-blur passes)
  let a = new Float32Array(W * H);
  for (let i = 0; i < a.length; i++) a[i] = bg[i] ? 0 : 1;
  const r = Math.max(0, Math.round(Number(opts.feather ?? 2) * k));
  if (r > 0) {
    const tmp = new Float32Array(W * H);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * W + QP.clamp(x, 0, W - 1)]; for (let x = 0; x < W; x++) { tmp[y * W + x] = s / (2 * r + 1); s += a[y * W + Math.min(W - 1, x + r + 1)] - a[y * W + Math.max(0, x - r)]; } }
      for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[QP.clamp(y, 0, H - 1) * W + x]; for (let y = 0; y < H; y++) { a[y * W + x] = s / (2 * r + 1); s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; } }
    }
  }
  for (let i = 0; i < a.length; i++) d[i * 4 + 3] = Math.round(d[i * 4 + 3] * a[i]);
  g.putImageData(id, 0, 0);
  a = null;
  return cv;
};

QP.Keyer = class Keyer {
  constructor(doc, source, params) {
    this.doc = doc; this.win = doc.defaultView; this.src = source;
    this.canvas = doc.createElement('canvas');
    this.params = { ...params };
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL is not available for keying');
    this.gl = gl;
    const vs = 'attribute vec2 p;varying vec2 v;void main(){v=vec2((p.x+1.0)*0.5,1.0-(p.y+1.0)*0.5);gl_Position=vec4(p,0.0,1.0);}';
    const fs = `precision mediump float;varying vec2 v;uniform sampler2D t;uniform vec3 key;uniform float sim,smo,spill,inv;uniform int mode;
      vec2 uv(vec3 c){return vec2(c.r*-0.169+c.g*-0.331+c.b*0.5+0.5,c.r*0.5+c.g*-0.419+c.b*-0.081+0.5);}
      void main(){vec4 c=texture2D(t,v);float a=1.0;
        if(mode==1){float d=distance(uv(c.rgb),uv(key));float b=d-sim;a=clamp(b/max(smo,0.002),0.0,1.0);
          float sp=pow(clamp(b/max(spill,0.002),0.0,1.0),1.5);float l=dot(c.rgb,vec3(0.2126,0.7152,0.0722));c.rgb=mix(vec3(l),c.rgb,sp);}
        else if(mode==2){float l=dot(c.rgb,vec3(0.2126,0.7152,0.0722));if(inv>0.5)l=1.0-l;a=clamp((l-sim)/max(smo,0.002),0.0,1.0);}
        gl_FragColor=vec4(c.rgb,c.a*a);}`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
    gl.useProgram(pr); this.pr = pr;
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.u = Object.fromEntries(['key', 'sim', 'smo', 'spill', 'inv', 'mode'].map((n) => [n, gl.getUniformLocation(pr, n)]));
    this.dirty = true; this.alive = true;
    this.isStill = source.tagName === 'IMG';
    this.prepare();
    const loop = () => { if (!this.alive) return; this.render(); this.raf = this.win.requestAnimationFrame(loop); };
    this.raf = this.win.requestAnimationFrame(loop);
  }
  prepare() {
    // background removal is done once on the CPU for stills
    this.cpuSrc = null;
    if (this.params.mode === 'bgremove' && this.isStill) {
      try { this.cpuSrc = QP.removeBackground(this.src, { tolerance: this.params.tolerance, feather: this.params.feather, color: this.params.bgAuto === false ? this.params.color : null }); } catch (e) { console.error(e); }
    }
    if (this.params.mode === 'chroma' && this.params.autoColor) this.autoPick = true;
    this.dirty = true;
  }
  set(params) {
    const old = this.params;
    this.params = { ...params };
    if (old.mode !== params.mode || old.tolerance !== params.tolerance || old.feather !== params.feather || old.color !== params.color || old.bgAuto !== params.bgAuto) this.prepare();
    this.dirty = true;
  }
  sample(src) {
    // pick the key colour from the frame's corners (for "auto" chroma key)
    try {
      const c = this.doc.createElement('canvas'); c.width = 16; c.height = 16;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, 16, 16);
      const d = g.getImageData(0, 0, 16, 16).data;
      const px = [0, 15, 240, 255].map((i) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
      const avg = [0, 1, 2].map((k) => Math.round(px.reduce((s, p) => s + p[k], 0) / 4));
      this.params.color = '#' + avg.map((v) => v.toString(16).padStart(2, '0')).join('');
      this.autoPick = false;
      if (this.onPick) this.onPick(this.params.color);
    } catch { /* not ready yet */ }
  }
  render() {
    const src = this.cpuSrc || this.src;
    let sw, sh;
    if (src.tagName === 'VIDEO') { if (src.readyState < 2) return; sw = src.videoWidth; sh = src.videoHeight; }
    else if (src.tagName === 'IMG') { if (!src.complete || !src.naturalWidth) return; sw = src.naturalWidth; sh = src.naturalHeight; }
    else { sw = src.width; sh = src.height; }
    if (!sw || !sh) return;
    if (this.isStill && !this.dirty) return;
    if (this.autoPick) this.sample(src);
    const k = Math.min(1, 1920 / Math.max(sw, sh));
    const W = Math.round(sw * k), H = Math.round(sh * k);
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    const gl = this.gl, p = this.params;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); } catch { return; }
    const mode = p.mode === 'chroma' ? 1 : p.mode === 'luma' ? 2 : 0;
    gl.uniform1i(this.u.mode, this.cpuSrc ? 0 : mode);
    gl.uniform3fv(this.u.key, QP.hexToRgb(p.color || '#00ff00'));
    gl.uniform1f(this.u.sim, mode === 2 ? Number(p.threshold ?? 15) / 100 : Number(p.similarity ?? 40) / 100 * 0.5);
    gl.uniform1f(this.u.smo, Number(p.smoothness ?? 8) / 100 * 0.5);
    gl.uniform1f(this.u.spill, Number(p.spill ?? 10) / 100);
    gl.uniform1f(this.u.inv, p.invert ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.dirty = false;
  }
  destroy() {
    this.alive = false;
    try { this.win.cancelAnimationFrame(this.raf); } catch { /* window gone */ }
    try { const ext = this.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch { /* ignore */ }
    this.canvas.remove();
  }
};
