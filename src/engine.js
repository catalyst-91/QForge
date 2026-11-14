'use strict';
// QForge playback engine: audio (Web Audio), video/image output window, fades,
// groups (timeline / sequence / playlist / shuffle, with loops) and cue progression.
window.QP = window.QP || {};

QP.dbToGain = (db) => (db <= -60 ? 0 : Math.pow(10, db / 20));
QP.gainToDb = (g) => (g <= 0.001 ? -60 : 20 * Math.log10(g));
QP.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
QP.isImagePath = (p) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(QP.platform.nameOf(p) || '');

// ------------------------------------------------------------------ cue tree helpers
QP.Tree = {
  walk(list, fn, parent = null, depth = 0) {
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (fn(c, parent, depth, list, i) === false) return false;
      if (c.type === 'group' && Array.isArray(c.children)) {
        if (QP.Tree.walk(c.children, fn, c, depth + 1) === false) return false;
      }
    }
    return true;
  },
  find(list, id) {
    let found = null;
    QP.Tree.walk(list, (c, parent, depth, l, index) => {
      if (c.id === id) { found = { cue: c, parent, list: l, index, depth }; return false; }
      return true;
    });
    return found;
  },
  all(list) { const out = []; QP.Tree.walk(list, (c) => { out.push(c); }); return out; },
  isAncestor(list, ancestorId, id) {
    const a = QP.Tree.find(list, ancestorId);
    if (!a || a.cue.type !== 'group') return false;
    return !!QP.Tree.find(a.cue.children, id);
  },
};

// ------------------------------------------------------------------ fade ramp model
QP.Ramp = class Ramp {
  constructor(v) { this.from = v; this.to = v; this.t0 = 0; this.dur = 0; this.curve = 'linear'; }
  value(now) {
    if (this.dur <= 0 || now >= this.t0 + this.dur) return this.to;
    const p = QP.clamp((now - this.t0) / this.dur, 0, 1);
    if (this.curve === 'exp') {
      const a = QP.gainToDb(this.from), b = QP.gainToDb(this.to);
      const db = a + (b - a) * p;
      return db <= -60 ? 0 : Math.pow(10, db / 20);
    }
    const s = this.curve === 'scurve' ? p * p * (3 - 2 * p) : this.curve === 'eqin' ? Math.sin((p * Math.PI) / 2) : this.curve === 'eqout' ? 1 - Math.cos((p * Math.PI) / 2) : p;
    return this.from + (this.to - this.from) * s;
  }
  rampTo(v, dur, curve, now) {
    this.from = this.value(now); this.to = v; this.t0 = now; this.dur = Math.max(0, dur || 0); this.curve = curve || 'linear';
  }
  shift(dt) { this.t0 += dt; }
  get moving() { return this.dur > 0; }
};

// ------------------------------------------------------------------ audio
QP.AudioEngine = class AudioEngine {
  constructor(onError) {
    this.contexts = new Map();
    this.buffers = new Map();
    this.loading = new Map();
    this.masterDb = 0;
    this.onError = onError || (() => {});
  }
  ctx(deviceId = '') {
    let c = this.contexts.get(deviceId);
    if (!c) {
      c = new AudioContext({ latencyHint: 'interactive' });
      c.master = c.createGain();
      c.master.gain.value = QP.dbToGain(this.masterDb) * (this.muted ? 0 : 1);
      c.deviceId = deviceId;
      c.post = c.createGain();          // after master: output processing + limiter insert here
      c.master.connect(c.post);
      c.post.connect(c.destination);
      QP.AudioEngine.configure(c);
      this.setupLimiter(c);
      if (deviceId && c.setSinkId) {
        c.setSinkId(deviceId).then(() => { QP.AudioEngine.configure(c); this.setupLimiter(c); })
          .catch((e) => this.onError(`Audio device unavailable (${e.message}) — using default output`));
      }
      this.contexts.set(deviceId, c);
    }
    if (c.state === 'suspended') c.resume();
    return c;
  }
  static configure(c) {
    // open every output channel of the device so cues can be routed to any of them
    const n = Math.max(2, Math.min(32, c.destination.maxChannelCount || 2));
    try {
      c.destination.channelCount = n;
      c.destination.channelInterpretation = 'discrete';
      c.master.channelCount = n;
      c.master.channelCountMode = 'explicit';
      c.master.channelInterpretation = 'discrete';
    } catch { /* device refused — stay stereo */ }
    c.outChannels = c.destination.channelCount || 2;
    try { c.post.channelCount = c.outChannels; c.post.channelCountMode = 'explicit'; c.post.channelInterpretation = 'discrete'; } catch { /* ignore */ }
    if (c.meterSplit) QP.AudioEngine.setupMeters(c);
  }
  static setupMeters(c) {
    // per-output-channel analysers (up to 8) tapped after the limiter
    try { if (c.meterSplit) c.meterSplit.disconnect(); } catch { /* ignore */ }
    const n = Math.min(8, c.outChannels || 2);
    c.meterSplit = c.createChannelSplitter(c.outChannels || 2);
    (c.tail || c.post).connect(c.meterSplit);
    c.meters = [];
    for (let i = 0; i < n; i++) { const a = c.createAnalyser(); a.fftSize = 1024; c.meterSplit.connect(a, i); c.meters.push(a); }
  }
  setupLimiter(c) {
    // rebuild: post -> [per-output delay/trim/polarity/mute] -> [limiter] -> destination
    try { c.post.disconnect(); } catch { /* ignore */ }
    for (const n of c.procNodes || []) { try { n.disconnect(); } catch { /* ignore */ } }
    c.procNodes = [];
    if (c.limiter) { try { c.limiter.disconnect(); } catch { /* ignore */ } c.limiter = null; }
    const n = c.outChannels || 2;
    let tail = c.post;
    const proc = this.outputProc ? this.outputProc(c.deviceId || '') : null;
    if (proc && proc.some((p) => p && (p.delay || p.trim || p.mute || p.invert))) {
      const split = c.createChannelSplitter(n);
      const merge = c.createChannelMerger(n);
      tail.connect(split);
      for (let i = 0; i < n; i++) {
        const p = proc[i] || {};
        const d = c.createDelay(1.0); d.delayTime.value = QP.clamp((Number(p.delay) || 0) / 1000, 0, 1);
        const g = c.createGain(); g.gain.value = p.mute ? 0 : QP.dbToGain(Number(p.trim) || 0) * (p.invert ? -1 : 1);
        split.connect(d, i); d.connect(g); g.connect(merge, 0, i);
        c.procNodes.push(d, g);
      }
      c.procNodes.push(split, merge);
      tail = merge;
    }
    // DynamicsCompressor is stereo-only, so the limiter is used on stereo devices only (never downmix a multichannel rig)
    if (this.limiterOn && n <= 2) {
      const l = c.createDynamicsCompressor();
      l.threshold.value = this.limiterCeiling ?? -1; l.knee.value = 0; l.ratio.value = 20; l.attack.value = 0.002; l.release.value = 0.1;
      tail.connect(l);
      tail = l;
      c.limiter = l;
    }
    tail.connect(c.destination);
    c.tail = tail;
    QP.AudioEngine.setupMeters(c);
  }
  // network displays: a stereo feed of this device's mix (after master volume / mute)
  netStream(deviceId = '') {
    const c = this.ctx(deviceId);
    if (!c.netDest) {
      c.netTap = c.createGain();
      c.netTap.channelCount = 2; c.netTap.channelCountMode = 'explicit'; c.netTap.channelInterpretation = 'speakers';
      c.netDest = c.createMediaStreamDestination();
      c.master.connect(c.netTap);
      c.netTap.connect(c.netDest);
    }
    return c.netDest.stream;
  }
  setOutputProc(fn) { this.outputProc = fn; for (const c of this.contexts.values()) this.setupLimiter(c); }
  refreshOutputs() { for (const c of this.contexts.values()) this.setupLimiter(c); }
  setLimiter(on, ceiling) { this.limiterOn = !!on; this.limiterCeiling = ceiling; for (const c of this.contexts.values()) this.setupLimiter(c); }
  limiterActive(c) { return !!(c && c.limiter); }
  setMuted(m) {
    this.muted = !!m;
    for (const c of this.contexts.values()) c.master.gain.setTargetAtTime(this.muted ? 0 : QP.dbToGain(this.masterDb), c.currentTime, 0.02);
  }
  meterLevels() {
    // returns [{device, levels:[{peak, rms}], limiting}] — peak/rms are linear 0..1+
    const out = [];
    if (!this.buf) this.buf = new Float32Array(1024);
    for (const [dev, c] of this.contexts) {
      if (!c.meters) continue;
      const levels = c.meters.map((a) => {
        a.getFloatTimeDomainData(this.buf);
        let pk = 0, sum = 0;
        for (let i = 0; i < this.buf.length; i++) { const v = Math.abs(this.buf[i]); if (v > pk) pk = v; sum += v * v; }
        return { peak: pk, rms: Math.sqrt(sum / this.buf.length) };
      });
      out.push({ device: dev, levels, limiting: c.limiter ? c.limiter.reduction < -0.5 : false });
    }
    return out;
  }
  channels(deviceId = '') { return this.ctx(deviceId).outChannels || 2; }
  resumeAll() { for (const c of this.contexts.values()) if (c.state === 'suspended') c.resume(); }
  setMaster(db) {
    this.masterDb = db;
    for (const c of this.contexts.values()) c.master.gain.setTargetAtTime(this.muted ? 0 : QP.dbToGain(db), c.currentTime, 0.02);
  }
  load(path) {
    if (!path) return Promise.reject(new Error('No file'));
    if (this.buffers.has(path)) return Promise.resolve(this.buffers.get(path));
    if (this.loading.has(path)) return this.loading.get(path);
    const p = (async () => {
      const res = await fetch(QP.platform.mediaUrl(path));
      if (!res.ok) throw new Error(`Cannot read file (${res.status})`);
      const ab = await res.arrayBuffer();
      const buf = await this.ctx('').decodeAudioData(ab);
      buf.peaks = QP.AudioEngine.peaks(buf, 1600);
      this.buffers.set(path, buf);
      return buf;
    })();
    this.loading.set(path, p);
    p.finally(() => this.loading.delete(path)).catch(() => {});
    return p;
  }
  static peaks(buf, buckets) {
    const out = new Float32Array(buckets);
    const chans = Math.min(buf.numberOfChannels, 2);
    const len = buf.length;
    const per = Math.max(1, Math.floor(len / buckets));
    const stride = Math.max(1, Math.floor(per / 400));
    for (let ch = 0; ch < chans; ch++) {
      const d = buf.getChannelData(ch);
      for (let b = 0; b < buckets; b++) {
        let m = out[b];
        const s0 = b * per, s1 = Math.min(len, s0 + per);
        for (let s = s0; s < s1; s += stride) { const v = Math.abs(d[s]); if (v > m) m = v; }
        out[b] = m;
      }
    }
    return out;
  }
};

// ------------------------------------------------------------------ runtime
QP.VISUAL_TYPES = ['video', 'text', 'camera'];

QP.parseDmxValues = (str) => {
  // "1@255, 2-10@50%, 20@full, 30>40@0"
  const out = [];
  for (const part of String(str || '').split(/[,;\n]+/)) {
    const m = /^\s*(\d+)\s*(?:(?:-|>|thru)\s*(\d+))?\s*@\s*(full|ff|[\d.]+%?)\s*$/i.exec(part);
    if (!m) continue;
    const a = QP.clamp(parseInt(m[1], 10), 1, 512), b = QP.clamp(parseInt(m[2] || m[1], 10), 1, 512);
    let v = m[3].toLowerCase();
    v = v === 'full' || v === 'ff' ? 255 : v.endsWith('%') ? Math.round(parseFloat(v) * 2.55) : parseInt(v, 10);
    v = QP.clamp(v || 0, 0, 255);
    for (let ch = Math.min(a, b); ch <= Math.max(a, b); ch++) out.push({ ch, v });
  }
  return out;
};

QP.Runtime = class Runtime {
  constructor(hooks) {
    // hooks: findCue(id), siblingsOf(id), getSettings(), setPlayhead(id), onChange(), error(msg), log(kind,msg)
    this.hooks = hooks;
    this.runs = [];
    this.nextId = 1;
    this.audio = new QP.AudioEngine((m) => hooks.error(m));
    this.output = new QP.OutputManager(() => hooks.getSettings());
    this.output.onClosed = (sid) => {
      for (const r of this.runs) if (QP.VISUAL_TYPES.includes(r.cue.type) && (this.output.surface(r.cue.surface).id === sid)) this.finish(r, true);
      hooks.onChange();
    };
    this.dmx = new Map();
    this.lastDmxSend = 0;
    this.timer = setInterval(() => this.tick(), 10);
  }
  now() { return performance.now() / 1000; }
  settings() { return this.hooks.getSettings(); }
  findCue(id) { return this.hooks.findCue(id); }
  log(kind, msg) { if (this.hooks.log) this.hooks.log(kind, msg); }
  label(c) { return `${c.number ? c.number + ' ' : ''}${c.name || c.type}`; }
  runsFor(cueId) { return this.runs.filter((r) => r.cueId === cueId && r.state !== 'done'); }
  childrenOf(run) { return this.runs.filter((r) => r.parentRun === run && r.state !== 'done'); }
  descendantsOf(run) {
    const out = [];
    const rec = (p) => { for (const k of this.runs) if (k.parentRun === p && k.state !== 'done') { out.push(k); rec(k); } };
    rec(run);
    return out;
  }
  segment(c, dur) {
    const start = QP.clamp(Number(c.start) || 0, 0, Math.max(0, dur - 0.01));
    const end = Number(c.end) > 0 ? QP.clamp(Number(c.end), start + 0.01, dur) : dur;
    return { start, end, len: Math.max(0.01, end - start) };
  }

  // ---- firing
  fire(cue, opts = {}) {
    if (!cue) return null;
    const now = this.now();
    const parent = opts.parentRun || null;
    const groupDriven = parent && ['all', 'playlist', 'shuffle'].includes(parent.cue.mode);
    const run = {
      id: this.nextId++, cue: structuredClone(cue), cueId: cue.id, parentRun: parent,
      state: 'prewait', tFire: now, startedAt: Date.now(), preEnd: now + (opts.preview ? 0 : Number(cue.preWait) || 0),
      actionStart: null, actionDur: 0, actionDone: false, cleaned: false,
      continued: !!opts.preview || groupDriven || cue.continueMode === 'none' || !cue.continueMode,
      stopped: false, paused: false, preview: !!opts.preview, offset: opts.offset, fadeInOverride: opts.fadeIn, slideDur: opts.slideDur,
    };
    this.runs.push(run);
    if (!parent) this.log('fire', `${opts.preview ? 'Preview' : 'Start'} ${this.label(cue)}`);
    if (run.preEnd <= now) this.startAction(run);
    this.hooks.onChange();
    return run;
  }

  startAction(run) {
    run.state = 'action';
    run.actionStart = this.now();
    const c = run.cue;
    if (c.armed === false) { run.actionDone = true; return; }
    if (['audio', 'video', 'text', 'camera', 'mic'].includes(c.type) && c.xfade && c.xfade !== 'off' && !run.preview) this.beginCrossfade(run);
    try {
      switch (c.type) {
        case 'audio': this.startAudio(run); break;
        case 'mic': this.startMic(run); break;
        case 'video': case 'text': case 'camera': this.startVisual(run); break;
        case 'group': this.startGroup(run); break;
        case 'fade': this.doFade(run); run.actionDur = Number(c.duration) || 0; break;
        case 'stop': this.doStop(run); run.actionDur = c.action === 'stop' ? Number(c.fadeTime) || 0 : 0; break;
        case 'start': { const t = this.findCue(c.target); if (t) this.fire(t); else this.hooks.error(`Cue ${c.number || ''}: no target`); run.actionDone = true; break; }
        case 'goto': { if (c.target) this.hooks.setPlayhead(c.target); run.actionDone = true; break; }
        case 'wait': run.actionDur = Number(c.duration) || 0; break;
        case 'midi': if (this.rehearsal('MIDI', c)) { run.actionDone = true; break; } QP.midi.send(c); run.actionDone = true; break;
        case 'osc':
          if (this.rehearsal(`OSC ${c.address} → ${c.host}:${c.port}`, c)) { run.actionDone = true; break; }
          QP.platform.oscSend({ host: c.host, port: c.port, address: c.address, args: QP.parseOscArgs(c.args) })
            .then((r) => { if (!r.ok) this.hooks.error(`OSC cue ${c.number || ''}: ${r.error}`); });
          run.actionDone = true; break;
        case 'timecode':
          if (this.rehearsal('timecode', c)) { run.actionDur = Number(c.duration) > 0 ? Number(c.duration) : Infinity; break; }
          this.startTimecode(run); break;
        case 'light': this.startLight(run); break;
        case 'app': {
          if (this.rehearsal(`app control (${c.app} ${c.action})`, c)) { run.actionDone = true; break; }
          const fade = c.action === 'fadeVolume' ? Math.max(0, Number(c.fadeTime) || 0) : 0;
          QP.platform.appControl({ app: c.app, action: c.action, value: Number(c.value), uri: c.uri, fade })
            .then((r) => { if (!r.ok) this.hooks.error(`App cue ${c.number || ''}: ${r.error}`); else this.log('app', `${this.label(c)}: ${c.app} ${c.action}${r.info ? ' — ' + r.info : ''}`); });
          run.actionDur = fade; if (!fade) run.actionDone = true; break;
        }
        case 'ma': {
          const cmd = String(c.command || '').trim();
          if (this.rehearsal(`MA command “${cmd}”`, c)) { run.actionDone = true; break; }
          if (c.proto === 'msc') {
            QP.midi.send({ midiOut: c.midiOut, message: c.mscCommand || 'msc_go', mscDevice: Number(c.mscDevice ?? 127), mscCue: c.mscCue || '1', mscList: c.mscList || '' });
          } else if (c.proto === 'telnet') {
            if (!cmd) throw new Error('no command');
            QP.platform.telnetSend({ host: c.host, port: Number(c.port) || 30000, user: c.user, password: c.password, command: cmd })
              .then((r) => { if (!r.ok) this.hooks.error(`MA cue ${c.number || ''}: ${r.error}`); });
          } else {
            if (!cmd) throw new Error('no command');
            const prefix = String(c.oscPrefix || '').replace(/^\/+|\/+$/g, '');
            QP.platform.oscSend({ host: c.host, port: Number(c.port) || 8000, address: `${prefix ? '/' + prefix : ''}/cmd`, args: [{ type: 's', value: cmd }] })
              .then((r) => { if (!r.ok) this.hooks.error(`MA cue ${c.number || ''}: ${r.error}`); });
          }
          this.log('ma', `${this.label(c)} → ${c.proto === 'msc' ? 'MSC ' + (c.mscCommand || 'msc_go') + ' ' + (c.mscCue || '') : cmd}`);
          run.actionDone = true; break;
        }
        case 'script':
          if (this.rehearsal('script', c)) { run.actionDone = true; break; }
          QP.platform.scriptRun({ mode: c.mode, command: c.command, method: c.method, url: c.url, body: c.body, headers: c.headers })
            .then((r) => { if (!r.ok) this.hooks.error(`Script cue ${c.number || ''}: ${r.error}`); else this.log('script', `Script ${this.label(c)} OK`); });
          run.actionDone = true; break;
        default: run.actionDone = true;
      }
    } catch (e) {
      run.error = e.message; run.actionDone = true; run.loading = false;
      this.hooks.error(`Cue ${c.number || c.name || ''}: ${e.message}`);
    }
  }

  // ---- per-cue crossfade (auto = fade the others out as this fades in; manual = T-bar)
  xfadeOutgoing(run) {
    const c = run.cue, scope = c.xfadeScope || (c.type === 'audio' || c.type === 'mic' ? 'audio' : 'layer');
    const anc = new Set(); for (let p = run.parentRun; p; p = p.parentRun) anc.add(p);
    const vis = QP.VISUAL_TYPES;
    const surf = (x) => this.output.surface(x.surface).id;
    return this.runs.filter((o) => {
      if (o === run || anc.has(o) || o.preview || o.state !== 'action' || o.stopping || o.stopped || o.actionDone) return false;
      if (o.parentRun && o.parentRun === run.parentRun && run.parentRun && ['playlist', 'shuffle', 'slideshow', 'step'].includes(run.parentRun.cue.mode)) return false;
      const t = o.cue.type;
      if (scope === 'all') return ['audio', 'mic', ...vis].includes(t);
      if (scope === 'audio') return t === 'audio' || t === 'mic';
      if (scope === 'visual') return vis.includes(t);
      if (scope === 'surface') return vis.includes(t) && vis.includes(c.type) && surf(o.cue) === surf(c);
      // 'layer'
      return vis.includes(t) && vis.includes(c.type) && surf(o.cue) === surf(c) && (Number(o.cue.layer) || 1) === (Number(c.layer) || 1);
    });
  }
  beginCrossfade(run) {
    const c = run.cue, t = Math.max(0, Number(c.xfadeTime) || 0);
    const out = this.xfadeOutgoing(run);
    if (c.xfade === 'manual') {
      if (this.manual) this.takeManual(0);
      run.manualIn = true;
      this.manual = { incoming: run, outgoing: out, p: 0, time: t || 2, take: null, base: new Map(out.map((o) => [o, { lvl: o.levelRamp ? o.levelRamp.value(this.now()) : 0, op: o.opRamp ? o.opRamp.value(this.now()) : 0 }])) };
      for (const o of out) o.manualOut = true;
      this.log('xfade', `Manual crossfade ready: ${this.label(c)} (${out.length} outgoing)`);
      return;
    }
    run.fadeInOverride = run.fadeInOverride ?? t;
    run.xfCurve = 'eqin';
    for (const o of out) {
      if (QP.VISUAL_TYPES.includes(o.cue.type)) o.trOut = c.transition || 'fade';
      o.xfOut = true;
      this.stopRun(o, t);
    }
    if (out.length) this.log('xfade', `Crossfade ${t}s into ${this.label(c)} (${out.length} out)`);
  }
  setManual(p) {
    const m = this.manual; if (!m) return;
    m.p = QP.clamp(p, 0, 1);
    const now = this.now(), r = m.incoming, s = Math.sin((m.p * Math.PI) / 2), cs = Math.cos((m.p * Math.PI) / 2);
    if (r.levelRamp) r.levelRamp.rampTo(QP.dbToGain(Number(r.cue.level) || 0) * s, 0.03, 'linear', now);
    if (r.opRamp) r.opRamp.rampTo(r.opBase * m.p, 0.03, 'linear', now);
    for (const o of m.outgoing) {
      if (o.state === 'done') continue;
      const b = m.base.get(o) || { lvl: 1, op: 1 };
      if (o.levelRamp) o.levelRamp.rampTo(b.lvl * cs, 0.03, 'linear', now);
      if (o.opRamp) o.opRamp.rampTo(b.op * (1 - m.p), 0.03, 'linear', now);
      if (QP.VISUAL_TYPES.includes(o.cue.type)) o.trOut = r.cue.transition || 'fade';
    }
    if (m.p >= 1) this.finishManual();
    this.hooks.onChange();
  }
  takeManual(dur) {
    const m = this.manual; if (!m) return;
    if (!(dur > 0)) { this.setManual(1); return; }
    m.take = { from: m.p, t0: this.now(), dur };
  }
  finishManual() {
    const m = this.manual; if (!m) return;
    this.manual = null;
    for (const o of m.outgoing) { o.manualOut = false; this.stopRun(o, 0); }
    m.incoming.manualIn = false;
    this.log('xfade', `Manual crossfade complete: ${this.label(m.incoming.cue)}`);
  }
  // resolve a cue's output: '' = show default, 'patch:<id>' = named patch, otherwise a system device id
  dev(d) {
    const st = this.settings();
    let v = d || st.audioDevice || '';
    for (let i = 0; i < 3 && String(v).startsWith('patch:'); i++) {
      const p = (st.patches || []).find((x) => `patch:${x.id}` === v);
      v = p ? p.device || '' : '';
    }
    return v;
  }
  rehearsal(what, c) {
    if (!this.hooks.rehearsal || !this.hooks.rehearsal()) return false;
    this.log('rehearsal', `[rehearsal] held back ${what} from ${this.label(c)}`);
    return true;
  }
  startMic(run) {
    const c = run.cue;
    run.loading = true;
    (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: c.inputDevice ? { exact: c.inputDevice } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } }, video: false });
      if (run.state === 'done' || run.stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      run.stream = stream;
      const ctx = this.audio.ctx(this.dev(c.device));
      run.ctx = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const chans = (stream.getAudioTracks()[0].getSettings().channelCount) || 1;
      src.connect(this.buildChain(run, ctx, chans));
      run.extraNodes.push(src);
      const now = this.now();
      const lvl = QP.dbToGain(Number(c.level) || 0);
      run.levelRamp = new QP.Ramp(c.fadeIn > 0 ? 0 : lvl);
      if (c.fadeIn > 0) run.levelRamp.rampTo(lvl, Number(c.fadeIn), 'scurve', now);
      run.gain.gain.value = run.levelRamp.value(now); run.lastG = run.gain.gain.value;
      run.actionDur = Number(c.duration) > 0 ? Number(c.duration) : Infinity;
      run.micLive = true;
      run.loading = false;
      run.actionStart = this.now();
    })().catch((e) => { run.loading = false; run.error = e.message; run.actionDone = true; this.hooks.error(`Mic cue ${c.number || ''}: ${e.message}`); });
  }
  updateDucking(now, dt) {
    // any running cue with "duck others" lowers every other audio/video/mic run
    const duckers = this.runs.filter((r) => r.cue.duckOthers && r.state === 'action' && !r.actionDone && !r.paused && !r.stopping && !r.loading);
    let target = 1, attack = 0.3, release = 1.0;
    for (const d of duckers) {
      target = Math.min(target, QP.dbToGain(-(Math.abs(Number(d.cue.duckAmount)) || 12)));
      attack = Math.min(attack, Number(d.cue.duckAttack) || 0.3);
      release = Math.max(release, Number(d.cue.duckRelease) || 1);
    }
    for (const r of this.runs) {
      if (!['audio', 'video', 'mic'].includes(r.cue.type)) continue;
      const tgt = duckers.includes(r) || r.cue.duckExempt ? 1 : target;
      const cur = r.duckCur ?? 1;
      if (Math.abs(cur - tgt) < 1e-4) { r.duckCur = tgt; continue; }
      const tc = tgt < cur ? attack : release;
      r.duckCur = cur + (tgt - cur) * Math.min(1, dt / Math.max(0.01, tc / 3));
    }
  }
  runLevel(r) {
    if (!r.meter) return null;
    if (!this.mbuf) this.mbuf = new Float32Array(512);
    r.meter.getFloatTimeDomainData(this.mbuf);
    let pk = 0; for (let i = 0; i < this.mbuf.length; i++) { const v = Math.abs(this.mbuf[i]); if (v > pk) pk = v; }
    return pk;
  }

  // ---- audio
  buildChain(run, ctx, channelsIn) {
    const c = run.cue;
    let head = null, tail = null;
    const link = (n) => { if (!head) head = n; else tail.connect(n); tail = n; };
    const linkPair = (a, b) => { if (!head) head = a; else tail.connect(a); tail = b; };
    const nodes0 = [];
    if (c.vocal && c.vocal !== 'off' && channelsIn === 2) {
      // mid/side vocal tools: "remove" keeps the side signal plus low end (karaoke),
      // "isolate" keeps the band-limited centre where lead vocals usually sit
      const vin = ctx.createGain(); vin.channelCount = 2; vin.channelCountMode = 'explicit';
      const sp = ctx.createChannelSplitter(2), mg = ctx.createChannelMerger(2);
      const l = ctx.createGain(), r = ctx.createGain(), rn = ctx.createGain();
      vin.connect(sp); sp.connect(l, 0); sp.connect(r, 1); sp.connect(rn, 1); rn.gain.value = -1;
      const mid = ctx.createGain(); mid.gain.value = 0.5; l.connect(mid); r.connect(mid);
      const side = ctx.createGain(); side.gain.value = 0.5; l.connect(side); rn.connect(side);
      if (c.vocal === 'remove') {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Number(c.vocalBass) || 160;
        mid.connect(lp);
        const sideR = ctx.createGain(); sideR.gain.value = -1; side.connect(sideR);
        side.connect(mg, 0, 0); sideR.connect(mg, 0, 1); lp.connect(mg, 0, 0); lp.connect(mg, 0, 1);
        nodes0.push(lp, sideR);
      } else {
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120; hp.Q.value = 0.7;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 8000; lp.Q.value = 0.7;
        const pres = ctx.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 2800; pres.gain.value = 3; pres.Q.value = 0.8;
        mid.connect(hp); hp.connect(lp); lp.connect(pres); pres.connect(mg, 0, 0); pres.connect(mg, 0, 1);
        nodes0.push(hp, lp, pres);
      }
      nodes0.push(vin, sp, mg, l, r, rn, mid, side);
      linkPair(vin, mg);
    }
    if (c.eqOn) {
      const lo = ctx.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 200; lo.gain.value = Number(c.eqLow) || 0;
      const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = Number(c.eqMidFreq) || 1000; mid.Q.value = 0.9; mid.gain.value = Number(c.eqMid) || 0;
      const hi = ctx.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 5000; hi.gain.value = Number(c.eqHigh) || 0;
      link(lo); link(mid); link(hi);
      run.eq = [lo, mid, hi];
    }
    run.gain = ctx.createGain();
    link(run.gain);
    const nodes = [...nodes0];
    run.meter = ctx.createAnalyser(); run.meter.fftSize = 512;
    run.gain.connect(run.meter); nodes.push(run.meter);
    let routing = c.routing;
    if (c.surround && Array.isArray(c.surroundMap) && channelsIn > 2) {
      // surround: each file channel goes to the output channel chosen in the speaker map
      routing = { on: true, matrix: c.surroundMap.slice(0, channelsIn).map((o) => { const row = []; if (Number(o) >= 0) row[Number(o)] = true; return row; }) };
    }
    if (routing && routing.on && Array.isArray(routing.matrix)) {
      const outs = ctx.outChannels || 2;
      const ins = Math.max(1, Math.min(channelsIn || 2, 32));
      const split = ctx.createChannelSplitter(ins);
      const merge = ctx.createChannelMerger(outs);
      run.gain.channelCountMode = 'max';
      tail.connect(split);
      for (let i = 0; i < ins; i++) {
        const row = routing.matrix[i] || [];
        for (let o = 0; o < outs; o++) {
          const v = row[o];
          if (!v) continue;
          const g = ctx.createGain(); g.gain.value = v === true ? 1 : QP.dbToGain(Number(v));
          split.connect(g, i); g.connect(merge, 0, o);
          nodes.push(g);
        }
      }
      merge.connect(ctx.master);
      nodes.push(split, merge);
    } else {
      run.pan = ctx.createStereoPanner();
      run.pan.pan.value = QP.clamp(Number(c.pan) || 0, -1, 1);
      tail.connect(run.pan).connect(ctx.master);
      nodes.push(run.pan);
    }
    run.extraNodes = nodes;
    run.head = head;
    return head;
  }
  startAudio(run) {
    const c = run.cue;
    const rate = Number(c.rate) || 1;
    const useElement = c.preservePitch && Math.abs(rate - 1) > 0.001;
    const buf = this.audio.buffers.get(c.file);
    if (!buf && !useElement) {
      if (!c.file) throw new Error('no audio file');
      run.loading = true;
      this.audio.load(c.file).then(() => {
        if (run.state === 'done' || run.stopped) return;
        run.loading = false; run.actionStart = this.now();
        this.startAudio(run);
      }).catch((e) => { run.loading = false; run.error = e.message; run.actionDone = true; this.hooks.error(`Cue ${c.number || ''}: ${e.message}`); });
      return;
    }
    const ctx = this.audio.ctx(run.preview && this.settings().previewDevice ? this.dev(this.settings().previewDevice) : this.dev(c.device));
    run.ctx = ctx;
    const count = Number(c.playCount);
    run.loops = count === 0 ? Infinity : Math.max(1, count || 1);
    const lvl = QP.dbToGain(Number(c.level) || 0);
    const fadeIn = run.fadeInOverride ?? Number(c.fadeIn) ?? 0;
    const initRamp = () => {
      const now = this.now();
      if (run.manualIn) { const p = this.manual && this.manual.incoming === run ? this.manual.p : 0; run.levelRamp = new QP.Ramp(lvl * Math.sin((p * Math.PI) / 2)); run.gain.gain.value = run.levelRamp.value(now); run.lastG = run.gain.gain.value; return; }
      run.levelRamp = new QP.Ramp(fadeIn > 0 ? 0 : lvl);
      if (fadeIn > 0) run.levelRamp.rampTo(lvl, fadeIn, run.xfCurve || (run.fadeInOverride != null ? 'linear' : 'scurve'), now);
      run.gain.gain.value = run.levelRamp.value(now);
      run.lastG = run.gain.gain.value;
    };
    if (useElement) {
      // pitch-preserving playback through a media element
      run.loading = true;
      const el = new Audio();
      el.preload = 'auto'; el.preservesPitch = true; el.playbackRate = rate;
      el.src = QP.platform.mediaUrl(c.file);
      el.onloadedmetadata = () => {
        if (run.state === 'done' || run.stopped) return;
        run.seg = this.segment(c, el.duration || 0);
        run.actionDur = run.loops === Infinity ? Infinity : (run.seg.len * run.loops) / rate;
        const src = ctx.createMediaElementSource(el);
        src.connect(this.buildChain(run, ctx, 2));
        run.mediaEl = el; run.iter = 0;
        initRamp();
        const startEl = run.offset != null ? (run.offset - run.seg.start) / rate : 0;
        el.currentTime = run.seg.start + Math.max(0, startEl * rate);
        el.play().catch((e) => this.hooks.error(`Cue ${c.number || ''}: ${e.message}`));
        run.loading = false;
        run.actionStart = this.now() - Math.max(0, startEl);
      };
      el.onerror = () => { run.loading = false; run.error = 'cannot load audio'; run.actionDone = true; this.hooks.error(`Cue ${c.number || ''}: cannot load audio`); };
      return;
    }
    run.seg = this.segment(c, buf.duration);
    run.actionDur = run.loops === Infinity ? Infinity : (run.seg.len * run.loops) / rate;
    this.buildChain(run, ctx, buf.numberOfChannels);
    initRamp();
    let startEl = 0;
    if (run.offset != null) startEl = QP.clamp((run.offset - run.seg.start) / rate, 0, run.seg.len / rate - 0.01);
    run.actionStart = this.now() - startEl;
    this.audioSource(run, startEl);
  }
  audioSource(run, elapsed) {
    const c = run.cue, seg = run.seg, rate = Number(c.rate) || 1;
    const src = run.ctx.createBufferSource();
    src.buffer = this.audio.buffers.get(c.file);
    src.playbackRate.value = rate;
    const filePos = seg.start + ((elapsed * rate) % seg.len);
    src.connect(run.head || (run.eq ? run.eq[0] : run.gain));
    if (run.loops !== 1) {
      src.loop = true; src.loopStart = seg.start; src.loopEnd = seg.end;
      src.start(0, filePos);
    } else {
      src.start(0, filePos, Math.max(0.001, seg.end - filePos));
    }
    run.src = src;
  }
  audioPosition(run, now) {
    if (!run.seg) return 0;
    if (run.mediaEl) return run.mediaEl.currentTime;
    const el = (run.paused ? run.pausedAt : now) - run.actionStart;
    const rate = Number(run.cue.rate) || 1;
    return run.seg.start + Math.min((el * rate) % run.seg.len, run.seg.len);
  }
  seekRun(run, filePos) {
    if (!run.seg || run.state !== 'action') return;
    const c = run.cue, rate = Number(c.rate) || 1, seg = run.seg;
    filePos = QP.clamp(filePos, seg.start, seg.end - 0.01);
    const ref = run.paused ? run.pausedAt : this.now();
    const el = ref - run.actionStart;
    const k = Math.floor((el * rate) / seg.len);
    const newEl = (k * seg.len) / rate + (filePos - seg.start) / rate;
    run.actionStart = ref - newEl;
    run.autoFaded = false;
    if (run.mediaEl) { run.mediaEl.currentTime = filePos; return; }
    if (run.el && run.el.tagName === 'VIDEO') { run.el.currentTime = filePos; return; }
    if (run.src) { try { run.src.stop(); run.src.disconnect(); } catch { /* ignore */ } run.src = null; }
    if (!run.paused && run.ctx) this.audioSource(run, newEl);
  }
  tickAudio(run, now, el) {
    const c = run.cue;
    if (c.fadeOut > 0 && isFinite(run.actionDur) && !run.autoFaded && !run.stopping && el >= run.actionDur - c.fadeOut) {
      run.autoFaded = true;
      run.levelRamp.rampTo(0, Math.max(0.01, run.actionDur - el), 'linear', now);
    }
    const g = run.levelRamp.value(now) * (run.duckCur ?? 1);
    if (Math.abs(g - run.lastG) > 1e-5) { run.gain.gain.setTargetAtTime(g, run.ctx.currentTime, 0.008); run.lastG = g; }
    if (run.cue.type === 'mic') { if (isFinite(run.actionDur) && el >= run.actionDur) run.actionDone = true; return; }
    if (run.mediaEl) {
      const m = run.mediaEl;
      if (m.ended || m.currentTime >= run.seg.end - 0.02) {
        run.iter++;
        if (run.iter >= Math.min(run.loops, run.maxIter || Infinity)) { run.actionDone = true; return; }
        m.currentTime = run.seg.start;
        if (m.paused) m.play().catch(() => {});
      }
      return;
    }
    if (isFinite(run.actionDur) && el >= run.actionDur) run.actionDone = true;
  }

  // ---- visual layers: video / image / text / camera
  startVisual(run) {
    const c = run.cue;
    if (c.type === 'video' && !c.file) throw new Error('no video file');
    run.loading = true;
    (async () => {
      const { doc, stage } = await this.output.ensure(c.surface);
      if (run.state === 'done' || run.stopped) return;
      let el;
      if (c.type === 'text') {
        el = doc.createElement('div');
        this.styleText(el, c);
        run.actionDur = Number(c.duration) > 0 ? Number(c.duration) : run.slideDur || Infinity;
      } else if (c.type === 'camera') {
        el = doc.createElement('video');
        el.muted = true; el.playsInline = true; el.autoplay = true;
        await QP.platform.cameraAccess();
        const [cw, ch] = String(c.resolution || '1920x1080').split('x').map(Number);
        const vc = { width: { ideal: cw || 1920 }, height: { ideal: ch || 1080 }, ...(Number(c.fps) ? { frameRate: { ideal: Number(c.fps) } } : {}) };
        const constraints = { video: c.deviceId ? { deviceId: { exact: c.deviceId }, ...vc } : vc, audio: false };
        run.stream = await navigator.mediaDevices.getUserMedia(constraints);
        el.srcObject = run.stream;
        if (c.mirror) el.style.transform = 'scaleX(-1)';
        run.actionDur = Number(c.duration) > 0 ? Number(c.duration) : run.slideDur || Infinity;
        await el.play().catch(() => {});
      } else if (QP.isImagePath(c.file)) {
        el = doc.createElement('img');
        await new Promise((res, rej) => { el.onload = res; el.onerror = () => rej(new Error('cannot load image')); el.src = QP.platform.mediaUrl(c.file); });
        run.actionDur = run.slideDur || (Number(c.imageDuration) > 0 ? Number(c.imageDuration) : Infinity);
      } else {
        el = doc.createElement('video');
        el.preload = 'auto'; el.playsInline = true;
        await new Promise((res, rej) => {
          el.onloadedmetadata = res; el.onerror = () => rej(new Error('cannot load video (unsupported codec?)'));
          el.src = QP.platform.mediaUrl(c.file);
        });
        const rate = Number(c.rate) || 1;
        run.seg = this.segment(c, el.duration || 0);
        const count = Number(c.playCount);
        run.loops = count === 0 ? Infinity : Math.max(1, count || 1);
        run.iter = 0;
        run.actionDur = run.loops === Infinity ? Infinity : (run.seg.len * run.loops) / rate;
        el.currentTime = run.offset != null ? QP.clamp(run.offset, run.seg.start, run.seg.end - 0.05) : run.seg.start;
        el.playbackRate = rate;
        el.preservesPitch = true;
        const dev = this.dev(c.device);
        if (dev && el.setSinkId) el.setSinkId(dev).catch(() => {});
      }
      if (run.state === 'done' || run.stopped) { if (run.stream) run.stream.getTracks().forEach((t) => t.stop()); return; }
      // keyed layers render through a WebGL canvas that takes the source's place
      let view = el;
      if (c.type !== 'text' && QP.keyActive(c)) {
        try {
          run.keyer = new QP.Keyer(doc, el, c.key);
          run.keyer.onPick = (col) => { if (this.hooks.keyPicked) this.hooks.keyPicked(run.cueId, col); };
          view = run.keyer.canvas;
          el.style.cssText = 'position:absolute;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
          stage.appendChild(el);
        } catch (e) { this.hooks.error(`Keying unavailable: ${e.message}`); run.keyer = null; view = el; }
      }
      view.classList.add('layer');
      view.style.zIndex = String(Number(c.layer) || 1);
      QP.applyGeo(view, c);
      if (c.type !== 'text') view.style.objectFit = c.fit === 'fill' ? 'fill' : c.fit === 'cover' ? 'cover' : 'contain';
      view.style.opacity = '0';
      stage.appendChild(view);
      run.el = el; run.view = view;
      if (this.netAudio) this.routeVideoAudio(run);
      const now = this.now();
      const op = QP.clamp((Number(c.opacity ?? 100)) / 100, 0, 1);
      run.opBase = op;
      const fIn = c.transition === 'cut' && run.fadeInOverride == null ? 0 : (run.fadeInOverride ?? (Number(c.fadeIn) || 0));
      const lvl = QP.dbToGain(Number(c.level) || 0);
      if (run.manualIn) {
        const p = this.manual && this.manual.incoming === run ? this.manual.p : 0;
        run.opRamp = new QP.Ramp(op * p); run.levelRamp = new QP.Ramp(lvl * Math.sin((p * Math.PI) / 2));
      } else {
        run.opRamp = new QP.Ramp(fIn > 0 ? 0 : op);
        if (fIn > 0) run.opRamp.rampTo(op, fIn, 'linear', now);
        run.levelRamp = new QP.Ramp(fIn > 0 ? 0 : lvl);
        if (fIn > 0) run.levelRamp.rampTo(lvl, fIn, run.xfCurve || 'linear', now);
      }
      run.trUse = true;
      this.applyVisual(run, now);
      if (el.tagName === 'VIDEO' && c.type === 'video') {
        try { await el.play(); } catch { el.muted = true; try { await el.play(); this.hooks.error('Video audio was muted by the autoplay policy'); } catch { /* ignore */ } }
      }
      run.loading = false;
      const startOff = run.seg && run.offset != null ? (el.currentTime - run.seg.start) / (Number(c.rate) || 1) : 0;
      run.actionStart = this.now() - startOff;
    })().catch((e) => {
      run.loading = false; run.error = e.message; run.actionDone = true;
      this.hooks.error(`Cue ${c.number || ''}: ${e.message}`);
    });
  }
  styleText(el, c) {
    const pos = { top: 'flex-start', middle: 'center', bottom: 'flex-end', lower: 'flex-end' }[c.position] || 'center';
    el.style.cssText = `position:absolute;inset:0;display:flex;align-items:${pos};justify-content:${c.align === 'left' ? 'flex-start' : c.align === 'right' ? 'flex-end' : 'center'};padding:${c.position === 'lower' ? '0 6vw 9vh' : '5vh 6vw'};box-sizing:border-box;pointer-events:none`;
    const inner = el.ownerDocument.createElement('div');
    const bgA = QP.clamp(Number(c.bgOpacity) || 0, 0, 100) / 100;
    const hex = (c.bgColor || '#000000').replace('#', '');
    const rgb = [0, 2, 4].map((i) => parseInt(hex.substr(i, 2), 16) || 0).join(',');
    inner.style.cssText = `font-family:${c.font || 'Segoe UI, Helvetica, Arial, sans-serif'};font-size:${Number(c.size) || 8}vh;font-weight:${c.bold ? 800 : 500};color:${c.textColor || '#ffffff'};text-align:${c.align || 'center'};line-height:1.15;white-space:pre-wrap;${bgA > 0 ? `background:rgba(${rgb},${bgA});padding:.25em .6em;border-radius:.2em;` : ''}text-shadow:${c.shadow === false ? 'none' : '0 .04em .2em rgba(0,0,0,.6)'}`;
    el.appendChild(inner);
    el._inner = inner;
  }
  textContent(run, now) {
    const c = run.cue;
    const el = (run.paused ? run.pausedAt : now) - (run.actionStart || now);
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (s) => { s = Math.max(0, Math.ceil(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`; };
    let remain = 0;
    if (c.countMode === 'duration') remain = (Number(c.countFrom) || 0) - el;
    else if (c.countMode === 'until') {
      const [hh, mm] = String(c.countUntil || '00:00').split(':').map((v) => parseInt(v, 10) || 0);
      const t = new Date(); t.setHours(hh, mm, 0, 0);
      remain = (t - new Date()) / 1000;
    }
    const d = new Date();
    return String(c.text || '')
      .replace(/\{countdown\}/g, fmt(remain))
      .replace(/\{clock\}/g, `${pad(d.getHours())}:${pad(d.getMinutes())}`)
      .replace(/\{clock:s\}/g, `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`)
      .replace(/\{elapsed\}/g, fmt(el))
      .replace(/\{showstart\}/g, () => { const r = QP.showStartRemaining ? QP.showStartRemaining() : null; return r == null ? '' : fmt(Math.max(0, r)); });
  }
  applyVisual(run, now) {
    if (!run.el) return;
    const v = run.view || run.el;
    const opv = QP.clamp(run.opRamp.value(now), 0, 1);
    const going = run.stopping || run.autoFaded && run.opRamp.to < run.opRamp.from;
    const type = run.trUse && !run.trOff ? (going ? (run.trOut || run.cue.transitionOut || run.cue.transition || 'fade') : (run.cue.transition || 'fade')) : 'fade';
    if (type === 'fade' || !(run.opBase > 0)) {
      if (run.trDirty) this.clearTransition(run, v);
      v.style.opacity = String(opv);
    } else this.applyTransition(run, v, type, QP.clamp(opv / run.opBase, 0, 1));
    if (run.el.tagName === 'VIDEO' && run.cue.type === 'video') run.el.volume = QP.clamp(run.levelRamp.value(now) * (run.duckCur ?? 1) * (this.audio.muted ? 0 : 1), 0, 1);
    if (run.cue.type === 'text' && run.el._inner && (!run.lastText || now - run.lastText > 0.2)) {
      run.lastText = now;
      const t = this.textContent(run, now);
      if (run.el._inner.textContent !== t) run.el._inner.textContent = t;
    }
  }
  // video cue sound normally plays straight from the video element; while a network display
  // wants sound it is routed through the audio engine so it is part of the streamed mix
  routeVideoAudio(run) {
    const el = run.el;
    if (!el || el.tagName !== 'VIDEO' || run.cue.type !== 'video' || run.mediaSrc || el.__qfSrc) return;
    try {
      const ctx = this.audio.ctx(this.dev(run.cue.device));
      run.mediaSrc = ctx.createMediaElementSource(el);
      el.__qfSrc = run.mediaSrc;
      run.mediaSrc.connect(ctx.master);
    } catch (e) { console.warn('video audio routing', e); }
  }
  setNetAudio(on) {
    this.netAudio = !!on;
    if (on) for (const r of this.runs) if (r.el && QP.VISUAL_TYPES.includes(r.cue.type)) this.routeVideoAudio(r);
  }
  // PowerPoint-style transitions, driven by the layer's opacity ramp (0 = hidden, 1 = fully in)
  applyTransition(run, v, type, p) {
    const base = run.opBase, st = v.style;
    const settled = p >= 0.999;
    if (settled && !run.trDirty) { st.opacity = String(base); return; }
    const g = run.cue.geo || {};
    const crop = { t: Number(g.cropT) || 0, r: Number(g.cropR) || 0, b: Number(g.cropB) || 0, l: Number(g.cropL) || 0 };
    const q = (1 - p) * 100;
    let op = base, clip = null, tr = '', sc = '', flt = '';
    switch (type) {
      case 'cut': op = p >= 0.5 ? base : 0; break;
      case 'dip': op = p < 0.5 ? 0 : (p - 0.5) * 2 * base; break;
      case 'wipe-right': clip = { ...crop, r: crop.r + q * (1 - (crop.l + crop.r) / 100) }; break;
      case 'wipe-left': clip = { ...crop, l: crop.l + q * (1 - (crop.l + crop.r) / 100) }; break;
      case 'wipe-down': clip = { ...crop, b: crop.b + q * (1 - (crop.t + crop.b) / 100) }; break;
      case 'wipe-up': clip = { ...crop, t: crop.t + q * (1 - (crop.t + crop.b) / 100) }; break;
      // slides push: the incoming layer arrives from one side, the outgoing one leaves by the other
      case 'slide-left': tr = `${run.stopping ? -q : q}vw 0`; break;
      case 'slide-right': tr = `${run.stopping ? q : -q}vw 0`; break;
      case 'slide-up': tr = `0 ${run.stopping ? -q : q}vh`; break;
      case 'slide-down': tr = `0 ${run.stopping ? q : -q}vh`; break;
      case 'zoom': sc = String(0.6 + 0.4 * p); op = base * p; break;
      case 'blur': flt = `blur(${((1 - p) * 30).toFixed(1)}px)`; op = base * p; break;
      case 'iris': clip = 'iris'; break;
      default: op = base * p;
    }
    st.opacity = String(op);
    st.translate = tr; st.scale = sc; st.filter = flt;
    if (clip === 'iris') st.clipPath = `circle(${(p * 75).toFixed(2)}% at 50% 50%)`;
    else if (clip) st.clipPath = `inset(${clip.t}% ${clip.r}% ${clip.b}% ${clip.l}%)`;
    else if (run.trClip) { QP.applyGeo(v, run.cue); }
    run.trClip = !!clip;
    run.trDirty = !settled;
    if (settled) this.clearTransition(run, v);
  }
  clearTransition(run, v) {
    v.style.translate = ''; v.style.scale = ''; v.style.filter = '';
    if (run.trClip) QP.applyGeo(v, run.cue);
    run.trClip = false; run.trDirty = false;
  }
  tickVisual(run, now, el) {
    const c = run.cue;
    if (c.fadeOut > 0 && isFinite(run.actionDur) && !run.autoFaded && !run.stopping && el >= run.actionDur - c.fadeOut) {
      run.autoFaded = true;
      const t = Math.max(0.01, run.actionDur - el);
      run.opRamp.rampTo(0, t, 'linear', now); run.levelRamp.rampTo(0, t, 'linear', now);
    }
    this.applyVisual(run, now);
    const v = run.el;
    if (v.tagName === 'VIDEO' && c.type === 'video') {
      if (run.holding) return;
      if (v.ended || v.currentTime >= run.seg.end - 0.025) {
        run.iter++;
        if (run.iter >= Math.min(run.loops, run.maxIter || Infinity)) {
          if (c.holdLast && !run.stopping) { v.pause(); run.holding = true; run.actionDur = Infinity; return; }
          run.actionDone = true; return;
        }
        v.currentTime = run.seg.start;
        if (v.paused) v.play().catch(() => {});
      }
    } else if (isFinite(run.actionDur) && el >= run.actionDur) run.actionDone = true;
  }

  // ---- timecode generator
  startTimecode(run, resumeFrame) {
    const c = run.cue;
    const fps = c.fps || '25';
    const startFrame = resumeFrame ?? QP.TC.parse(c.startTC || '00:00:00:00', fps);
    run.actionDur = Number(c.duration) > 0 ? Number(c.duration) : Infinity;
    if (c.tcMode === 'mtc') {
      const out = QP.midi.outputs.find((o) => o.name === c.midiOut) || QP.midi.outputs[0];
      if (!out) throw new Error('no MIDI output for MTC');
      run.tc = new QP.TC.MTCGen(out, { fps, startFrame });
    } else {
      const ctx = this.audio.ctx(this.dev(c.device));
      const outs = ctx.outChannels || 2;
      const ch = QP.clamp((Number(c.channel) || 1) - 1, 0, outs - 1);
      const merge = ctx.createChannelMerger(outs);
      merge.connect(ctx.destination);
      run.tcMerge = merge;
      const pre = ctx.createGain(); pre.connect(merge, 0, ch);
      run.tcPre = pre;
      run.tc = new QP.TC.LTCGen(ctx, pre, { fps, startFrame, levelDb: Number(c.level ?? -10) });
    }
    run.tc.start();
  }

  // ---- light (Art-Net / sACN)
  universe(proto, host, uni) {
    const key = `${proto}|${host || ''}|${uni}`;
    let u = this.dmx.get(key);
    if (!u) { u = { proto, host, universe: Number(uni) || 0, data: new Float32Array(512), dirty: true }; this.dmx.set(key, u); }
    return u;
  }
  startLight(run) {
    const c = run.cue;
    const u = this.universe(c.proto || 'artnet', c.host || '', c.universe ?? 0);
    const vals = QP.parseDmxValues(c.values);
    if (!vals.length) throw new Error('no channel values (e.g. 1@255, 2-8@50%)');
    run.light = { u, items: vals.map(({ ch, v }) => ({ i: ch - 1, from: u.data[ch - 1], to: v })) };
    run.actionDur = Number(c.fade) || 0;
    run.lightRamp = new QP.Ramp(0);
    run.lightRamp.rampTo(1, run.actionDur, c.curve || 'linear', this.now());
    this.tickLight(run, this.now());
  }
  tickLight(run, now) {
    const p = run.lightRamp.value(now);
    for (const it of run.light.items) run.light.u.data[it.i] = it.from + (it.to - it.from) * p;
    run.light.u.dirty = true;
    if (p >= 1) run.actionDone = true;
  }
  flushDmx(force) {
    if (this.hooks.rehearsal && this.hooks.rehearsal()) return;
    const t = performance.now();
    if (!force && t - this.lastDmxSend < 25) return;
    this.lastDmxSend = t;
    for (const u of this.dmx.values()) {
      if (!u.dirty) continue;
      u.dirty = false;
      QP.platform.dmxSend({ proto: u.proto, host: u.host, universe: u.universe, data: Array.from(u.data, (v) => Math.round(v)) });
    }
  }
  dmxBlackout() { for (const u of this.dmx.values()) { u.data.fill(0); u.dirty = true; } this.flushDmx(true); }

  // ---- groups
  startGroup(run) {
    run.pass = 0;
    if (!this.groupMemory) this.groupMemory = new Map();
    run.actionDur = Infinity;
    const count = Number(run.cue.playCount);
    run.loops = count === 0 || run.cue.endAction === 'repeat' ? Infinity : Math.max(1, count || 1);
    if (run.cue.mode === 'step') run.loops = 1;
    this.groupPass(run);
  }
  stepInfo(cue) {
    // for step groups: which child plays next, and whether more remain after it
    if (!this.stepPos) this.stepPos = new Map();
    const n = (cue.children || []).length;
    let pos = this.stepPos.get(cue.id) || 0;
    if (pos >= n) pos = 0;
    return { pos, n, more: pos < n - 1 };
  }
  resetStep(cueId) { if (this.stepPos) this.stepPos.delete(cueId); }
  groupPass(run) {
    const c = run.cue, kids = c.children || [];
    run.pass++;
    if (!kids.length) { run.actionDone = true; return; }
    const mode = c.mode || 'all';
    if (mode === 'all') {
      for (const k of kids) this.fire(k, { parentRun: run });
    } else if (mode === 'first') {
      this.fire(kids[0], { parentRun: run });
    } else if (mode === 'random1') {
      // play one child at random (never the same one twice in a row)
      let i = Math.floor(Math.random() * kids.length);
      if (kids.length > 1 && i === run.lastPlayed) i = (i + 1 + Math.floor(Math.random() * (kids.length - 1))) % kids.length;
      if (kids.length > 1 && this.lastRandom && this.lastRandom.get(run.cueId) === i) i = (i + 1) % kids.length;
      if (!this.lastRandom) this.lastRandom = new Map();
      this.lastRandom.set(run.cueId, i);
      run.lastPlayed = i;
      this.fire(kids[i], { parentRun: run });
    } else if (mode === 'step') {
      // each GO plays the next child only — the previous step fades out
      const info = this.stepInfo(c);
      for (const r of this.runsFor(run.cueId)) if (r !== run) this.stopRun(r, Number(c.crossfade) || 0);
      if (Number(c.crossfade) > 0 && info.pos > 0) run.stepFade = Number(c.crossfade);
      this.fire(kids[info.pos], { parentRun: run, fadeIn: run.stepFade });
      if (!this.stepPos) this.stepPos = new Map();
      const next = info.pos + 1;
      this.stepPos.set(run.cueId, next >= kids.length ? (c.stepWrap ? 0 : kids.length) : next);
    } else {
      const mem = c.resume && run.pass === 1 ? this.groupMemory.get(run.cueId) : null;
      if (mem && mem.order.length === kids.length && mem.pos < kids.length) {
        this.groupMemory.delete(run.cueId);
        run.order = mem.order; run.pos = mem.pos; run.nextAt = null;
        run.cur = this.fire(kids[run.order[run.pos]], { parentRun: run, fadeIn: Number(c.crossfade) > 0 ? Number(c.crossfade) : undefined });
        return;
      }
      const order = kids.map((_, i) => i);
      if (mode === 'shuffle') {
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        if (order.length > 1 && order[0] === run.lastPlayed) [order[0], order[1]] = [order[1], order[0]];
      }
      run.order = order; run.pos = 0; run.nextAt = null;
      run.cur = this.fire(kids[order[0]], { parentRun: run, slideDur: mode === 'slideshow' ? Number(c.slideDuration) || 5 : undefined });
    }
  }
  tickGroup(run, now) {
    if (run.stopping) return;
    const c = run.cue;
    const mode = c.mode || 'all';
    if (mode === 'playlist' || mode === 'shuffle' || mode === 'slideshow') {
      const kids = c.children || [];
      const cur = run.cur;
      const xf = Number(c.crossfade) || 0;
      if (cur && run.nextAt == null) {
        const gap = xf > 0 ? -xf : Number(c.gap) || 0;
        const finished = cur.state === 'done' || cur.actionDone;
        if (finished) run.nextAt = now + Math.max(0, gap);
        else if (gap < 0 && cur.state === 'action' && !cur.loading && !cur.paused && isFinite(cur.actionDur)
          && now - cur.actionStart >= cur.actionDur + gap) run.nextAt = now;
      }
      if (run.nextAt != null && now >= run.nextAt) {
        run.nextAt = null;
        run.lastPlayed = run.order[run.pos];
        run.pos++;
        if (run.pos < run.order.length && !run.devamp) {
          if (xf > 0 && cur && cur.state !== 'done' && !cur.actionDone) this.stopRun(cur, xf);
          run.cur = this.fire(kids[run.order[run.pos]], { parentRun: run, fadeIn: xf > 0 ? xf : undefined, slideDur: mode === 'slideshow' ? Number(c.slideDuration) || 5 : undefined });
        } else if (run.pos >= run.order.length && run.loops > run.pass && !run.devamp && xf > 0 && cur && !cur.actionDone && cur.state !== 'done') {
          // crossfade across the loop boundary too
          this.stopRun(cur, xf);
          run.cur = null;
        } else run.cur = null;
      }
      if (!run.cur && run.nextAt == null && this.childrenOf(run).length === 0) this.endPass(run);
    } else if (this.childrenOf(run).length === 0) {
      this.endPass(run);
    }
  }
  endPass(run) {
    if (run.devamp || run.pass >= run.loops) {
      run.actionDone = true;
      // what happens when the group finishes
      const c = run.cue, act = c.endAction || 'stop';
      if (act === 'next' && !run.endFired && c.continueMode !== 'auto-follow') { run.endFired = true; this.continueAfter(run); }
      else if (act === 'goto' && c.endTarget) this.hooks.setPlayhead(c.endTarget);
      else if (act === 'fire' && c.endTarget) { const t = this.findCue(c.endTarget); if (t) this.fire(t); }
    } else this.groupPass(run);
  }

  // ---- fade / stop / devamp
  targetRuns(cueId, includeDescendants) {
    const base = this.runsFor(cueId);
    if (!includeDescendants) return base;
    const out = [...base];
    for (const r of base) out.push(...this.descendantsOf(r));
    return out;
  }
  doFade(run) {
    const c = run.cue, now = this.now();
    if (!c.target) { this.hooks.error(`Fade cue ${c.number || ''}: no target`); return; }
    const dur = Number(c.duration) || 0;
    for (const t of this.targetRuns(c.target, true)) {
      if (t.state !== 'action') continue;
      if (c.setLevel && t.levelRamp) t.levelRamp.rampTo(QP.dbToGain(Number(c.level)), dur, c.curve, now);
      if (c.setOpacity && t.opRamp) t.trOff = true;
      if (c.setOpacity && t.opRamp) t.opRamp.rampTo(QP.clamp(Number(c.opacity) / 100, 0, 1), dur, c.curve === 'exp' ? 'linear' : c.curve, now);
      t.autoFaded = true;
    }
    if (c.stopWhenDone) for (const t of this.runsFor(c.target)) this.stopRun(t, dur, true);
  }
  doStop(run) {
    const c = run.cue;
    const targets = c.target ? this.runsFor(c.target) : this.runs.filter((r) => r !== run && r.state !== 'done' && !r.parentRun);
    for (const t of targets) {
      if (t === run) continue;
      if (c.action === 'pause') this.pauseRun(t);
      else if (c.action === 'resume') this.resumeRun(t);
      else if (c.action === 'devamp') this.devampRun(t);
      else this.stopRun(t, Number(c.fadeTime) || 0);
    }
  }
  devampRun(r) {
    const now = this.now();
    const apply = (t) => {
      if (t.cue.type === 'audio' && t.seg && t.loops !== 1) {
        if (t.mediaEl) { t.maxIter = (t.iter || 0) + 1; return; }
        const rate = Number(t.cue.rate) || 1;
        const el = now - t.actionStart;
        const k = Math.floor((el * rate) / t.seg.len);
        t.actionDur = Math.min(t.actionDur, ((k + 1) * t.seg.len) / rate);
        if (t.cue.fadeOut > 0) t.autoFaded = false;
      } else if (t.cue.type === 'video' && t.el) {
        t.maxIter = (t.iter || 0) + 1;
      } else if (t.cue.type === 'group') {
        t.devamp = true;
      }
    };
    apply(r);
    for (const d of this.descendantsOf(r)) apply(d);
    this.log('devamp', `Devamp ${this.label(r.cue)}`);
  }
  stopRun(r, fade = 0, fromFade = false) {
    if (!r || r.state === 'done') return;
    const now = this.now();
    if (r.cue.type === 'group' && r.cue.resume && r.order && !r.devamp) {
      // remember where a playlist stopped so the next start resumes with the following item
      if (!this.groupMemory) this.groupMemory = new Map();
      this.groupMemory.set(r.cueId, { order: r.order, pos: Math.min(r.pos + 1, r.order.length) % r.order.length });
    }
    for (const k of this.childrenOf(r)) this.stopRun(k, fade, fromFade);
    r.stopped = true;
    if (fade > 0 && r.state === 'action' && !r.paused && (r.levelRamp || r.opRamp || r.cue.type === 'group')) {
      if (!fromFade) {
        if (r.levelRamp) r.levelRamp.rampTo(0, fade, r.xfOut ? 'eqout' : 'linear', now);
        if (r.opRamp) r.opRamp.rampTo(0, fade, 'linear', now);
        r.trUse = true;
      }
      r.autoFaded = true;
      r.stopping = true;
      r.stopAt = now + fade;
      return;
    }
    this.finish(r, true);
  }
  pauseRun(r) {
    if (!r || r.state === 'done' || r.paused) return;
    for (const k of this.childrenOf(r)) this.pauseRun(k);
    r.paused = true;
    r.pausedAt = this.now();
    if (r.src) { try { r.src.onended = null; r.src.stop(); r.src.disconnect(); } catch { /* ignore */ } r.src = null; }
    if (r.mediaEl) r.mediaEl.pause();
    if (r.micLive && r.gain) { r.gain.gain.setTargetAtTime(0, r.ctx.currentTime, 0.01); r.lastG = -1; }
    if (r.el && r.el.tagName === 'VIDEO' && r.cue.type === 'video') r.el.pause();
    if (r.tc) { r.tcPausedFrame = r.tc.currentFrame(); r.tc.stop(); r.tc = null; }
    this.hooks.onChange();
  }
  resumeRun(r) {
    if (!r || !r.paused) return;
    const now = this.now();
    const dt = now - r.pausedAt;
    for (const k of ['tFire', 'preEnd', 'actionStart', 'stopAt', 'nextAt']) if (r[k] != null) r[k] += dt;
    if (r.levelRamp) r.levelRamp.shift(dt);
    if (r.opRamp) r.opRamp.shift(dt);
    if (r.lightRamp) r.lightRamp.shift(dt);
    r.paused = false;
    if (r.seg && r.ctx && !r.mediaEl && r.state === 'action' && !r.actionDone) this.audioSource(r, now - r.actionStart);
    if (r.mediaEl) r.mediaEl.play().catch(() => {});
    if (r.el && r.el.tagName === 'VIDEO' && r.cue.type === 'video') r.el.play().catch(() => {});
    if (r.tcPausedFrame != null && r.state === 'action') {
      if (r.tcMerge) { try { r.tcMerge.disconnect(); } catch { /* ignore */ } }
      try { this.startTimecode(r, r.tcPausedFrame); } catch (e) { this.hooks.error(e.message); }
      r.tcPausedFrame = null;
    }
    for (const k of this.runs.filter((x) => x.parentRun === r)) this.resumeRun(k);
    this.hooks.onChange();
  }
  cleanup(r) {
    if (r.src) { try { r.src.stop(); } catch { /* ignore */ } try { r.src.disconnect(); } catch { /* ignore */ } r.src = null; }
    if (r.mediaEl) { try { r.mediaEl.pause(); r.mediaEl.removeAttribute('src'); r.mediaEl.load(); } catch { /* ignore */ } r.mediaEl = null; }
    for (const n of [r.gain, ...(r.eq || []), ...(r.extraNodes || [])]) { if (n) try { n.disconnect(); } catch { /* ignore */ } }
    if (r.tc) { r.tc.stop(); r.tc = null; }
    if (r.tcMerge) { try { r.tcMerge.disconnect(); r.tcPre.disconnect(); } catch { /* ignore */ } }
    if (r.stream) { r.stream.getTracks().forEach((t) => t.stop()); r.stream = null; }
    if (r.keyer) { r.keyer.destroy(); r.keyer = null; }
    if (r.view && r.view !== r.el) { try { r.view.remove(); } catch { /* ignore */ } }
    r.view = null;
    if (r.el) {
      try { if (r.el.tagName === 'VIDEO') { r.el.pause(); if (r.el.srcObject) r.el.srcObject = null; else { r.el.removeAttribute('src'); r.el.load(); } } r.el.remove(); } catch { /* ignore */ }
      r.el = null;
    }
  }
  finish(r, kill = false) {
    r.actionDone = true;
    if (kill) { r.stopped = true; r.continued = true; }
    if (!r.cleaned) { this.cleanup(r); r.cleaned = true; }
    if (kill) r.state = 'done';
  }

  onGo() {
    // cues flagged "fade out on next GO" (walk-in music etc.)
    for (const r of this.runs) {
      if (r.parentRun || r.state === 'done' || r.stopping || !r.cue.stopOnGo) continue;
      this.stopRun(r, Number(r.cue.stopOnGoFade) || 3);
      this.log('fire', `Fade out on GO: ${this.label(r.cue)}`);
    }
  }
  // ---- global
  stopAll(fade = 0) { for (const r of this.runs.filter((x) => !x.parentRun)) this.stopRun(r, fade); this.hooks.onChange(); }
  panic() {
    const fade = Number(this.settings().panicFade) || 0;
    const hard = fade <= 0 || this.runs.some((r) => r.panicking && r.state !== 'done');
    for (const r of this.runs) if (r.state !== 'done') r.panicking = true;
    this.log('panic', hard ? 'Stop all (instant)' : `Stop all (fade ${fade}s)`);
    this.stopAll(hard ? 0 : fade);
  }
  pauseAll() { for (const r of this.runs.filter((x) => !x.parentRun)) this.pauseRun(r); this.log('pause', 'Pause all'); }
  resumeAll() { this.audio.resumeAll(); for (const r of this.runs.filter((x) => !x.parentRun)) this.resumeRun(r); this.log('resume', 'Resume all'); }

  continueAfter(r) {
    const siblings = r.parentRun ? (r.parentRun.cue.children || []) : (this.hooks.siblingsOf(r.cueId) || []);
    const i = siblings.findIndex((c) => c.id === r.cueId);
    if (i >= 0 && i + 1 < siblings.length) this.fire(siblings[i + 1], { parentRun: r.parentRun });
  }

  tick() {
    const now = this.now();
    const dt = this.lastTick ? now - this.lastTick : 0.01;
    this.lastTick = now;
    this.updateDucking(now, dt);
    if (this.manual) {
      const m = this.manual;
      if (m.incoming.state === 'done') { for (const o of m.outgoing) o.manualOut = false; this.manual = null; }
      else if (m.take) { const k = QP.clamp((now - m.take.t0) / m.take.dur, 0, 1); this.setManual(m.take.from + (1 - m.take.from) * k); }
    }
    const before = this.runs.length;
    for (const r of [...this.runs]) {
      if (r.state === 'done' || r.paused) continue;
      if (r.state === 'prewait') {
        if (now < r.preEnd) continue;
        this.startAction(r);
      }
      const el = now - r.actionStart;
      const mode = r.cue.continueMode;
      if (!r.continued && mode === 'auto-continue' && !r.loading && el >= (Number(r.cue.postWait) || 0)) {
        r.continued = true;
        this.continueAfter(r);
      }
      if (!r.actionDone) {
        const t = r.cue.type;
        if ((t === 'audio' && (r.src || r.mediaEl)) || (t === 'mic' && r.micLive)) this.tickAudio(r, now, el);
        else if (QP.VISUAL_TYPES.includes(t) && r.el) this.tickVisual(r, now, el);
        else if (t === 'group') this.tickGroup(r, now);
        else if (t === 'light' && r.light) this.tickLight(r, now);
        else if (t === 'timecode' && r.tc) { r.tc.tick(); if (isFinite(r.actionDur) && el >= r.actionDur) r.actionDone = true; }
        else if (!r.loading && isFinite(r.actionDur) && ['wait', 'fade', 'stop', 'timecode'].includes(t) && el >= r.actionDur) r.actionDone = true;
        if (r.stopAt != null && now >= r.stopAt) { this.finish(r, true); continue; }
      }
      if (r.actionDone) {
        if (!r.cleaned) { this.cleanup(r); r.cleaned = true; }
        if (!r.continued && mode === 'auto-follow' && !r.stopped) { r.continued = true; this.continueAfter(r); }
        if (r.continued || r.stopped) r.state = 'done';
      }
    }
    for (const r of this.runs) {
      if (r.state === 'done' && !r.statDone) {
        r.statDone = true;
        if (this.hooks.runEnded && r.actionStart != null && !r.preview) this.hooks.runEnded(r, Math.max(0, (r.paused ? r.pausedAt : now) - r.actionStart));
      }
    }
    this.runs = this.runs.filter((r) => r.state !== 'done');
    this.flushDmx(false);
    if (this.runs.length !== before) this.hooks.onChange();
  }

  // ---- info for UI
  info(r) {
    const now = this.now();
    const t = r.paused ? r.pausedAt : now;
    if (r.state === 'prewait') return { phase: 'Pre-wait', elapsed: t - r.tFire, total: r.preEnd - r.tFire, countdown: true };
    if (r.loading) return { phase: 'Loading…', elapsed: 0, total: 0 };
    if (r.actionDone) {
      const pw = Number(r.cue.postWait) || 0;
      return { phase: 'Post-wait', elapsed: t - r.actionStart, total: pw, countdown: true };
    }
    let phase = r.paused ? 'Paused' : r.stopping ? 'Stopping' : r.holding ? 'Holding last frame' : r.micLive ? 'Live' : 'Running';
    if (r.duckCur != null && r.duckCur < 0.9) phase += ` · ducked ${Math.round(QP.gainToDb(r.duckCur))} dB`;
    if (r.cue.type === 'group') {
      const loops = r.loops === Infinity ? '∞' : r.loops;
      phase = `${r.paused ? 'Paused' : r.devamp ? 'Devamp' : 'Running'} · pass ${r.pass}/${loops}`;
    } else if (r.cue.type === 'timecode') {
      const f = r.tc ? r.tc.currentFrame() : r.tcPausedFrame;
      if (f != null) phase += ` · ${QP.TC.format(f, r.cue.fps || '25')}`;
    } else if (r.loops && r.loops !== 1 && r.seg) {
      const rate = Number(r.cue.rate) || 1;
      const k = Math.floor(((t - r.actionStart) * rate) / r.seg.len) + 1;
      phase += ` · loop ${k}/${r.loops === Infinity ? '∞' : r.loops}`;
    }
    return { phase, elapsed: t - r.actionStart, total: r.actionDur };
  }
};

QP.parseOscArgs = (str) => {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(String(str || '')))) {
    if (m[1] !== undefined) { out.push({ type: 's', value: m[1] }); continue; }
    const t = m[2];
    if (/^-?\d+$/.test(t)) out.push({ type: 'i', value: parseInt(t, 10) });
    else if (/^-?(\d+\.\d*|\.\d+)$/.test(t)) out.push({ type: 'f', value: parseFloat(t) });
    else if (t === 'true') out.push({ type: 'T' });
    else if (t === 'false') out.push({ type: 'F' });
    else out.push({ type: 's', value: t });
  }
  return out;
};
