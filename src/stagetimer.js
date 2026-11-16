'use strict';
// Stage timers: named presenter / segment timers like dedicated stage-timer software.
// Modes: 'down' (count down a duration), 'up' (count up, optional target), 'tod' (count down
// to a time of day). Yellow / red warnings, overtime that keeps counting (or stops at zero),
// live adjustments. Timer definitions live in the show; running state lives here.
window.QP = window.QP || {};

QP.STAGE_TIMER_DEF = { name: 'Timer', mode: 'down', duration: 600, target: '19:30', warn: 120, crit: 30, overtime: 'continue' };

QP.fmtTimer = (sec, opts = {}) => {
  const neg = sec < 0;
  let s = Math.abs(sec);
  s = opts.floor ? Math.floor(s) : Math.ceil(s - 1e-6);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  const body = h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`;
  return neg ? `−${body}` : body;
};

// seconds until hh:mm today (wraps to tomorrow if that time passed more than 12 h ago)
QP.secondsUntil = (hhmm, now = Date.now()) => {
  const [hh, mm, ss] = String(hhmm || '00:00').split(':').map((v) => parseInt(v, 10) || 0);
  const t = new Date(now); t.setHours(hh, mm, ss || 0, 0);
  let d = (t.getTime() - now) / 1000;
  if (d < -12 * 3600) d += 24 * 3600;
  return d;
};

QP.parseDuration = (txt) => {
  // "10" = 10 min, "1:30" = 1 min 30 s, "1:00:00" = 1 h, "90s" = 90 s
  const s = String(txt || '').trim().toLowerCase();
  if (!s) return 0;
  if (/^\d+(\.\d+)?s$/.test(s)) return parseFloat(s);
  if (/^\d+(\.\d+)?m?$/.test(s)) return Math.round(parseFloat(s) * 60);
  if (/^\d+(\.\d+)?h$/.test(s)) return Math.round(parseFloat(s) * 3600);
  const parts = s.split(':').map((v) => parseInt(v, 10) || 0);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
};

QP.StageTimers = class StageTimers {
  constructor({ getTimers, onChange, log }) {
    this.getTimers = getTimers; this.onChange = onChange || (() => {}); this.log = log || (() => {});
    this.state = new Map();   // id -> { running, startAt, acc, adj, stopped }
  }
  list() { return this.getTimers() || []; }
  get(id) { return this.list().find((t) => t.id === id) || null; }
  st(id) {
    let s = this.state.get(id);
    if (!s) { s = { running: false, startAt: 0, acc: 0, adj: 0, stopped: false }; this.state.set(id, s); }
    return s;
  }
  elapsed(id, now = Date.now()) { const s = this.st(id); return s.acc + (s.running ? (now - s.startAt) / 1000 : 0); }
  // the value shown on screen, plus colour phase and progress
  value(t, now = Date.now()) {
    if (!t) return null;
    const s = this.st(t.id);
    const el = this.elapsed(t.id, now);
    const dur = Math.max(0, Number(t.duration) || 0);
    let sec, rem = null, total = 0, dir;
    if (t.mode === 'up') { sec = el + s.adj; dir = 1; if (dur > 0) { rem = dur - sec; total = dur; } }
    else if (t.mode === 'tod') { sec = QP.secondsUntil(t.target, now) + s.adj; rem = sec; dir = -1; total = Math.max(1, Number(t.todSpan) || 0); }
    else { sec = dur + s.adj - el; rem = sec; total = dur + s.adj; dir = -1; }
    if (t.overtime === 'stop' && t.mode !== 'up' && sec < 0) sec = 0;
    const warn = Number(t.warn) || 0, crit = Number(t.crit) || 0;
    let phase = 'normal';
    if (rem != null) {
      if (rem < 0 || (rem <= 0 && t.mode !== 'up')) phase = 'over';
      else if (crit && rem <= crit) phase = 'crit';
      else if (warn && rem <= warn) phase = 'warn';
    }
    if (t.overtime === 'stop' && phase === 'over') phase = 'crit';
    const frac = total > 0 && rem != null ? Math.min(1, Math.max(0, 1 - rem / total)) : null;
    const running = t.mode === 'tod' ? true : s.running;
    const text = t.mode === 'up' ? QP.fmtTimer(sec, { floor: true }) : QP.fmtTimer(sec);
    return { id: t.id, name: t.name || 'Timer', mode: t.mode, sec: +sec.toFixed(2), rem: rem == null ? null : +rem.toFixed(2), dir, running, phase, frac, text, warn, crit, total, overtime: t.overtime || 'continue' };
  }
  start(id) { const s = this.st(id); if (s.running) return; s.running = true; s.startAt = Date.now(); s.stopped = false; this.changed(id, 'started'); }
  pause(id) { const s = this.st(id); if (!s.running) return; s.acc = this.elapsed(id); s.running = false; this.changed(id, 'paused'); }
  toggle(id) { if (this.st(id).running) this.pause(id); else this.start(id); }
  reset(id) { const s = this.st(id); s.running = false; s.acc = 0; s.adj = 0; s.startAt = 0; s.stopped = false; this.changed(id, 'reset'); }
  restart(id) { this.reset(id); this.start(id); }
  add(id, sec) {
    const t = this.get(id); if (!t) return;
    // + means "more time on the clock": adds to a countdown, takes from a count-up's elapsed
    const s = this.st(id);
    if (t.mode === 'up') s.adj -= sec; else s.adj += sec;
    s.stopped = false;
    this.changed(id, `${sec >= 0 ? '+' : '−'}${QP.fmtTimer(Math.abs(sec), { floor: true })}`);
  }
  set(id, sec) {
    // put exactly <sec> on the clock (remaining for countdowns, elapsed for count-ups)
    const t = this.get(id); if (!t) return;
    const s = this.st(id);
    const now = Date.now();
    if (t.mode === 'up') { s.adj = 0; s.acc = sec; if (s.running) s.startAt = now; }
    else if (t.mode === 'tod') s.adj = sec - QP.secondsUntil(t.target, now);
    else { s.adj = sec - ((Number(t.duration) || 0) - this.elapsed(id, now)); }
    s.stopped = false;
    this.changed(id, `set to ${QP.fmtTimer(sec, { floor: true })}`);
  }
  changed(id, what) { const t = this.get(id); if (t && what) this.log(`Stage timer “${t.name}” ${what}`); this.onChange(); }
  // called regularly: handles "stop at zero" timers
  tick() {
    for (const t of this.list()) {
      const s = this.state.get(t.id);
      if (!s || !s.running || t.mode !== 'down' || t.overtime !== 'stop') continue;
      const rem = (Number(t.duration) || 0) + s.adj - this.elapsed(t.id);
      if (rem <= 0) { s.acc = (Number(t.duration) || 0) + s.adj; s.running = false; s.stopped = true; this.changed(t.id, 'reached zero'); }
    }
  }
};
