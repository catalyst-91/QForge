'use strict';
// QForge UI + show logic.
(function () {
  const P = QP.platform;
  const T = QP.Tree;
  const $ = (s, el = document) => el.querySelector(s);
  const IS_MAC = /mac/i.test(navigator.platform) || P.platform === 'darwin';
  const MOD = IS_MAC ? '⌘' : 'Ctrl+';

  // ---------------------------------------------------------------- helpers
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (['value', 'checked', 'disabled', 'selected'].includes(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  }
  const icon = (name) => { const s = h('span', { html: ICONS[name] || '' }); return s.firstChild; };
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function fmtTime(s, blankZero) {
    if (s == null || isNaN(s)) return '';
    if (s === Infinity) return '∞';
    if (blankZero && s === 0) return '';
    const neg = s < 0; s = Math.abs(s);
    let out;
    if (s < 60) out = s.toFixed(2);
    else { const m = Math.floor(s / 60); const r = s - m * 60; out = `${m}:${r < 10 ? '0' : ''}${r.toFixed(2)}`; }
    return (neg ? '-' : '') + out;
  }
  function parseTime(str) {
    str = String(str).trim();
    if (!str) return 0;
    const neg = str.startsWith('-'); if (neg) str = str.slice(1);
    const parts = str.split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    const v = parts.reduce((a, b) => a * 60 + b, 0);
    return neg ? -v : v;
  }
  const baseName = (p) => P.nameOf(p) || '';
  const stripExt = (n) => n.replace(/\.[^.]+$/, '');

  const ICONS = {
    audio: '<svg viewBox="0 0 16 16"><path d="M2 6h2.6L8 3.2v9.6L4.6 10H2z" fill="currentColor"/><path d="M10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.4 3.8a6 6 0 0 1 0 8.4" stroke="currentColor" fill="none" stroke-width="1.3" stroke-linecap="round"/></svg>',
    video: '<svg viewBox="0 0 16 16"><rect x="1.5" y="3.5" width="9" height="9" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M11 7l3.6-2.4v6.8L11 9z" fill="currentColor"/></svg>',
    group: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4 6h8M4 8.5h8M4 11h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    fade: '<svg viewBox="0 0 16 16"><path d="M1.5 13.5C6.5 13.5 8.5 2.5 14.5 2.5" stroke="currentColor" fill="none" stroke-width="1.6" stroke-linecap="round"/></svg>',
    stop: '<svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor"/></svg>',
    start: '<svg viewBox="0 0 16 16"><path d="M4.5 2.8l9 5.2-9 5.2z" fill="currentColor"/></svg>',
    goto: '<svg viewBox="0 0 16 16"><path d="M2 12V8.5A3.5 3.5 0 0 1 5.5 5H13" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round"/><path d="M10.5 2.3L13.4 5l-2.9 2.7" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    wait: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.5V8l2.4 1.6" stroke="currentColor" fill="none" stroke-width="1.4" stroke-linecap="round"/></svg>',
    memo: '<svg viewBox="0 0 16 16"><path d="M3.5 2.5h6l3 3v8h-9z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.5 8h5M5.5 10.5h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
    midi: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="5" cy="8" r="1" fill="currentColor"/><circle cx="11" cy="8" r="1" fill="currentColor"/><circle cx="8" cy="5" r="1" fill="currentColor"/><circle cx="6" cy="5.9" r=".9" fill="currentColor"/><circle cx="10" cy="5.9" r=".9" fill="currentColor"/></svg>',
    osc: '<svg viewBox="0 0 16 16"><circle cx="8" cy="9" r="1.6" fill="currentColor"/><path d="M5 6a4.2 4.2 0 0 1 6 0M3 4a7 7 0 0 1 10 0" stroke="currentColor" fill="none" stroke-width="1.4" stroke-linecap="round"/><path d="M8 10.5V14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    pause: '<svg viewBox="0 0 16 16"><rect x="3.5" y="3" width="3" height="10" rx="1" fill="currentColor"/><rect x="9.5" y="3" width="3" height="10" rx="1" fill="currentColor"/></svg>',
    play: '<svg viewBox="0 0 16 16"><path d="M4.5 2.8l9 5.2-9 5.2z" fill="currentColor"/></svg>',
    panic: '<svg viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="currentColor"/></svg>',
    x: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    gear: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    lock: '<svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5.2 7V5a2.8 2.8 0 0 1 5.6 0v2" stroke="currentColor" fill="none" stroke-width="1.5"/></svg>',
    unlock: '<svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5.2 7V5a2.8 2.8 0 0 1 5.4-1" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round"/></svg>',
    monitor: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="8.5" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 14h5M8 11v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    chev: '<svg viewBox="0 0 16 16"><path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cont: '<svg viewBox="0 0 16 16"><path d="M3 4v4.5a2 2 0 0 0 2 2h7" stroke="currentColor" fill="none" stroke-width="1.6" stroke-linecap="round"/><path d="M10 8l2.6 2.5L10 13" stroke="currentColor" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    follow: '<svg viewBox="0 0 16 16"><path d="M8 2.5v9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M4.5 8.5L8 12l3.5-3.5" stroke="currentColor" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 14h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    file: '<svg viewBox="0 0 16 16"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    save: '<svg viewBox="0 0 16 16"><path d="M2.5 2.5h9l2 2v9h-11z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><rect x="5" y="9" width="6" height="4.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5 2.5V5.5h5V2.5" stroke="currentColor" fill="none" stroke-width="1.2"/></svg>',
    newdoc: '<svg viewBox="0 0 16 16"><path d="M3.5 1.5h6l3 3v10h-9z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 7v5M5.5 9.5h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    import: '<svg viewBox="0 0 16 16"><path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.5 11v2.5h11V11" stroke="currentColor" fill="none" stroke-width="1.4" stroke-linecap="round"/></svg>',
    text: '<svg viewBox="0 0 16 16"><path d="M3 3.5h10M8 3.5v9.5M5.5 13h5" stroke="currentColor" fill="none" stroke-width="1.6" stroke-linecap="round"/></svg>',
    camera: '<svg viewBox="0 0 16 16"><rect x="1.5" y="4" width="13" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8.5" r="2.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 4l1-1.5h3l1 1.5" stroke="currentColor" fill="none" stroke-width="1.3"/></svg>',
    timecode: '<svg viewBox="0 0 16 16"><rect x="1.5" y="4" width="13" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3.5 10V6h1.5v4h1.5V6h1.5v4h1.5V6h1.5v4h1.5" stroke="currentColor" fill="none" stroke-width="1.1"/></svg>',
    light: '<svg viewBox="0 0 16 16"><path d="M8 1.8a4.3 4.3 0 0 0-2.6 7.7c.5.4.8 1 .8 1.6v.7h3.6v-.7c0-.6.3-1.2.8-1.6A4.3 4.3 0 0 0 8 1.8z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6.2 13.6h3.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    script: '<svg viewBox="0 0 16 16"><path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5M9 3l-2 10" stroke="currentColor" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    mic: '<svg viewBox="0 0 16 16"><rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5M5.5 14.5h5" stroke="currentColor" fill="none" stroke-width="1.4" stroke-linecap="round"/></svg>',
    rehearse: '<svg viewBox="0 0 16 16"><path d="M2 6h2.6L8 3.2v9.6L4.6 10H2z" fill="currentColor"/><path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    keyboard: '<svg viewBox="0 0 16 16"><rect x="1.5" y="4" width="13" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4 6.5h1M7 6.5h1M10 6.5h2M4 9.5h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    cart: '<svg viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" fill="currentColor"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="9" y="9" width="5.5" height="5.5" rx="1" fill="currentColor"/></svg>',
    check: '<svg viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    tools: '<svg viewBox="0 0 16 16"><path d="M10.5 1.8a3.5 3.5 0 0 0-3.3 4.6L2 11.6 4.4 14l5.2-5.2a3.5 3.5 0 0 0 4.6-3.3l-2 2-2.1-.5-.5-2.1z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    sm: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4 5.5h8M4 8h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M6 14h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    app: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4.6 6.4c2.2-.8 4.7-.6 6.8.6M5 8.6c1.8-.6 3.8-.4 5.4.5M5.5 10.7c1.4-.4 2.8-.3 4 .4" stroke="currentColor" fill="none" stroke-width="1.2" stroke-linecap="round"/></svg>',
    ma: '<svg viewBox="0 0 16 16"><path d="M2 13V4l3 5 3-5v9" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><path d="M9.5 13l2.5-9 2.5 9M10.4 10h3.2" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    eye: '<svg viewBox="0 0 16 16"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>',
    shot: '<svg viewBox="0 0 16 16"><rect x="1.5" y="4" width="13" height="9" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8.5" r="2.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 4l1-1.6h3l1 1.6" stroke="currentColor" fill="none" stroke-width="1.2"/><circle cx="12.3" cy="6.2" r=".7" fill="currentColor"/></svg>',
    panels: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10 2.5v11M10 6.5h4.5M10 10h4.5" stroke="currentColor" stroke-width="1.3"/></svg>',
    export: '<svg viewBox="0 0 16 16"><path d="M8 10V2M5 5l3-3 3 3" stroke="currentColor" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.5 11v2.5h11V11" stroke="currentColor" fill="none" stroke-width="1.4" stroke-linecap="round"/></svg>',
  };

  // ---------------------------------------------------------------- cue model
  const TYPES = {
    audio: { label: 'Audio', d: { file: '', device: '', level: 0, pan: 0, rate: 1, preservePitch: false, start: 0, end: 0, playCount: 1, fadeIn: 0, fadeOut: 0, eqOn: false, eqLow: 0, eqMid: 0, eqMidFreq: 1000, eqHigh: 0, routing: null, duckOthers: false, duckAmount: 12, duckAttack: 0.3, duckRelease: 1.0, duckExempt: false, markers: [], xfade: 'off', xfadeTime: 2, xfadeScope: '', vocal: 'off', vocalBass: 160, surround: false, surroundMap: null } },
    video: { label: 'Video', d: { file: '', surface: '', device: '', layer: 1, fit: 'contain', opacity: 100, level: 0, rate: 1, start: 0, end: 0, playCount: 1, fadeIn: 0, fadeOut: 0, imageDuration: 0, holdLast: false, duckExempt: false, transition: 'fade', transitionOut: '', xfade: 'off', xfadeTime: 1, xfadeScope: '', key: null } },
    mic: { label: 'Mic', d: { inputDevice: '', device: '', level: 0, pan: 0, fadeIn: 0.2, fadeOut: 0.5, duration: 0, eqOn: false, eqLow: 0, eqMid: 0, eqMidFreq: 1000, eqHigh: 0, routing: null, duckOthers: true, duckAmount: 12, duckAttack: 0.3, duckRelease: 1.0, duckExempt: false, xfade: 'off', xfadeTime: 2, xfadeScope: '' } },
    text: { label: 'Text', d: { surface: '', layer: 5, text: 'Welcome', font: '', size: 8, textColor: '#ffffff', bold: true, align: 'center', position: 'middle', bgColor: '#000000', bgOpacity: 0, shadow: true, opacity: 100, fadeIn: 0.5, fadeOut: 0.5, duration: 0, countMode: 'none', countFrom: 300, countUntil: '19:30', transition: 'fade', transitionOut: '', xfade: 'off', xfadeTime: 0.5, xfadeScope: '' } },
    camera: { label: 'Camera', d: { surface: '', layer: 2, deviceId: '', fit: 'cover', opacity: 100, mirror: false, fadeIn: 0, fadeOut: 0, duration: 0, resolution: '1920x1080', fps: 0, transition: 'fade', transitionOut: '', xfade: 'off', xfadeTime: 1, xfadeScope: '', key: null } },
    group: { label: 'Group', d: { mode: 'all', playCount: 1, gap: 0, crossfade: 0, resume: false, slideDuration: 5, endAction: 'stop', endTarget: '', stepWrap: false, children: [], collapsed: false } },
    fade: { label: 'Fade', d: { target: '', setLevel: true, level: -60, setOpacity: false, opacity: 0, duration: 3, curve: 'scurve', stopWhenDone: true } },
    stop: { label: 'Stop', d: { target: '', action: 'stop', fadeTime: 0 } },
    start: { label: 'Start', d: { target: '' } },
    goto: { label: 'Go To', d: { target: '' } },
    wait: { label: 'Wait', d: { duration: 5 } },
    memo: { label: 'Memo', d: {} },
    midi: { label: 'MIDI', d: { midiOut: '', message: 'note_on', channel: 1, data1: 60, data2: 127, mscDevice: 127, mscCue: '1' } },
    osc: { label: 'OSC', d: { host: '127.0.0.1', port: 8000, address: '/', args: '' } },
    timecode: { label: 'Timecode', d: { tcMode: 'ltc', fps: '25', startTC: '01:00:00:00', duration: 0, device: '', channel: 1, level: -10, midiOut: '' } },
    light: { label: 'Light', d: { proto: 'artnet', host: '', universe: 0, values: '1@255', fade: 2, curve: 'linear' } },
    script: { label: 'Script', d: { mode: 'http', command: '', method: 'GET', url: 'http://', body: '', headers: '' } },
    app: { label: 'App Control', d: { app: 'spotify', action: 'playpause', value: 50, fadeTime: 3, uri: '' } },
    ma: { label: 'MA Lighting', d: { console: 'ma3', proto: 'osc', host: '', port: 8000, oscPrefix: '', user: 'administrator', password: '', command: 'Go+ Sequence 1', midiOut: '', mscCommand: 'msc_go', mscDevice: 127, mscCue: '1', mscList: '' } },
  };
  const ADD_ORDER = ['audio', 'video', 'group', 'fade', 'stop', 'start', 'goto', 'wait', 'memo', 'midi', 'osc', 'text', 'camera', 'mic', 'timecode', 'light', 'script', 'app', 'ma'];
  const TRANSITIONS = [['fade', 'Fade'], ['cut', 'Cut'], ['dip', 'Dip to black'], ['wipe-right', 'Wipe → right'], ['wipe-left', 'Wipe ← left'], ['wipe-down', 'Wipe ↓ down'], ['wipe-up', 'Wipe ↑ up'], ['slide-left', 'Slide in from right'], ['slide-right', 'Slide in from left'], ['slide-up', 'Slide in from bottom'], ['slide-down', 'Slide in from top'], ['zoom', 'Zoom'], ['blur', 'Blur dissolve'], ['iris', 'Iris (circle)']];
  const APP_NAMES = { spotify: 'Spotify', music: 'Apple Music', system: 'System / any player' };
  const APP_ACTIONS = { play: 'Play', pause: 'Pause', playpause: 'Play / pause toggle', stop: 'Stop', next: 'Next track', previous: 'Previous track', volume: 'Set volume', fadeVolume: 'Fade volume', playUri: 'Play track / playlist', mute: 'Mute (system)', unmute: 'Unmute (system)', shuffleOn: 'Shuffle on', shuffleOff: 'Shuffle off', nowPlaying: 'Log what’s playing' };
  const COMMON = { number: '', name: '', notes: '', color: '', preWait: 0, postWait: 0, continueMode: 'none', armed: true, hotkey: '', midiTrigger: null, tcTrigger: '', todTrigger: '', notesSound: '', notesLights: '', notesVideo: '', stopOnGo: false, stopOnGoFade: 3 };
  const COLORS = { '': 'None', '#f43f5e': 'Red', '#f97316': 'Orange', '#facc15': 'Yellow', '#34d399': 'Green', '#22d3ee': 'Cyan', '#6366f1': 'Indigo', '#d946ef': 'Magenta' };
  const GROUP_MODES = {
    all: 'Timeline — start all children together (pre-waits = start times)',
    first: 'Sequence — start first child, then follow children’s continue settings',
    playlist: 'Playlist — play children one after another',
    shuffle: 'Shuffle — play children in random order',
    random1: 'Random — play one child at random each time',
    slideshow: 'Slideshow — show each child for a set time, with crossfades',
    step: 'Step — each GO plays the next child only',
  };
  const GROUP_BADGE = { all: 'TIMELINE', first: 'SEQUENCE', playlist: 'PLAYLIST', shuffle: 'SHUFFLE', random1: 'RANDOM', slideshow: 'SLIDESHOW', step: 'STEP' };
  const DEFAULT_SURFACE = () => ({ id: 'main', name: 'Main output', display: null, fullscreen: true, bg: '#000000', corners: null, blend: { left: 0, right: 0, top: 0, bottom: 0, gamma: 2.2 } });
  const DEFAULT_SETTINGS = {
    audioDevice: '', videoBg: '#000000', surfaces: [DEFAULT_SURFACE()],
    oscEnabled: true, oscPort: 53000, midiInput: '', mscReceive: false, mscDevice: 127,
    panicFade: 1.0, goProtect: 0.25, masterDb: 0, loudnessTarget: -16,
    midiTriggers: { go: null, panic: null, pause: null, resume: null, next: null, prev: null, xfader: null, xtake: null, blackout: null },
    remote: { enabled: false, port: 8080, pin: '', viewPin: false },
    backup: { role: 'off', host: '', port: 53000 },
    tcIn: { enabled: false },
    controllers: true,
    patches: [{ id: 'main', name: 'Mains', device: '' }, { id: 'mon', name: 'Monitors / foldback', device: '' }, { id: 'fx', name: 'Effects / surrounds', device: '' }],
    previewDevice: '',
    limiter: { on: true, ceiling: -1 },
    showStart: '', adminPin: '', outputProc: {},
    feedback: { enabled: false, host: '', port: 9000 },
    display: { waveList: true, waveActive: true, waveRemote: true },
    clicker: { enabled: true },
  };
  const CART_SIZE = 64;
  const prefs = {
    get(k, d) { try { const v = localStorage.getItem(`qforge.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(`qforge.${k}`, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  function newCue(type, useTemplate = true) {
    const tpl = useTemplate ? (prefs.get('templates', {})[type] || {}) : {};
    return { id: uid(), type, ...structuredClone(COMMON), ...structuredClone(TYPES[type].d), ...structuredClone(tpl) };
  }
  function normalizeCue(c) {
    if (!c || !TYPES[c.type]) return null;
    const n = { ...newCue(c.type, false), ...c };
    if (!n.id) n.id = uid();
    if (n.type === 'group') n.children = (c.children || []).map(normalizeCue).filter(Boolean);
    return n;
  }
  function cloneWithNewIds(c) {
    const n = structuredClone(c);
    T.walk([n], (x) => { x.id = uid(); });
    return n;
  }

  // ---------------------------------------------------------------- state
  const newList = (name) => ({ id: uid(), name, cues: [], playheadId: null });
  const emptyShow = () => ({ name: 'Untitled', settings: structuredClone(DEFAULT_SETTINGS), lists: [newList('Main')], cart: new Array(CART_SIZE).fill(null), stats: {}, script: { text: '', links: {} } });
  const S = {
    show: emptyShow(), listIdx: 0, view: 'list', cartSel: null, filter: '', loadTime: {},
    path: null, dirty: false, log: [], showTimer: { running: false, start: 0, acc: 0 },
    sel: new Set(), anchor: null, playheadId: null,
    locked: false, undo: [], redo: [], clipboard: null,
    durations: new Map(), missing: new Set(),
    tab: {}, lastGo: 0,
  };
  const settings = () => S.show.settings;
  const curList = () => S.show.lists[S.listIdx] || S.show.lists[0];
  const cues = () => curList().cues;
  const cartCues = () => S.show.cart.filter(Boolean);
  const find = (id) => T.find(cues(), id);
  function findAny(id) {
    if (!id) return null;
    for (const l of S.show.lists) { const f = T.find(l.cues, id); if (f) return { ...f, listObj: l }; }
    const f = T.find(cartCues(), id);
    return f ? { ...f, cart: true } : null;
  }
  const cueById = (id) => { const f = findAny(id); return f ? f.cue : null; };
  function walkAll(fn) { for (const l of S.show.lists) T.walk(l.cues, fn); T.walk(cartCues(), fn); }
  function allCues() { const out = []; walkAll((c) => { out.push(c); }); return out; }

  const rt = new QP.Runtime({
    findCue: (id) => cueById(id),
    siblingsOf: (id) => { for (const l of S.show.lists) if (l.cues.some((c) => c.id === id)) return l.cues; return null; },
    log: (kind, msg) => addLog(kind, msg),
    rehearsal: () => !!S.rehearsal,
    runEnded: (r, secs) => recordStat(r, secs),
    getSettings: settings,
    setPlayhead: (id) => setPlayhead(id, true),
    onChange: () => { S.needsUi = true; },
    keyPicked: (id, col) => { const c = cueById(id); if (c && c.key && c.key.autoColor) { c.key = { ...c.key, color: col, autoColor: false }; markDirty(); if (topSelected() && topSelected().id === id) renderInspector(); toast(`Key colour picked: ${col}`); } },
    error: (m) => { toast(m, 'err'); addLog('error', m); },
  });
  function addLog(kind, msg) {
    const d = new Date();
    const entry = { t: d.toISOString(), time: d.toLocaleTimeString([], { hour12: false }), kind, msg };
    S.log.push(entry);
    if (S.log.length > 3000) S.log.splice(0, S.log.length - 3000);
    P.logAppend(`${entry.t}\t${kind}\t${msg}`);
  }

  // ---------------------------------------------------------------- visible rows
  function matchesFilter(c) {
    const q = S.filter.trim().toLowerCase();
    if (!q) return true;
    return [c.number, displayName(c), c.notes, c.file ? baseName(c.file) : '', TYPES[c.type].label].some((v) => String(v || '').toLowerCase().includes(q));
  }
  function visibleRows() {
    const out = [];
    const filtering = !!S.filter.trim();
    const hasMatch = (c) => matchesFilter(c) || (c.type === 'group' && c.children.some(hasMatch));
    const rec = (list, depth, parent) => {
      for (const c of list) {
        if (filtering && !hasMatch(c)) continue;
        out.push({ cue: c, depth, parent, dim: filtering && !matchesFilter(c) });
        if (c.type === 'group' && (!c.collapsed || filtering)) rec(c.children, depth + 1, c);
      }
    };
    rec(cues(), 0, null);
    return out;
  }
  function displayName(c) {
    if (c.name) return c.name;
    const tgt = c.target ? cueById(c.target) : null;
    const tn = tgt ? (tgt.number ? `${tgt.number}` : displayName(tgt)) : '?';
    switch (c.type) {
      case 'audio': case 'video': return c.file ? stripExt(baseName(c.file)) : `${TYPES[c.type].label} cue`;
      case 'group': return 'Group';
      case 'fade': return c.target ? `Fade ${tn}` : 'Fade';
      case 'stop': {
        const act = { stop: 'Stop', pause: 'Pause', resume: 'Resume', devamp: 'Devamp' }[c.action] || 'Stop';
        return c.target ? `${act} ${tn}` : `${act} all`;
      }
      case 'start': return c.target ? `Start ${tn}` : 'Start';
      case 'goto': return c.target ? `Go to ${tn}` : 'Go to';
      case 'wait': return 'Wait';
      case 'memo': return 'Memo';
      case 'midi': return `MIDI ${c.message.replace('_', ' ')}`;
      case 'osc': return `OSC ${c.address}`;
      case 'text': return (c.text || 'Text').split('\n')[0].slice(0, 40);
      case 'camera': { const d = (S.videoInputs || []).find((x) => x.deviceId === c.deviceId); return d ? d.label || 'Camera' : 'Camera'; }
      case 'mic': { const d = (S.audioInputs || []).find((x) => x.deviceId === c.inputDevice); return `Mic · ${d ? d.label || 'input' : 'default input'}`; }
      case 'timecode': return `${c.tcMode === 'mtc' ? 'MTC' : 'LTC'} ${c.startTC}`;
      case 'light': return `Light ${c.values}`.slice(0, 40);
      case 'script': return c.mode === 'http' ? `${c.method} ${c.url}`.slice(0, 40) : `Run ${c.command}`.slice(0, 40);
      case 'app': return `${APP_NAMES[c.app] || c.app}: ${APP_ACTIONS[c.action] || c.action}${['volume', 'fadeVolume'].includes(c.action) ? ' ' + c.value + '%' : ''}`;
      case 'ma': return c.proto === 'msc' ? `MA MSC ${(c.mscCommand || 'msc_go').slice(4).toUpperCase()} ${c.mscCue}` : `MA: ${c.command}`.slice(0, 40);
      default: return '';
    }
  }
  function cueLabel(c) { return `${c.number ? c.number + ' · ' : ''}${displayName(c)}`; }
  function targetText(c) {
    if (['fade', 'start', 'goto', 'stop'].includes(c.type)) {
      if (!c.target) return c.type === 'stop' ? 'All cues' : '';
      const t = cueById(c.target);
      return t ? cueLabel(t) : '⚠ missing target';
    }
    if (c.type === 'audio' || c.type === 'video') return c.file ? `${baseName(c.file)}${c.type === 'video' && S.show.settings.surfaces.length > 1 ? ' → ' + surfaceName(c.surface) : ''}` : '⚠ no file';
    if (c.type === 'group') return `${c.children.length} cue${c.children.length === 1 ? '' : 's'}`;
    if (c.type === 'midi') return c.message.startsWith('msc') ? `MSC ${c.message.slice(4)} ${c.mscCue}` : `ch ${c.channel} · ${c.data1}${c.message === 'pc' ? '' : ' / ' + c.data2}`;
    if (c.type === 'osc') return `${c.host}:${c.port} ${c.address} ${c.args || ''}`;
    if (QP.VISUAL_TYPES.includes(c.type) && c.type !== 'video') return `→ ${surfaceName(c.surface)}`;
    if (c.type === 'mic') return `${c.duckOthers ? 'ducks others · ' : ''}${c.device ? 'custom output' : 'default output'}`;
    if (c.type === 'timecode') return c.tcMode === 'mtc' ? `MTC → ${c.midiOut || 'first MIDI out'} · ${c.fps}` : `LTC → ch ${c.channel} · ${c.fps} fps`;
    if (c.type === 'light') return `${c.proto === 'sacn' ? 'sACN' : 'Art-Net'} U${c.universe}${c.host ? ' · ' + c.host : ''}`;
    if (c.type === 'script') return c.mode === 'http' ? c.url : c.command;
    if (c.type === 'app') return c.action === 'playUri' ? c.uri : c.action === 'fadeVolume' ? `to ${c.value}% over ${c.fadeTime}s` : APP_NAMES[c.app] || '';
    if (c.type === 'ma') return `${c.console === 'ma2' ? 'grandMA2' : 'grandMA3'} · ${c.proto === 'telnet' ? 'Telnet' : c.proto === 'msc' ? 'MIDI Show Control' : 'OSC'}${c.proto !== 'msc' ? ' → ' + (c.host || '⚠ no IP') : ''}`;
    return '';
  }
  function mediaDuration(c) {
    if (!c.file) return null;
    if (c.type === 'audio') { const b = rt.audio.buffers.get(c.file); return b ? b.duration : null; }
    if (c.type === 'video') return QP.isImagePath(c.file) ? (Number(c.imageDuration) || 0) : S.durations.get(c.file) ?? null;
    return null;
  }
  function actionDuration(c) {
    switch (c.type) {
      case 'audio': case 'video': {
        const d = mediaDuration(c);
        if (d == null) return null;
        if (c.type === 'video' && QP.isImagePath(c.file)) return d || Infinity;
        const start = Math.min(Number(c.start) || 0, d);
        const end = Number(c.end) > 0 ? Math.min(Number(c.end), d) : d;
        const count = Number(c.playCount);
        if (count === 0) return Infinity;
        return (Math.max(0, end - start) * Math.max(1, count || 1)) / (Number(c.rate) || 1);
      }
      case 'fade': return Number(c.duration) || 0;
      case 'wait': return Number(c.duration) || 0;
      case 'text': case 'camera': case 'timecode': case 'mic': return Number(c.duration) > 0 ? Number(c.duration) : Infinity;
      case 'light': return Number(c.fade) || 0;
      case 'app': return c.action === 'fadeVolume' ? Number(c.fadeTime) || 0 : 0;
      case 'stop': return c.action === 'stop' ? Number(c.fadeTime) || 0 : 0;
      case 'group': {
        const count = Number(c.playCount);
        if (count === 0) return Infinity;
        const kids = c.children.map((k) => ({ k, d: actionDuration(k) }));
        if (kids.some((x) => x.d == null)) return null;
        let pass = 0;
        if (c.mode === 'all') pass = Math.max(0, ...kids.map((x) => (Number(x.k.preWait) || 0) + x.d));
        else if (c.mode === 'playlist' || c.mode === 'shuffle') pass = kids.reduce((a, x) => a + x.d, 0) + Math.max(0, kids.length - 1) * (Number(c.gap) || 0);
        else return null;
        return pass * Math.max(1, count || 1);
      }
      default: return 0;
    }
  }
  function surfaceName(id) { const all = settings().surfaces || []; const sf = all.find((x) => x.id === id) || all[0]; return sf ? sf.name : 'Output'; }
  function nextNumber() {
    let max = 0;
    walkAll((c) => { const n = parseFloat(c.number); if (!isNaN(n) && isFinite(n)) max = Math.max(max, Math.floor(n)); });
    return String(max + 1);
  }

  // ---------------------------------------------------------------- undo / dirty
  let lastUndoKey = null, lastUndoAt = 0;
  function pushUndo(key) {
    const t = Date.now();
    if (key && key === lastUndoKey && t - lastUndoAt < 1500) { lastUndoAt = t; return; }
    S.undo.push(snap());
    if (S.undo.length > 200) S.undo.shift();
    S.redo = [];
    lastUndoKey = key; lastUndoAt = t;
  }
  function snap() { return { lists: JSON.stringify(S.show.lists), cart: JSON.stringify(S.show.cart), listIdx: S.listIdx, playhead: S.playheadId }; }
  function restore(snap) {
    S.show.lists = JSON.parse(snap.lists);
    S.show.cart = JSON.parse(snap.cart);
    S.listIdx = Math.min(snap.listIdx || 0, S.show.lists.length - 1);
    S.playheadId = snap.playhead && cueById(snap.playhead) ? snap.playhead : null;
    for (const id of [...S.sel]) if (!cueById(id)) S.sel.delete(id);
    markDirty(); renderAll();
  }
  function undo() { if (!S.undo.length) return; S.redo.push(snap()); restore(S.undo.pop()); lastUndoKey = null; toast('Undo'); }
  function redo() { if (!S.redo.length) return; S.undo.push(snap()); restore(S.redo.pop()); lastUndoKey = null; toast('Redo'); }
  function markDirty(v = true) { S.dirty = v; P.setDirty(v); updateTitle(); if (v) collabChanged(); }
  function updateTitle() {
    const name = S.path ? baseName(S.path).replace(/\.qforge$/i, '') : S.show.name;
    P.setTitle(`${name}${S.dirty ? ' •' : ''} — QForge`);
    $('#st-show').textContent = S.path || 'Unsaved show';
  }

  // ---------------------------------------------------------------- status / toast
  let toastTimer = null;
  function toast(msg, kind = 'info') {
    const el = $('#st-msg');
    el.textContent = msg; el.className = kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.textContent = ''; el.className = ''; }, kind === 'err' ? 7000 : 3500);
  }

  // ---------------------------------------------------------------- selection / playhead
  function setPlayhead(id, select = false, fromSync = false) {
    if (id && !find(id)) { const f = findAny(id); if (f && f.listObj) switchList(S.show.lists.indexOf(f.listObj)); }
    S.playheadId = id && find(id) ? id : null;
    if (!fromSync) sync('playhead', S.playheadId || '');
    if (select && S.playheadId) { revealCue(S.playheadId); S.sel = new Set([S.playheadId]); S.anchor = S.playheadId; renderList(); renderInspector(); }
    else updateRowClasses();
    renderStandby();
    scrollToCue(S.playheadId);
  }
  function revealCue(id) {
    let f = find(id), changed = false;
    while (f && f.parent) { if (f.parent.collapsed) { f.parent.collapsed = false; changed = true; } f = find(f.parent.id); }
    if (changed) renderList();
  }
  function scrollToCue(id) {
    if (!id) return;
    const tr = rowEls.get(id);
    if (tr) tr.scrollIntoView({ block: 'nearest' });
  }
  function selectedCues() { return visibleRows().map((r) => r.cue).filter((c) => S.sel.has(c.id)); }
  function topSelected() {
    // selected cues whose ancestors aren't also selected
    return selectedCues().filter((c) => { let f = find(c.id); while (f && f.parent) { if (S.sel.has(f.parent.id)) return false; f = find(f.parent.id); } return true; });
  }
  function clickRow(id, e) {
    const rows = visibleRows().map((r) => r.cue.id);
    if (e.shiftKey && S.anchor && rows.includes(S.anchor)) {
      const a = rows.indexOf(S.anchor), b = rows.indexOf(id);
      S.sel = new Set(rows.slice(Math.min(a, b), Math.max(a, b) + 1));
    } else if (e.metaKey || e.ctrlKey) {
      if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id);
      S.anchor = id;
    } else {
      S.sel = new Set([id]); S.anchor = id;
    }
    S.playheadId = id;
    S.cartSel = null;
    sync('playhead', id);
    updateRowClasses(); renderStandby(); renderInspector();
  }
  function movePlayhead(dir, extend) {
    const rows = visibleRows().map((r) => r.cue.id);
    if (!rows.length) return;
    let i = rows.indexOf(S.playheadId);
    i = i < 0 ? (dir > 0 ? 0 : rows.length - 1) : QP.clamp(i + dir, 0, rows.length - 1);
    const id = rows[i];
    if (extend) S.sel.add(id); else { S.sel = new Set([id]); S.anchor = id; }
    S.playheadId = id;
    sync('playhead', id);
    updateRowClasses(); renderStandby(); renderInspector(); scrollToCue(id);
  }

  // ---------------------------------------------------------------- GO and transport
  function fireCue(c, opts = {}) {
    rt.audio.resumeAll();
    const off = S.loadTime[c.id];
    if (off != null) { delete S.loadTime[c.id]; refreshInspectorWave(); }
    return rt.fire(c, { ...opts, offset: off });
  }
  function go(fromSync = false) {
    const t = performance.now() / 1000;
    if (!fromSync && t - S.lastGo < (Number(settings().goProtect) || 0)) return;
    S.lastGo = t;
    const f = S.playheadId ? find(S.playheadId) : null;
    if (!f) { toast('Nothing in standby', 'err'); return; }
    if (!fromSync) sync('go', f.cue.id);
    rt.onGo();
    const stepMore = f.cue.type === 'group' && f.cue.mode === 'step' && rt.stepInfo(f.cue).more;
    fireCue(f.cue, { parentRun: null });
    if (stepMore) { renderStandby(); renderInspector(); const btn = $('#go'); btn.classList.add('flash'); setTimeout(() => btn.classList.remove('flash'), 140); return; }
    // advance past the auto-continue / auto-follow chain in the same list
    const list = f.list;
    let j = f.index;
    while (list[j].continueMode && list[j].continueMode !== 'none' && j + 1 < list.length) j++;
    let next = list[j + 1];
    if (!next && f.parent) { const pf = find(f.parent.id); next = pf ? pf.list[pf.index + 1] : null; }
    setPlayhead(next ? next.id : null, true, true);
    const btn = $('#go'); btn.classList.add('flash'); setTimeout(() => btn.classList.remove('flash'), 140);
  }
  function fireCueById(id, fromSync = false) { const c = cueById(id); if (c) { if (!fromSync) sync('fire', id); fireCue(c); } }
  function cueByNumber(num) { let hit = null; walkAll((c) => { if (!hit && String(c.number) === String(num)) hit = c; }); return hit; }
  function fireByNumber(num) {
    const hit = cueByNumber(num);
    if (hit) { sync('fire', hit.id); fireCue(hit); } else toast(`No cue numbered ${num}`, 'err');
    return hit;
  }
  function stopCueById(id, fromSync = false) { if (!fromSync) sync('stop', id); for (const r of rt.runsFor(id)) rt.stopRun(r, 0); }
  const panic = (fromSync = false) => { if (!fromSync) sync('panic'); rt.panic(); toast(rt.runs.some((r) => r.stopping) ? 'Stopping all… (press again to stop instantly)' : 'All stopped'); };
  const pauseAll = (fromSync = false) => { if (!fromSync) sync('pause'); rt.pauseAll(); };
  const resumeAll = (fromSync = false) => { if (!fromSync) sync('resume'); rt.resumeAll(); };

  // ---------------------------------------------------------------- editing operations
  function insertionPoint() {
    const sel = selectedCues();
    if (!sel.length) return { list: cues(), index: cues().length };
    const last = sel[sel.length - 1];
    const f = find(last.id);
    if (last.type === 'group' && !last.collapsed && sel.length === 1) return { list: last.children, index: last.children.length };
    return { list: f.list, index: f.index + 1 };
  }
  function insertCues(newCues, at) {
    if (S.locked) return;
    pushUndo(null);
    const p = at || insertionPoint();
    p.list.splice(p.index, 0, ...newCues);
    S.sel = new Set(newCues.map((c) => c.id));
    S.anchor = newCues[newCues.length - 1].id;
    if (!S.playheadId || newCues.length) S.playheadId = newCues[0].id;
    markDirty(); renderAll();
  }
  function addCue(type) {
    if (S.locked) return;
    if (type === 'group' && S.sel.size > 1) return groupSelected();
    const c = newCue(type);
    c.number = nextNumber();
    // smart defaults: fade/stop/start/goto target the selected cue
    const sel = selectedCues();
    if (['fade', 'stop', 'start', 'goto'].includes(type) && sel.length === 1 && sel[0].type !== type) {
      if (type !== 'goto') c.target = sel[0].id;
    }
    insertCues([c]);
    if (type === 'audio' || type === 'video') chooseFileFor(c);
  }
  async function chooseFileFor(cue) {
    const paths = await P.chooseMedia(cue.type === 'audio' ? 'audio' : 'video');
    if (!paths || !paths.length) return;
    pushUndo(null);
    cue.file = paths[0];
    afterFileSet(cue);
    // extra files become extra cues after this one
    if (paths.length > 1 && find(cue.id)) {
      const f = find(cue.id);
      const extra = paths.slice(1).map((p) => { const c = newCue(cue.type); c.file = p; return c; });
      let n = parseInt(nextNumber(), 10);
      for (const c of extra) c.number = String(n++);
      f.list.splice(f.index + 1, 0, ...extra);
      extra.forEach(afterFileSet);
    }
    markDirty(); renderAll();
  }
  function afterFileSet(cue) {
    if (!cue.file) return;
    if (cue.type === 'audio') rt.audio.load(cue.file).then(() => { S.needsList = true; refreshInspectorWave(); }).catch((e) => toast(`${baseName(cue.file)}: ${e.message}`, 'err'));
    if (cue.type === 'video') probeVideo(cue.file);
    checkMissing();
  }
  function probeVideo(path) {
    if (QP.isImagePath(path) || S.durations.has(path)) return;
    const v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => { S.durations.set(path, v.duration); v.removeAttribute('src'); v.load(); S.needsList = true; };
    v.onerror = () => { S.durations.set(path, null); };
    v.src = P.mediaUrl(path);
  }
  function deleteSelected() {
    if (S.locked || !S.sel.size) return;
    pushUndo(null);
    const rows = visibleRows().map((r) => r.cue.id);
    const firstIdx = rows.findIndex((id) => S.sel.has(id));
    for (const c of topSelected()) { const f = find(c.id); if (f) f.list.splice(f.index, 1); }
    S.sel.clear();
    const remaining = visibleRows().map((r) => r.cue.id);
    const nid = remaining[Math.min(firstIdx, remaining.length - 1)];
    if (nid) { S.sel.add(nid); S.anchor = nid; }
    if (!S.playheadId || !cueById(S.playheadId)) S.playheadId = nid || null;
    markDirty(); renderAll();
  }
  function renumberClones(list) {
    let n = parseInt(nextNumber(), 10);
    T.walk(list, (c) => { if (c.number !== '') c.number = String(n++); });
  }
  function duplicate() {
    if (S.locked) return;
    const top = topSelected();
    if (!top.length) return;
    const clones = top.map(cloneWithNewIds);
    renumberClones(clones);
    const f = find(top[top.length - 1].id);
    insertCues(clones, { list: f.list, index: f.index + 1 });
  }
  function copySel(cut) {
    const top = topSelected();
    if (!top.length) return;
    S.clipboard = JSON.stringify(top);
    toast(`${cut ? 'Cut' : 'Copied'} ${top.length} cue${top.length > 1 ? 's' : ''}`);
    if (cut) deleteSelected();
  }
  function paste() {
    if (S.locked || !S.clipboard) return;
    const clones = JSON.parse(S.clipboard).map(normalizeCue).filter(Boolean).map(cloneWithNewIds);
    renumberClones(clones);
    insertCues(clones);
  }
  function groupSelected() {
    if (S.locked) return;
    const top = topSelected();
    if (!top.length) { addCueRaw('group'); return; }
    const fs0 = top.map((c) => find(c.id));
    if (!fs0.every((f) => f.list === fs0[0].list)) { toast('Select cues that are in the same list to group them', 'err'); return; }
    pushUndo(null);
    const list = fs0[0].list;
    const idx = Math.min(...fs0.map((f) => f.index));
    const ordered = fs0.sort((a, b) => a.index - b.index).map((f) => f.cue);
    for (const c of ordered) list.splice(list.indexOf(c), 1);
    const g = newCue('group');
    g.number = nextNumber();
    g.children = ordered;
    list.splice(idx, 0, g);
    S.sel = new Set([g.id]); S.anchor = g.id; S.playheadId = g.id;
    markDirty(); renderAll();
  }
  function addCueRaw(type) { const c = newCue(type); c.number = nextNumber(); insertCues([c]); }
  function ungroup() {
    if (S.locked) return;
    const groups = topSelected().filter((c) => c.type === 'group');
    if (!groups.length) return;
    pushUndo(null);
    const newSel = new Set();
    for (const g of groups) {
      const f = find(g.id);
      f.list.splice(f.index, 1, ...g.children);
      g.children.forEach((k) => newSel.add(k.id));
    }
    S.sel = newSel;
    markDirty(); renderAll();
  }
  function moveCues(ids, targetId, pos) {
    if (S.locked) return;
    const moving = ids.map(cueById).filter(Boolean);
    if (!moving.length || ids.includes(targetId)) return;
    if (moving.some((m) => m.type === 'group' && T.isAncestor(cues(), m.id, targetId))) { toast('Cannot move a group inside itself', 'err'); return; }
    pushUndo(null);
    for (const m of moving) { const f = find(m.id); f.list.splice(f.index, 1); }
    const t = find(targetId);
    if (!t) return;
    if (pos === 'into') { t.cue.children.push(...moving); t.cue.collapsed = false; }
    else t.list.splice(t.index + (pos === 'after' ? 1 : 0), 0, ...moving);
    markDirty(); renderAll();
  }
  function setField(cue, key, val, opts = {}) {
    if (S.locked) return;
    if (cue[key] === val) return;
    pushUndo(`f:${cue.id}:${key}`);
    cue[key] = val;
    markDirty();
    // live adjustments to playing instances
    for (const r of rt.runsFor(cue.id)) {
      if (key === 'level' && r.levelRamp && !r.stopping) r.levelRamp.rampTo(QP.dbToGain(val), 0.05, 'linear', rt.now());
      if (key === 'pan' && r.pan) r.pan.pan.value = QP.clamp(val, -1, 1);
      if (key === 'opacity' && r.opRamp && !r.stopping) { r.opBase = QP.clamp(val / 100, 0, 1); r.opRamp.rampTo(r.opBase, 0.05, 'linear', rt.now()); }
      if (key === 'geo' || key === 'fit' || key === 'mirror') { r.cue[key] = structuredClone(val); if (r.view || r.el) QP.applyGeo(r.view || r.el, cue); if (key === 'fit' && r.view) r.view.style.objectFit = val; }
      if (key === 'key') { r.cue.key = structuredClone(val); if (r.keyer && QP.keyActive(cue)) r.keyer.set(val); else if (QP.keyActive(cue) !== !!r.keyer) toast('Keying on/off takes effect the next time this cue starts'); }
      if (['transition', 'transitionOut', 'xfade', 'xfadeTime', 'xfadeScope'].includes(key)) r.cue[key] = val;
    }
    if (key === 'file') afterFileSet(cue);
    S.needsList = true;
    if (opts.rerender) renderInspector();
  }

  // ---------------------------------------------------------------- list rendering
  const rowEls = new Map();
  function renderList() {
    const tb = $('#cuelist tbody');
    tb.textContent = '';
    rowEls.clear();
    const rows = visibleRows();
    document.body.classList.toggle('cartmode', S.view === 'cart');
    document.body.classList.toggle('scriptmode', S.view === 'script');
    if (S.view === 'cart') renderCart();
    if (S.view === 'script') renderScript();
    document.body.classList.toggle('empty', rows.length === 0 && S.view === 'list' && !S.filter);
    for (const { cue: c, depth, dim } of rows) {
      const dur = actionDuration(c);
      const broken = ((c.type === 'audio' || c.type === 'video') && (!c.file || S.missing.has(c.file)))
        || (['fade', 'start', 'goto'].includes(c.type) && (!c.target || !cueById(c.target)))
        || (c.type === 'stop' && c.target && !cueById(c.target));
      const nameCell = h('div', { class: 'namecell' },
        h('span', { class: 'indent', style: `width:${depth * 18}px` }),
        c.type === 'group'
          ? h('button', { class: `disclose${c.collapsed ? '' : ' open'}`, title: 'Expand / collapse', onclick: (e) => { e.stopPropagation(); c.collapsed = !c.collapsed; renderList(); } }, icon('chev'))
          : (depth ? h('span', { style: 'width:16px;flex:none' }) : null),
        h('span', { class: 'nm' }, displayName(c)),
        c.type === 'group' ? h('span', { class: 'gmode' }, GROUP_BADGE[c.mode] || '') : null,
        (c.type === 'audio' || c.type === 'video' || c.type === 'group') && Number(c.playCount) !== 1
          ? h('span', { class: 'loopbadge', title: 'Loops' }, `⟲ ${Number(c.playCount) === 0 ? '∞' : '×' + c.playCount}`) : null,
      );
      const contIcon = c.continueMode === 'auto-continue' ? icon('cont') : c.continueMode === 'auto-follow' ? icon('follow') : null;
      const tr = h('tr', {
        class: `row t-${c.type}${c.armed === false ? ' disarmed' : ''}${broken ? ' broken' : ''}${dim ? ' dim' : ''}`,
        'data-id': c.id, draggable: S.locked ? 'false' : 'true',
      },
      h('td', { class: 'c-state' }, h('span', { class: 'stateicon ph', html: ICONS.chev }), h('span', { class: 'stateicon run', html: ICONS.play })),
      h('td', { class: 'c-num' }, c.number),
      h('td', { class: 'c-type', title: TYPES[c.type].label }, icon(c.type)),
      h('td', { class: 'c-name' }, nameCell),
      h('td', { class: 'c-target', title: c.file || '' }, c.type === 'audio' && settings().display.waveList ? miniWave(c) : null, c.type === 'audio' && c.surround ? h('span', { class: 'chbadge' }, 'SURR') : null, QP.keyActive(c) ? h('span', { class: 'chbadge key' }, 'KEY') : null, c.xfade && c.xfade !== 'off' ? h('span', { class: 'chbadge xf' }, c.xfade === 'manual' ? 'XF·M' : 'XF') : null, targetText(c)),
      h('td', { class: 'c-time' }, fmtTime(Number(c.preWait) || 0, true)),
      h('td', { class: 'c-time' }, dur == null ? '' : fmtTime(dur, ['memo', 'start', 'goto', 'midi', 'osc'].includes(c.type))),
      h('td', { class: 'c-time' }, c.continueMode === 'auto-continue' ? fmtTime(Number(c.postWait) || 0) : ''),
      h('td', { class: 'c-cont', title: { 'auto-continue': 'Auto-continue', 'auto-follow': 'Auto-follow' }[c.continueMode] || '' }, h('span', { class: 'cont' }, contIcon)));
      if (c.color) { const bar = h('span', { class: 'colorbar', style: `background:${c.color}` }); tr.lastChild.style.position = 'relative'; tr.lastChild.append(bar); }
      tr.addEventListener('mousedown', (e) => { if (e.button === 0 && !e.target.closest('.disclose')) clickRow(c.id, e); });
      tr.addEventListener('dblclick', () => { const n = $('#f-name'); if (n) { n.focus(); n.select(); } });
      tr.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!S.sel.has(c.id)) clickRow(c.id, { shiftKey: false, metaKey: false, ctrlKey: false }); rowMenu(c, e); });
      tr.addEventListener('dragstart', (e) => {
        if (!S.sel.has(c.id)) { S.sel = new Set([c.id]); updateRowClasses(); }
        e.dataTransfer.setData('application/x-qforge', JSON.stringify(topSelected().map((x) => x.id)));
        e.dataTransfer.effectAllowed = 'move';
      });
      tr.addEventListener('dragover', (e) => {
        e.preventDefault();
        const r = tr.getBoundingClientRect();
        const y = (e.clientY - r.top) / r.height;
        let pos = y < 0.5 ? 'before' : 'after';
        if (c.type === 'group' && y > 0.25 && y < 0.75) pos = 'into';
        clearDropMarks();
        tr.classList.add(`drop-${pos}`);
        tr.dataset.drop = pos;
      });
      tr.addEventListener('dragleave', () => tr.classList.remove('drop-before', 'drop-after', 'drop-into'));
      tr.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation();
        const pos = tr.dataset.drop || 'after';
        clearDropMarks();
        const ids = e.dataTransfer.getData('application/x-qforge');
        if (ids) moveCues(JSON.parse(ids), c.id, pos);
        else if (e.dataTransfer.files.length) {
          const t = find(c.id);
          const at = pos === 'into' ? { list: c.children, index: c.children.length } : { list: t.list, index: t.index + (pos === 'after' ? 1 : 0) };
          dropFiles(e.dataTransfer.files, at, { asGroup: e.altKey });
        }
      });
      rowEls.set(c.id, tr);
      tb.append(tr);
    }
    updateRowClasses();
    renderStandby();
    renderTabs();
    if (S.collab && S.collab.peers && S.collab.peers.length) renderPresence();
  }
  // ---------------------------------------------------------------- cue list tabs
  function switchList(i) {
    if (i < 0 || i >= S.show.lists.length || i === S.listIdx) return;
    curList().playheadId = S.playheadId;
    S.listIdx = i;
    S.playheadId = curList().playheadId && find(curList().playheadId) ? curList().playheadId : (cues()[0] ? cues()[0].id : null);
    S.sel = new Set(S.playheadId ? [S.playheadId] : []);
    S.view = 'list';
    renderAll();
  }
  function renderTabs() {
    const bar = $('#list-tabs');
    bar.textContent = '';
    S.show.lists.forEach((l, i) => {
      const running = rt.runs.some((r) => !r.parentRun && l.cues.some((c) => c.id === r.cueId));
      bar.append(h('button', {
        class: `ltab${i === S.listIdx && S.view === 'list' ? ' on' : ''}${running ? ' live' : ''}`,
        onclick: () => { S.view = 'list'; if (i !== S.listIdx) switchList(i); else renderAll(); },
        ondblclick: () => renameList(i),
        title: 'Double-click to rename',
      }, l.name, S.show.lists.length > 1 && !S.locked ? h('span', { class: 'lx', title: 'Delete list', onclick: (e) => { e.stopPropagation(); deleteList(i); } }, '×') : null));
    });
    if (!S.locked) bar.append(h('button', { class: 'ltab add', title: 'New cue list', onclick: addList }, '+'));
    bar.append(h('span', { class: 'spacer' }),
      h('button', { class: `ltab cart${S.view === 'script' ? ' on' : ''}`, onclick: () => { S.view = S.view === 'script' ? 'list' : 'script'; renderAll(); }, title: `Script view (${MOD}J)` }, icon('memo'), 'Script'),
      h('button', { class: `ltab cart${S.view === 'cart' ? ' on' : ''}`, onclick: toggleCart, title: `Cart wall (${MOD}K)` }, icon('cart'), 'Cart'));
  }
  async function addList() {
    const name = await promptModal('New cue list', 'List name', `List ${S.show.lists.length + 1}`);
    if (!name) return;
    pushUndo(null);
    S.show.lists.push(newList(name));
    markDirty();
    switchList(S.show.lists.length - 1);
  }
  async function renameList(i) {
    if (S.locked) return;
    const name = await promptModal('Rename cue list', 'List name', S.show.lists[i].name);
    if (!name) return;
    pushUndo(null); S.show.lists[i].name = name; markDirty(); renderTabs();
  }
  async function deleteList(i) {
    const l = S.show.lists[i];
    const r = await askModal('Delete cue list?', `Delete “${l.name}” and its ${T.all(l.cues).length} cues?`, ['Delete', 'Cancel']);
    if (r !== 0) return;
    pushUndo(null);
    S.show.lists.splice(i, 1);
    S.listIdx = Math.min(S.listIdx, S.show.lists.length - 1);
    S.playheadId = curList().playheadId || null;
    markDirty(); renderAll();
  }

  // ---------------------------------------------------------------- cart wall
  function toggleCart() { S.view = S.view === 'cart' ? 'list' : 'cart'; renderAll(); }
  function cartPad(i) {
    const c = S.show.cart[i];
    if (!c) return;
    const runs = rt.runsFor(c.id);
    if (runs.length) stopCueById(c.id); else fireCueById(c.id);
  }
  function setCartCue(i, cue) {
    pushUndo(null);
    S.show.cart[i] = cue;
    markDirty();
    if (cue) afterFileSet(cue);
    renderCart(); renderInspector();
  }
  async function choosePadFile(i) {
    if (S.locked) return;
    const paths = await P.chooseMedia('audio');
    if (!paths || !paths.length) return;
    pushUndo(null);
    paths.forEach((p, k) => {
      let j = i + k;
      while (j < CART_SIZE && S.show.cart[j] && k > 0) j++;
      if (j >= CART_SIZE) return;
      const c = newCue('audio'); c.file = p; S.show.cart[j] = c; afterFileSet(c);
    });
    S.cartSel = S.show.cart[i] ? S.show.cart[i].id : null;
    markDirty(); renderCart(); renderInspector();
  }
  const padEls = [];
  function renderCart() {
    const view = $('#cart-view');
    view.textContent = '';
    padEls.length = 0;
    const grid = h('div', { class: 'cartgrid' });
    for (let i = 0; i < CART_SIZE; i++) {
      const c = S.show.cart[i];
      const pad = h('div', {
        class: `pad${c ? ' assigned' : ''}${c && S.cartSel === c.id ? ' sel' : ''}`,
        style: c && c.color ? `--c:${c.color}` : '',
        draggable: c && !S.locked ? 'true' : 'false',
        title: c ? `${displayName(c)}${c.hotkey ? '  [' + c.hotkey + ']' : ''}\nClick to play / stop · Alt-click to edit` : (S.locked ? '' : 'Click to load a sound, or drop a file here'),
      },
      h('div', { class: 'pnum' }, String(i + 1), c && c.hotkey ? h('span', { class: 'pkey' }, c.hotkey) : null),
      h('div', { class: 'pname' }, c ? displayName(c) : ''),
      h('div', { class: 'pmeta' }, c ? (Number(c.playCount) === 0 ? '⟲ loop' : fmtTime(actionDuration(c) ?? NaN)) : ''),
      h('div', { class: 'pbar' }, h('i')),
      c && !S.locked ? h('button', { class: 'pclear', title: 'Clear pad', onclick: (e) => { e.stopPropagation(); setCartCue(i, null); } }, '×') : null);
      pad.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target.closest('.pclear')) return;
        if (!c) { choosePadFile(i); return; }
        if (e.altKey || e.metaKey || e.ctrlKey) { S.cartSel = c.id; renderCart(); renderInspector(); return; }
        S.cartSel = c.id;
        cartPad(i);
        renderInspector();
        for (const p of padEls) p.classList.toggle('sel', p === pad);
      });
      pad.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-qforge-pad', String(i)); });
      pad.addEventListener('dragover', (e) => { e.preventDefault(); pad.classList.add('over'); });
      pad.addEventListener('dragleave', () => pad.classList.remove('over'));
      pad.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation(); pad.classList.remove('over');
        if (S.locked) return;
        const from = e.dataTransfer.getData('application/x-qforge-pad');
        if (from !== '') {
          const a = Number(from); if (a === i) return;
          pushUndo(null); [S.show.cart[a], S.show.cart[i]] = [S.show.cart[i], S.show.cart[a]]; markDirty(); renderCart(); return;
        }
        const f = e.dataTransfer.files[0];
        if (f) { const nc = newCue(/\.(mp4|mov|m4v|webm|mkv|png|jpe?g|gif|webp)$/i.test(f.name) || (f.type || '').startsWith('video') ? 'video' : 'audio'); nc.file = P.pathForFile(f); setCartCue(i, nc); }
      });
      padEls.push(pad);
      grid.append(pad);
    }
    view.append(grid);
  }
  function updateCartStates() {
    if (S.view !== 'cart') return;
    S.show.cart.forEach((c, i) => {
      const pad = padEls[i]; if (!pad) return;
      const runs = c ? rt.runsFor(c.id) : [];
      pad.classList.toggle('playing', runs.length > 0);
      if (runs.length) {
        const inf = rt.info(runs[0]);
        const p = inf.total > 0 && isFinite(inf.total) ? QP.clamp(inf.elapsed / inf.total, 0, 1) : 1;
        pad.querySelector('.pbar i').style.width = `${(p * 100).toFixed(1)}%`;
        pad.querySelector('.pmeta').textContent = isFinite(inf.total) ? `-${fmtTime(Math.max(0, inf.total - inf.elapsed))}` : fmtTime(inf.elapsed);
      } else if (pad.classList.contains('was')) {
        pad.querySelector('.pbar i').style.width = '0';
        pad.querySelector('.pmeta').textContent = c ? (Number(c.playCount) === 0 ? '⟲ loop' : fmtTime(actionDuration(c) ?? NaN)) : '';
      }
      pad.classList.toggle('was', runs.length > 0);
    });
  }
  const waveCache = new Map();
  function miniWave(c) {
    const b = c.file && rt.audio.buffers.get(c.file);
    if (!b || !b.peaks) return null;
    const key = `${c.file}|${c.start}|${c.end}`;
    let url = waveCache.get(key);
    if (!url) {
      const W = 72, H = 18, cv = document.createElement('canvas');
      cv.width = W * 2; cv.height = H * 2;
      const g = cv.getContext('2d'); g.scale(2, 2);
      const dur = b.duration, s0 = Math.min(Number(c.start) || 0, dur), e0 = Number(c.end) > 0 ? Math.min(Number(c.end), dur) : dur;
      const grad = g.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, '#22d3ee'); grad.addColorStop(1, '#d946ef');
      g.fillStyle = grad;
      for (let x = 0; x < W; x++) {
        const t = s0 + ((e0 - s0) * x) / W;
        const v = b.peaks[Math.floor((t / dur) * b.peaks.length)] || 0;
        const hh = Math.max(0.5, v * (H / 2 - 1));
        g.fillRect(x, H / 2 - hh, 1, hh * 2);
      }
      url = cv.toDataURL();
      waveCache.set(key, url);
    }
    return h('img', { class: 'miniwave', src: url, alt: '' });
  }
  function clearDropMarks() { for (const tr of rowEls.values()) tr.classList.remove('drop-before', 'drop-after', 'drop-into'); }
  function updateRowClasses() {
    for (const [id, tr] of rowEls) {
      tr.classList.toggle('sel', S.sel.has(id));
      tr.classList.toggle('playhead', id === S.playheadId);
    }
  }
  function updateRunningRows() {
    const running = new Map();
    for (const r of rt.runs) {
      const inf = rt.info(r);
      const p = inf.total > 0 && isFinite(inf.total) ? QP.clamp(inf.elapsed / inf.total, 0, 1) : 0;
      if (!running.has(r.cueId) || (running.get(r.cueId).p < p)) running.set(r.cueId, { p, paused: r.paused });
    }
    for (const [id, tr] of rowEls) {
      const st = running.get(id);
      tr.classList.toggle('running', !!st);
      tr.classList.toggle('paused', !!(st && st.paused));
      if (st) tr.style.setProperty('--p', `${(st.p * 100).toFixed(1)}%`);
    }
  }
  function renderStandby() {
    const c = S.playheadId ? cueById(S.playheadId) : null;
    $('#sb-num').textContent = c ? (c.number || '') : '';
    $('#sb-name').textContent = c ? displayName(c) : '— end of cue list —';
    const dept = c ? [['SND', c.notesSound], ['LX', c.notesLights], ['VID', c.notesVideo]].filter(([, v]) => v) : [];
    const sn = $('#sb-notes');
    sn.textContent = c ? (c.notes || '') : '';
    for (const [k, v] of dept) sn.append(h('span', { class: 'dept' }, h('b', {}, k), v));
    $('#go').disabled = !c;
  }

  // ---------------------------------------------------------------- active panel
  const actEls = new Map();
  function renderActive() {
    const list = $('#active-list');
    const runs = rt.runs.filter((r) => !r.preview || true);
    const live = new Set();
    // order parents before children
    const ordered = [];
    const add = (parent) => { for (const r of runs) if (r.parentRun === parent) { ordered.push(r); add(r); } };
    add(null);
    for (const r of runs) if (!ordered.includes(r)) ordered.push(r);
    ordered.forEach((r, i) => {
      live.add(r.id);
      let el = actEls.get(r.id);
      if (!el) {
        el = h('div', { class: 'act' },
          h('div', { class: 'a-top' },
            h('span', { class: 'a-icon', html: ICONS[r.cue.type] }),
            h('div', { class: 'a-title' }, h('b', {}, r.cue.number || ''), displayName(r.cue)),
            h('button', { class: 'a-btn a-pause', title: 'Pause / resume', onclick: () => (r.paused ? rt.resumeRun(r) : rt.pauseRun(r)) }, icon('pause')),
            h('button', { class: 'a-btn', title: 'Stop', onclick: () => { rt.stopRun(r, 0); } }, icon('x'))),
          h('div', { class: 'a-meta' }, h('span', { class: 'a-phase' }), h('span', { class: 'a-time' })),
          r.cue.type === 'audio' && settings().display.waveActive ? h('div', { class: 'a-wave' }, h('img', { alt: '' }), h('img', { alt: '', class: 'played' }), h('i')) : h('div', { class: 'a-bar' }, h('i')),
          ['audio', 'mic'].includes(r.cue.type) ? h('div', { class: 'a-meter' }, h('i')) : null);
        if (r.cue.color) el.style.setProperty('--c', r.cue.color);
        if (r.parentRun) el.classList.add('child');
        actEls.set(r.id, el);
      }
      if (list.children[i] !== el) list.insertBefore(el, list.children[i] || null);
      const inf = rt.info(r);
      el.classList.toggle('paused', r.paused);
      el.classList.toggle('prewait', r.state === 'prewait');
      el.classList.toggle('postwait', inf.phase === 'Post-wait');
      el.querySelector('.a-phase').textContent = inf.phase;
      const rem = isFinite(inf.total) ? inf.total - inf.elapsed : null;
      el.querySelector('.a-time').textContent = inf.countdown
        ? `-${fmtTime(Math.max(0, rem))}`
        : `${fmtTime(Math.max(0, inf.elapsed))}${rem != null && inf.total > 0 ? '  /  -' + fmtTime(Math.max(0, rem)) : ''}`;
      const p = inf.total > 0 && isFinite(inf.total) ? QP.clamp(inf.elapsed / inf.total, 0, 1) : (r.loading ? 0 : 1);
      const bar = el.querySelector('.a-bar i');
      if (bar) bar.style.width = `${(p * 100).toFixed(1)}%`;
      const wv = el.querySelector('.a-wave');
      if (wv) {
        const img = wv.querySelector('img');
        if (!img.src || img.dataset.k !== `${r.cue.file}|${r.cue.start}|${r.cue.end}`) { const url = waveImage(r.cue, 280, 28); if (url) { img.src = url; wv.querySelector('img.played').src = url; img.dataset.k = `${r.cue.file}|${r.cue.start}|${r.cue.end}`; } }
        const f = runFraction(r);
        wv.querySelector('i').style.left = `${((f ?? p) * 100).toFixed(2)}%`;
        wv.style.setProperty('--p', `${((f ?? p) * 100).toFixed(2)}%`);
      }
      const mt = el.querySelector('.a-meter i');
      if (mt) { const pk = rt.runLevel(r); const db = pk ? QP.gainToDb(pk) : -60; mt.style.width = `${QP.clamp((db + 60) / 60, 0, 1) * 100}%`; mt.classList.toggle('hot', db > -1); }
      const pb = el.querySelector('.a-pause');
      const want = r.paused ? 'play' : 'pause';
      if (pb.dataset.ic !== want) { pb.dataset.ic = want; pb.innerHTML = ICONS[want]; }
    });
    for (const [id, el] of actEls) if (!live.has(id)) { el.remove(); actEls.delete(id); }
    $('#active-count').textContent = rt.runs.length ? String(rt.runs.length) : '';
  }

  // ---------------------------------------------------------------- inspector
  const insp = $('#inspector');
  let waveCtl = null;
  function renderInspector() {
    if (S.waveView) { S.waveView.destroy(); S.waveView = null; }
    insp.textContent = '';
    waveCtl = null;
    const sel = S.view === 'cart' ? (S.cartSel && cueById(S.cartSel) ? [cueById(S.cartSel)] : []) : selectedCues();
    if (sel.length > 1) { renderBulk(sel); return; }
    if (sel.length !== 1) {
      insp.append(h('div', { class: 'insp-head' }, h('div', { class: 'insp-title' }, sel.length ? `${sel.length} cues selected` : 'Inspector')),
        h('div', { class: 'insp-empty' }, sel.length
          ? h('div', {}, 'Multiple cues selected. ', h('button', { class: 'btn mini edit-only', onclick: groupSelected }, `Group them (${MOD}G)`))
          : S.view === 'cart' ? 'Click an empty pad to load a sound. Alt-click a pad to edit it without playing.' : 'Select a cue to edit it, or add one from the toolbar.'));
      return;
    }
    const c = sel[0];
    const tabsFor = c.type === 'audio' ? ['basics', 'time', 'audio', 'triggers']
      : QP.VISUAL_TYPES.includes(c.type) ? ['basics', c.type, 'fx', 'map', 'triggers']
      : ['basics', c.type !== 'memo' ? c.type : null, 'triggers'].filter(Boolean);
    let tab = S.tab[c.type] || 'basics';
    if (!tabsFor.includes(tab)) tab = 'basics';
    const tabLabel = { basics: 'Basics', triggers: 'Triggers', time: 'Time & Loops', audio: 'Audio Levels', map: 'Mapping', fx: c.type === 'text' ? 'Transitions' : 'Transitions & Keying', app: 'App Control', ma: 'MA Lighting' };
    const head = h('div', { class: 'insp-head' },
      h('div', { class: 'insp-title' }, icon(c.type), `${TYPES[c.type].label} cue`),
      h('div', { class: 'tabs' }, tabsFor.map((t) => h('button', { class: `tab${t === tab ? ' on' : ''}`, onclick: () => { S.tab[c.type] = t; renderInspector(); } }, tabLabel[t] || (t === 'stop' ? 'Action' : TYPES[t].label)))),
      h('div', { class: 'insp-actions' },
        ['audio', 'video', 'group', 'text', 'camera', 'timecode', 'mic'].includes(c.type) ? h('button', { class: 'btn mini', onclick: () => fireCue(c, { preview: true }) }, '▶ Preview') : null,
        h('button', { class: 'btn mini', onclick: () => { for (const r of rt.runsFor(c.id)) rt.stopRun(r, 0); } }, '■ Stop'),
        h('button', { class: 'btn mini', onclick: () => fireCueById(c.id), title: 'Fire this cue now without moving the playhead' }, 'Fire'),
        h('button', { class: 'btn mini edit-only', title: 'More', onclick: (e) => popMenu(e.currentTarget, [
          { label: `Save as default for new ${TYPES[c.type].label} cues`, fn: () => saveTemplate(c) },
          { label: `Reset ${TYPES[c.type].label} defaults`, fn: () => { const t = prefs.get('templates', {}); delete t[c.type]; prefs.set('templates', t); toast('Defaults reset'); } },
        ]) }, '⋯')));
    const body = h('fieldset', { class: 'insp-body', disabled: S.locked });
    if (tab === 'basics') body.append(basicsTab(c));
    else if (tab === 'triggers') body.append(triggersTab(c));
    else if (tab === 'time') body.append(timeTab(c));
    else if (tab === 'map') body.append(mapTab(c));
    else if (tab === 'fx') body.append(fxTab(c));
    else body.append(typeTab(c));
    insp.append(head, body);
  }
  function renderBulk(sel) {
    const allAudio = sel.every((c) => c.type === 'audio' || c.type === 'mic');
    const allVisual = sel.every((c) => QP.VISUAL_TYPES.includes(c.type));
    const same = (k) => { const v = sel[0][k]; return sel.every((c) => JSON.stringify(c[k]) === JSON.stringify(v)) ? v : undefined; };
    const apply = (k, v) => { if (S.locked) return; pushUndo(`bulk:${k}`); sel.forEach((c) => { c[k] = v; }); markDirty(); S.needsList = true; };
    const sel_ = (k, label, opts) => { const el = h('select', {}, h('option', { value: '__mixed' }, '— mixed —'), opts.map(([v, l]) => h('option', { value: v }, l))); const cur = same(k); el.value = cur === undefined ? '__mixed' : cur; el.onchange = () => { if (el.value !== '__mixed') apply(k, el.value); el.blur(); }; return h('label', { class: 'field' }, h('span', { class: 'flabel' }, label), el); };
    const time_ = (k, label) => { const cur = same(k); const el = h('input', { type: 'text', value: cur === undefined ? '' : fmtTime(Number(cur) || 0), placeholder: 'mixed' }); el.onchange = () => { if (el.value.trim() === '') return; const v = Math.max(0, parseTime(el.value)); el.value = fmtTime(v); apply(k, v); }; return h('label', { class: 'field' }, h('span', { class: 'flabel' }, label), el); };
    const num_ = (k, label, min, max) => { const cur = same(k); const el = h('input', { type: 'number', value: cur === undefined ? '' : cur, placeholder: 'mixed', min, max, step: 0.5 }); el.onchange = () => { if (el.value === '') return; apply(k, QP.clamp(Number(el.value), min, max)); }; return h('label', { class: 'field' }, h('span', { class: 'flabel' }, label), el); };
    const chk_ = (k, label) => { const cur = same(k); const el = h('input', { type: 'checkbox', checked: !!cur }); el.indeterminate = cur === undefined; el.onchange = () => { apply(k, el.checked); el.blur(); }; return h('label', { class: 'field check' }, el, h('span', { class: 'flabel' }, label)); };
    insp.append(
      h('div', { class: 'insp-head' }, h('div', { class: 'insp-title' }, icon('tools'), `Editing ${sel.length} cues`),
        h('div', { class: 'insp-actions' },
          h('button', { class: 'btn mini edit-only', onclick: groupSelected }, `Group (${MOD}G)`),
          h('button', { class: 'btn mini edit-only', onclick: () => renumber(false) }, 'Renumber…'),
          allAudio ? h('button', { class: 'btn mini edit-only', onclick: () => normalizeCues(sel) }, 'Normalise') : null)),
      h('fieldset', { class: 'insp-body', disabled: S.locked }, h('div', { class: 'grid' },
        h('div', { class: 'explain' }, 'Changes here apply to every selected cue. Fields showing “mixed” differ between cues and are left alone unless you change them.'),
        sel_('color', 'Colour', Object.entries(COLORS)),
        sel_('continueMode', 'Continue', [['none', 'Do not continue'], ['auto-continue', 'Auto-continue'], ['auto-follow', 'Auto-follow']]),
        time_('preWait', 'Pre-wait'), time_('postWait', 'Post-wait'),
        chk_('armed', 'Armed'),
        ...(allAudio || allVisual ? [time_('fadeIn', 'Fade in'), time_('fadeOut', 'Fade out')] : []),
        ...(allAudio ? [num_('level', 'Level (dB)', -60, 12), sel_('device', 'Output device', deviceOptions()), chk_('duckExempt', 'Never duck')] : []),
        ...(allVisual ? [sel_('surface', 'Output surface', surfaceOptions()), num_('layer', 'Layer', 1, 99)] : []))));
  }
  function rowMenu(c, e) {
    const add = (type, init) => {
      if (S.locked) return;
      const f = find(c.id); if (!f) return;
      const n = newCue(type); n.number = nextNumber(); Object.assign(n, init);
      insertCues([n], { list: f.list, index: f.index + 1 });
    };
    const runs = rt.runsFor(c.id);
    popMenu({ x: e.clientX, y: e.clientY }, [
      { label: runs.length ? 'Stop' : 'Fire now', icon: runs.length ? 'stop' : 'start', fn: () => (runs.length ? stopCueById(c.id) : fireCueById(c.id)) },
      { label: 'Put in standby', icon: 'chev', fn: () => setPlayhead(c.id, true) },
      ...(S.locked ? [] : [
        '-',
        { label: 'Add fade-out & stop (3 s) after this', icon: 'fade', fn: () => add('fade', { target: c.id, setLevel: true, level: -60, setOpacity: QP.VISUAL_TYPES.includes(c.type), opacity: 0, duration: 3, stopWhenDone: true }) },
        { label: 'Add Stop cue for this', icon: 'stop', fn: () => add('stop', { target: c.id }) },
        { label: 'Add Start cue for this', icon: 'start', fn: () => add('start', { target: c.id }) },
        ...(Number(c.playCount) !== 1 && ['audio', 'video', 'group'].includes(c.type) ? [{ label: 'Add Devamp cue for this loop', icon: 'stop', fn: () => add('stop', { target: c.id, action: 'devamp' }) }] : []),
        '-',
        { label: c.armed === false ? 'Arm' : 'Disarm', fn: () => { pushUndo(null); selectedCues().forEach((x) => { x.armed = c.armed === false; }); markDirty(); renderAll(); } },
        ...Object.entries(COLORS).map(([v, l]) => ({ label: `Colour: ${l}`, fn: () => { pushUndo(null); selectedCues().forEach((x) => { x.color = v; }); markDirty(); renderAll(); } })),
        '-',
        { label: 'Duplicate', kbd: `${MOD}D`, fn: duplicate },
        { label: 'Group selected', kbd: `${MOD}G`, fn: groupSelected },
        ...(c.type === 'group' ? [{ label: 'Ungroup', kbd: `${MOD}⇧G`, fn: ungroup }] : []),
        { label: 'Delete', kbd: '⌫', fn: deleteSelected },
      ]),
    ]);
  }
  function mapTab(c) {
    const geo = () => ({ x: 0, y: 0, w: 100, h: 100, scale: 100, rot: 0, cropL: 0, cropT: 0, cropR: 0, cropB: 0, corners: null, ...(c.geo || {}) });
    const setGeo = (patch) => { setField(c, 'geo', { ...geo(), ...patch }); };
    const num = (key, label, min, max, step, hint) => {
      const inp = h('input', { type: 'number', value: geo()[key], min, max, step });
      inp.addEventListener('change', () => { let v = parseFloat(inp.value); if (isNaN(v)) v = 0; v = QP.clamp(v, min, max); inp.value = v; setGeo({ [key]: v, ...(['x', 'y', 'w', 'h', 'scale', 'rot'].includes(key) ? { corners: null } : {}) }); });
      inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (!isNaN(v)) setGeo({ [key]: QP.clamp(v, min, max), ...(['x', 'y', 'w', 'h', 'scale', 'rot'].includes(key) ? { corners: null } : {}) }); });
      return h('label', { class: 'field' }, h('span', { class: 'flabel' }, label), inp, hint ? h('span', { class: 'hint' }, hint) : null);
    };
    const preset = (label, p) => h('button', { class: 'btn mini edit-only', onclick: () => { setField(c, 'geo', { ...geo(), x: 0, y: 0, w: 100, h: 100, scale: 100, rot: 0, corners: null, ...p }); renderInspector(); } }, label);
    const hasPin = !!(c.geo && c.geo.corners);
    return h('div', { class: 'grid' },
      h('div', { class: 'explain' }, `Place this ${TYPES[c.type].label.toLowerCase()} anywhere on “${surfaceName(c.surface)}”: move, size, rotate, crop or corner-pin it onto a set piece, screen or panel. Changes show live while the cue is running. For curved or irregular surfaces use Settings → Video outputs → Mesh warp, and masks to black out areas.`),
      h('div', { class: 'field full' }, h('span', { class: 'flabel' }, 'Quick layouts'), h('div', { class: 'learnbox', style: 'flex-wrap:wrap' },
        preset('Full screen', {}), preset('Left half', { x: -25, w: 50 }), preset('Right half', { x: 25, w: 50 }), preset('Top half', { y: -25, h: 50 }), preset('Bottom half', { y: 25, h: 50 }),
        preset('Centre 50%', { scale: 50 }), preset('Picture-in-picture', { x: 32, y: -32, scale: 30 }), preset('Lower third strip', { y: 37, h: 26 }))),
      num('x', 'Position X (%)', -150, 150, 0.5, '0 = centred'), num('y', 'Position Y (%)', -150, 150, 0.5, '0 = centred'),
      num('w', 'Width (% of output)', 1, 400, 0.5), num('h', 'Height (% of output)', 1, 400, 0.5),
      num('scale', 'Scale (%)', 1, 400, 1), num('rot', 'Rotation (°)', -360, 360, 0.5),
      num('cropL', 'Crop left (%)', 0, 100, 0.5), num('cropR', 'Crop right (%)', 0, 100, 0.5),
      num('cropT', 'Crop top (%)', 0, 100, 0.5), num('cropB', 'Crop bottom (%)', 0, 100, 0.5),
      h('div', { class: 'field full' }, h('span', { class: 'flabel' }, 'Corner-pin this cue'), h('div', { class: 'learnbox' },
        h('div', { class: 'lv' }, hasPin ? 'Corner-pinned (position/size fields are ignored)' : 'Not corner-pinned'),
        h('button', { class: 'btn mini edit-only', onclick: async () => {
          if (!rt.runsFor(c.id).length) fireCue(c, { preview: true });
          try { await rt.output.editCueQuad(c, (commit) => { setField(c, 'geo', { ...geo(), corners: c.geo.corners }); if (commit) renderInspector(); }); } catch (e) { toast(e.message, 'err'); }
        } }, 'Edit corners in output'),
        hasPin ? h('button', { class: 'btn mini edit-only', onclick: () => { setGeo({ corners: null }); renderInspector(); } }, 'Remove corner-pin') : null,
        h('button', { class: 'btn mini edit-only', onclick: () => { setField(c, 'geo', null); renderInspector(); } }, 'Reset all mapping'))));
  }
  function timeTab(c) {
    if (S.waveView) { S.waveView.destroy(); S.waveView = null; }
    S.waveState = S.waveState || {};
    const st = S.waveState[c.id] || (S.waveState[c.id] = {});
    const view = new QP.WaveView({
      cue: c, state: st,
      buffer: () => rt.audio.buffers.get(c.file),
      set: (k, v) => { if (!S.locked) setField(c, k, v); },
      runs: () => rt.runsFor(c.id),
      position: (r) => (r.seg ? rt.audioPosition(r, rt.now()) : null),
      loadTime: () => S.loadTime[c.id] ?? null,
      setLoadTime: (t) => { if (t == null) delete S.loadTime[c.id]; else S.loadTime[c.id] = t; },
      seek: (t) => rt.runsFor(c.id).forEach((r) => rt.seekRun(r, t)),
      locked: () => S.locked,
      fmt: (t) => fmtTime(t),
      onCommit: () => { syncTimeFields(); S.needsList = true; },
      preview: (from) => { rt.audio.resumeAll(); rt.fire(c, { preview: true, offset: from != null ? from : undefined }); },
    });
    S.waveView = view;
    waveCtl = { draw: () => view.draw(), cue: c };
    const fields = h('div', { class: 'grid time-fields' },
      fTime(c, 'start', 'Start (in)'),
      fTime(c, 'end', 'End (out)', { hint: '0 = end of file' }),
      fTime(c, 'fadeIn', 'Fade in'),
      fTime(c, 'fadeOut', 'Fade out', { hint: 'At the end of the last loop' }),
      fNum(c, 'playCount', 'Play count', { min: 0, step: 1, def: 1, hint: '1 = once · 0 = loop forever', rerender: true }),
      fNum(c, 'rate', 'Rate', { min: 0.25, max: 4, step: 0.05, def: 1 }),
      fCheck(c, 'preservePitch', 'Preserve pitch when rate ≠ 1'),
      inOutButtons(c),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Load to time'),
        h('div', { class: 'learnbox' }, h('div', { class: 'lv', id: 'lt-val' }, S.loadTime[c.id] != null ? fmtTime(S.loadTime[c.id]) : '— (Shift-click wave)'),
          h('button', { class: 'btn mini', onclick: () => { delete S.loadTime[c.id]; view.draw(); syncTimeFields(); } }, 'Clear'))),
      (c.markers || []).length ? h('div', { class: 'field full' }, h('span', { class: 'flabel' }, `Markers (${c.markers.length})`),
        h('div', { class: 'learnbox' },
          h('span', { class: 'hint', style: 'flex:1' }, c.markers.map((m, i) => `${i + 1}: ${fmtTime(m)}`).join('   ')),
          h('button', { class: 'btn mini edit-only', onclick: () => splitAtMarkers(c) }, `Split into ${c.markers.length + 1} cues`),
          h('button', { class: 'btn mini edit-only', onclick: () => { setField(c, 'markers', []); renderInspector(); } }, 'Clear markers'))) : null);
    function syncTimeFields() {
      // refresh numeric fields after dragging on the wave without rebuilding the wave view
      const set = (label, v) => { const f = [...fields.querySelectorAll('.field')].find((x) => x.querySelector('.flabel') && x.querySelector('.flabel').textContent === label); const inp = f && f.querySelector('input'); if (inp && document.activeElement !== inp) inp.value = fmtTime(Number(v) || 0); };
      set('Start (in)', c.start); set('End (out)', c.end); set('Fade in', c.fadeIn); set('Fade out', c.fadeOut);
      const lt = fields.querySelector('#lt-val'); if (lt) lt.textContent = S.loadTime[c.id] != null ? fmtTime(S.loadTime[c.id]) : '— (Shift-click wave)';
      const mkCount = (c.markers || []).length;
      if (mkCount !== (fields.dataset.mk ? Number(fields.dataset.mk) : mkCount)) renderInspector();
      fields.dataset.mk = mkCount;
    }
    fields.dataset.mk = (c.markers || []).length;
    // typing into a time field updates the wave immediately
    fields.addEventListener('change', () => setTimeout(() => view.draw(), 0));
    return h('div', { class: 'time-tab' }, view.el, fields);
  }
  function refreshInspectorWave() { if (waveCtl) waveCtl.draw(); }

  // field builders --------------------------------------------------
  const blurNonText = (el) => { if (el.type === 'checkbox' || el.type === 'range' || el.tagName === 'SELECT') el.blur(); };
  function fText(c, key, label, o = {}) {
    const inp = h('input', { type: 'text', value: c[key] ?? '', placeholder: o.placeholder || '', id: o.id });
    inp.addEventListener('change', () => setField(c, key, inp.value, o));
    return h('label', { class: `field ${o.cls || ''}` }, h('span', { class: 'flabel' }, label), inp, o.hint ? h('span', { class: 'hint' }, o.hint) : null);
  }
  function fArea(c, key, label, o = {}) {
    const inp = h('textarea', { placeholder: o.placeholder || '' });
    inp.value = c[key] || '';
    inp.addEventListener('change', () => setField(c, key, inp.value, o));
    return h('label', { class: `field ${o.cls || ''}` }, h('span', { class: 'flabel' }, label), inp);
  }
  function fNum(c, key, label, o = {}) {
    const inp = h('input', { type: 'number', value: c[key] ?? 0, step: o.step ?? 1, min: o.min, max: o.max });
    inp.addEventListener('change', () => {
      let v = parseFloat(inp.value); if (isNaN(v)) v = o.def ?? 0;
      if (o.min != null) v = Math.max(o.min, v); if (o.max != null) v = Math.min(o.max, v);
      inp.value = v; setField(c, key, v, o);
    });
    return h('label', { class: `field ${o.cls || ''}` }, h('span', { class: 'flabel' }, label), inp, o.hint ? h('span', { class: 'hint' }, o.hint) : null);
  }
  function fTime(c, key, label, o = {}) {
    const inp = h('input', { type: 'text', value: fmtTime(Number(c[key]) || 0), placeholder: '0.00' });
    inp.addEventListener('change', () => { let v = parseTime(inp.value); if (!o.allowNeg) v = Math.max(0, v); inp.value = fmtTime(v); setField(c, key, v, o); });
    return h('label', { class: `field ${o.cls || ''}` }, h('span', { class: 'flabel' }, label), inp, o.hint ? h('span', { class: 'hint' }, o.hint) : null);
  }
  function fSelect(c, key, label, options, o = {}) {
    const sel = h('select', {}, options.map(([v, l]) => h('option', { value: v, disabled: String(v).startsWith('__hdr_') || v === '__sys' }, l)));
    sel.value = c[key] ?? '';
    sel.addEventListener('change', () => { setField(c, key, o.num ? Number(sel.value) : sel.value, o); blurNonText(sel); });
    return h('label', { class: `field ${o.cls || ''}` }, h('span', { class: 'flabel' }, label), sel, o.hint ? h('span', { class: 'hint' }, o.hint) : null);
  }
  function fCheck(c, key, label, o = {}) {
    const inp = h('input', { type: 'checkbox', checked: !!c[key] });
    inp.addEventListener('change', () => { setField(c, key, inp.checked, o); inp.blur(); });
    return h('label', { class: `field check ${o.cls || ''}` }, inp, h('span', { class: 'flabel' }, label));
  }
  function fRange(c, key, label, min, max, step, fmt, o = {}) {
    const r = h('input', { type: 'range', min, max, step, value: c[key] ?? 0 });
    const t = h('input', { type: 'text', value: fmt(c[key] ?? 0) });
    r.addEventListener('input', () => { const v = Number(r.value); t.value = fmt(v); setField(c, key, v); });
    r.addEventListener('change', () => r.blur());
    t.addEventListener('change', () => { let v = parseFloat(t.value); if (isNaN(v)) v = 0; v = QP.clamp(v, min, max); r.value = v; t.value = fmt(v); setField(c, key, v); });
    return h('div', { class: `field ${o.cls || ''}` }, h('span', { class: 'flabel' }, label), h('div', { class: 'rangebox' }, r, t));
  }
  function fTarget(c, key, label, o = {}) {
    const opts = [['', o.allLabel || '— none —']];
    S.show.lists.forEach((l) => {
      if (S.show.lists.length > 1) opts.push([`__hdr_${l.id}`, `── ${l.name} ──`]);
      T.walk(l.cues, (x, parent, depth) => { if (x.id !== c.id) opts.push([x.id, `${'  '.repeat(depth)}${cueLabel(x)}`]); });
    });
    S.show.cart.forEach((x, i) => { if (x && x.id !== c.id) opts.push([x.id, `Cart ${i + 1} · ${cueLabel(x)}`]); });
    return fSelect(c, key, label, opts, { rerender: false, ...o });
  }
  const dbFmt = (v) => (v <= -60 ? '-inf' : `${Number(v).toFixed(1)}`);
  function fileField(c) {
    const missing = c.file && S.missing.has(c.file);
    return h('div', { class: 'field full' }, h('span', { class: 'flabel' }, c.type === 'audio' ? 'Audio file' : 'Video / image file'),
      h('div', { class: 'filebox' },
        h('div', { class: `fname${missing ? ' missing' : ''}`, title: c.file || '' }, c.file ? `${missing ? '⚠ Missing: ' : ''}${c.file.startsWith('blob:') ? baseName(c.file) : c.file}` : 'No file chosen'),
        h('button', { class: 'btn mini edit-only', onclick: () => chooseFileFor(c) }, 'Choose…'),
        P.isElectron && c.file ? h('button', { class: 'btn mini', onclick: () => P.reveal(c.file) }, 'Reveal') : null));
  }
  function wirelessTag(label) {
    const l = String(label || '');
    if (/airplay/i.test(l)) return 'AirPlay';
    if (/bluetooth|airpods|beats|bose|jbl|sony wh|sony wf|soundlink|ue boom|marshall|galaxy buds|hands-free|a2dp|\bbt\b/i.test(l)) return 'Bluetooth';
    return '';
  }
  function deviceLabel(d) { const w = wirelessTag(d.label); return d.label ? `${d.label}${w && !new RegExp(w, 'i').test(d.label) ? ` · ${w}` : ''}` : `Audio output ${d.deviceId.slice(0, 6)} (names hidden — open Settings → Audio)`; }
  function deviceOptions(withDefault = true) {
    return [
      ...(withDefault ? [['', 'Show default']] : []),
      ...(settings().patches || []).map((p) => [`patch:${p.id}`, `Patch · ${p.name}${p.device ? '' : ' (system default)'}`]),
      ['__sys', '── System audio devices ──'],
      ...S.audioOutputs.map((d) => [d.deviceId, deviceLabel(d)]),
    ];
  }
  async function unlockDeviceNames() {
    // browsers/Electron only reveal device names after an input permission has been granted once
    if (S.audioOutputs.length && S.audioOutputs.every((d) => d.label)) return;
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      st.getTracks().forEach((t) => t.stop());
    } catch { /* user declined — ids only */ }
    await refreshDevices();
  }

  function basicsTab(c) {
    return h('div', { class: 'grid' },
      fText(c, 'number', 'Number', { placeholder: '—' }),
      fText(c, 'name', 'Name', { placeholder: displayName({ ...c, name: '' }), id: 'f-name', cls: 'span2' }),
      fSelect(c, 'color', 'Colour', Object.entries(COLORS)),
      fTime(c, 'preWait', 'Pre-wait', { hint: 'Delay before the action starts' }),
      fSelect(c, 'continueMode', 'Continue', [['none', 'Do not continue'], ['auto-continue', 'Auto-continue (after post-wait)'], ['auto-follow', 'Auto-follow (when finished)']]),
      fTime(c, 'postWait', 'Post-wait', { hint: 'Auto-continue fires the next cue this long after this cue starts' }),
      fCheck(c, 'armed', 'Armed (uncheck to skip the action but keep timing)'),
      ...(['audio', 'video', 'group', 'mic', 'text', 'camera'].includes(c.type) ? [
        fCheck(c, 'stopOnGo', 'Fade out when the next GO is pressed', { rerender: true }),
        c.stopOnGo ? fTime(c, 'stopOnGoFade', 'Fade-out time on GO') : null,
      ] : []),
      fArea(c, 'notes', 'Notes (shown in Standby)', { cls: 'full' }),
      h('div', { class: 'section-title' }, 'Department notes (stage manager view)'),
      fArea(c, 'notesSound', 'Sound'), fArea(c, 'notesLights', 'Lighting'), fArea(c, 'notesVideo', 'Video / stage'));
  }

  function triggersTab(c) {
    const lv = h('div', { class: 'lv' }, QP.midi.describe(c.midiTrigger));
    const hk = h('input', { type: 'text', value: c.hotkey || '', placeholder: 'Click, then press a key', readonly: true });
    hk.addEventListener('keydown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      if (e.key === 'Backspace' || e.key === 'Delete') { hk.value = ''; setField(c, 'hotkey', ''); hk.blur(); return; }
      if (e.key === ' ' || e.key === 'Escape') { toast('Space and Esc are reserved for GO and Stop All', 'err'); hk.blur(); return; }
      hk.value = normKey(e); setField(c, 'hotkey', hk.value); hk.blur();
    });
    return h('div', { class: 'grid wide' },
      h('div', { class: 'section-title' }, 'Keyboard'),
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Hotkey — fires this cue'), hk, h('span', { class: 'hint' }, 'Backspace clears. Hotkeys fire the cue without moving the playhead.')),
      h('div', { class: 'section-title' }, 'MIDI'),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'MIDI trigger — fires this cue'),
        h('div', { class: 'learnbox' }, lv,
          h('button', { class: 'btn mini edit-only', onclick: () => { lv.textContent = 'Waiting for MIDI…'; lv.classList.add('learning'); QP.midi.learn((m) => { setField(c, 'midiTrigger', { type: m.type, ch: m.ch, num: m.num }); lv.textContent = QP.midi.describe(m); lv.classList.remove('learning'); }); } }, 'Learn'),
          h('button', { class: 'btn mini edit-only', onclick: () => { setField(c, 'midiTrigger', null); lv.textContent = '—'; } }, 'Clear'))),
      h('div', { class: 'section-title' }, 'Time of day'),
      fText(c, 'todTrigger', 'Fire every day at (24h clock)', { placeholder: 'HH:MM or HH:MM:SS — blank = off', hint: 'Uses this computer’s clock. Great for house music, doors announcements and walk-in loops.' }),
      h('div', { class: 'section-title' }, 'Timecode'),
      fText(c, 'tcTrigger', 'Fire at incoming timecode (MTC)', { placeholder: 'HH:MM:SS:FF — blank = off', hint: settings().tcIn.enabled ? 'Fires when incoming MIDI timecode passes this time.' : 'Turn on “Chase MIDI timecode” in Settings → MIDI & Timecode.' }),
      h('div', { class: 'section-title' }, 'OSC'),
      h('div', { class: 'explain' }, c.number
        ? `Send /cue/${c.number}/start (or /stop, /pause, /resume, /devamp) to port ${settings().oscPort} to control this cue remotely.`
        : 'Give this cue a number to control it over OSC with /cue/{number}/start.'));
  }

  function typeTab(c) {
    switch (c.type) {
      case 'audio': {
        const g = h('div', { class: 'grid' },
          fileField(c),
          fRange(c, 'level', 'Level (dB)', -60, 12, 0.5, dbFmt),
          fRange(c, 'pan', 'Pan', -1, 1, 0.05, (v) => (v == 0 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)),
          h('div', { class: 'explain' }, 'Trim, loops, fades, rate and markers are on the Time & Loops tab.'),
          fSelect(c, 'device', 'Output device', deviceOptions(), { rerender: true }),
          h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Loudness'),
            h('button', { class: 'btn mini edit-only', onclick: () => normalizeCues([c]) }, `Normalise to ${settings().loudnessTarget} LUFS`)),
          h('div', { class: 'section-title' }, 'EQ'),
          fCheck(c, 'eqOn', 'EQ on', { rerender: true }),
          ...(c.eqOn ? [
            fRange(c, 'eqLow', 'Low shelf 200 Hz (dB)', -15, 15, 0.5, (v) => Number(v).toFixed(1)),
            fRange(c, 'eqMid', 'Mid (dB)', -15, 15, 0.5, (v) => Number(v).toFixed(1)),
            fNum(c, 'eqMidFreq', 'Mid frequency (Hz)', { min: 100, max: 10000, step: 50 }),
            fRange(c, 'eqHigh', 'High shelf 5 kHz (dB)', -15, 15, 0.5, (v) => Number(v).toFixed(1)),
          ] : []),
          ...xfadeFields(c),
          ...vocalFields(c),
          ...surroundFields(c),
          ...duckFields(c),
          c.surround ? h('div', { class: 'explain' }, 'The routing matrix is replaced by the surround speaker map while surround is on.') : routingEditor(c));
        return g;
      }
      case 'video': return h('div', { class: 'grid' },
        fileField(c),
        fSelect(c, 'surface', 'Output surface', surfaceOptions()),
        fNum(c, 'layer', 'Layer', { min: 1, max: 99, hint: 'Higher layers are on top' }),
        fSelect(c, 'fit', 'Fit', [['contain', 'Fit (letterbox)'], ['cover', 'Fill (crop)'], ['fill', 'Stretch']]),
        fRange(c, 'opacity', 'Opacity (%)', 0, 100, 1, (v) => String(Math.round(v))),
        fRange(c, 'level', 'Audio level (dB)', -60, 0, 0.5, dbFmt),
        fTime(c, 'start', 'In (start time)'), fTime(c, 'end', 'Out (end time)', { hint: '0 = end of file' }),
        c.file && !QP.isImagePath(c.file) ? inOutButtons(c) : null,
        fNum(c, 'playCount', 'Play count', { min: 0, step: 1, def: 1, hint: '1 = once · 0 = loop forever' }),
        fNum(c, 'rate', 'Rate', { min: 0.25, max: 4, step: 0.05, def: 1 }),
        fTime(c, 'fadeIn', 'Fade in'), fTime(c, 'fadeOut', 'Fade out'),
        fTime(c, 'imageDuration', 'Image duration', { hint: 'Still images only · 0 = hold until stopped' }),
        fCheck(c, 'holdLast', 'Hold last frame at the end (until stopped)'),
        fCheck(c, 'duckExempt', 'Never duck this video’s audio'),
        fSelect(c, 'device', 'Audio output device', deviceOptions()));
      case 'group': return h('div', { class: 'grid wide' },
        fSelect(c, 'mode', 'Group mode', Object.entries(GROUP_MODES), { cls: 'span2', rerender: true }),
        c.mode !== 'step' && c.endAction !== 'repeat' ? fNum(c, 'playCount', 'Loop count', { min: 0, step: 1, def: 1, hint: '1 = play once · 0 = loop forever (Devamp to exit)' }) : null,
        c.mode === 'slideshow' ? fTime(c, 'slideDuration', 'Time per slide', { hint: 'Images, text and live inputs show for this long; videos play to their end' }) : null,
        (c.mode === 'playlist' || c.mode === 'shuffle') && !(Number(c.crossfade) > 0) ? fTime(c, 'gap', 'Gap between items', { allowNeg: true, hint: 'Negative = overlap (start next before current ends)' }) : null,
        ['playlist', 'shuffle', 'slideshow', 'step'].includes(c.mode) ? fTime(c, 'crossfade', 'Crossfade', { hint: 'Fades each item into the next — perfect for house music and slideshows', rerender: true }) : null,
        (c.mode === 'playlist' || c.mode === 'shuffle') ? fCheck(c, 'resume', 'Resume where it left off (next start plays the following item)') : null,
        c.mode === 'step' ? fCheck(c, 'stepWrap', 'Wrap around to the first child after the last') : null,
        c.mode === 'step' ? h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Next step'), h('div', { class: 'learnbox' }, h('div', { class: 'lv' }, `${rt.stepInfo(c).pos + 1} of ${c.children.length}`), h('button', { class: 'btn mini', onclick: () => { rt.resetStep(c.id); renderInspector(); } }, 'Reset to first'))) : null,
        h('div', { class: 'section-title' }, 'When the group finishes'),
        fSelect(c, 'endAction', 'Then', [['stop', 'Stop'], ['repeat', 'Repeat this group (loop until stopped)'], ['next', 'Continue — start the next cue in the list'], ['goto', 'Put a chosen cue in standby'], ['fire', 'Start a chosen cue']], { rerender: true }),
        ['goto', 'fire'].includes(c.endAction) ? fTarget(c, 'endTarget', 'Chosen cue', { allLabel: '— choose a cue —' }) : null,
        h('div', { class: 'explain' }, {
          all: 'Timeline: every child starts when the group fires. Use each child’s pre-wait as its start time on the timeline. The pass ends when every child has finished.',
          first: 'Sequence: the first child starts; after that each child’s own Continue setting (auto-continue / auto-follow) carries playback through the group. The pass ends when nothing in the group is running.',
          playlist: 'Playlist: children play in order, each starting when the previous one finishes (plus the gap). Children’s own continue settings are ignored.',
          shuffle: 'Shuffle: like Playlist, but the order is randomised on every pass.',
          random1: 'Random: each time the group runs, one child is picked at random (never the same one twice in a row). Set it to repeat for random play that keeps going.',
          slideshow: 'Slideshow: children play in order — images, text and cameras for the slide time, videos to their end — with an optional crossfade. Loop it or repeat it for a continuous show.',
          step: 'Step: every GO on this group plays the next child only, and standby stays on the group until the last child — great for slides or stings you advance by hand.',
        }[c.mode]),
        h('div', { class: 'explain' }, `This group has ${c.children.length} cue${c.children.length === 1 ? '' : 's'}. Drag cues onto the middle of the group row to put them inside, or select cues and press ${MOD}G.`));
      case 'fade': return h('div', { class: 'grid' },
        fTarget(c, 'target', 'Target cue', { cls: 'span2', allLabel: '— choose a cue —' }),
        fTime(c, 'duration', 'Fade duration'),
        fSelect(c, 'curve', 'Curve', [['scurve', 'S-curve'], ['linear', 'Linear'], ['exp', 'Constant dB (exponential)']]),
        fCheck(c, 'setLevel', 'Fade audio level', { rerender: true }),
        c.setLevel ? fRange(c, 'level', 'To level (dB)', -60, 12, 0.5, dbFmt) : null,
        fCheck(c, 'setOpacity', 'Fade video opacity', { rerender: true }),
        c.setOpacity ? fRange(c, 'opacity', 'To opacity (%)', 0, 100, 1, (v) => String(Math.round(v))) : null,
        fCheck(c, 'stopWhenDone', 'Stop target when fade completes'),
        h('div', { class: 'explain' }, 'Fading a group fades every running cue inside it.'));
      case 'stop': return h('div', { class: 'grid' },
        fSelect(c, 'action', 'Action', [['stop', 'Stop'], ['pause', 'Pause'], ['resume', 'Resume'], ['devamp', 'Devamp (finish current loop, then stop looping)']], { cls: 'span2' }),
        fTarget(c, 'target', 'Target cue', { cls: 'span2', allLabel: '— all running cues —' }),
        c.action === 'stop' ? fTime(c, 'fadeTime', 'Fade-out time') : null);
      case 'start': return h('div', { class: 'grid' }, fTarget(c, 'target', 'Cue to start', { cls: 'span2', allLabel: '— choose a cue —' }),
        h('div', { class: 'explain' }, 'Starts the target without moving the playhead. Point it at an earlier cue (with auto-continue) to build a loop in the cue list.'));
      case 'goto': return h('div', { class: 'grid' }, fTarget(c, 'target', 'Move playhead to', { cls: 'span2', allLabel: '— choose a cue —' }));
      case 'wait': return h('div', { class: 'grid' }, fTime(c, 'duration', 'Wait duration'),
        h('div', { class: 'explain' }, 'A Wait cue holds for its duration — set it to auto-follow to delay the next cue.'));
      case 'midi': {
        const outs = [['', QP.midi.outputs.length ? 'First available output' : 'No MIDI outputs found'], ...QP.midi.outputs.map((o) => [o.name, o.name])];
        const msc = c.message.startsWith('msc');
        return h('div', { class: 'grid' },
          fSelect(c, 'midiOut', 'MIDI output', outs, { cls: 'span2' }),
          fSelect(c, 'message', 'Message', [['note_on', 'Note On'], ['note_off', 'Note Off'], ['cc', 'Control Change'], ['pc', 'Program Change'], ['msc_go', 'MSC GO'], ['msc_stop', 'MSC STOP'], ['msc_resume', 'MSC RESUME']], { rerender: true }),
          msc ? fNum(c, 'mscDevice', 'MSC device ID', { min: 0, max: 127, hint: '127 = all devices' }) : fNum(c, 'channel', 'Channel', { min: 1, max: 16 }),
          msc ? fText(c, 'mscCue', 'MSC cue number', { placeholder: 'e.g. 12 or 12.5' }) : fNum(c, 'data1', c.message === 'cc' ? 'Controller' : c.message === 'pc' ? 'Program' : 'Note', { min: 0, max: 127 }),
          !msc && c.message !== 'pc' ? fNum(c, 'data2', c.message === 'cc' ? 'Value' : 'Velocity', { min: 0, max: 127 }) : null);
      }
      case 'osc': return h('div', { class: 'grid' },
        oscTemplatePicker(c),
        fText(c, 'host', 'Destination IP', { placeholder: '127.0.0.1' }),
        fNum(c, 'port', 'Port', { min: 1, max: 65535 }),
        fText(c, 'address', 'OSC address', { placeholder: '/cue/1/go', cls: 'span2' }),
        fText(c, 'args', 'Arguments', { placeholder: '1 0.5 "text"', cls: 'full', hint: 'Space-separated. Whole numbers → int, decimals → float, true/false, anything else (or "quoted") → string.' }),
        h('div', { class: 'explain' }, 'Example for grandMA3: IP of the console, its OSC input port, address /cmd with argument "Go+ Sequence 1".'));
      case 'mic': return h('div', { class: 'grid' },
        fSelect(c, 'inputDevice', 'Input (mic / line / interface)', [['', 'Default input'], ...(S.audioInputs || []).map((d) => [d.deviceId, d.label || `Input ${d.deviceId.slice(0, 6)}`])], { cls: 'span2' }),
        fSelect(c, 'device', 'Output device', deviceOptions(), { rerender: true }),
        fRange(c, 'level', 'Level (dB)', -60, 12, 0.5, dbFmt),
        fRange(c, 'pan', 'Pan', -1, 1, 0.05, (v) => (v == 0 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)),
        fTime(c, 'fadeIn', 'Fade in'), fTime(c, 'fadeOut', 'Fade out (on stop with fade)'),
        fTime(c, 'duration', 'Duration', { hint: '0 = live until stopped' }),
        h('div', { class: 'explain' }, 'Passes a live input (mic, line, playback device) through QForge with level, EQ, routing and auto-ducking. Expect a little latency — for a lectern mic in a PA, route it through your desk instead and use this for announcements and backstage feeds.'),
        h('div', { class: 'section-title' }, 'EQ'),
        fCheck(c, 'eqOn', 'EQ on', { rerender: true }),
        ...(c.eqOn ? [
          fRange(c, 'eqLow', 'Low shelf 200 Hz (dB)', -15, 15, 0.5, (v) => Number(v).toFixed(1)),
          fRange(c, 'eqMid', 'Mid (dB)', -15, 15, 0.5, (v) => Number(v).toFixed(1)),
          fNum(c, 'eqMidFreq', 'Mid frequency (Hz)', { min: 100, max: 10000, step: 50 }),
          fRange(c, 'eqHigh', 'High shelf 5 kHz (dB)', -15, 15, 0.5, (v) => Number(v).toFixed(1)),
        ] : []),
        ...xfadeFields(c),
        ...duckFields(c),
        routingEditor(c));
      case 'text': return h('div', { class: 'grid' },
        fArea(c, 'text', 'Text', { cls: 'full', placeholder: 'Use {countdown}, {clock}, {clock:s} or {elapsed} for live values' }),
        fSelect(c, 'surface', 'Output surface', surfaceOptions()),
        fNum(c, 'layer', 'Layer', { min: 1, max: 99 }),
        fSelect(c, 'position', 'Position', [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom'], ['lower', 'Lower third']]),
        fSelect(c, 'align', 'Align', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]),
        fNum(c, 'size', 'Size (% of screen height)', { min: 1, max: 60, step: 0.5 }),
        fText(c, 'font', 'Font', { placeholder: 'System default' }),
        h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Text colour'), colorInput(c, 'textColor')),
        fCheck(c, 'bold', 'Bold'), fCheck(c, 'shadow', 'Shadow'),
        h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Box colour'), colorInput(c, 'bgColor')),
        fRange(c, 'bgOpacity', 'Box opacity (%)', 0, 100, 1, (v) => String(Math.round(v))),
        fRange(c, 'opacity', 'Opacity (%)', 0, 100, 1, (v) => String(Math.round(v))),
        fTime(c, 'fadeIn', 'Fade in'), fTime(c, 'fadeOut', 'Fade out'),
        fTime(c, 'duration', 'Duration', { hint: '0 = hold until stopped' }),
        fSelect(c, 'countMode', 'Countdown', [['none', 'None'], ['duration', 'Count down from a duration'], ['until', 'Count down to a clock time']], { rerender: true }),
        c.countMode === 'duration' ? fTime(c, 'countFrom', 'Count down from') : null,
        c.countMode === 'until' ? fText(c, 'countUntil', 'Until (24h clock)', { placeholder: '19:30' }) : null);
      case 'camera': return h('div', { class: 'grid' },
        fSelect(c, 'deviceId', 'Camera / capture device', [['', 'Default camera'], ...(S.videoInputs || []).map((d) => [d.deviceId, /ndi/i.test(d.label) ? `NDI ▸ ${d.label}` : d.label || `Camera ${d.deviceId.slice(0, 6)}`]).sort((x, y) => (/^NDI/.test(y[1]) ? 1 : 0) - (/^NDI/.test(x[1]) ? 1 : 0))], { cls: 'span2' }),
        fSelect(c, 'surface', 'Output surface', surfaceOptions()),
        fNum(c, 'layer', 'Layer', { min: 1, max: 99 }),
        fSelect(c, 'fit', 'Fit', [['contain', 'Fit (letterbox)'], ['cover', 'Fill (crop)'], ['fill', 'Stretch']]),
        fRange(c, 'opacity', 'Opacity (%)', 0, 100, 1, (v) => String(Math.round(v))),
        fCheck(c, 'mirror', 'Mirror image'),
        fSelect(c, 'resolution', 'Capture resolution', [['1280x720', '720p (1280×720)'], ['1920x1080', '1080p (1920×1080)'], ['3840x2160', '4K UHD (3840×2160)'], ['640x480', 'SD (640×480)']]),
        fSelect(c, 'fps', 'Frame rate', [[0, 'Camera default'], [25, '25 fps'], [30, '30 fps'], [50, '50 fps'], [60, '60 fps']], { num: true }),
        h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Devices'), h('button', { class: 'btn mini', onclick: async () => { await P.cameraAccess(); try { const st = await navigator.mediaDevices.getUserMedia({ video: true }); st.getTracks().forEach((t) => t.stop()); } catch { /* declined */ } await refreshDevices(); renderInspector(); toast(`${(S.videoInputs || []).length} camera / capture input(s) found`); } }, 'Refresh camera list')),
        fTime(c, 'fadeIn', 'Fade in'), fTime(c, 'fadeOut', 'Fade out'),
        fTime(c, 'duration', 'Duration', { hint: '0 = live until stopped' }),
        h('div', { class: 'explain' }, 'Live input from a webcam, capture card (HDMI/SDI capture devices appear as cameras) or NDI. For NDI, install the free NDI Tools and use NDI Webcam / NDI Virtual Input to turn any NDI source into a camera — it shows here as “NDI ▸ …”. Spout and Syphon are not supported.'));
      case 'timecode': {
        const outs = [['', QP.midi.outputs.length ? 'First available output' : 'No MIDI outputs found'], ...QP.midi.outputs.map((o) => [o.name, o.name])];
        return h('div', { class: 'grid' },
          fSelect(c, 'tcMode', 'Output', [['ltc', 'LTC (audio)'], ['mtc', 'MTC (MIDI timecode)']], { rerender: true }),
          fSelect(c, 'fps', 'Frame rate', [['24', '24 fps'], ['25', '25 fps'], ['29.97df', '29.97 drop-frame'], ['30', '30 fps']]),
          fText(c, 'startTC', 'Start timecode', { placeholder: '01:00:00:00' }),
          fTime(c, 'duration', 'Duration', { hint: '0 = run until stopped' }),
          ...(c.tcMode === 'mtc' ? [fSelect(c, 'midiOut', 'MIDI output', outs, { cls: 'span2' })] : [
            fSelect(c, 'device', 'Audio device', deviceOptions(), { rerender: true }),
            fNum(c, 'channel', 'Output channel', { min: 1, max: rt.audio.channels(rt.dev(c.device)) || 2, hint: `This device has ${rt.audio.channels(rt.dev(c.device))} output channel(s)` }),
            fRange(c, 'level', 'Level (dB)', -40, 0, 0.5, dbFmt)]),
          h('div', { class: 'explain' }, 'Put a Timecode cue in a Timeline group with your audio/video to drive grandMA3 (or any console) in sync. LTC goes to a dedicated interface output — keep it off your PA. Pausing holds the timecode; resuming carries on from the same frame.'));
      }
      case 'light': return h('div', { class: 'grid' },
        fSelect(c, 'proto', 'Protocol', [['artnet', 'Art-Net'], ['sacn', 'sACN (E1.31)']], { rerender: true }),
        fNum(c, 'universe', c.proto === 'sacn' ? 'Universe (1–63999)' : 'Universe (0-based, Net/Sub/Uni)', { min: c.proto === 'sacn' ? 1 : 0, max: c.proto === 'sacn' ? 63999 : 32767 }),
        fText(c, 'host', 'Destination IP', { placeholder: c.proto === 'sacn' ? 'Blank = multicast' : 'Blank = broadcast 255.255.255.255' }),
        fTime(c, 'fade', 'Fade time'),
        fSelect(c, 'curve', 'Curve', [['linear', 'Linear'], ['scurve', 'S-curve']]),
        fArea(c, 'values', 'Channel levels', { cls: 'full', placeholder: '1@255, 2-8@50%, 20@full' }),
        h('div', { class: 'explain' }, 'Channels not listed keep their current level (tracking). Use “1-512@0” for a blackout. Levels persist after Stop All — lights don’t snap off with the panic button.'));
      case 'script': return h('div', { class: 'grid' },
        fSelect(c, 'mode', 'Type', [['http', 'Web request (HTTP)'], ['shell', 'Shell command']], { rerender: true }),
        ...(c.mode === 'http' ? [
          fSelect(c, 'method', 'Method', [['GET', 'GET'], ['POST', 'POST'], ['PUT', 'PUT'], ['DELETE', 'DELETE']]),
          fText(c, 'url', 'URL', { cls: 'full', placeholder: 'http://192.168.1.50/api/...' }),
          fArea(c, 'headers', 'Headers (one per line)', { placeholder: 'Content-Type: application/json\nAuthorization: Bearer …' }),
          fArea(c, 'body', 'Body'),
        ] : [fText(c, 'command', 'Command', { cls: 'full', placeholder: P.platform === 'win32' ? 'powershell -Command "..."' : 'osascript -e ...' })]),
        h('div', { class: 'explain' }, S.scriptsAllowed ? 'Script cues are allowed on this computer.' : 'Script cues are disabled on this computer — enable them in Settings → Advanced. They never run from a show file without your permission.'));
      case 'app': return appTab(c);
      case 'ma': return maTab(c);
      default: return h('div');
    }
  }
  // ---- v1.5: transitions, crossfades, keying, vocal tools, surround, app control, MA
  function xfadeFields(c) {
    const vis = QP.VISUAL_TYPES.includes(c.type);
    return [
      h('div', { class: 'section-title' }, 'Crossfade'),
      fSelect(c, 'xfade', 'Crossfade with what’s already playing', [['off', 'Off'], ['auto', 'Auto — others fade out as this fades in'], ['manual', 'Manual — T-bar / Take']], { rerender: true }),
      ...(c.xfade && c.xfade !== 'off' ? [
        fTime(c, 'xfadeTime', c.xfade === 'manual' ? 'Take time' : 'Crossfade time'),
        fSelect(c, 'xfadeScope', 'Crossfade out of', vis
          ? [['', 'Same output and layer (default)'], ['surface', 'Anything on the same output'], ['visual', 'All video, text and camera'], ['all', 'Everything playing (audio and video)']]
          : [['', 'Other audio cues (default)'], ['all', 'Everything playing (audio and video)']]),
        h('div', { class: 'explain' }, c.xfade === 'manual'
          ? 'When this cue starts it waits silent / invisible. Move the T-bar under the Program monitor, press Take (Ctrl/Cmd+Shift+X) or move a MIDI fader learned in Settings → MIDI to crossfade from what’s playing into it.'
          : `When this cue starts, the cues it crossfades out of fade down over the crossfade time while this one fades up${vis ? ' using the transition chosen above' : ' (equal-power curve, so there’s no dip in the middle)'}.`),
      ] : []),
    ];
  }
  function inOutButtons(c) {
    return h('div', { class: 'field full' }, h('span', { class: 'flabel' }, 'Set In / Out while playing'),
      h('div', { class: 'learnbox' },
        h('div', { class: 'lv' }, `In ${fmtTime(Number(c.start) || 0)}  ·  Out ${Number(c.end) > 0 ? fmtTime(Number(c.end)) : 'end of file'}`),
        h('button', { class: 'btn mini edit-only', title: 'Press I while playing', onclick: () => { if (!setInOutFromPlayback('start')) toast('Play or preview the cue first', 'err'); } }, 'Set In here (I)'),
        h('button', { class: 'btn mini edit-only', title: 'Press O while playing', onclick: () => { if (!setInOutFromPlayback('end')) toast('Play or preview the cue first', 'err'); } }, 'Set Out here (O)'),
        h('button', { class: 'btn mini edit-only', onclick: () => { setField(c, 'start', 0); setField(c, 'end', 0); renderInspector(); } }, 'Clear')));
  }
  function keyFields(c) {
    const k = { mode: 'off', color: '#00ff00', autoColor: false, similarity: 40, smoothness: 8, spill: 10, threshold: 15, invert: false, tolerance: 18, feather: 2, bgAuto: true, ...(c.key || {}) };
    const setKey = (patch, rerender) => { setField(c, 'key', { ...k, ...(c.key || {}), ...patch }); if (rerender) renderInspector(); };
    const rng = (prop, label, min, max, step = 1) => {
      const r = h('input', { type: 'range', min, max, step, value: k[prop] });
      const t = h('input', { type: 'text', value: String(k[prop]) });
      r.addEventListener('input', () => { t.value = r.value; setKey({ [prop]: Number(r.value) }); });
      r.addEventListener('change', () => r.blur());
      t.addEventListener('change', () => { const v = QP.clamp(Number(t.value) || 0, min, max); r.value = v; t.value = v; setKey({ [prop]: v }); });
      return h('div', { class: 'field' }, h('span', { class: 'flabel' }, label), h('div', { class: 'rangebox' }, r, t));
    };
    const still = c.type === 'video' && c.file && QP.isImagePath(c.file);
    const modeSel = h('select', {}, [['off', 'Off'], ['chroma', 'Green / blue screen (chroma key)'], ['luma', 'Luma key (remove black or white)'], ...(still ? [['bgremove', 'Remove background (plain backgrounds)']] : [])].map(([v, l]) => h('option', { value: v }, l)));
    modeSel.value = still || k.mode !== 'bgremove' ? k.mode : 'off';
    modeSel.onchange = () => { setKey({ mode: modeSel.value }, true); modeSel.blur(); };
    const out = [h('div', { class: 'section-title' }, 'Keying & background removal'), h('label', { class: 'field span2' }, h('span', { class: 'flabel' }, 'Key'), modeSel)];
    if (k.mode === 'chroma') {
      const col = h('input', { type: 'color', value: k.color });
      col.oninput = () => setKey({ color: col.value, autoColor: false });
      out.push(
        h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Key colour'), h('div', { class: 'learnbox' }, col,
          h('button', { class: 'btn mini edit-only', onclick: () => setKey({ color: '#00b140', autoColor: false }, true) }, 'Green'),
          h('button', { class: 'btn mini edit-only', onclick: () => setKey({ color: '#0047bb', autoColor: false }, true) }, 'Blue'),
          h('button', { class: 'btn mini edit-only', title: 'Sample the corners of the picture the next time it plays', onclick: () => setKey({ autoColor: true }, true) }, k.autoColor ? 'Auto ✓' : 'Auto'))),
        rng('similarity', 'Similarity', 1, 100), rng('smoothness', 'Edge softness', 0, 100), rng('spill', 'Spill reduction', 0, 100));
    } else if (k.mode === 'luma') {
      const inv = h('input', { type: 'checkbox', checked: !!k.invert }); inv.onchange = () => { setKey({ invert: inv.checked }); inv.blur(); };
      out.push(rng('threshold', 'Threshold', 0, 100), rng('smoothness', 'Edge softness', 0, 100), h('label', { class: 'field check' }, inv, h('span', { class: 'flabel' }, 'Remove white instead of black')));
    } else if (k.mode === 'bgremove') {
      const auto = h('input', { type: 'checkbox', checked: k.bgAuto !== false }); auto.onchange = () => { setKey({ bgAuto: auto.checked }, true); auto.blur(); };
      const col = h('input', { type: 'color', value: k.color }); col.oninput = () => setKey({ color: col.value });
      out.push(rng('tolerance', 'Tolerance', 1, 60), rng('feather', 'Edge feather (px)', 0, 20),
        h('label', { class: 'field check' }, auto, h('span', { class: 'flabel' }, 'Detect the background colour from the edges')),
        k.bgAuto === false ? h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Background colour'), col) : null);
    }
    out.push(h('div', { class: 'explain' }, k.mode === 'bgremove'
      ? 'Removes the background from a still image by flooding in from the edges through anything close to the edge colour — great for logos, product shots and people on plain backdrops. Busy photo backgrounds need a cut-out PNG made in an editor (or use a mask on the Mapping tab).'
      : k.mode === 'off' ? 'Key out a green/blue screen or a black/white background so the layers underneath show through. Works on video files, images and live cameras; the Preview monitor shows the result over a checkerboard.'
        : 'Keying runs on the graphics card in real time and shows in the Preview monitor. Light the screen evenly and keep people away from it for the cleanest edge.'));
    return out;
  }
  function fxTab(c) {
    return h('div', { class: 'grid' },
      h('div', { class: 'section-title' }, 'Transition'),
      fSelect(c, 'transition', 'Transition in', TRANSITIONS),
      fSelect(c, 'transitionOut', 'Transition out', [['', 'Same as in'], ...TRANSITIONS]),
      fTime(c, 'fadeIn', 'Transition in time'), fTime(c, 'fadeOut', 'Transition out time', { hint: 'Also used by “Stop with fade” and crossfades' }),
      h('div', { class: 'explain' }, 'Transitions play over the fade in / out times, like slide transitions in PowerPoint or Keynote: fades, wipes, slides, zoom, blur, iris or a dip to black. Add a crossfade below to transition straight out of the cue already on screen.'),
      ...xfadeFields(c),
      ...(c.type === 'video' || c.type === 'camera' ? keyFields(c) : []));
  }
  function vocalFields(c) {
    return [
      h('div', { class: 'section-title' }, 'Vocal tools'),
      fSelect(c, 'vocal', 'Vocals', [['off', 'Off — play as recorded'], ['remove', 'Remove vocals (karaoke / backing track)'], ['isolate', 'Isolate vocals (vocal focus)']], { rerender: true }),
      c.vocal === 'remove' ? fNum(c, 'vocalBass', 'Keep bass below (Hz)', { min: 40, max: 400, step: 10, hint: 'Stops the kick and bass disappearing with the vocal' }) : null,
      c.vocal && c.vocal !== 'off' ? h('div', { class: 'explain' }, 'Works on stereo files by cancelling or keeping what’s panned dead-centre — usually the lead vocal. Centre-panned instruments are affected too and reverb tails remain, so results vary by mix. For studio-quality stems, separate the track first (e.g. with a stem-splitter app) and load the stems as cues.') : null,
    ];
  }
  function surroundFields(c) {
    const b = c.file && rt.audio.buffers.get(c.file);
    const n = b ? b.numberOfChannels : null;
    const out = [h('div', { class: 'section-title' }, 'Surround (5.1 / 7.1)')];
    if (!n) { out.push(h('div', { class: 'explain' }, c.file ? 'Reading the file…' : 'Choose a file to see its channels.')); return out; }
    if (n <= 2) { out.push(h('div', { class: 'explain' }, `This file is ${n === 1 ? 'mono' : 'stereo'}. Surround mapping appears for multichannel files (quad, 5.1, 7.1 WAV / FLAC / AAC).`)); return out; }
    const labels = n === 6 ? ['L', 'R', 'C', 'LFE', 'Ls', 'Rs'] : n === 8 ? ['L', 'R', 'C', 'LFE', 'Lss', 'Rss', 'Lrs', 'Rrs'] : n === 4 ? ['L', 'R', 'Ls', 'Rs'] : [...Array(n)].map((_, i) => `Ch ${i + 1}`);
    const layout = n === 6 ? '5.1' : n === 8 ? '7.1' : n === 4 ? 'quad' : `${n}-channel`;
    const outs = rt.audio.channels(rt.dev(c.device));
    const defMap = () => labels.map((_, i) => (i < outs ? i : -1));
    const tog = h('input', { type: 'checkbox', checked: !!c.surround });
    tog.onchange = () => { if (tog.checked && (!Array.isArray(c.surroundMap) || c.surroundMap.length !== n)) setField(c, 'surroundMap', defMap()); setField(c, 'surround', tog.checked); renderInspector(); };
    out.push(h('label', { class: 'field check span2' }, tog, h('span', { class: 'flabel' }, `Play in surround — this file is ${layout} (${n} channels)`)));
    if (!c.surround) { out.push(h('div', { class: 'explain' }, 'Off: the file is folded down to stereo (or follows the routing matrix below). Turn on to send each channel to its own output on a multichannel interface.')); return out; }
    const map = Array.isArray(c.surroundMap) && c.surroundMap.length === n ? c.surroundMap : defMap();
    const grid = h('div', { class: 'surr-grid' }, labels.map((lab, i) => {
      const sel = h('select', {}, h('option', { value: -1 }, 'Off'), [...Array(outs)].map((_, o) => h('option', { value: o }, `Out ${o + 1}`)));
      sel.value = String(map[i] ?? -1);
      sel.onchange = () => { const m = [...map]; m[i] = Number(sel.value); setField(c, 'surroundMap', m); sel.blur(); };
      return h('label', { class: 'surr-ch' }, h('b', {}, lab), sel);
    }));
    const preset = (label, m) => h('button', { class: 'btn mini edit-only', onclick: () => { setField(c, 'surroundMap', m.map((o) => (o < outs ? o : -1))); renderInspector(); } }, label);
    out.push(h('div', { class: 'field full' }, h('span', { class: 'flabel' }, 'Speaker map — file channel → output'), grid),
      h('div', { class: 'field full' }, h('span', { class: 'flabel' }, 'Presets'), h('div', { class: 'learnbox', style: 'flex-wrap:wrap' },
        preset('Straight through (1→1, 2→2 …)', labels.map((_, i) => i)),
        n === 6 ? preset('Film order outputs (L C R Ls Rs LFE)', [0, 2, 1, 5, 3, 4]) : null,
        n === 8 ? preset('Film order outputs (L C R Lss Rss Lrs Rrs LFE)', [0, 2, 1, 7, 3, 4, 5, 6]) : null,
        n >= 6 ? preset('5.1 into 4 speakers (no C / LFE)', labels.map((l, i) => ({ L: 0, R: 1, Ls: 2, Rs: 3, Lss: 2, Rss: 3, Lrs: 2, Rrs: 3 }[l] ?? -1))) : null)),
      outs < n ? h('div', { class: 'explain warn' }, `The selected output only has ${outs} channel${outs === 1 ? '' : 's'}, so channels mapped “Off” are dropped. Pick a multichannel interface or patch in Output device, or turn surround off to fold down to stereo.`) : h('div', { class: 'explain' }, `Output device has ${outs} channels. Files are usually in SMPTE order (L R C LFE Ls Rs); adjust the map to match how your speakers are wired.`));
    return out;
  }
  function appTab(c) {
    const vol = ['volume', 'fadeVolume'].includes(c.action);
    const isWin = P.platform === 'win32';
    return h('div', { class: 'grid' },
      fSelect(c, 'app', 'App', Object.entries(APP_NAMES), { rerender: true }),
      fSelect(c, 'action', 'Action', Object.entries(APP_ACTIONS).filter(([a]) => !(['mute', 'unmute'].includes(a) && c.app !== 'system') && !(['shuffleOn', 'shuffleOff'].includes(a) && c.app === 'system')), { rerender: true }),
      vol ? fRange(c, 'value', 'Volume (%)', 0, 100, 1, (v) => String(Math.round(v))) : null,
      c.action === 'fadeVolume' ? fTime(c, 'fadeTime', 'Fade time') : null,
      c.action === 'playUri' ? fText(c, 'uri', c.app === 'spotify' ? 'Spotify link / URI' : 'Playlist name', { cls: 'span2', placeholder: c.app === 'spotify' ? 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M' : 'Pre-show music' }) : null,
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Test'), h('button', { class: 'btn mini', onclick: async () => { const r = await P.appControl({ app: c.app, action: c.action, value: Number(c.value), uri: c.uri, fade: Number(c.fadeTime) || 0 }); toast(r.ok ? `OK${r.info ? ': ' + r.info : ''}` : r.error, r.ok ? 'ok' : 'err'); } }, 'Run now')),
      h('div', { class: 'explain' }, isWin
        ? 'Windows: play / pause / next / previous are sent as media keys, so they control whichever app owns the media session (Spotify, Apple Music, a browser, VLC…). Volume and fades change the Windows system volume — choose “System / any player”. Spotify links open in the Spotify app.'
        : P.platform === 'darwin'
          ? 'macOS: Spotify and Apple Music are controlled directly (play, pause, tracks, their own volume, fades, play a Spotify link or a Music playlist). The first time, macOS asks to let QForge control the app — click OK. “System” sets the Mac’s output volume.'
          : 'Controls music apps running on this computer. Needs the desktop app (Linux uses playerctl).'),
      h('div', { class: 'explain' }, 'Tip: start house music in Spotify with one cue, then add a Fade volume cue on GO to take it out under the show.'));
  }
  const MA_TEMPLATES = [
    ['Go+ sequence', 'Go+ Sequence 1'], ['Go to cue', 'Goto Cue 5 Sequence 1'], ['Off sequence', 'Off Sequence 1'], ['Go+ executor', 'Go+ Executor 201'],
    ['Go+ macro', 'Go+ Macro 1'], ['Sequence level', 'Sequence 1 At 50'], ['Grand master', 'Master 1 At 100'], ['Blackout toggle', 'Blackout'], ['Clear programmer', 'ClearAll'],
  ];
  function maTab(c) {
    const ma2 = c.console === 'ma2';
    const fix = (cmd) => (ma2 ? cmd.replace(/Sequence (\d+)/g, 'Executor $1').replace('Master 1', 'SpecialMaster 2.1').replace('Blackout', 'Blackout') : cmd);
    const outs = [['', QP.midi.outputs.length ? 'First available output' : 'No MIDI outputs found'], ...QP.midi.outputs.map((o) => [o.name, o.name])];
    const protoOpts = ma2 ? [['telnet', 'Telnet (command line)'], ['msc', 'MIDI Show Control']] : [['osc', 'OSC (command line)'], ['msc', 'MIDI Show Control']];
    if (!S.locked && !protoOpts.some(([v]) => v === c.proto)) setTimeout(() => { setField(c, 'proto', protoOpts[0][0]); setField(c, 'port', ma2 ? 30000 : 8000); renderInspector(); }, 0);
    return h('div', { class: 'grid' },
      fSelect(c, 'console', 'Console', [['ma3', 'grandMA3 (console / onPC)'], ['ma2', 'grandMA2 (console / onPC)']], { rerender: true }),
      fSelect(c, 'proto', 'Connection', protoOpts, { rerender: true }),
      ...(c.proto === 'msc' ? [
        fSelect(c, 'midiOut', 'MIDI output', outs, { cls: 'span2' }),
        fSelect(c, 'mscCommand', 'MSC command', [['msc_go', 'GO'], ['msc_stop', 'STOP (pause)'], ['msc_resume', 'RESUME']]),
        fText(c, 'mscCue', 'Cue number', { placeholder: '5 or 5.1' }),
        fText(c, 'mscList', ma2 ? 'Executor (cue list)' : 'Sequence (cue list)', { placeholder: 'blank = selected / default' }),
        fNum(c, 'mscDevice', 'MSC device ID', { min: 0, max: 127, hint: '127 = all devices' }),
        h('div', { class: 'explain' }, `${ma2 ? 'grandMA2: Setup → Console → MIDI Show Control' : 'grandMA3: Menu → In & Out → MIDI'} — set MSC In to the same device ID and command format “All” (or Lighting), and pick the executor/sequence to follow.`),
      ] : [
        fText(c, 'host', 'Console IP address', { placeholder: '192.168.1.10' }),
        fNum(c, 'port', ma2 ? 'Telnet port' : 'OSC port', { min: 1, max: 65535, hint: ma2 ? 'grandMA2 uses 30000 (not 23)' : 'The port set in the console’s OSC settings' }),
        ...(ma2 ? [fText(c, 'user', 'User name', { placeholder: 'administrator' }), h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Password'), (() => { const i = h('input', { type: 'password', value: c.password || '' }); i.onchange = () => setField(c, 'password', i.value); return i; })())]
          : [fText(c, 'oscPrefix', 'OSC prefix', { placeholder: 'blank, or the prefix set on the console', hint: 'Sends /<prefix>/cmd' })]),
        fArea(c, 'command', 'Command line', { cls: 'full', placeholder: ma2 ? 'Go+ Executor 1' : 'Go+ Sequence 1' }),
        h('div', { class: 'field full' }, h('span', { class: 'flabel' }, 'Templates'), h('div', { class: 'learnbox', style: 'flex-wrap:wrap' },
          MA_TEMPLATES.map(([l, cmd]) => h('button', { class: 'btn mini edit-only', onclick: () => { setField(c, 'command', fix(cmd)); renderInspector(); } }, l)))),
        h('div', { class: 'explain' }, ma2
          ? 'grandMA2: Setup → Console → Global Settings → Telnet → “Login Enabled”. QForge logs in with the user above, keeps the connection open, and sends each line of the command box as a command. Several lines = several commands.'
          : 'grandMA3: Menu → In & Out → OSC — add an entry with this computer’s IP, enable Receive and Receive Command, and match the port (and prefix). Any command-line text works, e.g. Go+ Sequence 1, Goto Cue 3, Macro 5.'),
      ]),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Test'), h('button', { class: 'btn mini', onclick: () => fireCueById(c.id) }, 'Send now')));
  }

  function duckFields(c) {
    return [
      h('div', { class: 'section-title' }, 'Ducking'),
      fCheck(c, 'duckOthers', 'Duck other audio while this plays (announcements, VO)', { rerender: true }),
      ...(c.duckOthers ? [
        fNum(c, 'duckAmount', 'Duck by (dB)', { min: 1, max: 60, step: 1 }),
        fTime(c, 'duckAttack', 'Duck down time'),
        fTime(c, 'duckRelease', 'Recover time'),
      ] : [fCheck(c, 'duckExempt', 'Never duck this cue')]),
    ];
  }
  const OSC_TEMPLATES = [
    { group: 'grandMA3', items: [
      ['Go+ sequence', { port: 8000, address: '/cmd', args: '"Go+ Sequence 1"' }],
      ['Go to cue in sequence', { port: 8000, address: '/cmd', args: '"Goto Cue 5 Sequence 1"' }],
      ['Off sequence', { port: 8000, address: '/cmd', args: '"Off Sequence 1"' }],
      ['Sequence master level', { port: 8000, address: '/cmd', args: '"Sequence 1 At 50"' }],
      ['Run macro', { port: 8000, address: '/cmd', args: '"Go+ Macro 1"' }],
    ] },
    { group: 'ETC Eos', items: [
      ['GO (main playback)', { port: 8000, address: '/eos/key/go_0', args: '' }],
      ['Fire cue (list/cue)', { port: 8000, address: '/eos/cue/1/5/fire', args: '' }],
      ['Run macro', { port: 8000, address: '/eos/macro/1/fire', args: '' }],
    ] },
    { group: 'Resolume Arena / Avenue', items: [
      ['Trigger column', { port: 7000, address: '/composition/columns/1/connect', args: '1' }],
      ['Trigger clip (layer/clip)', { port: 7000, address: '/composition/layers/1/clips/1/connect', args: '1' }],
      ['Clear layer', { port: 7000, address: '/composition/layers/1/clear', args: '1' }],
      ['Composition opacity', { port: 7000, address: '/composition/video/opacity', args: '1.0' }],
    ] },
    { group: 'Behringer X32 / Midas M32', items: [
      ['Mute channel', { port: 10023, address: '/ch/01/mix/on', args: '0' }],
      ['Unmute channel', { port: 10023, address: '/ch/01/mix/on', args: '1' }],
      ['Channel fader (0–1)', { port: 10023, address: '/ch/01/mix/fader', args: '0.75' }],
      ['Recall scene', { port: 10023, address: '/-action/goscene', args: '1' }],
    ] },
    { group: 'QLab / another QForge', items: [
      ['GO', { port: 53000, address: '/go', args: '' }],
      ['Start cue', { port: 53000, address: '/cue/1/start', args: '' }],
      ['Panic / stop all', { port: 53000, address: '/panic', args: '' }],
    ] },
    { group: 'Bitfocus Companion', items: [
      ['Press button (page/row/column)', { port: 12321, address: '/location/1/0/1/press', args: '' }],
    ] },
  ];
  function oscTemplatePicker(c) {
    const sel = h('select', {}, h('option', { value: '' }, 'Choose a device template…'),
      OSC_TEMPLATES.map((g, gi) => h('optgroup', { label: g.group }, g.items.map((it, ii) => h('option', { value: `${gi}:${ii}` }, it[0])))));
    sel.addEventListener('change', () => {
      if (!sel.value) return;
      const [gi, ii] = sel.value.split(':').map(Number);
      const [label, t] = OSC_TEMPLATES[gi].items[ii];
      pushUndo(null);
      Object.assign(c, t);
      if (!c.name) c.name = `${OSC_TEMPLATES[gi].group}: ${label}`;
      markDirty(); renderAll();
      toast('Template applied — set the destination IP and adjust numbers', 'ok');
    });
    return h('label', { class: 'field full' }, h('span', { class: 'flabel' }, 'Template'), sel,
      h('span', { class: 'hint' }, 'Ports shown are the usual defaults — match them to the device’s OSC settings (grandMA3: In & Out → OSC; Eos: Show Control → OSC).'));
  }
  function splitAtMarkers(c) {
    const f = find(c.id);
    const b = rt.audio.buffers.get(c.file);
    if (!f || !b) return;
    const s0 = Number(c.start) || 0, e0 = Number(c.end) > 0 ? Number(c.end) : b.duration;
    const pts = [s0, ...(c.markers || []).filter((m) => m > s0 + 0.05 && m < e0 - 0.05), e0];
    pushUndo(null);
    let n = parseInt(nextNumber(), 10);
    const parts = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = cloneWithNewIds(c);
      Object.assign(p, { start: pts[i], end: i === pts.length - 2 && !(Number(c.end) > 0) ? 0 : pts[i + 1], markers: [], number: String(n++), name: `${displayName(c)} — part ${i + 1}`, continueMode: 'none' });
      parts.push(p);
    }
    f.list.splice(f.index + 1, 0, ...parts);
    S.sel = new Set(parts.map((p) => p.id));
    markDirty(); renderAll();
    toast(`Created ${parts.length} cues from markers (original kept above)`, 'ok');
  }
  function surfaceOptions() { return (settings().surfaces || []).map((sf) => [sf.id, sf.name]); }
  function colorInput(c, key) {
    const el = h('input', { type: 'color', value: c[key] || '#ffffff', class: 'colorpick' });
    el.addEventListener('input', () => setField(c, key, el.value));
    el.addEventListener('change', () => el.blur());
    return el;
  }
  function routingEditor(c) {
    const dev = rt.dev(c.device);
    const outs = Math.min(rt.audio.channels(dev), 32);
    const buf = rt.audio.buffers.get(c.file);
    const ins = Math.min(buf ? buf.numberOfChannels : 2, 16);
    const on = !!(c.routing && c.routing.on);
    const box = h('div', { class: 'field full' });
    const toggle = h('input', { type: 'checkbox', checked: on });
    toggle.addEventListener('change', () => {
      const m = c.routing && c.routing.matrix ? c.routing.matrix : Array.from({ length: ins }, (_, i) => Array.from({ length: outs }, (_, o) => (ins === 1 ? o < 2 : o === i)));
      setField(c, 'routing', { on: toggle.checked, matrix: m }, { rerender: true });
      toggle.blur();
    });
    box.append(h('div', { class: 'section-title', style: 'margin-bottom:8px' }, 'Output routing'),
      h('label', { class: 'field check', style: 'padding-top:0' }, toggle, h('span', { class: 'flabel' }, `Custom routing matrix (device has ${outs} output${outs === 1 ? '' : 's'})`)));
    if (on) {
      const tbl = h('table', { class: 'matrix' });
      tbl.append(h('tr', {}, h('th', {}, 'File ch → Out'), ...Array.from({ length: outs }, (_, o) => h('th', {}, String(o + 1)))));
      for (let i = 0; i < ins; i++) {
        const row = h('tr', {}, h('th', {}, ins === 2 ? ['L', 'R'][i] : String(i + 1)));
        for (let o = 0; o < outs; o++) {
          const cb = h('input', { type: 'checkbox', checked: !!((c.routing.matrix[i] || [])[o]) });
          cb.addEventListener('change', () => {
            const m = c.routing.matrix.map((r) => [...r]);
            while (m.length <= i) m.push([]);
            m[i][o] = cb.checked;
            setField(c, 'routing', { on: true, matrix: m });
            cb.blur();
          });
          row.append(h('td', {}, cb));
        }
        tbl.append(row);
      }
      box.append(h('div', { class: 'matrixwrap' }, tbl), h('span', { class: 'hint' }, 'Pan is ignored while custom routing is on. Choose an output device with more channels (e.g. your audio interface) to see more outputs.'));
    }
    return box;
  }

  // waveform with draggable trims ----------------------------------------
  function waveBox(c) {
    const canvas = h('canvas');
    const label = h('div', { class: 'wlabel' });
    const box = h('div', { class: 'wave' }, canvas, label);
    let drag = null;
    const buf = () => rt.audio.buffers.get(c.file);
    const draw = () => {
      const b = buf();
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth, H = canvas.clientHeight;
      if (!W) return;
      if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      if (!b) { label.textContent = c.file ? 'Loading waveform…' : 'No file'; return; }
      const dur = b.duration, pk = b.peaks;
      const grad = g.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, '#22d3ee'); grad.addColorStop(0.55, '#6366f1'); grad.addColorStop(1, '#d946ef');
      g.fillStyle = grad;
      for (let x = 0; x < W; x++) {
        const v = pk[Math.floor((x / W) * pk.length)] || 0;
        const hh = Math.max(1, v * (H / 2 - 6));
        g.fillRect(x, H / 2 - hh, 1, hh * 2);
      }
      const s = Math.min(Number(c.start) || 0, dur), e = Number(c.end) > 0 ? Math.min(Number(c.end), dur) : dur;
      const xs = (s / dur) * W, xe = (e / dur) * W;
      g.fillStyle = 'rgba(5,6,10,.72)';
      g.fillRect(0, 0, xs, H); g.fillRect(xe, 0, W - xe, H);
      g.fillStyle = '#34d399'; g.fillRect(xs - 1, 0, 2, H);
      g.fillStyle = '#f43f5e'; g.fillRect(xe - 1, 0, 2, H);
      for (const mk of c.markers || []) {
        const xm = (mk / dur) * W;
        g.fillStyle = '#f97316'; g.fillRect(xm - 0.75, 0, 1.5, H);
        g.beginPath(); g.moveTo(xm - 5, H); g.lineTo(xm + 5, H); g.lineTo(xm, H - 7); g.fill();
      }
      if (S.loadTime[c.id] != null) {
        const xl = (S.loadTime[c.id] / dur) * W;
        g.fillStyle = '#facc15'; g.fillRect(xl - 1, 0, 2, H);
        g.beginPath(); g.moveTo(xl - 6, 0); g.lineTo(xl + 6, 0); g.lineTo(xl, 8); g.fill();
      }
      for (const r of rt.runsFor(c.id)) {
        if (!r.seg) continue;
        const x = (rt.audioPosition(r, rt.now()) / dur) * W;
        g.fillStyle = '#fff'; g.fillRect(x - 0.5, 0, 1.5, H);
      }
      label.textContent = `${fmtTime(dur)} total · trimmed ${fmtTime(e - s)} — drag handles to trim · Alt-click: marker · Shift-click to ${rt.runsFor(c.id).length ? 'jump playback' : 'load to time'}${S.loadTime[c.id] != null ? ` (loaded at ${fmtTime(S.loadTime[c.id])})` : ''}`;
    };
    const timeAt = (ev) => { const b = buf(); const r = canvas.getBoundingClientRect(); return b ? QP.clamp((ev.clientX - r.left) / r.width, 0, 1) * b.duration : 0; };
    canvas.addEventListener('mousedown', (ev) => {
      const b = buf(); if (!b) return;
      if (ev.altKey && !S.locked) {
        const t = Math.round(timeAt(ev) * 100) / 100;
        const near = (c.markers || []).findIndex((m) => Math.abs(m - t) < b.duration * 0.008);
        const mk = [...(c.markers || [])];
        if (near >= 0) mk.splice(near, 1); else mk.push(t);
        setField(c, 'markers', mk.sort((x, y) => x - y));
        draw(); renderInspector();
        return;
      }
      if (ev.shiftKey) {
        const t = timeAt(ev);
        const runs = rt.runsFor(c.id);
        if (runs.length) runs.forEach((r) => rt.seekRun(r, t));
        else if (S.loadTime[c.id] != null && Math.abs(S.loadTime[c.id] - t) < b.duration * 0.01) delete S.loadTime[c.id];
        else S.loadTime[c.id] = Math.round(t * 100) / 100;
        draw();
        return;
      }
      if (S.locked) return;
      const t = timeAt(ev);
      const s = Number(c.start) || 0, e = Number(c.end) > 0 ? Number(c.end) : b.duration;
      drag = Math.abs(t - s) < Math.abs(t - e) ? 'start' : 'end';
      const move = (mv) => {
        let v = timeAt(mv);
        if (drag === 'start') v = Math.min(v, (Number(c.end) > 0 ? Number(c.end) : b.duration) - 0.05);
        else v = Math.max(v, (Number(c.start) || 0) + 0.05);
        if (drag === 'end' && v >= b.duration - 0.01) v = 0;
        setField(c, drag, Math.round(v * 100) / 100);
        draw();
      };
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); drag = null; renderInspector(); };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
      move(ev);
    });
    waveCtl = { draw, cue: c };
    requestAnimationFrame(draw);
    if ((c.markers || []).length) {
      return h('div', { class: 'field full', style: 'gap:6px' }, box, h('div', { class: 'learnbox' },
        h('span', { class: 'hint', style: 'flex:1' }, `${c.markers.length} marker${c.markers.length > 1 ? 's' : ''}: ${c.markers.map((m) => fmtTime(m)).join(', ')}`),
        h('button', { class: 'btn mini edit-only', onclick: () => splitAtMarkers(c) }, `Split into ${c.markers.length + 1} cues`),
        h('button', { class: 'btn mini edit-only', onclick: () => { setField(c, 'markers', []); renderInspector(); } }, 'Clear markers')));
    }
    return box;
  }

  // ---------------------------------------------------------------- toolbar
  function buildToolbar() {
    const bar = $('#toolbar');
    const fg = h('div', { class: 'tgroup' },
      h('button', { class: 'addbtn', title: `New show (${MOD}N)`, onclick: () => runCommand('new') }, icon('newdoc'), 'New'),
      h('button', { class: 'addbtn', title: `Open show (${MOD}O)`, onclick: () => runCommand('open') }, icon('file'), 'Open'),
      h('button', { class: 'addbtn', title: `Save (${MOD}S)`, onclick: () => runCommand('save') }, icon('save'), 'Save'),
      h('button', { class: 'addbtn', title: 'Import cues from another show file', onclick: () => runCommand('import') }, icon('import'), 'Import'),
      h('button', { class: 'addbtn', title: 'Export options', onclick: (e) => exportMenu(e.currentTarget) }, icon('export'), 'Export'));
    bar.insertBefore(fg, bar.firstChild);
    const add = $('#add-buttons');
    const primary = ['audio', 'video', 'group', 'fade', 'stop', 'start', 'goto', 'wait', 'memo'];
    for (const t of primary) add.append(h('button', { class: 'addbtn', title: `New ${TYPES[t].label} cue`, onclick: () => addCue(t) }, icon(t), TYPES[t].label));
    add.append(h('button', { class: 'addbtn', title: 'More cue types', onclick: (e) => popMenu(e.currentTarget, ['midi', 'osc', 'text', 'camera', 'mic', 'timecode', 'light', 'script', 'app', 'ma'].map((t) => ({ label: `${TYPES[t].label} cue`, icon: t, fn: () => addCue(t) }))) }, icon('tools'), 'More ▾'));
    const right = bar.querySelector('.tgroup.right');
    const search = h('input', { type: 'search', id: 'search', placeholder: `Find cues (${MOD}F)` });
    search.addEventListener('input', () => { S.filter = search.value; renderList(); });
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const r = visibleRows().find((x) => !x.dim); if (r) { setPlayhead(r.cue.id, true); search.blur(); } } });
    right.insertBefore(search, right.firstChild);
    right.insertBefore(h('button', { class: 'tbtn small', title: 'Tools', onclick: (e) => toolsMenu(e.currentTarget) }, icon('tools'), 'Tools'), $('#btn-video'));
    right.insertBefore(h('button', { class: 'tbtn small', id: 'btn-rehearsal', title: 'Rehearsal mode: mutes audio and holds back MIDI, OSC, DMX, timecode and scripts', onclick: () => toggleRehearsal() }, icon('rehearse'), 'Rehearsal'), $('#btn-video'));
    right.insertBefore(h('button', { class: 'tbtn small', title: `Stage manager view (${MOD}⇧M)`, onclick: () => runCommand('sm-open') }, icon('sm'), 'SM view'), $('#btn-video'));
    $('#btn-pause').append(icon('pause'), 'Pause all');
    $('#btn-resume').append(icon('play'), 'Resume');
    $('#btn-panic').append(icon('panic'), 'Stop all');
    $('#btn-video').append(icon('monitor'), 'Outputs');
    $('#btn-settings').append(icon('gear'), 'Settings');
    $('#btn-pause').onclick = () => pauseAll();
    $('#btn-resume').onclick = () => resumeAll();
    $('#btn-panic').onclick = () => panic();
    $('#btn-video').onclick = toggleVideo;
    $('#btn-lock').onclick = toggleLock;
    $('#btn-settings').onclick = () => openSettings();
    $('#go').onclick = () => go();
    $('#tm-timer').onclick = () => timerToggle();
    $('#tm-timer').ondblclick = () => timerReset();
    const m = $('#master');
    m.addEventListener('input', () => { settings().masterDb = Number(m.value); rt.audio.setMaster(Number(m.value)); updateMaster(); markDirty(); });
    m.addEventListener('change', () => m.blur());
    m.addEventListener('dblclick', () => { m.value = 0; m.dispatchEvent(new Event('input')); });
    updateLockUi();
  }
  function popMenu(anchor, items) {
    closePop();
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, bottom: anchor.y };
    const top = Math.min(r.bottom + 4, window.innerHeight - Math.min(items.length * 32 + 20, window.innerHeight - 20));
    const menu = h('div', { class: 'popmenu', style: `left:${Math.min(r.left, window.innerWidth - 300)}px; top:${Math.max(8, top)}px` },
      items.map((it) => (it === '-' ? h('hr') : h('button', { onclick: () => { closePop(); it.fn(); } }, it.icon ? icon(it.icon) : null, it.label, it.kbd ? h('span', { class: 'kbd' }, it.kbd) : null))));
    document.body.append(menu);
    setTimeout(() => window.addEventListener('mousedown', outside), 0);
    function outside(e) { if (!menu.contains(e.target)) closePop(); }
    closePop.fn = () => { menu.remove(); window.removeEventListener('mousedown', outside); };
  }
  function closePop() { if (closePop.fn) { closePop.fn(); closePop.fn = null; } }
  function exportMenu(anchor) {
    popMenu(anchor, [
      { label: 'Save As…', kbd: `${MOD}⇧S`, fn: () => runCommand('save-as') },
      '-',
      { label: 'Export Show Package (show + all media)…', kbd: `${MOD}⇧E`, fn: () => runCommand('export-package') },
      { label: 'Export Cue List as CSV…', fn: () => runCommand('export-csv') },
      { label: 'Print Cue Sheet (PDF)…', kbd: `${MOD}⇧P`, fn: () => runCommand('export-pdf') },
    ]);
  }
  function toolsMenu(anchor) {
    popMenu(anchor, [
      { label: 'Pre-flight check…', kbd: `${MOD}⇧K`, fn: () => runCommand('preflight') },
      { label: 'Relink missing media…', fn: () => runCommand('relink') },
      { label: 'Show log…', fn: () => runCommand('log') },
      { label: 'Show statistics…', fn: () => runCommand('stats') },
      { label: 'Version history…', fn: () => runCommand('history') },
      { label: 'Record input…', icon: 'mic', fn: () => runCommand('record') },
      '-',
      { label: 'Find & replace…', kbd: `${MOD}H`, fn: () => runCommand('replace') },
      { label: 'Renumber selected cues…', kbd: `${MOD}⇧R`, fn: () => runCommand('renumber') },
      { label: 'Normalise loudness of selected audio', fn: () => runCommand('normalize') },
      '-',
      { label: 'Start / stop show timer', kbd: `${MOD}T`, fn: () => timerToggle() },
      { label: 'Reset show timer', fn: () => timerReset() },
      { label: 'Blackout all DMX universes', fn: () => { rt.dmxBlackout(); toast('DMX blackout sent'); } },
      { label: S.rehearsal ? 'Leave rehearsal mode' : 'Rehearsal mode (mute outputs)', fn: () => toggleRehearsal() },
      '-',
      { label: 'Keyboard shortcuts', kbd: '?', icon: 'keyboard', fn: () => showShortcuts() },
    ]);
  }
  function updateMaster() {
    const v = Number(settings().masterDb) || 0;
    $('#master').value = v;
    $('#master-val').textContent = `${v <= -60 ? '-inf' : v.toFixed(1)} dB`;
  }
  async function requireAdmin(why) {
    const pin = settings().adminPin;
    if (!S.locked || !pin) return true;
    const v = await promptModal('Admin PIN required', why || 'Enter the admin PIN', '');
    if (v === pin) return true;
    if (v != null) toast('Wrong PIN', 'err');
    return false;
  }
  async function toggleLock() {
    if (S.locked && !(await requireAdmin('Enter the admin PIN to unlock editing'))) return;
    S.locked = !S.locked; updateLockUi(); renderAll(); toast(S.locked ? 'Show mode: editing locked' : 'Edit mode');
    addLog('show', S.locked ? 'Show locked' : 'Show unlocked');
  }
  function updateLockUi() {
    document.body.classList.toggle('locked', S.locked);
    const b = $('#btn-lock');
    b.textContent = ''; b.append(icon(S.locked ? 'lock' : 'unlock'), S.locked ? 'Locked' : 'Edit');
    b.classList.toggle('on', S.locked);
    const st = $('#st-lock'); st.textContent = S.locked ? 'SHOW MODE' : ''; st.classList.toggle('on', S.locked);
    if (typeof applyShowView === 'function') applyShowView();
  }
  async function toggleVideo() {
    if (rt.output.anyOpen()) { rt.output.closeAll(); $('#btn-video').classList.remove('on'); }
    else { try { await rt.output.openAll(); $('#btn-video').classList.add('on'); } catch (e) { toast(e.message, 'err'); } }
  }

  // ---------------------------------------------------------------- script view (theatre hit list)
  let lastScriptPh = null;
  function scriptLines() { return String((S.show.script || {}).text || '').split(/\r?\n/); }
  function renderScript() {
    const view = $('#script-view');
    view.textContent = '';
    const sc = S.show.script || (S.show.script = { text: '', links: {} });
    const tools = h('div', { class: 'sv-tools' },
      h('span', { class: 'hint' }, S.scriptEdit ? 'Paste or type the script, then press Done.' : `Click a line to put its cue in standby.${S.locked ? '' : ' Click the gutter to link the standby cue to a line.'}`),
      h('span', { class: 'spacer' }),
      !S.locked ? h('button', { class: 'btn mini', onclick: () => { S.scriptEdit = !S.scriptEdit; renderScript(); } }, S.scriptEdit ? 'Done' : 'Edit text') : null,
      !S.locked ? h('button', { class: 'btn mini', onclick: loadScriptFile }, 'Load .txt…') : null);
    view.append(tools);
    if (S.scriptEdit) {
      const ta = h('textarea', { class: 'sv-edit', placeholder: 'Paste your script here — one line per line of dialogue / stage direction.' });
      ta.value = sc.text || '';
      ta.addEventListener('change', () => { pushUndo(null); sc.text = ta.value; markDirty(); });
      view.append(ta);
      setTimeout(() => ta.focus(), 20);
      return;
    }
    const lines = scriptLines();
    const box = h('div', { class: 'sv-lines' });
    lines.forEach((line, i) => {
      const cid = sc.links[i];
      const cue = cid ? cueById(cid) : null;
      const row = h('div', { class: `sv-line${cue ? ' linked' : ''}`, 'data-i': i, 'data-cue': cue ? cue.id : '' },
        h('div', { class: 'sv-gutter', title: S.locked ? '' : (cue ? 'Click to unlink' : 'Click to link the standby cue here'), onclick: () => linkScriptLine(i) },
          cue ? h('span', { class: 'sv-badge', style: cue.color ? `--c:${cue.color}` : '' }, cue.number || '•') : h('span', { class: 'sv-plus' }, '+')),
        h('div', { class: 'sv-text', onclick: () => { if (cue) setPlayhead(cue.id, true); } }, line || ' '),
        cue ? h('div', { class: 'sv-cue' }, displayName(cue)) : null);
      box.append(row);
    });
    if (!lines.join('').trim()) box.append(h('div', { class: 'insp-empty' }, 'No script yet — press “Edit text” to paste one.'));
    view.append(box);
    lastScriptPh = null;
    updateScript();
  }
  function linkScriptLine(i) {
    if (S.locked) return;
    const sc = S.show.script;
    pushUndo(null);
    if (sc.links[i]) delete sc.links[i];
    else if (S.playheadId) {
      for (const [k, v] of Object.entries(sc.links)) if (v === S.playheadId) delete sc.links[k];
      sc.links[i] = S.playheadId;
    } else { toast('Put a cue in standby first, then click the line', 'err'); return; }
    markDirty(); renderScript();
  }
  function loadScriptFile() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.txt,.md,.fountain,text/plain';
    inp.onchange = async () => { const f = inp.files[0]; if (!f) return; pushUndo(null); S.show.script.text = await f.text(); markDirty(); renderScript(); toast(`Loaded ${f.name}`, 'ok'); };
    inp.click();
  }
  function updateScript() {
    if (S.view !== 'script' || S.scriptEdit) return;
    const view = $('#script-view');
    const running = new Set(rt.runs.map((r) => r.cueId));
    view.querySelectorAll('.sv-line.linked').forEach((el) => {
      el.classList.toggle('ph', el.dataset.cue === S.playheadId);
      el.classList.toggle('run', running.has(el.dataset.cue));
    });
    if (S.playheadId !== lastScriptPh) {
      lastScriptPh = S.playheadId;
      const el = view.querySelector(`.sv-line[data-cue="${CSS.escape(S.playheadId || '')}"]`);
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  // ---------------------------------------------------------------- run statistics
  function recordStat(r, secs) {
    if (!S.show.stats) S.show.stats = {};
    if (['memo', 'goto', 'start', 'midi', 'osc', 'script'].includes(r.cue.type)) return;
    const st = S.show.stats[r.cueId] || { n: 0, total: 0, min: Infinity, max: 0, last: 0 };
    st.n++; st.total += secs; st.last = secs; st.min = Math.min(st.min, secs); st.max = Math.max(st.max, secs); st.at = Date.now();
    if (r.stopped) st.stoppedEarly = (st.stoppedEarly || 0) + 1;
    S.show.stats[r.cueId] = st;
  }
  function showStats() {
    const rows = [];
    S.show.lists.forEach((l) => T.walk(l.cues, (c) => {
      const st = (S.show.stats || {})[c.id];
      if (!st) return;
      const planned = actionDuration(c);
      const avg = st.total / st.n;
      rows.push({ c, st, planned, avg, delta: planned != null && isFinite(planned) ? avg - planned : null });
    }));
    const tbl = h('table', { class: 'stats' },
      h('tr', {}, ['Cue', 'Planned', 'Runs', 'Average', 'Last', 'Min – max', 'Δ vs plan', 'Stopped early'].map((t) => h('th', {}, t))),
      rows.map(({ c, st, planned, avg, delta }) => h('tr', {},
        h('td', {}, h('b', {}, c.number ? c.number + ' ' : ''), displayName(c)),
        h('td', {}, planned == null ? '—' : fmtTime(planned)),
        h('td', {}, String(st.n)),
        h('td', {}, fmtTime(avg)), h('td', {}, fmtTime(st.last)),
        h('td', {}, `${fmtTime(st.min)} – ${fmtTime(st.max)}`),
        h('td', { class: delta == null ? '' : Math.abs(delta) < 1 ? 'ok' : delta > 0 ? 'warn' : 'bad' }, delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}s`),
        h('td', {}, String(st.stoppedEarly || 0)))));
    const total = rows.reduce((a, r) => a + r.avg, 0);
    const body = h('div', {},
      h('div', { class: 'explain', style: 'margin-bottom:10px' }, rows.length ? `Actual running times collected across rehearsals and shows (${rows.length} cues, ${fmtClock(total)} total average). Statistics are saved with the show.` : 'No statistics yet — they build up automatically as cues run in rehearsals and shows.'),
      h('div', { class: 'statswrap' }, tbl),
      h('div', { class: 'logtools', style: 'margin-top:10px' },
        h('button', { class: 'btn mini', onclick: () => {
          const csv = [['Number', 'Name', 'Planned', 'Runs', 'Average', 'Last', 'Min', 'Max', 'Delta', 'Stopped early'], ...rows.map(({ c, st, planned, avg, delta }) => [c.number, displayName(c), planned == null ? '' : planned.toFixed(2), st.n, avg.toFixed(2), st.last.toFixed(2), st.min.toFixed(2), st.max.toFixed(2), delta == null ? '' : delta.toFixed(2), st.stoppedEarly || 0])]
            .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
          P.exportText(`${S.show.name} statistics.csv`, csv, 'csv', 'CSV');
        } }, 'Export CSV…'),
        h('button', { class: 'btn mini edit-only', onclick: async () => { if ((await askModal('Reset statistics?', 'Clear all collected running times for this show?', ['Reset', 'Cancel'])) === 0) { S.show.stats = {}; markDirty(); closeModals(); showStats(); } } }, 'Reset statistics')));
    modal({ title: 'Show statistics', body, buttons: ['Close'], wide: true });
  }

  // ---------------------------------------------------------------- version history
  async function showHistory() {
    if (!P.isElectron) { toast('Version history needs the desktop app', 'err'); return; }
    if (!S.path) { toast('Save the show first — history is kept for saved shows', 'err'); return; }
    const list = await P.historyList(S.path);
    const body = h('div', {},
      h('div', { class: 'explain', style: 'margin-bottom:10px' }, 'QForge keeps the last 20 saved versions of this show. Opening one loads it as unsaved changes — save to make it current (the version you replace is kept in history too).'),
      list.length ? h('div', { class: 'histlist' }, list.map((v) => h('div', { class: 'pf-row' },
        h('span', { class: 'pf-t' }, new Date(v.time).toLocaleString(), h('span', { class: 'hint' }, `  ·  ${(v.size / 1024).toFixed(1)} KB`)),
        h('button', { class: 'btn mini', onclick: async () => {
          if (!(await confirmDiscard())) return;
          const r = await P.historyRead(v.file, S.path);
          if (r.error) { toast(r.error, 'err'); return; }
          closeModals();
          const path = S.path;
          loadShowData(r.data, path, { dirty: true });
          toast(`Restored the version from ${new Date(v.time).toLocaleString()} — save to keep it`, 'ok');
        } }, 'Open')))) : h('div', { class: 'insp-empty' }, 'No earlier versions yet — they appear each time you save over this show.'));
    modal({ title: `Version history — ${baseName(S.path)}`, body, buttons: ['Close'] });
  }

  // ---------------------------------------------------------------- recorder
  async function openRecorder() {
    if (S.locked) { toast('Unlock the show to record new cues', 'err'); return; }
    let stream = null, rec = null, chunks = [], t0 = 0, timer = null, actx = null, an = null, raf = 0;
    const devSel = h('select', {}, h('option', { value: '' }, 'Default input'), (S.audioInputs || []).map((d) => h('option', { value: d.deviceId }, d.label || 'Input')));
    const name = h('input', { type: 'text', value: `Recording ${new Date().toLocaleTimeString([], { hour12: false }).replace(/:/g, '-')}` });
    const meter = h('div', { class: 'mbar', style: 'height:12px' }, h('i', { class: 'rms' }));
    const time = h('div', { class: 'rec-time' }, '0:00.0');
    const btn = h('button', { class: 'btn primary rec-btn' }, '● Record');
    const stopAll = () => { cancelAnimationFrame(raf); clearInterval(timer); if (stream) stream.getTracks().forEach((t) => t.stop()); if (actx) actx.close(); stream = null; };
    const openInput = async () => {
      stopAll();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: devSel.value ? { exact: devSel.value } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      actx = new AudioContext(); an = actx.createAnalyser(); an.fftSize = 1024; actx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(1024);
      const loop = () => { an.getFloatTimeDomainData(buf); let pk = 0; for (const v of buf) pk = Math.max(pk, Math.abs(v)); const db = pk > 0 ? 20 * Math.log10(pk) : -90; meter.querySelector('.rms').style.width = `${100 - QP.clamp((db + 60) / 60, 0, 1) * 100}%`; raf = requestAnimationFrame(loop); };
      loop();
    };
    devSel.onchange = () => openInput().catch((e) => toast(e.message, 'err'));
    btn.onclick = async () => {
      if (!rec) {
        if (!stream) await openInput();
        chunks = [];
        rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '' , audioBitsPerSecond: 256000 });
        rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        rec.start(250);
        t0 = performance.now();
        timer = setInterval(() => { const s2 = (performance.now() - t0) / 1000; time.textContent = `${Math.floor(s2 / 60)}:${(s2 % 60).toFixed(1).padStart(4, '0')}`; }, 100);
        btn.textContent = '■ Stop & add cue'; btn.classList.add('recording');
      } else {
        await new Promise((res) => { rec.onstop = res; rec.stop(); });
        clearInterval(timer);
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const bytes = await blob.arrayBuffer();
        const fname = `${(name.value || 'Recording').replace(/[\\/:*?"<>|]+/g, '_')}.webm`;
        const r = await P.saveRecording(fname, bytes, S.path);
        if (!r.ok) { toast(`Could not save recording: ${r.error}`, 'err'); return; }
        const c = newCue('audio'); c.file = r.path; c.name = name.value || 'Recording'; c.number = nextNumber();
        insertCues([c]); afterFileSet(c);
        addLog('tools', `Recorded ${baseName(r.path)}`);
        toast(`Recorded ${fmtTime((performance.now() - t0) / 1000)} → ${baseName(r.path)}`, 'ok');
        m.close(0);
      }
    };
    const m = modal({ title: 'Record input', small: true, onClose: stopAll, body: h('div', { class: 'grid wide' },
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Input'), devSel),
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Cue name'), name),
      h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Input level'), meter),
      h('div', { class: 'rec-row' }, time, btn),
      h('div', { class: 'hint' }, P.isElectron ? (S.path ? 'Saved to a “Recordings” folder next to the show file.' : 'Saved to Documents/QForge Recordings (save the show first to keep recordings with it).') : 'Browser mode: the recording lives in memory until the page closes.')) });
    openInput().catch((e) => toast(`Input unavailable: ${e.message}`, 'err'));
  }

  // ---------------------------------------------------------------- output processing editor
  function outputProcEditor() {
    const s = settings();
    if (!s.outputProc) s.outputProc = {};
    const wrap = h('div', { class: 'field full' });
    const devSel = h('select', {}, [['default', 'System default output'], ...S.audioOutputs.map((d) => [d.deviceId, d.label || 'Output'])].map(([v, l]) => h('option', { value: v }, l)));
    devSel.value = S.procDev || 'default';
    const table = h('div');
    const draw = () => {
      table.textContent = '';
      const dev = devSel.value;
      const n = rt.audio.channels(dev === 'default' ? '' : dev);
      const arr = s.outputProc[dev] || (s.outputProc[dev] = []);
      const tbl = h('table', { class: 'matrix proc' }, h('tr', {}, ['Output', 'Delay (ms)', 'Trim (dB)', 'Polarity ø', 'Mute'].map((t) => h('th', {}, t))));
      for (let i = 0; i < n; i++) {
        const p = arr[i] || (arr[i] = { delay: 0, trim: 0, invert: false, mute: false });
        const upd = () => { markDirty(); rt.audio.refreshOutputs(); };
        const dl = h('input', { type: 'number', min: 0, max: 1000, step: 0.1, value: p.delay }); dl.onchange = () => { p.delay = QP.clamp(Number(dl.value) || 0, 0, 1000); dl.value = p.delay; upd(); };
        const tr = h('input', { type: 'number', min: -40, max: 12, step: 0.5, value: p.trim }); tr.onchange = () => { p.trim = QP.clamp(Number(tr.value) || 0, -40, 12); tr.value = p.trim; upd(); };
        const inv = h('input', { type: 'checkbox', checked: !!p.invert }); inv.onchange = () => { p.invert = inv.checked; upd(); inv.blur(); };
        const mu = h('input', { type: 'checkbox', checked: !!p.mute }); mu.onchange = () => { p.mute = mu.checked; upd(); mu.blur(); };
        tbl.append(h('tr', {}, h('th', {}, String(i + 1)), h('td', {}, dl), h('td', {}, tr), h('td', {}, inv), h('td', {}, mu)));
      }
      table.append(h('div', { class: 'matrixwrap' }, tbl), h('span', { class: 'hint' }, 'Delay ≈ 2.9 ms per metre of distance between the main speakers and a fill/delay speaker. Applies to everything played through this device.'));
    };
    devSel.onchange = () => { S.procDev = devSel.value; draw(); devSel.blur(); };
    draw();
    wrap.append(h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Device'), devSel), table);
    return wrap;
  }

  // ---------------------------------------------------------------- rehearsal mode
  function toggleRehearsal(on) {
    S.rehearsal = on == null ? !S.rehearsal : !!on;
    rt.audio.setMuted(S.rehearsal);
    for (const r of rt.runs) if (r.el && r.el.tagName === 'VIDEO') rt.applyVisual(r, rt.now());
    document.body.classList.toggle('rehearsal', S.rehearsal);
    $('#btn-rehearsal').classList.toggle('on', S.rehearsal);
    $('#rehearsal-banner').hidden = !S.rehearsal;
    addLog('rehearsal', S.rehearsal ? 'Rehearsal mode ON — outputs muted' : 'Rehearsal mode OFF');
    toast(S.rehearsal ? 'Rehearsal mode: audio muted, MIDI/OSC/DMX/timecode/scripts held back' : 'Rehearsal mode off — outputs live', S.rehearsal ? 'info' : 'ok');
    publishState(true);
  }

  // ---------------------------------------------------------------- level meters
  const meterHold = new Map();
  function renderMeters() {
    const box = $('#meters');
    const devs = rt.audio.meterLevels();
    if (!devs.length) { if (box.childElementCount) box.textContent = ''; box.hidden = true; return; }
    box.hidden = false;
    const key = devs.map((d) => `${d.device}:${d.levels.length}`).join('|');
    if (box.dataset.key !== key) {
      box.dataset.key = key;
      box.textContent = '';
      for (const d of devs) {
        const name = d.device ? ((S.audioOutputs.find((o) => o.deviceId === d.device) || {}).label || 'Output') : 'Default output';
        box.append(h('div', { class: 'mdev', 'data-dev': d.device },
          h('div', { class: 'mname' }, h('span', {}, name), h('span', { class: 'mlim', title: 'Limiter reducing gain' }, 'LIM')),
          d.levels.map((_, i) => h('div', { class: 'mch' }, h('span', { class: 'mnum' }, String(i + 1)), h('div', { class: 'mbar' }, h('i', { class: 'rms' }), h('i', { class: 'pk' })), h('span', { class: 'clip', title: 'Clip — click to reset', onclick: (e) => e.currentTarget.classList.remove('on') })))));
      }
    }
    const t = performance.now();
    const toPct = (v) => { const db = v > 0 ? 20 * Math.log10(v) : -90; return QP.clamp((db + 60) / 60, 0, 1) * 100; };
    for (const d of devs) {
      const el = box.querySelector(`.mdev[data-dev="${CSS.escape(d.device)}"]`);
      if (!el) continue;
      el.querySelector('.mlim').classList.toggle('on', d.limiting);
      const chans = el.querySelectorAll('.mch');
      d.levels.forEach((lv, i) => {
        const ch = chans[i]; if (!ch) return;
        const k = `${d.device}:${i}`;
        let hold = meterHold.get(k) || { v: 0, t: 0 };
        if (lv.peak >= hold.v || t - hold.t > 1500) hold = { v: lv.peak, t };
        meterHold.set(k, hold);
        ch.querySelector('.rms').style.width = `${100 - toPct(lv.rms * 1.414)}%`;
        ch.querySelector('.pk').style.left = `calc(${toPct(hold.v)}% - 2px)`;
        if (lv.peak >= 0.999) ch.querySelector('.clip').classList.add('on');
      });
    }
  }

  // ---------------------------------------------------------------- keyboard shortcut sheet
  function showShortcuts() {
    const rows = [
      ['Show control', [['Space', 'GO'], ['Esc', 'Stop all (fade) · press again: instant'], ['↑ / ↓', 'Move standby'], ['← / →', 'Collapse / expand group'], [`${MOD}P / ${MOD}R`, 'Pause all / resume all'], [`${MOD}L`, 'Lock (show mode)'], [`${MOD}T`, 'Start / stop show timer'], [`${MOD}K`, 'Cart wall'], [`${MOD}⇧M`, 'Stage manager view'], [`${MOD}⇧V`, 'Show / hide outputs'], [`${MOD}B`, 'Black out video outputs'], [`${MOD}⇧X`, 'Take manual crossfade'], [`${MOD}${IS_MAC ? '⌥' : 'Alt+'}S`, 'Screenshot outputs'], ['Page Down / Up', 'Clicker: GO / back'], ['B or .', 'Clicker: black out']]],
      ['Editing', [[`${MOD}1…9, 0`, 'New Audio, Video, Group, Fade, Stop, Start, Go To, Wait, Memo, MIDI'], [`${MOD}⇧0`, 'New OSC cue'], [`${MOD}G / ${MOD}⇧G`, 'Group / ungroup'], [`${MOD}D`, 'Duplicate'], [`${MOD}C / X / V`, 'Copy / cut / paste cues'], [`${MOD}Z / ${MOD}⇧Z`, 'Undo / redo'], ['Delete', 'Delete cue(s)'], ['Right-click', 'Cue actions menu'], ['Shift-click waveform', 'Load to time / jump'], ['I / O', 'Set In / Out of the playing cue'], ['Alt-drop files', 'Drop as one playlist / slideshow'], [`${MOD}${IS_MAC ? '⌥' : 'Alt+'}1 / 2 / 3`, 'Preview / Program / Now playing panels']]],
      ['Find & files', [[`${MOD}F`, 'Find cues'], [`${MOD}H`, 'Find & replace'], [`${MOD}⇧R`, 'Renumber'], [`${MOD}S / ${MOD}⇧S`, 'Save / save as'], [`${MOD}O / ${MOD}N`, 'Open / new'], [`${MOD}⇧I`, 'Import cues'], [`${MOD}⇧E`, 'Export show package'], [`${MOD}⇧P`, 'Print cue sheet'], [`${MOD}⇧K`, 'Pre-flight check'], ['?', 'This sheet']]],
    ];
    const body = h('div', { class: 'shortcuts' }, rows.map(([title, list]) => h('div', { class: 'sc-col' }, h('div', { class: 'section-title' }, title),
      list.map(([k, d]) => h('div', { class: 'sc-row' }, h('kbd', {}, k), h('span', {}, d))))));
    modal({ title: 'Keyboard shortcuts', body, buttons: ['Close'], wide: true });
  }

  // ---------------------------------------------------------------- time-of-day triggers
  let lastTod = null;
  function checkTimeOfDay() {
    const d = new Date();
    const now = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    const prev = lastTod;
    lastTod = now;
    if (prev == null || now === prev) return;
    const crossed = (t) => (prev < now ? t > prev && t <= now : t > prev || t <= now); // handles midnight
    walkAll((c) => {
      if (!c.todTrigger) return;
      const p = String(c.todTrigger).split(':').map((v) => parseInt(v, 10));
      if (p.length < 2 || p.some(isNaN)) return;
      const t = p[0] * 3600 + p[1] * 60 + (p[2] || 0);
      if (crossed(t)) { addLog('schedule', `${c.todTrigger} → ${cueLabel(c)}`); fireCueById(c.id); }
    });
  }
  setInterval(checkTimeOfDay, 250);

  // ---------------------------------------------------------------- OSC feedback (TouchOSC, consoles, Companion)
  const fbLast = new Map();
  function sendFeedback() {
    const f = settings().feedback;
    if (!f.enabled || !f.host) return;
    const ph = S.playheadId ? cueById(S.playheadId) : null;
    const top = rt.runs.filter((r) => !r.parentRun);
    const cr = cueRemaining();
    const vals = {
      '/qforge/standby/number': ph ? String(ph.number || '') : '',
      '/qforge/standby/name': ph ? displayName(ph) : 'End of list',
      '/qforge/standby/notes': ph ? ph.notes || '' : '',
      '/qforge/running/count': top.length,
      '/qforge/running/names': top.map((r) => `${r.cue.number ? r.cue.number + ' ' : ''}${displayName(r.cue)}`).join(' · '),
      '/qforge/remaining': cr ? `-${fmtClock(Math.ceil(cr.rem))}` : '',
      '/qforge/timer': fmtClock(timerElapsed()),
      '/qforge/rehearsal': S.rehearsal ? 1 : 0,
    };
    S.show.cart.forEach((c, i) => { vals[`/qforge/cart/${i + 1}`] = c && rt.runsFor(c.id).length ? 1 : 0; });
    for (const [addr, v] of Object.entries(vals)) {
      if (fbLast.get(addr) === v) continue;
      fbLast.set(addr, v);
      P.oscSend({ host: f.host, port: f.port || 9000, address: addr, args: [typeof v === 'number' ? { type: 'i', value: v } : { type: 's', value: v }] });
    }
  }
  setInterval(sendFeedback, 200);

  // ---------------------------------------------------------------- collaboration over IP
  const PEER_COLORS = ['#f97316', '#22c55e', '#eab308', '#3b82f6', '#ec4899', '#14b8a6', '#a855f7', '#ef4444'];
  S.collab = { mode: 'off', id: uid(), version: 0, peers: [], status: '', url: '', pin: '', color: PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)] };
  const collabName = () => prefs.get('collabName', '') || (P.isElectron ? 'QForge operator' : 'Browser guest');
  function collabPayload() { return { name: S.show.name, lists: S.show.lists, cart: S.show.cart, script: S.show.script || null }; }
  let collabTimer = null;
  function collabChanged() {
    if (!S.collab || S.collab.mode === 'off' || S.applyingRemote) return;
    clearTimeout(collabTimer);
    collabTimer = setTimeout(collabSend, 250);
  }
  function collabSend() {
    const c = S.collab;
    if (c.mode === 'host') { c.version++; P.collabPublish({ enabled: true, version: c.version, show: collabPayload(), from: c.id }); }
    else if (c.mode === 'join') {
      P.collabFetch({ url: `${c.url}/api/collab/push`, method: 'POST', pin: c.pin, body: { base: c.version, show: collabPayload(), from: c.id, name: collabName() } })
        .then((r) => { if (!r.ok) { c.status = `Sync failed: ${(r.data && r.data.error) || r.status}`; updateCollabStatus(); } });
    }
  }
  function applyRemote(show) {
    if (!show) return;
    const ae = document.activeElement;
    if (isTextField(ae) && (insp.contains(ae) || $('#modal-root').contains(ae))) { S.pendingRemote = show; return; }
    S.applyingRemote = true;
    try {
      const m = migrateShow({ ...show, settings: S.show.settings });
      S.show.lists = m.lists; S.show.cart = m.cart;
      if (show.name) S.show.name = show.name;
      if (show.script !== undefined) S.show.script = show.script || S.show.script;
      S.listIdx = Math.min(S.listIdx, S.show.lists.length - 1);
      for (const id of [...S.sel]) if (!cueById(id)) S.sel.delete(id);
      if (S.playheadId && !find(S.playheadId)) S.playheadId = cues()[0] ? cues()[0].id : null;
      if (S.cartSel && !cueById(S.cartSel)) S.cartSel = null;
      markDirty(true);
      renderAll();
      checkMissing();
    } finally { S.applyingRemote = false; }
  }
  document.addEventListener('focusout', () => setTimeout(() => {
    if (S.pendingRemote && !isTextField(document.activeElement)) { const s = S.pendingRemote; S.pendingRemote = null; applyRemote(s); }
  }, 60));
  async function setHosting(on) {
    if (on && !P.isElectron) { toast('Hosting needs the desktop app', 'err'); return; }
    if (on && S.collab.mode === 'join') leaveSession();
    S.collab.mode = on ? 'host' : 'off';
    prefs.set('collabHost', !!on);
    if (on) S.collab.version = Math.max(1, S.collab.version + 1);
    await startRemote();
    P.collabPublish({ enabled: !!on, version: S.collab.version, show: on ? collabPayload() : null, from: S.collab.id });
    addLog('collab', on ? 'Hosting collaboration session' : 'Stopped hosting');
    updateCollabStatus();
  }
  P.onCollabIncoming((msg) => {
    if (S.collab.mode !== 'host' || !msg || !msg.show) return;
    applyRemote(msg.show);
    S.collab.version++;
    P.collabPublish({ enabled: true, version: S.collab.version, show: collabPayload(), from: msg.from });
    addLog('collab', `${msg.name || 'Guest'} edited the show`);
  });
  async function joinSession(addr, pin) {
    let base = String(addr || '').trim().replace(/\/+$/, '');
    if (!base) { toast('Enter the host’s IP address', 'err'); return false; }
    if (!/^https?:\/\//.test(base)) base = `http://${base}`;
    if (!/:\d+$/.test(base)) base += ':8080';
    S.collab.status = 'Connecting…'; updateCollabStatus();
    const r = await P.collabFetch({ url: `${base}/api/collab/show`, pin });
    if (!r.ok) {
      S.collab.status = r.status === 403 ? 'Wrong PIN' : r.status === 404 ? 'That QForge isn’t hosting a session' : `Can’t reach ${base} (${(r.data && r.data.error) || r.status})`;
      updateCollabStatus(); toast(S.collab.status, 'err'); return false;
    }
    if (S.dirty && S.collab.mode !== 'join') {
      const k = await askModal('Join session?', 'Joining replaces the show you have open with the host’s show. Save your current show first if you want to keep it.', ['Join', 'Cancel']);
      if (k !== 0) { S.collab.status = ''; updateCollabStatus(); return false; }
    }
    if (S.collab.mode === 'host') await setHosting(false);
    rt.stopAll(0);
    Object.assign(S.collab, { mode: 'join', url: base, pin, version: r.data.version || 0, status: 'Connected' });
    prefs.set('collabJoin', base.replace(/^http:\/\//, ''));
    S.path = null;
    applyRemote(r.data.show);
    S.undo = []; S.redo = [];
    P.collabListen({ url: `${base}/collab/events`, pin });
    addLog('collab', `Joined session at ${base}`);
    toast(`Joined ${base} — edits are shared live`, 'ok');
    updateCollabStatus();
    return true;
  }
  function leaveSession() {
    P.collabListen({ url: null });
    if (S.collab.mode === 'join') addLog('collab', 'Left session');
    S.collab.mode = 'off'; S.collab.peers = []; S.collab.status = '';
    renderPresence(); updateCollabStatus();
  }
  P.onCollabEvent((ev) => {
    if (S.collab.mode !== 'join') return;
    if (ev.type === 'open') S.collab.status = 'Connected';
    else if (ev.type === 'show' && ev.data) {
      S.collab.version = ev.data.version || S.collab.version;
      if (ev.data.from !== S.collab.id && ev.data.show) applyRemote(ev.data.show);
    } else if (ev.type === 'presence') { S.collab.peers = (ev.data || []).filter((p) => p.id !== S.collab.id); renderPresence(); }
    else if (ev.type === 'error' || ev.type === 'closed') {
      S.collab.status = ev.error ? `Disconnected: ${ev.error}` : 'Disconnected — reconnecting…';
      if (ev.error !== 'Wrong PIN' && P.isElectron) setTimeout(() => { if (S.collab.mode === 'join') P.collabListen({ url: `${S.collab.url}/collab/events`, pin: S.collab.pin }); }, 2500);
    }
    updateCollabStatus();
  });
  setInterval(async () => {
    const c = S.collab;
    if (c.mode === 'off') return;
    const sel = S.view === 'cart' ? (S.cartSel ? cueById(S.cartSel) : null) : selectedCues()[0];
    const me = { id: c.id, name: collabName(), color: c.color, cueId: sel ? sel.id : S.playheadId, host: c.mode === 'host' };
    let list = null;
    if (c.mode === 'host') list = await P.collabPresence(me);
    else { const r = await P.collabFetch({ url: `${c.url}/api/collab/presence`, method: 'POST', pin: c.pin, body: me }); if (r.ok) list = r.data; }
    if (Array.isArray(list)) { c.peers = list.filter((p) => p.id !== c.id); renderPresence(); updateCollabStatus(); }
  }, 2000);
  function renderPresence() {
    for (const tr of rowEls.values()) tr.querySelectorAll('.pres').forEach((d) => d.remove());
    for (const p of S.collab.peers || []) {
      const tr = p.cueId && rowEls.get(p.cueId);
      if (!tr) continue;
      const cell = tr.querySelector('.namecell');
      if (cell) cell.append(h('span', { class: 'pres', style: `--pc:${p.color || '#f97316'}`, title: `${p.name} is here` }, (p.name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()));
    }
  }
  function updateCollabStatus() {
    const el = $('#st-collab');
    const c = S.collab;
    if (c.mode === 'off') { el.innerHTML = c.status ? `<span class="dot bad"></span>${esc(c.status)}` : ''; return; }
    const n = (c.peers || []).length;
    const ok = c.mode === 'host' ? !!(S.remoteStatus && S.remoteStatus.ok) : c.status === 'Connected';
    el.innerHTML = `<span class="dot ${ok ? 'on' : 'bad'}"></span>${c.mode === 'host' ? 'Hosting' : 'Joined'} · ${n} other${n === 1 ? '' : 's'}`;
    el.title = c.mode === 'host' ? `Others join with: ${(S.remoteStatus && S.remoteStatus.addresses || []).map((x) => `${x}:${S.remoteStatus.port}`).join(' or ')}` : `${c.url} — ${c.status}`;
  }

  // ---------------------------------------------------------------- header timers
  function timerElapsed() { const t = S.showTimer; return t.acc + (t.running ? (Date.now() - t.start) / 1000 : 0); }
  function timerToggle() {
    const t = S.showTimer;
    if (t.running) { t.acc = timerElapsed(); t.running = false; } else { t.start = Date.now(); t.running = true; }
    addLog('timer', t.running ? 'Show timer started' : `Show timer stopped at ${fmtClock(timerElapsed())}`);
  }
  function timerReset() { S.showTimer = { running: false, start: 0, acc: 0 }; }
  QP.showStartRemaining = () => {
    const v = settings().showStart;
    if (!v) return null;
    const p = String(v).split(':').map((x) => parseInt(x, 10));
    if (p.length < 2 || p.some(isNaN)) return null;
    const t = new Date(); t.setHours(p[0], p[1], p[2] || 0, 0);
    return (t - new Date()) / 1000;
  };
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
    return `${hh ? hh + ':' : ''}${String(mm).padStart(hh ? 2 : 1, '0')}:${String(ss).padStart(2, '0')}`;
  }
  function cueRemaining() {
    let best = null;
    for (const r of rt.runs) {
      if (r.parentRun || r.state !== 'action' || r.actionDone) continue;
      const inf = rt.info(r);
      if (!isFinite(inf.total) || inf.total <= 0) continue;
      const rem = inf.total - inf.elapsed;
      if (best == null || rem > best.rem) best = { rem, cue: r.cue };
    }
    return best;
  }
  function renderTimers() {
    const d = new Date();
    $('#tm-clock').textContent = d.toLocaleTimeString([], { hour12: false });
    const tEl = $('#tm-timer');
    tEl.querySelector('b').textContent = fmtClock(timerElapsed());
    tEl.classList.toggle('on', S.showTimer.running);
    const cr = cueRemaining();
    $('#tm-remain').querySelector('b').textContent = cr ? `-${fmtClock(Math.ceil(cr.rem))}` : '—';
    $('#tm-remain').title = cr ? `Longest running cue: ${cueLabel(cr.cue)}` : '';
    const ss = QP.showStartRemaining();
    const st = $('#tm-start');
    st.hidden = ss == null;
    if (ss != null) {
      st.querySelector('span').textContent = ss > 0 ? 'SHOW STARTS IN' : 'SHOW STARTED';
      st.querySelector('b').textContent = ss > 0 ? fmtClock(Math.ceil(ss)) : `+${fmtClock(-ss)}`;
      st.classList.toggle('soon', ss > 0 && ss <= 300);
    }
    const tc = QP.mtcIn && settings().tcIn.enabled ? QP.mtcIn.current() : null;
    const tcEl = $('#st-tc');
    tcEl.textContent = tc ? `TC IN ${QP.TC.format(tc.frames, tc.fps)}${tc.stale ? ' (stopped)' : ''}` : '';
  }

  // ---------------------------------------------------------------- files
  function showData() {
    curList().playheadId = S.playheadId;
    return {
      app: 'QForge', version: 2, savedAt: new Date().toISOString(), name: S.show.name, settings: settings(),
      lists: structuredClone(S.show.lists), cart: structuredClone(S.show.cart),
      stats: S.show.stats || {}, script: S.show.script || { text: '', links: {} },
    };
  }
  async function confirmDiscard() {
    if (!S.dirty) return true;
    const r = await askModal('Save changes?', 'This show has unsaved changes.', ['Save', "Don't Save", 'Cancel']);
    if (r === 0) return await saveShow(false);
    return r === 1;
  }
  function templateChooser() {
    const tpls = QP.showTemplates(newCue, uid);
    return new Promise((resolve) => {
      let chosen = 'blank';
      const grid = h('div', { class: 'tplgrid' }, tpls.map((t) => {
        const card = h('button', { class: `tplcard${t.id === 'blank' ? ' on' : ''}`, onclick: () => { chosen = t.id; grid.querySelectorAll('.tplcard').forEach((x) => x.classList.toggle('on', x === card)); }, ondblclick: () => m.close(0) },
          h('div', { class: 'tpl-ic' }, icon(t.icon)), h('div', { class: 'tpl-name' }, t.name), h('div', { class: 'tpl-desc' }, t.desc));
        return card;
      }));
      const m = modal({ title: 'Start a new show', wide: true, body: h('div', {}, h('div', { class: 'explain', style: 'margin-bottom:12px' }, 'Pick a starting point. Templates create cue lists, groups, cart pads and timings with clearly named placeholders — drop in your media files (the cues marked “add file”) and you’re ready to run. Everything can be changed afterwards.'), grid),
        buttons: ['Create show', 'Cancel'], onClose: (i) => resolve(i === 0 ? tpls.find((t) => t.id === chosen) : null) });
    });
  }
  async function newShow(fromTemplate = true) {
    if (!(await confirmDiscard())) return;
    let tpl = null;
    if (fromTemplate) { tpl = await templateChooser(); if (!tpl) return; }
    rt.stopAll(0);
    S.show = emptyShow();
    if (tpl && tpl.id !== 'blank') {
      const b = tpl.build();
      S.show.lists = b.lists; S.show.cart = b.cart || S.show.cart;
      if (b.script) S.show.script = b.script;
      if (b.settings) Object.assign(S.show.settings, b.settings);
      S.show.name = tpl.name;
    }
    S.listIdx = 0; S.view = 'list'; S.cartSel = null;
    S.path = null; S.sel.clear(); S.playheadId = null; S.undo = []; S.redo = [];
    P.clearRecovery();
    S.playheadId = cues()[0] ? cues()[0].id : null;
    if (S.playheadId) S.sel = new Set([S.playheadId]);
    applySettings(); markDirty(false); renderAll();
    if (tpl && tpl.id !== 'blank') toast(`“${tpl.name}” template ready — add files to the cues marked “add file”`, 'ok');
  }
  function migrateShow(data) {
    if (!data || (!Array.isArray(data.cues) && !Array.isArray(data.lists))) throw new Error('Not a QForge show file');
    const st = data.settings || {};
    const settingsOut = {
      ...structuredClone(DEFAULT_SETTINGS), ...st,
      midiTriggers: { ...DEFAULT_SETTINGS.midiTriggers, ...(st.midiTriggers || {}) },
      remote: { ...DEFAULT_SETTINGS.remote, ...(st.remote || {}) },
      backup: { ...DEFAULT_SETTINGS.backup, ...(st.backup || {}) },
      tcIn: { ...DEFAULT_SETTINGS.tcIn, ...(st.tcIn || {}) },
      limiter: { ...DEFAULT_SETTINGS.limiter, ...(st.limiter || {}) },
      feedback: { ...DEFAULT_SETTINGS.feedback, ...(st.feedback || {}) },
      display: { ...DEFAULT_SETTINGS.display, ...(st.display || {}) },
      clicker: { ...DEFAULT_SETTINGS.clicker, ...(st.clicker || {}) },
    };
    if (!Array.isArray(st.surfaces) || !st.surfaces.length) {
      const sf = DEFAULT_SURFACE();
      if (st.videoDisplay != null) sf.display = st.videoDisplay;
      if (st.videoFullscreen != null) sf.fullscreen = st.videoFullscreen;
      if (st.videoBg) sf.bg = st.videoBg;
      settingsOut.surfaces = [sf];
    } else settingsOut.surfaces = st.surfaces.map((sf) => ({ ...DEFAULT_SURFACE(), ...sf, blend: { ...DEFAULT_SURFACE().blend, ...(sf.blend || {}) } }));
    const lists = Array.isArray(data.lists) && data.lists.length
      ? data.lists.map((l) => ({ id: l.id || uid(), name: l.name || 'List', playheadId: l.playheadId || null, cues: (l.cues || []).map(normalizeCue).filter(Boolean) }))
      : [{ id: uid(), name: 'Main', playheadId: null, cues: (data.cues || []).map(normalizeCue).filter(Boolean) }];
    const cart = new Array(CART_SIZE).fill(null);
    (data.cart || []).slice(0, CART_SIZE).forEach((c, i) => { cart[i] = c ? normalizeCue(c) : null; });
    return { name: data.name || 'Untitled', settings: settingsOut, lists, cart, stats: data.stats || {}, script: { text: '', links: {}, ...(data.script || {}) } };
  }
  function loadShowData(data, path, { dirty = false } = {}) {
    const show = migrateShow(data);
    rt.stopAll(0);
    S.show = show;
    S.path = path || null;
    S.listIdx = 0; S.view = 'list'; S.cartSel = null; S.filter = ''; S.loadTime = {};
    if ($('#search')) $('#search').value = '';
    S.sel.clear(); S.undo = []; S.redo = [];
    S.playheadId = curList().playheadId && find(curList().playheadId) ? curList().playheadId : (cues()[0] ? cues()[0].id : null);
    if (S.playheadId) S.sel.add(S.playheadId);
    applySettings(); markDirty(dirty); renderAll();
    preloadMedia();
    addLog('show', `Loaded show ${path ? baseName(path) : show.name}`);
  }
  async function openShow(pathArg) {
    if (!(await confirmDiscard())) return;
    const r = pathArg ? await P.readShow(pathArg) : await P.openShow();
    if (!r) return;
    if (r.error) { toast(`Could not open show: ${r.error}`, 'err'); return; }
    try { loadShowData(r.data, r.path); P.clearRecovery(); toast(`Opened ${baseName(r.path)}`, 'ok'); } catch (e) { toast(e.message, 'err'); }
  }
  async function saveShow(saveAs) {
    const r = await P.saveShow(S.path, showData(), saveAs);
    if (!r || !r.ok) { if (r && r.error) toast(`Save failed: ${r.error}`, 'err'); return false; }
    S.path = P.isElectron ? r.path : S.path;
    if (!P.isElectron) S.show.name = stripExt(r.path);
    markDirty(false);
    P.clearRecovery();
    addLog('show', `Saved ${baseName(r.path)}`);
    toast(`Saved ${baseName(r.path)}`, 'ok');
    return true;
  }
  async function importCues() {
    if (S.locked) return;
    const r = await P.openShow();
    if (!r) return;
    let src;
    try { src = migrateShow(r.data); } catch (e) { toast(`Could not import: ${r.error || e.message}`, 'err'); return; }
    const imported = src.lists.flatMap((l) => l.cues);
    const map = new Map();
    T.walk(imported, (c) => { const nid = uid(); map.set(c.id, nid); c.id = nid; });
    T.walk(imported, (c) => { if (c.target && map.has(c.target)) c.target = map.get(c.target); });
    if (!imported.length) { toast('That show has no cues', 'err'); return; }
    insertCues(imported, { list: cues(), index: cues().length });
    preloadMedia();
    toast(`Imported ${T.all(imported).length} cues from ${baseName(r.path)}`, 'ok');
  }
  async function exportPackage() {
    if (!P.isElectron) { toast('Show packages need the desktop app', 'err'); return; }
    toast('Exporting show package…');
    const r = await P.exportPackage(showData());
    if (!r || !r.ok) { if (r && r.error) toast(`Export failed: ${r.error}`, 'err'); return; }
    toast(`Package exported to ${r.dir} (${r.copied} media file${r.copied === 1 ? '' : 's'}${r.missing.length ? `, ${r.missing.length} missing` : ''})`, r.missing.length ? 'err' : 'ok');
  }
  function sheetRows() {
    const rows = [];
    S.show.lists.forEach((l) => T.walk(l.cues, (c, parent, depth) => {
      const d = actionDuration(c);
      rows.push({ list: l.name, num: c.number, name: displayName(c), type: TYPES[c.type].label, depth, target: targetText(c), pre: fmtTime(Number(c.preWait) || 0, true), dur: d == null ? '' : fmtTime(d, true), post: c.continueMode === 'auto-continue' ? fmtTime(Number(c.postWait) || 0) : '', cont: { 'auto-continue': 'Auto-continue', 'auto-follow': 'Auto-follow' }[c.continueMode] || '', notes: c.notes || '', color: c.color || '' });
    }));
    return rows;
  }
  async function exportCsv() {
    const rows = [['List', 'Number', 'Name', 'Type', 'Depth', 'Target / File', 'Pre-wait', 'Action', 'Post-wait', 'Continue', 'Notes']];
    for (const r of sheetRows()) rows.push([r.list, r.num, r.name, r.type, r.depth, r.target, r.pre, r.dur, r.post, r.cont, r.notes]);
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const name = `${S.path ? stripExt(baseName(S.path)) : S.show.name} cue list.csv`;
    const r = await P.exportText(name, csv, 'csv', 'CSV');
    if (r && r.ok) toast(`Exported ${baseName(r.path)}`, 'ok');
  }
  async function exportPdf() {
    const title = S.path ? stripExt(baseName(S.path)) : S.show.name;
    let lastList = null;
    const body = sheetRows().map((r) => {
      let hdr = '';
      if (r.list !== lastList && S.show.lists.length > 1) { hdr = `<tr class="lh"><td colspan="9">${esc(r.list)}</td></tr>`; }
      lastList = r.list;
      return `${hdr}<tr><td class="cb" style="background:${esc(r.color) || 'transparent'}"></td><td class="n">${esc(r.num)}</td><td style="padding-left:${6 + r.depth * 16}px"><b>${esc(r.name)}</b><div class="t">${esc(r.type)}</div></td><td>${esc(r.target)}</td><td class="r">${esc(r.pre)}</td><td class="r">${esc(r.dur)}</td><td class="r">${esc(r.post)}</td><td>${esc(r.cont)}</td><td class="notes">${esc(r.notes)}</td></tr>`;
    }).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      body{font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#111;margin:0;font-size:10.5px}
      h1{font-size:18px;margin:0 0 2px} .sub{color:#666;margin-bottom:10px}
      table{width:100%;border-collapse:collapse} th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#555;border-bottom:2px solid #333;padding:4px 6px}
      td{padding:4px 6px;border-bottom:1px solid #ddd;vertical-align:top} td.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
      td.n{font-weight:700;white-space:nowrap} .t{color:#777;font-size:9px} td.cb{width:4px;padding:0} td.notes{color:#333;max-width:220px}
      tr.lh td{background:#eee;font-weight:700;font-size:12px;padding:6px} tr{page-break-inside:avoid}
    </style></head><body><h1>${esc(title)}</h1><div class="sub">QForge cue sheet · ${esc(new Date().toLocaleString())}</div>
    <table><thead><tr><th></th><th>#</th><th>Cue</th><th>Target / file</th><th>Pre</th><th>Action</th><th>Post</th><th>Continue</th><th>Notes</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
    const r = await P.printPdf(html, `${title} cue sheet.pdf`);
    if (r && r.ok) toast(`Cue sheet ${P.isElectron ? 'saved to ' + baseName(r.path) : 'sent to print'}`, 'ok');
    else if (r && r.error) toast(r.error, 'err');
  }
  async function preloadMedia() {
    const all = allCues();
    await checkMissing();
    for (const c of all) if (c.type === 'video' && c.file && !S.missing.has(c.file)) probeVideo(c.file);
    const audio = [...new Set(all.filter((c) => c.type === 'audio' && c.file && !S.missing.has(c.file)).map((c) => c.file))];
    let i = 0;
    for (const p of audio) {
      i++;
      toast(`Loading audio ${i}/${audio.length}…`);
      try { await rt.audio.load(p); } catch (e) { toast(`${baseName(p)}: ${e.message}`, 'err'); }
      S.needsList = true;
    }
    if (audio.length) toast(`Loaded ${audio.length} audio file${audio.length > 1 ? 's' : ''}`, 'ok');
    if (S.missing.size) toast(`${S.missing.size} media file${S.missing.size > 1 ? 's are' : ' is'} missing — Tools → Relink missing media`, 'err');
  }
  async function checkMissing() {
    const paths = [...new Set(allCues().filter((c) => c.file).map((c) => c.file))];
    const ex = await P.filesExist(paths);
    S.missing = new Set(paths.filter((_, i) => !ex[i]));
    S.needsList = true;
  }
  const AUDIO_RE = /\.(wav|mp3|aiff?|flac|ogg|oga|m4a|aac|opus|caf|weba)$/i;
  const VIDEO_RE = /\.(mp4|mov|m4v|webm|mkv|ogv|png|jpe?g|gif|webp|bmp|avif|svg)$/i;
  async function dropFiles(fileList, at, opts = {}) {
    if (S.locked) return;
    const made = [];
    let n = parseInt(nextNumber(), 10);
    const num = () => String(Number.isFinite(n) ? n++ : nextNumber());
    const files = [...fileList].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
    let skipped = 0;
    for (const f of files) {
      const name = f.name || '';
      const type = f.type || '';
      if (name.toLowerCase().endsWith('.qforge')) { const p = P.pathForFile(f); if (P.isElectron) openShow(p); continue; }
      if (/\.(m3u8?|pls)$/i.test(name)) {
        // playlist file → a playlist group of its tracks (paths resolved next to the playlist)
        const text = await f.text().catch(() => '');
        const base = P.isElectron ? P.pathForFile(f).replace(/[^\\/]+$/, '') : '';
        const items = text.split(/\r?\n/).map((l) => l.replace(/^File\d+=/i, '').trim()).filter((l) => l && !l.startsWith('#') && !/^\[|^(Title|Length|NumberOfEntries|Version)\d*=/i.test(l));
        const g = newCue('group'); g.mode = 'playlist'; g.name = stripExt(name); g.number = num();
        for (const it of items) {
          const isA = AUDIO_RE.test(it), isV = VIDEO_RE.test(it);
          if (!isA && !isV) continue;
          const k = newCue(isA ? 'audio' : 'video');
          k.file = /^([a-z]:[\\/]|\/|\\\\)/i.test(it) || !base ? it : base + it;
          g.children.push(k);
        }
        if (g.children.length) made.push(g); else skipped++;
        continue;
      }
      if (/\.(txt|md|srt|lrc)$/i.test(name) || type === 'text/plain') {
        // text file → a text / titles cue (one cue per blank-line-separated block for lyrics, up to 200)
        const text = (await f.text().catch(() => '')).replace(/\r/g, '');
        const isLyrics = /\.(srt|lrc)$/i.test(name) || opts.asGroup;
        const blocks = isLyrics
          ? text.replace(/^\d+\n[\d:,]+ --> [\d:,]+\n/gm, '').replace(/^\[[\d:.]+\]/gm, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).slice(0, 200)
          : [text.trim()];
        if (blocks.length > 1) {
          const g = newCue('group'); g.mode = 'step'; g.name = stripExt(name); g.number = num();
          for (const b of blocks) { const t = newCue('text'); t.text = b; t.size = 6; t.position = 'lower'; g.children.push(t); }
          made.push(g);
        } else if (blocks[0]) { const t = newCue('text'); t.text = blocks[0].slice(0, 2000); t.number = num(); made.push(t); }
        continue;
      }
      const isAudio = type.startsWith('audio') || AUDIO_RE.test(name);
      const isVid = type.startsWith('video') || type.startsWith('image') || VIDEO_RE.test(name);
      if (!isAudio && !isVid) { skipped++; continue; }
      const c = newCue(isAudio ? 'audio' : 'video');
      c.file = P.pathForFile(f);
      c.number = num();
      made.push(c);
    }
    if (skipped) toast(`${skipped} file${skipped > 1 ? 's' : ''} skipped (not audio, video, image, text or playlist)`, 'err');
    if (!made.length) return;
    let toInsert = made;
    if (opts.asGroup && made.length > 1) {
      // Alt/Option-drop: wrap everything in one playlist (audio) or slideshow (pictures) group
      const g = newCue('group');
      const allVisual = made.every((c) => c.type === 'video' || c.type === 'text');
      g.mode = allVisual ? 'slideshow' : 'playlist'; g.crossfade = allVisual ? 1 : 0; g.name = allVisual ? 'Slideshow' : 'Playlist'; g.number = made[0].number;
      made.forEach((c) => { c.number = ''; });
      g.children = made; toInsert = [g];
    }
    insertCues(toInsert, at);
    T.walk(toInsert, (c) => { if (c.file) afterFileSet(c); });
    toast(`Added ${made.length} cue${made.length > 1 ? 's' : ''}${opts.asGroup && made.length > 1 ? ' as a group' : ''}`, 'ok');
  }
  // drop a single file onto the inspector to replace the selected cue's file
  function setupInspectorDrop() {
    insp.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); insp.classList.add('dragover'); } });
    insp.addEventListener('dragleave', (e) => { if (e.target === insp) insp.classList.remove('dragover'); });
    insp.addEventListener('drop', (e) => {
      insp.classList.remove('dragover');
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      const c = topSelected();
      const f = e.dataTransfer.files[0];
      if (S.locked || !c || !['audio', 'video'].includes(c.type)) { toast('Select an audio or video cue first, then drop a file on the inspector to replace its file', 'err'); return; }
      const ok = c.type === 'audio' ? AUDIO_RE.test(f.name) || (f.type || '').startsWith('audio') : VIDEO_RE.test(f.name) || /^(video|image)/.test(f.type || '');
      if (!ok) { toast(`That isn’t ${c.type === 'audio' ? 'an audio' : 'a video or image'} file`, 'err'); return; }
      setField(c, 'file', P.pathForFile(f));
      renderInspector();
      toast(`Replaced file: ${f.name}`, 'ok');
    });
  }
  // autosave for crash recovery
  setInterval(() => { if (S.dirty) P.saveRecovery(showData(), S.path); }, 30000);
  async function checkRecovery() {
    const rec = await P.getRecovery();
    if (!rec || !rec.data) return;
    const when = new Date(rec.savedAt).toLocaleString();
    const r = await askModal('Recover unsaved show?', `QForge found an autosave from ${when}${rec.path ? ` (${baseName(rec.path)})` : ''}. It looks like QForge didn’t close cleanly last time.`, ['Recover', 'Discard']);
    if (r === 0) { try { loadShowData(rec.data, rec.path, { dirty: true }); toast('Show recovered — save it to keep it', 'ok'); } catch (e) { toast(e.message, 'err'); } }
    P.clearRecovery();
  }

  // ---------------------------------------------------------------- modal helpers
  function modal({ title, body, buttons, small, onClose, wide }) {
    const root = $('#modal-root');
    const close = (v) => { back.remove(); if (onClose) onClose(v); };
    const back = h('div', { class: 'modal-back', onmousedown: (e) => { if (e.target === back) close(-1); } },
      h('div', { class: `modal${small ? ' small' : ''}${wide ? ' wide' : ''}` },
        h('div', { class: 'modal-head' }, title, h('button', { class: 'x', onclick: () => close(-1) }, icon('x'))),
        h('div', { class: 'modal-body' }, body),
        buttons ? h('div', { class: 'modal-foot' }, buttons.map((b, i) => h('button', { class: `btn${i === 0 ? ' primary' : ''}`, onclick: () => close(i) }, b))) : null));
    root.append(back);
    return { close, el: back };
  }
  function askModal(title, text, buttons) {
    return new Promise((resolve) => { modal({ title, body: h('div', {}, text), buttons, small: true, onClose: (i) => resolve(i < 0 ? buttons.length - 1 : i) }); });
  }
  function promptModal(title, label, value) {
    return new Promise((resolve) => {
      const inp = h('input', { type: 'text', value: value || '' });
      const m = modal({ title, small: true, body: h('label', { class: 'field' }, h('span', { class: 'flabel' }, label), inp), buttons: ['OK', 'Cancel'], onClose: (i) => resolve(i === 0 ? inp.value.trim() : null) });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); m.close(0); } });
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
    });
  }
  function closeModals() { $('#modal-root').textContent = ''; QP.midi.cancelLearn(); }

  // ---------------------------------------------------------------- tools
  function saveTemplate(c) {
    const skip = new Set(['id', 'type', 'number', 'name', 'notes', 'file', 'target', 'children', 'hotkey', 'midiTrigger', 'tcTrigger', 'collapsed', 'fileRel']);
    const tpl = {};
    for (const [k, v] of Object.entries(c)) if (!skip.has(k)) tpl[k] = structuredClone(v);
    const all = prefs.get('templates', {}); all[c.type] = tpl; prefs.set('templates', all);
    toast(`New ${TYPES[c.type].label} cues will start with these settings`, 'ok');
  }
  async function normalizeCues(list) {
    if (S.locked) return;
    const targets = (list || (S.view === 'cart' ? (S.cartSel ? [cueById(S.cartSel)] : cartCues()) : selectedCues())).filter((c) => c && c.type === 'audio' && c.file);
    const pool = targets.length ? targets : allCues().filter((c) => c.type === 'audio' && c.file);
    if (!pool.length) { toast('No audio cues to normalise', 'err'); return; }
    const target = Number(settings().loudnessTarget) || -16;
    let done = 0;
    for (const c of pool) {
      toast(`Measuring loudness ${done + 1}/${pool.length}…`);
      try {
        const buf = await rt.audio.load(c.file);
        if (buf.lufs == null) buf.lufs = await QP.measureLoudness(buf);
        const lvl = Math.round(QP.clamp(target - buf.lufs, -60, 12) * 10) / 10;
        setField(c, 'level', lvl);
        done++;
      } catch (e) { toast(`${baseName(c.file)}: ${e.message}`, 'err'); }
    }
    renderInspector();
    addLog('tools', `Normalised ${done} audio cue(s) to ${target} LUFS`);
    toast(`Normalised ${done} cue${done === 1 ? '' : 's'} to ${target} LUFS`, 'ok');
  }
  async function relink() {
    await checkMissing();
    if (!S.missing.size) { toast('No missing media 🎉', 'ok'); return; }
    if (!P.isElectron) { toast('Relinking needs the desktop app', 'err'); return; }
    const names = [...S.missing].map((p) => baseName(p));
    const found = await P.relink(names);
    if (!found) return;
    let n = 0;
    pushUndo(null);
    walkAll((c) => {
      if (c.file && S.missing.has(c.file)) {
        const hit = found[baseName(c.file).toLowerCase()];
        if (hit) { c.file = hit; n++; }
      }
    });
    markDirty();
    await preloadMedia();
    renderAll();
    toast(`Relinked ${n} cue${n === 1 ? '' : 's'}${S.missing.size ? ` · ${S.missing.size} still missing` : ''}`, S.missing.size ? 'err' : 'ok');
    addLog('tools', `Relinked ${n} cue(s)`);
  }
  async function preflight() {
    await checkMissing();
    const items = [];
    const ok = (t) => items.push({ s: 'ok', t });
    const warn = (t, fix) => items.push({ s: 'warn', t, fix });
    const bad = (t, fix) => items.push({ s: 'bad', t, fix });
    const all = allCues();
    const L = (c) => cueLabel(c);
    const missingCues = all.filter((c) => c.file && S.missing.has(c.file));
    if (missingCues.length) bad(`${missingCues.length} cue(s) with missing media: ${missingCues.slice(0, 6).map(L).join(', ')}${missingCues.length > 6 ? '…' : ''}`, { label: 'Relink…', fn: relink });
    else ok('All media files found');
    const noFile = all.filter((c) => (c.type === 'audio' || c.type === 'video') && !c.file);
    if (noFile.length) bad(`${noFile.length} audio/video cue(s) have no file: ${noFile.slice(0, 6).map(L).join(', ')}`);
    const broken = all.filter((c) => (['fade', 'start', 'goto'].includes(c.type) && (!c.target || !cueById(c.target))) || (c.type === 'stop' && c.target && !cueById(c.target)));
    if (broken.length) bad(`${broken.length} cue(s) with a missing target: ${broken.slice(0, 6).map(L).join(', ')}`); else ok('All fade / stop / start / go-to targets exist');
    const nums = new Map();
    all.forEach((c) => { if (c.number) nums.set(c.number, (nums.get(c.number) || 0) + 1); });
    const dup = [...nums].filter(([, n]) => n > 1).map(([k]) => k);
    if (dup.length) warn(`Duplicate cue numbers: ${dup.slice(0, 10).join(', ')} — OSC/MSC triggers will hit the first match`, { label: 'Renumber all…', fn: () => renumber(true) });
    else ok('Cue numbers are unique');
    const devIds = new Set(S.audioOutputs.map((d) => d.deviceId));
    const devs = new Set([rt.dev(''), ...all.map((c) => rt.dev(c.device)), ...(settings().patches || []).map((p) => p.device)].filter(Boolean));
    const lostDevs = [...devs].filter((d) => !devIds.has(d));
    if (lostDevs.length) bad(`${lostDevs.length} audio output device(s) used by this show aren’t connected — those cues will play on the system default`);
    else ok(`Audio outputs OK (${S.audioOutputs.length} device${S.audioOutputs.length === 1 ? '' : 's'} available)`);
    const midiCues = all.filter((c) => c.type === 'midi' || (c.type === 'timecode' && c.tcMode === 'mtc'));
    const outNames = new Set(QP.midi.outputs.map((o) => o.name));
    const lostMidi = midiCues.filter((c) => (c.midiOut && !outNames.has(c.midiOut)) || !QP.midi.outputs.length);
    if (midiCues.length) { if (lostMidi.length) bad(`${lostMidi.length} MIDI/MTC cue(s) point at an output that isn’t connected: ${lostMidi.slice(0, 5).map(L).join(', ')}`); else ok('MIDI outputs OK'); }
    const oscCues = all.filter((c) => c.type === 'osc');
    for (const c of oscCues) {
      const r = await P.lookup(c.host);
      if (!r.ok) bad(`OSC cue ${L(c)}: cannot resolve host “${c.host}”`);
      else if (!(Number(c.port) > 0)) bad(`OSC cue ${L(c)}: invalid port`);
    }
    if (oscCues.length && !items.some((i) => i.t.startsWith('OSC cue'))) ok(`${oscCues.length} OSC cue(s) have valid destinations (UDP can’t confirm the receiver is listening)`);
    const scripts = all.filter((c) => c.type === 'script');
    if (scripts.length) { if (S.scriptsAllowed) ok(`${scripts.length} script cue(s) — scripts are allowed on this computer`); else bad(`${scripts.length} script cue(s) won’t run — scripts are disabled on this computer`, { label: 'Settings…', fn: () => openSettings('advanced') }); }
    const visuals = all.filter((c) => QP.VISUAL_TYPES.includes(c.type));
    if (visuals.length) {
      const displays = await P.listDisplays();
      const ids = new Set(displays.map((d) => String(d.id)));
      for (const sf of settings().surfaces) if (sf.display != null && P.isElectron && !ids.has(String(sf.display))) warn(`Output “${sf.name}” is set to a display that isn’t connected — it will open on another screen`, { label: 'Settings…', fn: () => openSettings('video') });
      const sfIds = new Set(settings().surfaces.map((x) => x.id));
      const lostSf = visuals.filter((c) => c.surface && !sfIds.has(c.surface));
      if (lostSf.length) warn(`${lostSf.length} visual cue(s) use a deleted output surface — they’ll go to “${settings().surfaces[0].name}”`);
      if (!items.some((i) => i.t.startsWith('Output'))) ok(`${settings().surfaces.length} output surface(s) configured`);
    }
    if (settings().oscEnabled) { if (/Listening/.test(S.oscStatus || '')) ok(S.oscStatus); else warn(S.oscStatus || 'OSC input not running'); }
    if (settings().remote.enabled) { if (S.remoteStatus && S.remoteStatus.ok) ok(`Web remote running on port ${S.remoteStatus.port}`); else bad(`Web remote not running: ${(S.remoteStatus && S.remoteStatus.error) || 'unknown'}`); }
    if (settings().backup.role !== 'off') { if (settings().backup.host) ok(`Backup sync: this machine is ${settings().backup.role.toUpperCase()} (partner ${settings().backup.host})`); else bad('Backup sync is on but no partner IP is set'); }
    if (S.dirty) warn('Show has unsaved changes', { label: 'Save', fn: () => saveShow(false) });
    const bads = items.filter((i) => i.s === 'bad').length, warns = items.filter((i) => i.s === 'warn').length;
    const body = h('div', { class: 'preflight' },
      h('div', { class: `pf-sum ${bads ? 'bad' : warns ? 'warn' : 'ok'}` }, bads ? `${bads} problem${bads > 1 ? 's' : ''} to fix before doors` : warns ? `Ready, with ${warns} warning${warns > 1 ? 's' : ''}` : 'All clear — ready for the show'),
      items.map((i) => h('div', { class: `pf-row ${i.s}` }, h('span', { class: 'pf-ic' }, i.s === 'ok' ? '✓' : i.s === 'warn' ? '!' : '✕'), h('span', { class: 'pf-t' }, i.t),
        i.fix ? h('button', { class: 'btn mini', onclick: () => { closeModals(); i.fix.fn(); } }, i.fix.label) : null)));
    modal({ title: 'Pre-flight check', body, buttons: ['Close', 'Run again'], onClose: (i) => { if (i === 1) preflight(); } });
    addLog('tools', `Pre-flight: ${bads} problem(s), ${warns} warning(s)`);
  }
  function showLog() {
    const filter = h('select', {}, [['', 'All events'], ['fire', 'Cue starts'], ['error', 'Errors'], ['remote', 'Remote'], ['sync', 'Backup sync'], ['show', 'Show / file'], ['tools', 'Tools']].map(([v, l]) => h('option', { value: v }, l)));
    const list = h('div', { class: 'logview' });
    const draw = () => {
      list.textContent = '';
      const rows = S.log.filter((e) => !filter.value || e.kind === filter.value).slice(-800).reverse();
      for (const e of rows) list.append(h('div', { class: `logrow k-${e.kind}` }, h('span', { class: 'lt' }, e.time), h('span', { class: 'lk' }, e.kind), h('span', { class: 'lm' }, e.msg)));
      if (!rows.length) list.append(h('div', { class: 'hint' }, 'Nothing logged yet.'));
    };
    filter.onchange = draw;
    draw();
    const body = h('div', {}, h('div', { class: 'logtools' }, filter,
      h('button', { class: 'btn mini', onclick: () => P.exportText(`QForge log ${new Date().toISOString().slice(0, 10)}.txt`, S.log.map((e) => `${e.t}\t${e.kind}\t${e.msg}`).join('\n'), 'txt', 'Text') }, 'Export…'),
      P.isElectron ? h('button', { class: 'btn mini', onclick: () => P.openLogFolder() }, 'Open log folder') : null,
      h('button', { class: 'btn mini', onclick: () => { S.log = []; draw(); } }, 'Clear')), list);
    modal({ title: 'Show log', body, buttons: ['Close'], wide: true });
  }
  async function renumber(all = false) {
    if (S.locked) return;
    const sel = all ? [] : topSelected();
    const scope = sel.length ? sel : cues();
    const startVal = await promptModal(`Renumber ${sel.length ? sel.length + ' selected cue(s)' : 'the whole list'}`, 'Start number and step (e.g. "1 1" or "100 10")', `${(sel[0] && parseFloat(sel[0].number)) || 1} 1`);
    if (!startVal) return;
    const [st, step] = startVal.split(/[\s,]+/).map(Number);
    if (isNaN(st)) { toast('Enter a start number', 'err'); return; }
    pushUndo(null);
    let n = st;
    const inc = isNaN(step) || !step ? 1 : step;
    T.walk(all ? S.show.lists.flatMap((l) => l.cues) : scope, (c) => { c.number = String(Math.round(n * 1000) / 1000); n += inc; });
    markDirty(); renderAll();
    toast('Cues renumbered', 'ok');
  }
  function findReplace() {
    if (S.locked) return;
    const f = h('input', { type: 'text', placeholder: 'Find' });
    const r = h('input', { type: 'text', placeholder: 'Replace with' });
    const inNotes = h('input', { type: 'checkbox', checked: true });
    const caseS = h('input', { type: 'checkbox' });
    const info = h('div', { class: 'hint' });
    const count = () => {
      if (!f.value) { info.textContent = ''; return 0; }
      const re = new RegExp(f.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseS.checked ? 'g' : 'gi');
      let n = 0; walkAll((c) => { n += ((c.name || '').match(re) || []).length; if (inNotes.checked) n += ((c.notes || '').match(re) || []).length; });
      info.textContent = `${n} match${n === 1 ? '' : 'es'} across all lists and the cart`;
      return re;
    };
    [f, inNotes, caseS].forEach((x) => x.addEventListener('input', count));
    const body = h('div', { class: 'grid wide' },
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Find'), f),
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Replace with'), r),
      h('label', { class: 'field check' }, inNotes, h('span', { class: 'flabel' }, 'Also search notes')),
      h('label', { class: 'field check' }, caseS, h('span', { class: 'flabel' }, 'Match case')), info);
    modal({ title: 'Find & replace', body, buttons: ['Replace all', 'Cancel'], onClose: (i) => {
      if (i !== 0 || !f.value) return;
      const re = count();
      pushUndo(null);
      let n = 0;
      walkAll((c) => {
        if (c.name && re.test(c.name)) { c.name = c.name.replace(re, r.value); n++; }
        if (inNotes.checked && c.notes && re.test(c.notes)) { c.notes = c.notes.replace(re, r.value); n++; }
      });
      markDirty(); renderAll(); toast(`Replaced in ${n} field${n === 1 ? '' : 's'}`, 'ok');
    } });
    setTimeout(() => f.focus(), 30);
  }

  // ---------------------------------------------------------------- settings
  let settingsTab = 'general';
  async function openSettings(tab) {
    if (!$('#modal-root').children.length && !S.settingsUnlocked && !(await requireAdmin('Enter the admin PIN to open Settings'))) return;
    S.settingsUnlocked = true;
    if (tab) settingsTab = tab;
    const s = settings();
    const displays = await P.listDisplays();
    S.scriptsAllowed = await P.scriptStatus();
    if (settingsTab === 'audio') await unlockDeviceNames();
    const set = (k, v) => { s[k] = v; markDirty(); };
    const field = (label, ctl, hint, cls) => h('label', { class: `field ${cls || ''}` }, h('span', { class: 'flabel' }, label), ctl, hint ? h('span', { class: 'hint' }, hint) : null);
    const select = (opts, val, on) => { const el = h('select', {}, opts.map(([v, l]) => h('option', { value: v }, l))); el.value = val ?? ''; el.onchange = () => { on(el.value); el.blur(); }; return el; };
    const num = (val, on, attrs = {}) => { const el = h('input', { type: 'number', value: val, ...attrs }); el.onchange = () => on(Number(el.value)); return el; };
    const text = (val, on, attrs = {}) => { const el = h('input', { type: 'text', value: val ?? '', ...attrs }); el.onchange = () => on(el.value); return el; };
    const check = (label, val, on) => { const el = h('input', { type: 'checkbox', checked: !!val }); el.onchange = () => { on(el.checked); el.blur(); }; return h('label', { class: 'field check' }, el, h('span', { class: 'flabel' }, label)); };
    const section = (t) => h('div', { class: 'section-title' }, t);

    const tabs = {
      general: () => h('div', { class: 'grid wide' },
        section('Show'),
        field('Show name', text(S.show.name, (v) => { S.show.name = v || 'Untitled'; markDirty(); })),
        field('Stop-all fade time (s)', num(s.panicFade, (v) => set('panicFade', Math.max(0, v)), { step: 0.1, min: 0 }), 'Esc fades everything out over this time — press Esc again to stop instantly.'),
        field('Double-GO protection (s)', num(s.goProtect, (v) => set('goProtect', Math.max(0, v)), { step: 0.05, min: 0 }), 'Ignore a second GO within this time.'),
        field('Show start time (24h)', text(s.showStart, (v) => set('showStart', v.trim()), { placeholder: 'e.g. 19:30 — blank = off' }), 'Shows a “show starts in” countdown in the header, stage manager view and remote. Text cues can use {showstart}.'),
        section('Operator lock'),
        field('Admin PIN', (() => { const el = h('input', { type: 'password', value: s.adminPin || '', placeholder: 'Blank = no PIN' }); el.onchange = () => set('adminPin', el.value.trim()); return el; })(), 'When set, unlocking show mode, opening Settings while locked, and New/Open/Import need this PIN. Lock the show (Ctrl/⌘+L) before handing over to an operator.'),
        section('Appearance (this computer)'),
        field('Theme', select([['neon', 'Neon (default)'], ['midnight', 'Midnight'], ['contrast', 'High contrast (dark booth)']], prefs.get('theme', 'neon'), (v) => { prefs.set('theme', v); applyTheme(); })),
        section('Show mode (this computer)'),
        check('Switch to the minimal show view when the show is locked (GO, standby, monitors and now playing only)', minimalShow(), (v) => { prefs.set('minimalShow', v); applyShowView(); }),
        section('Waveforms'),
        check('Show waveforms in the cue list', s.display.waveList, (v) => { s.display.waveList = v; markDirty(); renderList(); }),
        check('Show waveforms in Now Playing and the Preview monitor', s.display.waveActive, (v) => { s.display.waveActive = v; markDirty(); for (const el of actEls.values()) el.remove(); actEls.clear(); S.pvKey = null; }),
        check('Show waveforms on the web remote and stage manager view', s.display.waveRemote, (v) => { s.display.waveRemote = v; markDirty(); publishState(true); }),
        section('Presentation clickers & Bluetooth remotes'),
        check('Clicker keys control the show (Page Down = GO, Page Up = back, B or . = black out, F5 = back to top)', s.clicker.enabled, (v) => { s.clicker.enabled = v; markDirty(); }),
        h('div', { class: 'explain' }, 'Pair any USB, wireless or Bluetooth presentation clicker in your computer’s Bluetooth settings — they act like a keyboard, so nothing else is needed. Bluetooth MIDI pedals and controllers can be learned in Settings → MIDI. Phones and tablets on Wi-Fi can use the web remote.'),
        section('Screenshots (this computer)'),
        (() => {
          const lv = h('div', { class: 'lv' }, prefs.get('shotDir', '') || 'Pictures → QForge Screenshots (default)');
          if (!prefs.get('shotDir', '')) P.screenshotDir().then((d) => { if (d && !prefs.get('shotDir', '')) lv.textContent = `${d} (default)`; });
          return h('div', { class: 'field full' }, h('span', { class: 'flabel' }, 'Save output screenshots to'), h('div', { class: 'learnbox' }, lv,
            P.isElectron ? h('button', { class: 'btn mini', onclick: async () => { const d = await P.chooseFolder({ title: 'Folder for QForge screenshots', defaultPath: prefs.get('shotDir', '') || undefined }); if (d) { prefs.set('shotDir', d); lv.textContent = d; } } }, 'Choose…') : null,
            P.isElectron ? h('button', { class: 'btn mini', onclick: () => P.openShotFolder(prefs.get('shotDir', '')) }, 'Open') : null,
            h('button', { class: 'btn mini', onclick: () => { prefs.set('shotDir', ''); openSettings('general'); } }, 'Default')),
            h('span', { class: 'hint' }, `Take one with ${MOD}${IS_MAC ? '⌥' : 'Alt+'}S, the camera button on the Program monitor, or OSC /screenshot. Each open output is saved as a PNG named with the output and time.`));
        })(),
        section('Autosave'),
        h('div', { class: 'explain' }, 'QForge autosaves a recovery copy every 30 seconds while there are unsaved changes. If the app or computer crashes, you’ll be offered the recovery copy next time you open QForge.')),
      audio: () => h('div', { class: 'grid wide' },
        section('Audio'),
        field('Default audio output', select(deviceOptions().filter(([v]) => v !== '__sys').map(([v, l]) => [v, v === '' ? 'System default (follows OS sound settings)' : l]), s.audioDevice, (v) => set('audioDevice', v)), `Cues can override this individually. This device has ${rt.audio.channels(rt.dev(s.audioDevice))} output channel(s).`),
        section('Audio patches'),
        h('div', { class: 'explain' }, 'Patches are named outputs (Mains, Monitors, Effects…) that point at your Mac’s or PC’s sound devices — the same devices you see in System Settings → Sound / Windows Sound settings. Cues play to a patch, so moving to a new venue or interface only means re-pointing the patches here. “System default” follows whatever output is selected in the operating system.'),
        patchEditor(),
        field('Preview / headphone output', select(deviceOptions().filter(([v]) => v !== '__sys').map(([v, l]) => [v, v === '' ? 'Same as show output' : l]), s.previewDevice, (v) => set('previewDevice', v)), 'The inspector’s ▶ Preview button plays audio here, so you can audition cues in headphones during the show.'),
        field('Loudness target (LUFS)', num(s.loudnessTarget, (v) => set('loudnessTarget', QP.clamp(v, -40, -5)), { step: 1 }), 'Used by “Normalise”. −16 suits most live playback; −23 is broadcast (EBU R128).'),
        section('Output processing (speaker alignment)'),
        outputProcEditor(),
        section('Master limiter'),
        check('Limit the master output (protects the PA from overs)', s.limiter.on, (v) => { s.limiter.on = v; markDirty(); rt.audio.setLimiter(v, s.limiter.ceiling); }),
        field('Ceiling (dBFS)', num(s.limiter.ceiling, (v) => { s.limiter.ceiling = QP.clamp(v, -20, 0); markDirty(); rt.audio.setLimiter(s.limiter.on, s.limiter.ceiling); }, { step: 0.5, min: -20, max: 0 }), 'Applies to stereo outputs. Multichannel interfaces are left unlimited so routing is never downmixed.'),
        section('Bluetooth & wireless speakers'),
        h('div', { class: 'explain' }, `Bluetooth speakers and headphones, AirPlay (Mac) and wireless audio devices appear in the device lists once they’re connected in your computer’s sound settings — they’re tagged “Bluetooth” or “AirPlay” where the system names them. Bluetooth adds roughly 150–300 ms of delay, so it suits background music, lobbies and previews rather than tight cues; use Output processing above to delay wired speakers if you need them to line up. If a wireless device disconnects mid-show, QForge warns you and its cues fall back to the system default output.${S.audioOutputs.some((d) => wirelessTag(d.label)) ? ' Connected now: ' + S.audioOutputs.filter((d) => wirelessTag(d.label)).map((d) => d.label).join(', ') + '.' : ''}`),
        section('Rehearsal mode'),
        h('div', { class: 'explain' }, 'Rehearsal mode (toolbar button) mutes all audio and holds back MIDI, OSC, DMX, timecode and script cues so you can run the show silently — video and text still play so you can check looks and timing. Everything held back is written to the show log.')),
      video: () => surfacesTab(displays),
      remote: () => h('div', { class: 'grid wide' },
        section('Web remote & live timeline'),
        check('Enable web remote (phones, tablets, laptops on the same network)', s.remote.enabled, (v) => { s.remote.enabled = v; markDirty(); startRemote().then(() => openSettings()); }),
        field('Port', num(s.remote.port, (v) => { s.remote.port = QP.clamp(v | 0, 1024, 65535); markDirty(); startRemote().then(() => openSettings()); }, { min: 1024, max: 65535 })),
        field('PIN (needed to control)', text(s.remote.pin, (v) => { s.remote.pin = v.trim(); markDirty(); startRemote(); }, { placeholder: 'Blank = no PIN' })),
        check('Also require the PIN to view the timeline', s.remote.viewPin, (v) => { s.remote.viewPin = v; markDirty(); startRemote(); }),
        h('div', { class: 'explain' }, remoteHelp()),
        h('div', { class: 'field' }, h('button', { class: 'btn', onclick: () => runCommand('sm-open') }, 'Open stage manager view')),
        section('Collaboration — edit together over the network'),
        h('div', { class: 'explain' }, 'One QForge hosts the show; others join by IP address and edit the same cue list live (cues, groups, cart, script). Everyone sees who is working on which cue. Playback stays on each machine — the host normally runs the show. If two people change the same thing at once, the last change wins. Joining machines use their own audio devices and media paths, so media that only exists on the host shows as missing on guests.'),
        field('Your name (shown to others)', text(collabName(), (v) => { prefs.set('collabName', v.trim()); })),
        check(`Host: let others join this show${S.collab.mode === 'host' && S.remoteStatus && S.remoteStatus.ok ? ` — join address ${S.remoteStatus.addresses.map((x) => `${x}:${S.remoteStatus.port}`).join(' or ')}` : ''}`, S.collab.mode === 'host', (v) => { setHosting(v).then(() => openSettings('remote')); }),
        (() => {
          const addr = h('input', { type: 'text', value: S.collab.mode === 'join' ? S.collab.url.replace(/^http:\/\//, '') : prefs.get('collabJoin', ''), placeholder: '192.168.1.20:8080' });
          const pin = h('input', { type: 'password', value: S.collab.pin || '', placeholder: 'Host’s remote PIN (if set)' });
          return h('div', { class: 'field full' }, h('span', { class: 'flabel' }, 'Join another QForge'),
            h('div', { class: 'learnbox' }, addr, pin,
              S.collab.mode === 'join'
                ? h('button', { class: 'btn mini', onclick: () => { leaveSession(); openSettings('remote'); } }, 'Leave session')
                : h('button', { class: 'btn mini', onclick: async () => { if (await joinSession(addr.value, pin.value)) openSettings('remote'); } }, 'Join')),
            h('span', { class: 'hint' }, S.collab.status ? `Status: ${S.collab.status}${S.collab.mode !== 'off' ? ` · ${(S.collab.peers || []).length} other(s) connected` : ''}` : 'Uses the host’s web-remote port (default 8080).'));
        })(),
        section('OSC remote control'),
        check('Listen for OSC', s.oscEnabled, (v) => { set('oscEnabled', v); startOsc().then(() => openSettings()); }),
        field('OSC listen port (UDP)', num(s.oscPort, (v) => { set('oscPort', QP.clamp(v | 0, 1, 65535)); startOsc().then(() => openSettings()); }, { min: 1, max: 65535 }), S.oscStatus || ''),
        h('div', { class: 'oscref' }, [
          '/go                      GO (fire standby cue)',
          '/go/{number}  or /cue/{number}/start    fire a cue by number',
          '/cue/{number}/stop | pause | resume | devamp | select',
          '/stop  /panic            stop all (fade)   ·   /hardstop   stop instantly',
          '/pause  /resume          pause / resume everything',
          '/playhead/next  /playhead/previous   ·   /cart/{1-64}   toggle a cart pad',
          'A trailing argument of 0 is ignored (button release), so console buttons work directly.',
          'Addresses may also be prefixed with /qforge (e.g. /qforge/go).',
        ].join('\n')),
        section('OSC feedback (TouchOSC, Companion, consoles)'),
        check('Send show status over OSC', s.feedback.enabled, (v) => { s.feedback.enabled = v; markDirty(); fbLast.clear(); }),
        field('Feedback IP', text(s.feedback.host, (v) => { s.feedback.host = v.trim(); markDirty(); fbLast.clear(); }, { placeholder: 'e.g. 192.168.1.40' })),
        field('Feedback port', num(s.feedback.port, (v) => { s.feedback.port = QP.clamp(v | 0, 1, 65535); markDirty(); fbLast.clear(); }, { min: 1, max: 65535 })),
        h('div', { class: 'oscref' }, 'Sent whenever they change:\n/qforge/standby/number  /qforge/standby/name  /qforge/standby/notes   (strings)\n/qforge/running/count (int)   /qforge/running/names (string)\n/qforge/remaining  /qforge/timer   (strings)\n/qforge/rehearsal (0/1)   /qforge/cart/{1-64} (0/1 playing)'),
        section('Main / backup sync'),
        field('This machine is', select([['off', 'Standalone (no sync)'], ['main', 'MAIN — mirror my actions to the backup'], ['backup', 'BACKUP — follow the main machine']], s.backup.role, (v) => { s.backup.role = v; markDirty(); startSync(); openSettings(); })),
        field(s.backup.role === 'backup' ? 'Main machine IP (for status only)' : 'Backup machine IP', text(s.backup.host, (v) => { s.backup.host = v.trim(); markDirty(); })),
        s.backup.role === 'main' ? field('Backup’s OSC port', num(s.backup.port, (v) => { s.backup.port = QP.clamp(v | 0, 1, 65535); markDirty(); }, { min: 1, max: 65535 })) : null,
        h('div', { class: 'explain' }, 'Run the same show file (e.g. from a show package) on both machines. The MAIN sends every GO, cue start/stop, pause/resume, stop-all and playhead move to the BACKUP over OSC, plus a heartbeat. The BACKUP must have OSC listening. If the main fails, switch your audio/video feeds to the backup and keep going.')),
      midi: () => h('div', { class: 'grid wide' },
        section('MIDI control'),
        field('Listen on MIDI input', select([['', 'All inputs'], ...QP.midi.inputs.map((i) => [i.name, i.name])], s.midiInput, (v) => set('midiInput', v)),
          QP.midi.access ? `${QP.midi.inputs.length} input(s), ${QP.midi.outputs.length} output(s) found` : 'MIDI is not available'),
        check('Receive MIDI Show Control (MSC GO / STOP / RESUME)', s.mscReceive, (v) => set('mscReceive', v)),
        field('MSC device ID to respond to', num(s.mscDevice, (v) => set('mscDevice', QP.clamp(v | 0, 0, 127)), { min: 0, max: 127 }), '127 = respond to all. MSC GO with a cue number fires that cue; without one it acts as GO.'),
        ...midiLearnRows(s),
        h('div', { class: 'explain' }, 'The crossfade fader follows a MIDI fader or knob continuously (learn it by moving it past half-way). Bluetooth MIDI devices work too: on a Mac pair them in Audio MIDI Setup → MIDI Studio → Bluetooth; on Windows pair them in Bluetooth settings and restart QForge.'),
        section('Control surfaces'),
        check('Use APC Mini mk2 / Launchpad (Mini mk3, X, Pro mk3) as a cart & transport controller', s.controllers, (v) => { set('controllers', v); QP.controllers.setEnabled(v); openSettings(); }),
        h('div', { class: 'explain' }, `${QP.controllers.list().length ? 'Connected: ' + QP.controllers.list().join(', ') + '. ' : 'No supported controller detected. '}The 8×8 grid plays cart pads 1–64 (lit in the pad colour, flashing while playing). Right-hand column, top to bottom: GO, Stop all, Pause, Resume, Previous, Next.`),
        section('Timecode in'),
        check('Chase incoming MIDI timecode (fires cues with a timecode trigger)', s.tcIn.enabled, (v) => { s.tcIn.enabled = v; markDirty(); }),
        h('div', { class: 'explain' }, 'Set a cue’s trigger time in Inspector → Triggers. QForge fires the cue when incoming MTC passes that time. Big jumps (locating) don’t fire cues. LTC input isn’t supported — convert LTC to MTC with your interface or console.')),
      advanced: () => h('div', { class: 'grid wide' },
        section('Script cues (this computer)'),
        check('Allow script cues to run shell commands and web requests', S.scriptsAllowed, async (v) => { S.scriptsAllowed = await P.scriptAllow(v); openSettings(); }),
        h('div', { class: 'explain' }, 'This setting is stored on this computer, not in the show file, so a show you download can never run commands unless you’ve allowed it here.'),
        section('Logs'),
        h('div', { class: 'field' }, h('button', { class: 'btn', onclick: () => { closeModals(); showLog(); } }, 'Open show log')),
        section('Cue defaults'),
        h('div', { class: 'explain' }, 'Use the ⋯ button in the inspector to save a cue’s settings as the default for new cues of that type.'),
        h('div', { class: 'field' }, h('button', { class: 'btn', onclick: () => { prefs.set('templates', {}); toast('All cue defaults reset'); } }, 'Reset all cue defaults'))),
    };
    const labels = { general: 'General', audio: 'Audio', video: 'Video outputs', remote: 'Remote & network', midi: 'MIDI & timecode', advanced: 'Advanced' };
    const bar = h('div', { class: 'stabs' }, Object.keys(tabs).map((k) => h('button', { class: `stab${k === settingsTab ? ' on' : ''}`, onclick: () => { settingsTab = k; closeModals(); openSettings(); } }, labels[k])));
    closeModals();
    modal({ title: 'Settings', body: h('div', {}, bar, tabs[settingsTab]()), buttons: ['Done'], wide: true, onClose: () => { QP.midi.cancelLearn(); S.settingsUnlocked = false; renderAll(); } });
  }
  function patchEditor() {
    const s = settings();
    if (!s.patches) s.patches = [];
    const box = h('div', { class: 'field full' });
    const draw = () => {
      box.textContent = '';
      const tbl = h('table', { class: 'stats patches' }, h('tr', {}, h('th', {}, 'Patch name'), h('th', {}, 'Sound device'), h('th', {}, 'Channels'), h('th', {}, '')));
      s.patches.forEach((p, i) => {
        const nm = h('input', { type: 'text', value: p.name }); nm.onchange = () => { p.name = nm.value || `Patch ${i + 1}`; markDirty(); };
        const sel = h('select', {}, h('option', { value: '' }, 'System default (follows OS sound settings)'), S.audioOutputs.map((d) => h('option', { value: d.deviceId }, deviceLabel(d))));
        sel.value = p.device || '';
        if (p.device && !S.audioOutputs.some((d) => d.deviceId === p.device)) sel.append(h('option', { value: p.device, selected: true }, '⚠ Not connected'));
        sel.onchange = () => { p.device = sel.value; markDirty(); draw(); sel.blur(); };
        tbl.append(h('tr', {}, h('td', {}, nm), h('td', {}, sel), h('td', {}, String(rt.audio.channels(p.device || ''))),
          h('td', {}, h('button', { class: 'btn mini', onclick: () => { const used = allCues().filter((c) => c.device === `patch:${p.id}`).length; if (used && !confirm(`${used} cue(s) use this patch — they will fall back to the show default. Remove it?`)) return; s.patches.splice(i, 1); markDirty(); draw(); } }, 'Remove'))));
      });
      box.append(tbl, h('div', { class: 'learnbox', style: 'margin-top:8px' },
        h('button', { class: 'btn mini', onclick: () => { s.patches.push({ id: uid(), name: `Patch ${s.patches.length + 1}`, device: '' }); markDirty(); draw(); } }, '+ Add patch'),
        h('button', { class: 'btn mini', onclick: async () => { await unlockDeviceNames(); draw(); toast(`${S.audioOutputs.length} sound device(s) found`, 'ok'); } }, 'Refresh device list'),
        h('span', { class: 'hint' }, `${S.audioOutputs.length} output device(s) available`)));
    };
    draw();
    return box;
  }
  function midiLearnRows(s) {
    return Object.entries({ go: 'GO', panic: 'Stop all / panic', pause: 'Pause all', resume: 'Resume all', next: 'Playhead next', prev: 'Playhead previous', xfader: 'Manual crossfade fader (CC)', xtake: 'Take manual crossfade', blackout: 'Black out video outputs' }).map(([k, label]) => {
      const lv = h('div', { class: 'lv' }, QP.midi.describe(s.midiTriggers[k]));
      return h('div', { class: 'field' }, h('span', { class: 'flabel' }, label), h('div', { class: 'learnbox' }, lv,
        h('button', { class: 'btn mini', onclick: () => { lv.textContent = 'Waiting for MIDI…'; lv.classList.add('learning'); QP.midi.learn((m) => { s.midiTriggers[k] = { type: m.type, ch: m.ch, num: m.num }; lv.textContent = QP.midi.describe(m); lv.classList.remove('learning'); markDirty(); }); } }, 'Learn'),
        h('button', { class: 'btn mini', onclick: () => { s.midiTriggers[k] = null; lv.textContent = '—'; markDirty(); } }, 'Clear')));
    });
  }
  function remoteHelp() {
    const r = S.remoteStatus;
    if (!P.isElectron) return 'The web remote runs from the desktop app.';
    if (!settings().remote.enabled) return 'Turn this on, then open the address shown here in any browser on the same Wi-Fi / network. You get GO and transport, the live timeline, the cue list, the cart wall and a stage manager view.';
    if (!r || !r.ok) return `Not running: ${(r && r.error) || 'starting…'}`;
    return `Running. Open ${r.addresses.map((a) => `http://${a}:${r.port}`).join('  or  ')} on your phone or tablet. Timeline-only link: add “/?view=timeline”.`;
  }
  function surfacesTab(displays) {
    const s = settings();
    const wrap = h('div', { class: 'grid wide' }, h('div', { class: 'section-title' }, 'Output surfaces'),
      h('div', { class: 'explain' }, 'Each surface is its own output window — one per screen or projector. Video, image, text and camera cues choose which surface they appear on. Use warping (corner-pin) and edge blending for projection.'));
    s.surfaces.forEach((sf, i) => {
      const upd = (k, v) => { sf[k] = v; markDirty(); rt.output.apply(sf.id); };
      const card = h('div', { class: 'surface-card field full' },
        h('div', { class: 'sc-head' },
          h('input', { type: 'text', value: sf.name, class: 'sc-name', onchange: (e) => { upd('name', e.target.value || `Output ${i + 1}`); } }),
          h('button', { class: 'btn mini', onclick: () => rt.output.ensure(sf.id).catch((e) => toast(e.message, 'err')) }, 'Open'),
          h('button', { class: 'btn mini', onclick: () => rt.output.identify(sf.id) }, 'Identify'),
          h('button', { class: 'btn mini', onclick: () => { sf._tp = !sf._tp; rt.output.testPattern(sf.id, sf._tp); } }, 'Test pattern'),
          s.surfaces.length > 1 ? h('button', { class: 'btn mini', onclick: () => { s.surfaces.splice(i, 1); markDirty(); openSettings(); } }, 'Remove') : null),
        h('div', { class: 'grid' },
          h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Display'), (() => { const el = h('select', {}, displays.map((d) => h('option', { value: String(d.id) }, d.label))); el.value = String(sf.display ?? (displays[i + 1] || displays[1] || displays[0] || {}).id); el.onchange = () => { upd('display', Number(el.value)); rt.output.place(sf.id); el.blur(); }; return el; })()),
          h('label', { class: 'field check' }, (() => { const el = h('input', { type: 'checkbox', checked: sf.fullscreen !== false }); el.onchange = () => { upd('fullscreen', el.checked); rt.output.place(sf.id); el.blur(); }; return el; })(), h('span', { class: 'flabel' }, 'Full screen')),
          h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Background'), (() => { const el = h('input', { type: 'color', value: sf.bg || '#000000', class: 'colorpick' }); el.oninput = () => upd('bg', el.value); return el; })()),
          ...mappingFields(sf, upd),
          ...['left', 'right', 'top', 'bottom'].map((k) => h('label', { class: 'field' }, h('span', { class: 'flabel' }, `Blend ${k} (%)`),
            (() => { const el = h('input', { type: 'number', min: 0, max: 50, step: 0.5, value: sf.blend[k] || 0 }); el.onchange = () => { sf.blend[k] = QP.clamp(Number(el.value) || 0, 0, 50); markDirty(); rt.output.apply(sf.id); }; return el; })())),
          h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Blend gamma'), (() => { const el = h('input', { type: 'number', min: 1, max: 3, step: 0.1, value: sf.blend.gamma || 2.2 }); el.onchange = () => { sf.blend.gamma = QP.clamp(Number(el.value) || 2.2, 1, 3); markDirty(); rt.output.apply(sf.id); }; return el; })())));
      card.append(masksBlock(sf), ndiBlock(sf, upd));
      wrap.append(card);
    });
    wrap.append(h('div', { class: 'field' }, h('button', { class: 'btn', onclick: () => { const n = s.surfaces.length + 1; s.surfaces.push({ ...DEFAULT_SURFACE(), id: uid(), name: `Output ${n}` }); markDirty(); openSettings(); } }, '+ Add output surface')));
    return wrap;
  }
  function mappingFields(sf, upd) {
    const mode = sf.mapMode === 'mesh' ? 'mesh' : 'pin';
    const sel = h('select', {}, h('option', { value: 'pin' }, 'Corner-pin (4 points)'), h('option', { value: 'mesh' }, 'Mesh warp (GPU grid)'));
    sel.value = mode;
    sel.onchange = () => { if (sel.value === 'mesh' && !sf.mesh) sf.mesh = QP.newMesh(4, 3, sf); upd('mapMode', sel.value === 'mesh' ? 'mesh' : 'pin'); openSettings('video'); };
    const out = [h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Output mapping'), sel)];
    if (mode === 'pin') {
      out.push(h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Corner-pin'), h('div', { class: 'learnbox' },
        h('button', { class: 'btn mini', onclick: () => rt.output.editCorners(sf.id, () => markDirty()).catch((e) => toast(e.message, 'err')) }, 'Edit in output'),
        h('button', { class: 'btn mini', onclick: () => { upd('corners', null); } }, 'Reset'))));
    } else {
      const m = sf.mesh || (sf.mesh = QP.newMesh(4, 3, sf));
      const size = (k) => { const el = h('select', {}, [2, 3, 4, 5, 6, 8].map((n) => h('option', { value: n }, String(n)))); el.value = String(m[k]); el.onchange = () => { const cols = k === 'cols' ? Number(el.value) : m.cols, rows = k === 'rows' ? Number(el.value) : m.rows; sf.mesh = QP.newMesh(cols, rows, sf); markDirty(); rt.output.apply(sf.id); openSettings('video'); }; return el; };
      out.push(
        h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Mesh grid (columns × rows)'), h('div', { class: 'learnbox' }, size('cols'), h('span', {}, '×'), size('rows'))),
        h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'Mesh points'), h('div', { class: 'learnbox' },
          h('button', { class: 'btn mini', onclick: () => rt.output.editMesh(sf.id, () => markDirty()).catch((e) => toast(e.message, 'err')) }, 'Edit in output'),
          h('button', { class: 'btn mini', onclick: () => { sf.mesh = QP.newMesh(m.cols, m.rows, null); markDirty(); rt.output.apply(sf.id); } }, 'Reset'))));
    }
    return out;
  }
  function masksBlock(sf) {
    const box = h('div', { class: 'maskbox' });
    const draw = () => {
      box.textContent = '';
      box.append(h('div', { class: 'flabel', style: 'margin:4px 0 6px' }, `Masks (${(sf.masks || []).length})`));
      (sf.masks || []).forEach((m, i) => {
        const nm = h('input', { type: 'text', value: m.name, class: 'mk-name' }); nm.onchange = () => { m.name = nm.value || `Mask ${i + 1}`; markDirty(); };
        const fe = h('input', { type: 'number', min: 0, max: 200, step: 1, value: m.feather || 0, class: 'mk-num', title: 'Feather (px)' }); fe.onchange = () => { m.feather = QP.clamp(Number(fe.value) || 0, 0, 200); markDirty(); rt.output.apply(sf.id); };
        const inv = h('input', { type: 'checkbox', checked: !!m.invert, title: 'Invert (keep only inside)' }); inv.onchange = () => { m.invert = inv.checked; markDirty(); rt.output.apply(sf.id); inv.blur(); };
        const en = h('input', { type: 'checkbox', checked: m.enabled !== false, title: 'Enabled' }); en.onchange = () => { m.enabled = en.checked; markDirty(); rt.output.apply(sf.id); en.blur(); };
        box.append(h('div', { class: 'mk-row' }, en, nm, h('span', { class: 'hint' }, 'feather'), fe, h('label', { class: 'hint mk-inv' }, inv, 'show only inside'),
          h('button', { class: 'btn mini', onclick: () => rt.output.editMask(sf.id, m.id, () => markDirty()) }, 'Edit points'),
          h('button', { class: 'btn mini', onclick: () => { sf.masks.splice(i, 1); markDirty(); rt.output.apply(sf.id); draw(); } }, 'Delete')));
      });
      box.append(h('div', { class: 'learnbox' },
        h('button', { class: 'btn mini', onclick: () => { toast(`Click points in “${sf.name}” to draw the mask, then press Enter`); rt.output.drawMask(sf.id, (pts) => { if (pts) { markDirty(); draw(); } }).catch((e) => toast(e.message, 'err')); } }, '+ Draw mask in output'),
        h('span', { class: 'hint' }, 'Masks black out parts of the output (stage edges, set pieces, architecture). Feather softens the edge; “show only inside” turns a mask into a window.')));
    };
    draw();
    return box;
  }
  function ndiBlock(sf, upd) {
    const on = h('input', { type: 'checkbox', checked: !!sf.ndi }); on.onchange = () => { upd('ndi', on.checked); rt.output.place(sf.id); on.blur(); openSettings('video'); };
    const size = h('select', {}, ['1280x720', '1920x1080', '2560x1440', '3840x2160', '1080x1920'].map((v) => h('option', { value: v }, v.replace('x', ' × '))));
    size.value = sf.ndiSize || '1920x1080';
    size.onchange = () => { upd('ndiSize', size.value); rt.output.place(sf.id); size.blur(); };
    return h('div', { class: 'ndibox' },
      h('label', { class: 'field check', style: 'padding-top:0' }, on, h('span', { class: 'flabel' }, 'NDI capture window (send this output over NDI with NDI Tools)')),
      sf.ndi ? h('div', { class: 'learnbox' }, h('span', { class: 'hint' }, 'Window size'), size,
        h('span', { class: 'hint', style: 'flex:1' }, `Opens as a normal window titled “QForge NDI - ${sf.name}”. In NDI Tools use Scan Converter (Windows: capture this window) or Screen Capture / NDI Capture (Mac) to publish it as an NDI source. On a Retina Mac the pixel size doubles.`)) : null);
  }
  async function startOsc() {
    const s = settings();
    const r = await P.oscListen(s.oscEnabled ? s.oscPort : 0);
    const el = $('#st-osc');
    if (!s.oscEnabled) { S.oscStatus = 'OSC input off'; el.innerHTML = '<span class="dot"></span>OSC off'; return; }
    if (r && r.ok) { S.oscStatus = `Listening on UDP ${r.port}`; el.innerHTML = `<span class="dot on"></span>OSC ${r.port}`; }
    else { S.oscStatus = `OSC unavailable: ${(r && r.error) || 'unknown error'}`; el.innerHTML = `<span class="dot bad"></span>OSC ${P.isElectron ? 'error' : 'n/a'}`; el.title = S.oscStatus; }
  }
  async function startRemote() {
    const r = settings().remote;
    const hosting = S.collab && S.collab.mode === 'host';
    S.remoteStatus = await P.remoteStart({ enabled: r.enabled || hosting, port: r.port, pin: r.pin, viewPin: r.viewPin });
    if (hosting) P.collabPublish({ enabled: true, version: S.collab.version, show: collabPayload(), from: S.collab.id });
    const el = $('#st-remote');
    if (!r.enabled && !hosting) el.innerHTML = '';
    else if (S.remoteStatus && S.remoteStatus.ok) { el.innerHTML = `<span class="dot on"></span>Remote :${S.remoteStatus.port}`; el.title = S.remoteStatus.addresses.map((a) => `http://${a}:${S.remoteStatus.port}`).join('\n'); }
    else { el.innerHTML = '<span class="dot bad"></span>Remote error'; el.title = (S.remoteStatus && S.remoteStatus.error) || ''; }
    publishState(true);
  }
  function applyTheme() {
    const t = prefs.get('theme', 'neon');
    document.body.classList.remove('theme-neon', 'theme-midnight', 'theme-contrast');
    document.body.classList.add(`theme-${t}`);
  }
  function applySettings() {
    rt.audio.setMaster(Number(settings().masterDb) || 0);
    updateMaster();
    for (const sf of settings().surfaces) rt.output.apply(sf.id);
    startOsc();
    startRemote();
    startSync();
    QP.controllers.setEnabled(settings().controllers !== false);
    rt.audio.outputProc = (dev) => (settings().outputProc || {})[dev || 'default'];
    rt.audio.setLimiter(settings().limiter.on, settings().limiter.ceiling);
    fbLast.clear();
  }

  // ---------------------------------------------------------------- main / backup sync
  let syncTimer = null;
  function sync(kind, arg) {
    const b = settings().backup;
    if (b.role !== 'main' || !b.host) return;
    const args = arg != null ? [{ type: 's', value: String(arg) }] : [];
    P.oscSend({ host: b.host, port: b.port || 53000, address: `/qforge/sync/${kind}`, args });
    if (kind !== 'hb' && kind !== 'playhead') addLog('sync', `→ backup: ${kind}${arg ? ' ' + (cueById(arg) ? cueLabel(cueById(arg)) : arg) : ''}`);
  }
  function startSync() {
    clearInterval(syncTimer);
    const b = settings().backup;
    const el = $('#st-sync');
    el.textContent = '';
    if (b.role === 'main') { syncTimer = setInterval(() => sync('hb', S.playheadId || ''), 1000); el.innerHTML = '<span class="dot on"></span>MAIN'; el.title = `Mirroring to ${b.host || '(no backup IP set)'}`; }
    if (b.role === 'backup') {
      syncTimer = setInterval(() => {
        const age = (Date.now() - (S.lastHeartbeat || 0)) / 1000;
        const okHb = age < 3.5;
        el.innerHTML = `<span class="dot ${okHb ? 'on' : 'bad'}"></span>BACKUP · main ${okHb ? 'OK' : 'LOST'}`;
        if (!okHb && S.mainWasOk) { toast('Main machine heartbeat lost!', 'err'); addLog('sync', 'Main heartbeat lost'); }
        S.mainWasOk = okHb;
      }, 1000);
    }
  }
  function onSync(kind, arg) {
    if (settings().backup.role !== 'backup') return;
    switch (kind) {
      case 'hb': S.lastHeartbeat = Date.now(); if (arg && arg !== S.playheadId && cueById(arg)) setPlayhead(arg, false, true); break;
      case 'go': if (arg && cueById(arg)) { setPlayhead(arg, false, true); go(true); addLog('sync', `← main: GO ${cueLabel(cueById(arg))}`); } break;
      case 'fire': fireCueById(arg, true); break;
      case 'stop': stopCueById(arg, true); break;
      case 'panic': panic(true); break;
      case 'pause': pauseAll(true); break;
      case 'resume': resumeAll(true); break;
      case 'playhead': setPlayhead(arg || null, true, true); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- remote control (OSC / MIDI)
  function onOsc(m) {
    const a = m.address.replace(/^\/qforge/i, '').replace(/^\/workspace\/[^/]+/, '');
    const parts = a.split('/').filter(Boolean).map(decodeURIComponent);
    if ((parts[0] || '').toLowerCase() === 'sync') { onSync(parts[1], m.args && m.args[0]); return; }
    // continuous crossfade fader: /xfade <0..1>
    if ((parts[0] || '').toLowerCase() === 'xfade' && !parts[1]) { const v = Number(m.args && m.args[0]); if (rt.manual && !isNaN(v)) { rt.manual.take = null; rt.setManual(v > 1 ? v / 127 : v); } return; }
    if (m.args && m.args.length && (m.args[0] === 0 || m.args[0] === false)) return;
    const cueAct = (num, act) => {
      const c = cueByNumber(num);
      if (!c) { toast(`OSC: no cue ${num}`, 'err'); return; }
      const runs = rt.runsFor(c.id);
      if (act === 'start' || act === 'go') fireCueById(c.id);
      else if (act === 'stop') stopCueById(c.id);
      else if (act === 'pause') runs.forEach((r) => rt.pauseRun(r));
      else if (act === 'resume') runs.forEach((r) => rt.resumeRun(r));
      else if (act === 'devamp') runs.forEach((r) => rt.devampRun(r));
      else if (act === 'select' || act === 'load') setPlayhead(c.id, true);
    };
    addLog('remote', `OSC ${m.address}${m.from ? ' from ' + m.from : ''}`);
    switch ((parts[0] || '').toLowerCase()) {
      case 'go': if (parts[1]) fireByNumber(parts[1]); else go(); break;
      case 'stop': case 'panic': panic(); break;
      case 'hardstop': rt.stopAll(0); break;
      case 'pause': pauseAll(); break;
      case 'resume': resumeAll(); break;
      case 'cue': if (parts[1]) cueAct(parts[1], (parts[2] || 'start').toLowerCase()); break;
      case 'cart': if (parts[1]) cartPad(Number(parts[1]) - 1); break;
      case 'screenshot': screenshotOutputs(); break;
      case 'blackout': toggleBlackout(); break;
      case 'xfade': if (parts[1] === 'take' && rt.manual) rt.takeManual(rt.manual.time); break;
      case 'select': if (parts[1]) cueAct(parts[1], 'select'); break;
      case 'playhead':
        if (parts[1] === 'next') movePlayhead(1); else if (parts[1] === 'previous' || parts[1] === 'prev') movePlayhead(-1);
        else if (parts[1]) cueAct(parts[1], 'select');
        break;
      default: break;
    }
  }
  function onMidi(msg, inputName) {
    const s = settings();
    if (s.midiInput && s.midiInput !== inputName) return;
    if (msg.type === 'msc') {
      if (!s.mscReceive || (msg.device !== 0x7f && msg.device !== Number(s.mscDevice) && Number(s.mscDevice) !== 127)) return;
      if (msg.command === 0x01) { if (msg.cue) fireByNumber(msg.cue); else go(); }
      else if (msg.command === 0x02) { if (msg.cue) { const c = cueByNumber(msg.cue); if (c) stopCueById(c.id); } else pauseAll(); }
      else if (msg.command === 0x03) resumeAll();
      else if (msg.command === 0x0a) rt.stopAll(0);
      return;
    }
    const t = s.midiTriggers;
    if (QP.midi.matches(t.go, msg)) return go();
    if (QP.midi.matches(t.panic, msg)) return panic();
    if (QP.midi.matches(t.pause, msg)) return pauseAll();
    if (QP.midi.matches(t.resume, msg)) return resumeAll();
    if (QP.midi.matches(t.next, msg)) return movePlayhead(1);
    if (QP.midi.matches(t.prev, msg)) return movePlayhead(-1);
    if (QP.midi.matches(t.xtake, msg)) { if (rt.manual) rt.takeManual(rt.manual.time); return null; }
    if (QP.midi.matches(t.blackout, msg)) return toggleBlackout();
    if (t.xfader && QP.midi.matches(t.xfader, msg)) return null;
    walkAll((c) => { if (QP.midi.matches(c.midiTrigger, msg)) fireCueById(c.id); });
  }
  // timecode chase
  QP.mtcIn = new QP.TC.MTCReader();
  let lastTcFrames = null;
  QP.mtcIn.onUpdate = (tc) => {
    if (!settings().tcIn.enabled) { lastTcFrames = tc.frames; return; }
    const prev = lastTcFrames;
    lastTcFrames = tc.frames;
    if (prev == null || tc.frames <= prev || tc.frames - prev > QP.TC.info(tc.fps).base * 2) return; // stopped, rewound or located
    walkAll((c) => {
      if (!c.tcTrigger) return;
      const f = QP.TC.parse(c.tcTrigger, tc.fps);
      if (f > prev && f <= tc.frames) { addLog('timecode', `TC ${QP.TC.format(f, tc.fps)} → ${cueLabel(c)}`); fireCueById(c.id); }
    });
  };

  // ---------------------------------------------------------------- web remote: state + commands
  let lastPublish = 0;
  function publishState(force) {
    if (!S.remoteStatus || !S.remoteStatus.ok) return;
    const t = performance.now();
    const interval = rt.runs.length ? 150 : 1000;
    if (!force && t - lastPublish < interval) return;
    lastPublish = t;
    const ph = S.playheadId ? cueById(S.playheadId) : null;
    const runs = rt.runs.map((r) => {
      const inf = rt.info(r);
      const f = settings().display.waveRemote && r.cue.type === 'audio' ? runFraction(r) : null;
      return { id: r.id, cueId: r.cueId, parent: r.parentRun ? r.parentRun.id : null, num: r.cue.number || '', name: displayName(r.cue), type: r.cue.type, color: r.cue.color || '', phase: inf.phase, elapsed: +inf.elapsed.toFixed(2), total: isFinite(inf.total) ? +inf.total.toFixed(2) : null, paused: r.paused, state: r.actionDone ? 'post' : r.state, wave: f != null ? remotePeaks(r.cue) : null, wpos: f != null ? +f.toFixed(4) : null };
    });
    const rows = [];
    T.walk(cues(), (c, parent, depth) => {
      const d = actionDuration(c);
      rows.push({ id: c.id, num: c.number || '', name: displayName(c), type: c.type, depth, color: c.color || '', pre: Number(c.preWait) || 0, dur: d == null ? null : isFinite(d) ? +d.toFixed(2) : -1, post: Number(c.postWait) || 0, cont: c.continueMode || 'none', mode: c.mode || null, loops: c.playCount ?? 1, notes: c.notes || '' });
    });
    const cr = cueRemaining();
    const tc = QP.mtcIn.current();
    P.remotePublish({
      ok: true, t: Date.now(), show: S.path ? stripExt(baseName(S.path)) : S.show.name,
      lists: S.show.lists.map((l) => l.name), listIdx: S.listIdx, locked: S.locked,
      playhead: ph ? { id: ph.id, num: ph.number || '', name: displayName(ph), notes: ph.notes || '', sound: ph.notesSound || '', lights: ph.notesLights || '', video: ph.notesVideo || '' } : null,
      showStart: QP.showStartRemaining() != null ? Math.round(QP.showStartRemaining()) : null,
      runs, cues: rows,
      cart: S.show.cart.map((c, i) => (c ? { i, num: c.number || '', name: displayName(c), color: c.color || '', playing: rt.runsFor(c.id).length > 0 } : null)),
      timer: { running: S.showTimer.running, elapsed: Math.floor(timerElapsed()) },
      remain: cr ? { s: Math.ceil(cr.rem), name: cueLabel(cr.cue) } : null,
      tc: tc && settings().tcIn.enabled ? QP.TC.format(tc.frames, tc.fps) : null,
      role: settings().backup.role,
      rehearsal: !!S.rehearsal,
      waves: !!settings().display.waveRemote,
      blackout: !!S.blackout,
      xfade: rt.manual ? { p: +rt.manual.p.toFixed(3), name: displayName(rt.manual.incoming.cue) } : null,
    });
  }
  // compact waveform (120 levels 0–99) of a cue's In→Out region for the web remote / SM view
  const remotePeakCache = new Map();
  function remotePeaks(c) {
    const b = c.file && rt.audio.buffers.get(c.file);
    if (!b || !b.peaks) return null;
    const key = `${c.file}|${c.start}|${c.end}`;
    let v = remotePeakCache.get(key);
    if (!v) {
      const dur = b.duration, s0 = Math.min(Number(c.start) || 0, dur), e0 = Number(c.end) > 0 ? Math.min(Number(c.end), dur) : dur;
      const out = [];
      for (let i = 0; i < 120; i++) { const t = s0 + ((e0 - s0) * (i + 0.5)) / 120; out.push(Math.round(Math.min(1, b.peaks[Math.floor((t / dur) * b.peaks.length)] || 0) * 99)); }
      v = out.join(',');
      if (remotePeakCache.size > 100) remotePeakCache.clear();
      remotePeakCache.set(key, v);
    }
    return v;
  }
  function onRemoteCmd(cmd, arg, from) {
    addLog('remote', `Web ${cmd}${arg != null ? ' ' + arg : ''}${from ? ' from ' + String(from).replace('::ffff:', '') : ''}`);
    switch (cmd) {
      case 'go': go(); break;
      case 'panic': panic(); break;
      case 'hardstop': rt.stopAll(0); break;
      case 'pause': pauseAll(); break;
      case 'resume': resumeAll(); break;
      case 'next': movePlayhead(1); break;
      case 'prev': movePlayhead(-1); break;
      case 'fire': fireCueById(String(arg)); break;
      case 'stop': stopCueById(String(arg)); break;
      case 'select': setPlayhead(String(arg), true); break;
      case 'cart': cartPad(Number(arg)); break;
      case 'list': switchList(Number(arg)); break;
      case 'timer-toggle': timerToggle(); break;
      case 'timer-reset': timerReset(); break;
      case 'rehearsal': toggleRehearsal(); break;
      case 'blackout': toggleBlackout(); break;
      case 'screenshot': screenshotOutputs(); break;
      case 'xfade-take': if (rt.manual) rt.takeManual(rt.manual.time); break;
      case 'pauserun': { const r = rt.runs.find((x) => x.id === Number(arg)); if (r) { if (r.paused) rt.resumeRun(r); else rt.pauseRun(r); } break; }
      case 'stoprun': { const r = rt.runs.find((x) => x.id === Number(arg)); if (r) rt.stopRun(r, 0); break; }
      default: break;
    }
    publishState(true);
  }

  // ---------------------------------------------------------------- keyboard + commands
  function hotkeyUsed(e) { const key = normKey(e); let used = false; walkAll((c) => { if (c.hotkey === key) used = true; }); return used; }
  function normKey(e) {
    const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    return (e.altKey ? 'Alt+' : '') + (e.shiftKey && e.key.length > 1 ? 'Shift+' : '') + k;
  }
  const isTextField = (el) => el && ((el.tagName === 'INPUT' && !['checkbox', 'range', 'color', 'button'].includes(el.type)) || el.tagName === 'TEXTAREA' || el.isContentEditable);
  const nativeEdit = (cmd) => (P.nativeEdit ? P.nativeEdit(cmd) : document.execCommand(cmd));
  function runCommand(cmd, arg) {
    const inText = isTextField(document.activeElement);
    if (cmd.startsWith('add:')) return addCue(cmd.slice(4));
    switch (cmd) {
      case 'new': return requireAdmin('Enter the admin PIN to start a new show').then((ok) => ok && newShow());
      case 'open': return requireAdmin('Enter the admin PIN to open another show').then((ok) => ok && openShow());
      case 'open-path': return openShow(arg);
      case 'save': return saveShow(false);
      case 'save-as': return saveShow(true);
      case 'save-and-close': return saveShow(false).then((ok) => { if (ok) P.closeNow(); });
      case 'import': return importCues();
      case 'history': return showHistory();
      case 'record': return openRecorder();
      case 'stats': return showStats();
      case 'script-toggle': S.view = S.view === 'script' ? 'list' : 'script'; return renderAll();
      case 'export-package': return exportPackage();
      case 'export-csv': return exportCsv();
      case 'export-pdf': return exportPdf();
      case 'settings': return openSettings();
      case 'preflight': return preflight();
      case 'relink': return relink();
      case 'log': return showLog();
      case 'find': { const el = $('#search'); el.focus(); el.select(); return null; }
      case 'replace': return findReplace();
      case 'renumber': return renumber(false);
      case 'normalize': return normalizeCues();
      case 'save-template': { const c = S.view === 'cart' ? cueById(S.cartSel) : selectedCues()[0]; if (c) saveTemplate(c); return null; }
      case 'list-new': return addList();
      case 'cart-toggle': return toggleCart();
      case 'sm-open': return P.openStageManager().then((r) => { if (r && !r.ok) toast(r.error || 'Could not open stage manager view', 'err'); });
      case 'timer-toggle': return timerToggle();
      case 'timer-reset': return timerReset();
      case 'rehearsal': return toggleRehearsal();
      case 'shortcuts': return showShortcuts();
      case 'undo': return inText ? nativeEdit('undo') : undo();
      case 'redo': return inText ? nativeEdit('redo') : redo();
      case 'cut': return inText ? nativeEdit('cut') : copySel(true);
      case 'copy': return inText ? nativeEdit('copy') : copySel(false);
      case 'paste': return inText ? nativeEdit('paste') : paste();
      case 'duplicate': return inText ? null : duplicate();
      case 'select-all': if (inText) return nativeEdit('selectAll'); S.sel = new Set(visibleRows().map((r) => r.cue.id)); updateRowClasses(); return renderInspector();
      case 'group': return groupSelected();
      case 'ungroup': return ungroup();
      case 'lock': return toggleLock();
      case 'panel:preview': return setPanel('preview');
      case 'panel:program': return setPanel('program');
      case 'panel:active': return setPanel('active');
      case 'panel:all': return setPanel('all');
      case 'wave:list': return toggleWave('waveList');
      case 'wave:active': return toggleWave('waveActive');
      case 'blackout': return toggleBlackout();
      case 'screenshot': return screenshotOutputs();
      case 'xfade-take': if (rt.manual) rt.takeManual(rt.manual.time); else toast('No manual crossfade is waiting'); return null;
      case 'go': return go();
      case 'panic': return panic();
      case 'pause-all': return pauseAll();
      case 'resume-all': return resumeAll();
      case 'video-toggle': return toggleVideo();
      default: return null;
    }
  }
  const KEYMAP = { b: 'blackout', j: 'script-toggle', n: 'new', o: 'open', s: 'save', z: 'undo', y: 'redo', x: 'cut', c: 'copy', v: 'paste', d: 'duplicate', a: 'select-all', g: 'group', l: 'lock', p: 'pause-all', r: 'resume-all', ',': 'settings', i: 'import', e: 'export-package', f: 'find', h: 'replace', k: 'cart-toggle', t: 'timer-toggle' };
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const inText = isTextField(e.target);
    if (e.key === 'Escape') {
      e.preventDefault();
      // Esc closes an open dialog / menu / search first; only a "bare" Esc is Stop All
      if ($('#modal-root').children.length) { closeModals(); return; }
      if (closePop.fn) { closePop(); return; }
      if (inText) { e.target.blur(); if (e.target.id === 'search' && S.filter) { e.target.value = ''; S.filter = ''; renderList(); } return; }
      panic();
      return;
    }
    if (mod) {
      if (P.isElectron && !(e.key.toLowerCase() === 'f' && !e.shiftKey)) return; // handled by the application menu
      const k = e.key.toLowerCase();
      let cmd = KEYMAP[k];
      if (k === 'z' && e.shiftKey) cmd = 'redo';
      if (k === 's' && e.shiftKey) cmd = 'save-as';
      if (k === 'g' && e.shiftKey) cmd = 'ungroup';
      if (k === 'v' && e.shiftKey) cmd = 'video-toggle';
      if (k === 'r' && e.shiftKey) cmd = 'renumber';
      if (k === 'k' && e.shiftKey) cmd = 'preflight';
      if (k === 'p' && e.shiftKey) cmd = 'export-pdf';
      if (k === 'm' && e.shiftKey) cmd = 'sm-open';
      if (k === 'x' && e.shiftKey) cmd = 'xfade-take';
      if (k === 's' && e.altKey) cmd = 'screenshot';
      if (/^[0-9]$/.test(k)) cmd = `add:${k === '0' ? (e.shiftKey ? 'osc' : 'midi') : ADD_ORDER[Number(k) - 1]}`;
      if (cmd) { if (inText && ['undo', 'redo', 'cut', 'copy', 'paste', 'select-all'].includes(cmd)) return; e.preventDefault(); runCommand(cmd); }
      return;
    }
    if (inText) return;
    if ($('#modal-root').children.length) return;
    if (e.key === ' ') { e.preventDefault(); if (!e.repeat) go(); return; }
    // presentation clickers / Bluetooth remotes (they send PageDown / PageUp / B / . / F5)
    if (settings().clicker.enabled) {
      if (e.key === 'PageDown') { e.preventDefault(); if (!e.repeat) go(); return; }
      if (e.key === 'PageUp') { e.preventDefault(); movePlayhead(-1); return; }
      if ((e.key === '.' || e.key === 'b' || e.key === 'B') && !e.repeat && !hotkeyUsed(e)) { e.preventDefault(); toggleBlackout(); return; }
      if ((e.key === 'F5' || e.key === 'Home') && !e.repeat) { e.preventDefault(); const first = cues()[0]; if (first) setPlayhead(first.id, true); return; }
    }
    if ((e.key === 'i' || e.key === 'o' || e.key === 'I' || e.key === 'O') && !e.repeat && !hotkeyUsed(e)) { if (setInOutFromPlayback(e.key.toLowerCase() === 'i' ? 'start' : 'end')) { e.preventDefault(); return; } }
    if (e.key === '?') { e.preventDefault(); showShortcuts(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); movePlayhead(1, e.shiftKey); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); movePlayhead(-1, e.shiftKey); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const c = S.playheadId && cueById(S.playheadId);
      if (c && c.type === 'group') { c.collapsed = e.key === 'ArrowLeft'; renderList(); }
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      if (S.view === 'cart' && S.cartSel && !S.locked) { const i = S.show.cart.findIndex((c) => c && c.id === S.cartSel); if (i >= 0) setCartCue(i, null); S.cartSel = null; return; }
      deleteSelected(); return;
    }
    if (e.repeat) return;
    const key = normKey(e);
    walkAll((c) => { if (c.hotkey && c.hotkey === key) fireCueById(c.id); });
  });
  // never let buttons keep focus (Space must always mean GO)
  document.addEventListener('mousedown', (e) => { if (e.target.closest('button') && !e.target.closest('.modal')) e.preventDefault(); });

  // ---------------------------------------------------------------- list-pane file drop + splitter
  function setupDropAndSplitter() {
    const pane = $('#list-pane');
    pane.addEventListener('dragover', (e) => { e.preventDefault(); if (e.dataTransfer.types.includes('Files') && S.view === 'list') pane.classList.add('dragover'); });
    pane.addEventListener('dragleave', (e) => { if (e.target === pane) pane.classList.remove('dragover'); });
    pane.addEventListener('drop', (e) => {
      e.preventDefault(); pane.classList.remove('dragover'); clearDropMarks();
      if (S.view !== 'list') return;
      if (e.dataTransfer.files.length) dropFiles(e.dataTransfer.files, { list: cues(), index: cues().length }, { asGroup: e.altKey });
      else { const ids = e.dataTransfer.getData('application/x-qforge'); if (ids && cues().length) moveCues(JSON.parse(ids), cues()[cues().length - 1].id, 'after'); }
    });
    document.addEventListener('drop', () => pane.classList.remove('dragover'));
    const sp = $('#splitter');
    sp.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const move = (m) => { const hgt = QP.clamp(window.innerHeight - m.clientY - 26, 140, window.innerHeight - 300); document.documentElement.style.setProperty('--insp-h', `${hgt}px`); };
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); refreshInspectorWave(); };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    });
  }

  // ---------------------------------------------------------------- right panels: preview / program / now playing
  const PANELS = ['preview', 'program', 'active'];
  function panelState() { return { preview: true, program: true, active: true, all: true, ...prefs.get('panels', {}) }; }
  function setPanel(k, on) {
    const st = panelState();
    st[k] = on == null ? !st[k] : !!on;
    if (k !== 'all' && st[k]) st.all = true;
    prefs.set('panels', st); applyPanels();
  }
  function applyPanels() {
    const st = panelState();
    for (const k of PANELS) $(`#pn-${k}`).hidden = !st[k];
    document.body.classList.toggle('no-right', !st.all);
    const b = $('#btn-panels'); if (b) b.classList.toggle('on', !!st.all);
    S.pvKey = null;
    refreshInspectorWave();
  }
  function panelsMenu(anchor) {
    const st = panelState();
    popMenu(anchor, [
      { label: `${st.preview && st.all ? '✓ ' : ''}Preview monitor (standby cue)`, fn: () => setPanel('preview') },
      { label: `${st.program && st.all ? '✓ ' : ''}Program monitor (what’s on the outputs)`, fn: () => setPanel('program') },
      { label: `${st.active && st.all ? '✓ ' : ''}Now playing`, fn: () => setPanel('active') },
      '-',
      { label: st.all ? 'Hide the whole right panel' : 'Show the right panel', fn: () => setPanel('all') },
      '-',
      { label: `${settings().display.waveList ? '✓ ' : ''}Waveforms in the cue list`, fn: () => toggleWave('waveList') },
      { label: `${settings().display.waveActive ? '✓ ' : ''}Waveforms in Now Playing / Preview`, fn: () => toggleWave('waveActive') },
      { label: `${settings().display.waveRemote ? '✓ ' : ''}Waveforms on the web remote / SM view`, fn: () => toggleWave('waveRemote') },
    ]);
  }
  function toggleWave(k) {
    settings().display[k] = !settings().display[k];
    markDirty(); S.pvKey = null;
    for (const el of actEls.values()) el.remove(); actEls.clear();
    renderList(); publishState(true);
    toast(`${{ waveList: 'Cue list', waveActive: 'Now playing', waveRemote: 'Remote / SM' }[k]} waveforms ${settings().display[k] ? 'on' : 'off'}`);
  }
  function minimalShow() { return prefs.get('minimalShow', true); }
  function applyShowView() {
    const on = S.locked && minimalShow();
    document.body.classList.toggle('show-min', on);
    refreshInspectorWave();
  }

  // waveform image for a cue (cached), used by Now Playing and Preview
  const bigWaveCache = new Map();
  function waveImage(c, W, H) {
    const b = c.file && rt.audio.buffers.get(c.file);
    if (!b || !b.peaks) return null;
    const key = `${c.file}|${c.start}|${c.end}|${W}x${H}`;
    let url = bigWaveCache.get(key);
    if (!url) {
      const cv = document.createElement('canvas');
      cv.width = W * 2; cv.height = H * 2;
      const g = cv.getContext('2d'); g.scale(2, 2);
      const dur = b.duration, s0 = Math.min(Number(c.start) || 0, dur), e0 = Number(c.end) > 0 ? Math.min(Number(c.end), dur) : dur;
      const grad = g.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, '#22d3ee'); grad.addColorStop(0.55, '#6366f1'); grad.addColorStop(1, '#d946ef');
      g.fillStyle = grad;
      for (let x = 0; x < W; x++) {
        const t = s0 + ((e0 - s0) * x) / W;
        const v = b.peaks[Math.floor((t / dur) * b.peaks.length)] || 0;
        const hh = Math.max(0.5, v * (H / 2 - 1));
        g.fillRect(x, H / 2 - hh, 1, hh * 2);
      }
      url = cv.toDataURL();
      if (bigWaveCache.size > 60) bigWaveCache.clear();
      bigWaveCache.set(key, url);
    }
    return url;
  }
  function runFraction(r) {
    if (!r.seg) return null;
    const pos = rt.audioPosition(r, rt.now());
    return QP.clamp((pos - r.seg.start) / r.seg.len, 0, 1);
  }

  // ---- preview monitor (the cue in standby)
  let pvMedia = null, pvStream = null, pvKeyer = null;
  function stopPreviewMedia() {
    if (pvKeyer) { pvKeyer.destroy(); pvKeyer = null; }
    if (pvMedia) { try { pvMedia.pause(); pvMedia.removeAttribute('src'); pvMedia.load(); } catch { /* ignore */ } pvMedia = null; }
    if (pvStream) { pvStream.getTracks().forEach((t) => t.stop()); pvStream = null; }
  }
  function previewKey(c) {
    if (!c) return 'none';
    return JSON.stringify([c.id, c.type, c.file, c.start, c.end, c.text, c.size, c.textColor, c.bgColor, c.bgOpacity, c.key, c.deviceId, c.children ? c.children.length : 0, c.mode, settings().display.waveActive, !!rt.audio.buffers.get(c.file), S.locked]);
  }
  function renderPreview() {
    if ($('#pn-preview').hidden || document.body.classList.contains('no-right')) { if (pvMedia || pvStream) stopPreviewMedia(); return; }
    const c = S.playheadId ? cueById(S.playheadId) : null;
    const k = previewKey(c);
    if (k === S.pvKey) { updatePreviewLive(c); return; }
    S.pvKey = k;
    stopPreviewMedia();
    const box = $('#preview-box'); box.textContent = '';
    const tools = $('#pv-tools'); tools.textContent = '';
    $('#pv-sub').textContent = c ? cueLabel(c) : '';
    if (!c) { box.append(h('div', { class: 'pv-empty' }, 'Nothing in standby')); return; }
    const screen = h('div', { class: 'pv-screen' });
    const d = actionDuration(c);
    const meta = h('div', { class: 'pv-meta' }, h('span', { class: 'pv-type' }, icon(c.type), TYPES[c.type].label), h('span', {}, targetText(c) || ''), h('span', { class: 'pv-dur' }, d == null ? '' : isFinite(d) ? fmtTime(d) : '∞'));
    const keyed = QP.keyActive(c);
    if (c.type === 'video' && c.file) {
      if (QP.isImagePath(c.file)) {
        const img = h('img', { src: P.mediaUrl(c.file), alt: '' });
        screen.append(img);
        if (keyed) img.onload = () => attachPreviewKeyer(screen, img, c);
      } else {
        const v = h('video', { muted: true, playsinline: true, preload: 'auto' });
        v.muted = true; v.src = P.mediaUrl(c.file);
        v.addEventListener('loadedmetadata', () => { try { v.currentTime = Number(c.start) || 0; } catch { /* ignore */ } if (keyed) attachPreviewKeyer(screen, v, c); });
        screen.append(v); pvMedia = v;
        const scrub = h('input', { type: 'range', min: 0, max: 1000, value: 0, class: 'pv-scrub' });
        scrub.addEventListener('input', () => { if (v.duration) v.currentTime = (scrub.value / 1000) * v.duration; });
        v.addEventListener('timeupdate', () => { if (v.duration && document.activeElement !== scrub) scrub.value = Math.round((v.currentTime / v.duration) * 1000); updatePvMarks(c, v); });
        const marks = h('div', { class: 'pv-marks' }, h('i', { class: 'mk-in' }), h('i', { class: 'mk-out' }));
        tools.append(
          h('button', { class: 'pbtn', title: 'Play / pause this preview (muted, local only)', onclick: () => (v.paused ? v.play().catch(() => {}) : v.pause()) }, '▶❚❚'),
          h('button', { class: 'pbtn edit-only', title: 'Set the cue’s In point here', onclick: () => setInOut(c, 'start', v.currentTime) }, 'IN'),
          h('button', { class: 'pbtn edit-only', title: 'Set the cue’s Out point here', onclick: () => setInOut(c, 'end', v.currentTime) }, 'OUT'));
        box.append(screen, h('div', { class: 'pv-scrubwrap' }, marks, scrub), meta);
        return;
      }
    } else if (c.type === 'text') {
      const bgA = QP.clamp(Number(c.bgOpacity) || 0, 0, 100) / 100;
      const t = h('div', { class: `pv-text pos-${c.position || 'middle'}`, style: `text-align:${c.align || 'center'};justify-content:${c.align === 'left' ? 'flex-start' : c.align === 'right' ? 'flex-end' : 'center'}` },
        h('span', { style: `color:${c.textColor || '#fff'};font-weight:${c.bold ? 800 : 500};font-family:${c.font || 'inherit'};${bgA ? `background:${c.bgColor}${Math.round(bgA * 255).toString(16).padStart(2, '0')};padding:.2em .5em;border-radius:.2em;` : ''}` }, String(c.text || '').replace(/\{[^}]+\}/g, (m) => (m.includes('count') ? '5:00' : m.includes('clock') ? new Date().toTimeString().slice(0, 5) : '0:00'))));
      screen.append(t);
      requestAnimationFrame(() => { const hh = screen.clientHeight || 120; t.firstChild.style.fontSize = `${Math.max(6, ((Number(c.size) || 8) / 100) * hh)}px`; });
    } else if (c.type === 'camera') {
      screen.append(h('div', { class: 'pv-ph' }, icon('camera'), displayName(c)));
      tools.append(h('button', { class: 'pbtn', title: 'Show a live picture from this camera here', onclick: async () => {
        try {
          stopPreviewMedia();
          await P.cameraAccess();
          pvStream = await navigator.mediaDevices.getUserMedia({ video: c.deviceId ? { deviceId: { exact: c.deviceId } } : true, audio: false });
          const v = h('video', { muted: true, playsinline: true, autoplay: true });
          v.srcObject = pvStream; if (c.mirror) v.style.transform = 'scaleX(-1)';
          screen.textContent = ''; screen.append(v); await v.play().catch(() => {});
          if (keyed) attachPreviewKeyer(screen, v, c);
        } catch (e) { toast(`Camera: ${e.message}`, 'err'); }
      } }, 'LIVE'));
    } else if (c.type === 'audio') {
      const url = settings().display.waveActive ? waveImage(c, 300, 70) : null;
      screen.classList.add('pv-audio');
      if (url) screen.append(h('img', { class: 'pv-wave', src: url, alt: '' }), h('i', { class: 'pv-head' }));
      else screen.append(h('div', { class: 'pv-ph' }, icon('audio'), c.file ? baseName(c.file) : 'No file'));
      tools.append(h('button', { class: 'pbtn', title: 'Listen on the preview / headphone output', onclick: () => fireCue(c, { preview: true }) }, '🎧'),
        h('button', { class: 'pbtn', title: 'Stop listening', onclick: () => { for (const r of rt.runsFor(c.id)) if (r.preview) rt.stopRun(r, 0); } }, '■'));
    } else if (c.type === 'group') {
      screen.classList.add('pv-list');
      screen.append(h('div', { class: 'pv-gmode' }, GROUP_BADGE[c.mode] || 'GROUP', c.mode === 'step' ? ` · next ${rt.stepInfo(c).pos + 1}/${c.children.length}` : ''),
        ...c.children.slice(0, 7).map((k) => h('div', { class: 'pv-child' }, icon(k.type), h('b', {}, k.number || ''), displayName(k))),
        ...(c.children.length > 7 ? [h('div', { class: 'pv-child more' }, `+ ${c.children.length - 7} more`)] : []));
    } else {
      screen.append(h('div', { class: 'pv-ph' }, icon(c.type), displayName(c)));
    }
    if (keyed) screen.classList.add('checker');
    box.append(screen, meta);
  }
  function attachPreviewKeyer(screen, src, c) {
    try {
      if (pvKeyer) pvKeyer.destroy();
      pvKeyer = new QP.Keyer(document, src, c.key);
      pvKeyer.canvas.className = 'pv-keyed';
      src.style.visibility = 'hidden';
      screen.append(pvKeyer.canvas);
    } catch { /* WebGL unavailable */ }
  }
  function updatePvMarks(c, v) {
    const m = $('#preview-box .pv-marks'); if (!m || !v.duration) return;
    const a = (Number(c.start) || 0) / v.duration, b = (Number(c.end) > 0 ? Number(c.end) : v.duration) / v.duration;
    m.querySelector('.mk-in').style.left = `${QP.clamp(a, 0, 1) * 100}%`;
    m.querySelector('.mk-out').style.left = `${QP.clamp(b, 0, 1) * 100}%`;
  }
  function updatePreviewLive(c) {
    if (!c) return;
    if (c.type === 'audio') {
      const head = $('#preview-box .pv-head'); if (!head) return;
      const r = rt.runsFor(c.id).find((x) => x.seg);
      head.style.display = r ? 'block' : 'none';
      if (r) head.style.left = `${(runFraction(r) || 0) * 100}%`;
    }
    if (pvKeyer && c.key) pvKeyer.set(c.key);
  }
  function setInOut(c, which, t) {
    if (S.locked) { toast('Unlock editing to change In / Out points', 'err'); return; }
    t = Math.max(0, Number(t) || 0);
    if (which === 'end' && t <= (Number(c.start) || 0)) { toast('Out must be after In', 'err'); return; }
    if (which === 'start' && Number(c.end) > 0 && t >= Number(c.end)) { toast('In must be before Out', 'err'); return; }
    setField(c, which, +t.toFixed(3));
    toast(`${which === 'start' ? 'In' : 'Out'} point set to ${fmtTime(t)}`);
    S.pvKey = null; renderInspector();
  }
  // I / O keys: set In / Out of the selected cue at its current playback position
  function setInOutFromPlayback(which) {
    const c = topSelected() || (S.playheadId && cueById(S.playheadId));
    if (!c || !['audio', 'video'].includes(c.type)) return false;
    const r = rt.runsFor(c.id).find((x) => x.seg);
    let t = null;
    if (r) t = r.el && r.el.tagName === 'VIDEO' ? r.el.currentTime : rt.audioPosition(r, rt.now());
    else if (pvMedia && S.playheadId === c.id) t = pvMedia.currentTime;
    if (t == null) { toast('Play or preview the cue first, then press I / O at the moment you want', 'err'); return true; }
    setInOut(c, which, t);
    return true;
  }

  // ---- program monitor (mirror of the output)
  let lastProgram = 0;
  function programSurfaces() { return (settings().surfaces || []).map((sf) => [sf.id, sf.name]); }
  function syncProgramSelect() {
    const sel = $('#pg-surface');
    const opts = programSurfaces();
    const sig = JSON.stringify(opts);
    if (sel.dataset.sig !== sig) {
      sel.dataset.sig = sig; sel.textContent = '';
      for (const [v, l] of opts) sel.append(h('option', { value: v }, l));
      sel.hidden = opts.length < 2;
    }
    if (!opts.some(([v]) => v === S.pgSurface)) S.pgSurface = opts.length ? opts[0][0] : 'main';
    sel.value = S.pgSurface;
  }
  function drawProgram(ts) {
    if ($('#pn-program').hidden || document.body.classList.contains('no-right')) return;
    if (ts - lastProgram < 66) return;
    lastProgram = ts;
    syncProgramSelect();
    const cv = $('#program'), box = $('#program-box');
    const w = rt.output.liveSurface(S.pgSurface);
    $('#pg-empty').hidden = !!w;
    $('#pg-blk').hidden = !S.blackout;
    const BW = Math.max(80, box.clientWidth);
    const ow = w ? w.innerWidth || 1920 : 1920, oh = w ? w.innerHeight || 1080 : 1080;
    const BH = Math.round((BW * oh) / ow);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(BW * dpr) || cv.height !== Math.round(BH * dpr)) { cv.width = Math.round(BW * dpr); cv.height = Math.round(BH * dpr); cv.style.height = `${BH}px`; }
    const g = cv.getContext('2d');
    const sf = rt.output.surface(S.pgSurface);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.fillStyle = w ? (sf.bg || '#000') : '#05060a'; g.fillRect(0, 0, cv.width, cv.height);
    if (!w || !w.document) return;
    const stage = w.document.getElementById('stage'); if (!stage) return;
    const k = cv.width / ow;
    const layers = [...stage.children].filter((e) => (e.classList.contains('layer') && e.style.width !== '2px') || e.id === 'testpattern')
      .sort((a, b) => (Number(a.style.zIndex) || 0) - (Number(b.style.zIndex) || 0));
    for (const el of layers) {
      const op = el.id === 'testpattern' ? 1 : QP.clamp(Number(el.style.opacity === '' ? 1 : el.style.opacity), 0, 1);
      if (op <= 0.005) continue;
      const r = el.getBoundingClientRect();
      g.globalAlpha = op;
      try {
        let sw = 0, sh = 0;
        if (el.tagName === 'VIDEO') { if (el.readyState < 2) continue; sw = el.videoWidth; sh = el.videoHeight; }
        else if (el.tagName === 'IMG') { sw = el.naturalWidth; sh = el.naturalHeight; }
        else if (el.tagName === 'CANVAS') { sw = el.width; sh = el.height; }
        if (sw && sh) {
          let x = r.left, y = r.top, ww = r.width, hh = r.height;
          const fit = el.style.objectFit || 'contain';
          if (fit === 'contain' || fit === 'cover') {
            const sa = sw / sh, ba = ww / Math.max(1, hh);
            const useW = fit === 'contain' ? sa > ba : sa < ba;
            if (useW) { const nh = ww / sa; y += (hh - nh) / 2; hh = nh; } else { const nw = hh * sa; x += (ww - nw) / 2; ww = nw; }
          }
          g.save(); g.beginPath(); g.rect(r.left * k, r.top * k, r.width * k, r.height * k); g.clip();
          g.drawImage(el, x * k, y * k, ww * k, hh * k);
          g.restore();
        } else if (el.tagName === 'DIV' && el._inner) {
          const inner = el._inner, txt = inner.textContent || '';
          const cs = w.getComputedStyle(inner);
          const fs = parseFloat(cs.fontSize) || 40;
          const ir = inner.getBoundingClientRect();
          if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') { g.fillStyle = cs.backgroundColor; g.fillRect(ir.left * k, ir.top * k, ir.width * k, ir.height * k); }
          g.fillStyle = cs.color || '#fff';
          g.font = `${cs.fontWeight} ${fs * k}px ${cs.fontFamily}`;
          g.textAlign = cs.textAlign === 'left' ? 'left' : cs.textAlign === 'right' ? 'right' : 'center';
          g.textBaseline = 'middle';
          const lines = txt.split('\n');
          const lh = fs * 1.15;
          const tx = g.textAlign === 'left' ? ir.left : g.textAlign === 'right' ? ir.right : ir.left + ir.width / 2;
          const padTop = parseFloat(cs.paddingTop) || 0;
          lines.forEach((ln, i) => g.fillText(ln, tx * k, (ir.top + padTop + lh * (i + 0.5)) * k));
        }
      } catch { /* source not drawable yet */ }
    }
    g.globalAlpha = 1;
  }

  // ---- blackout + screenshots
  function applyBlackout() {
    for (const w of rt.output.wins.values()) {
      if (!w || w.closed || !w.document || !w.document.body) continue;
      let d = w.document.getElementById('qf-blackout');
      if (!d) { d = w.document.createElement('div'); d.id = 'qf-blackout'; d.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9700;pointer-events:none;opacity:0;transition:opacity .4s'; w.document.body.appendChild(d); }
      const want = S.blackout ? '1' : '0';
      if (d.style.opacity !== want) d.style.opacity = want;
    }
    const b = $('#pg-black'); if (b) b.classList.toggle('on', !!S.blackout);
  }
  function toggleBlackout(on) {
    S.blackout = on == null ? !S.blackout : !!on;
    applyBlackout();
    addLog('video', S.blackout ? 'Outputs blacked out' : 'Blackout off');
    toast(S.blackout ? 'Video outputs blacked out' : 'Blackout off');
  }
  async function screenshotOutputs() {
    const open = rt.output.surfaces().filter((sf) => rt.output.isOpen(sf.id));
    if (!open.length) { toast('No video output is open to screenshot', 'err'); return; }
    if (!P.isElectron) {
      const a = document.createElement('a'); a.href = $('#program').toDataURL('image/png');
      a.download = `QForge ${rt.output.surface(S.pgSurface).name} ${new Date().toISOString().slice(0, 19).replace(/:/g, '.')}.png`; a.click();
      toast('Screenshot downloaded', 'ok'); return;
    }
    const dir = prefs.get('shotDir', '');
    const saved = [];
    for (const sf of open) {
      const r = await P.screenshot({ frame: rt.output.frameName(sf), dir, label: sf.name });
      if (r.ok) saved.push(r.file); else toast(`Screenshot ${sf.name}: ${r.error}`, 'err');
    }
    if (saved.length) {
      addLog('video', `Screenshot saved: ${saved.join(', ')}`);
      toast(`Saved ${saved.length} screenshot${saved.length > 1 ? 's' : ''} → ${dir || 'Pictures/QForge Screenshots'}`, 'ok');
      const pb = $('#program-box'); pb.classList.add('flash'); setTimeout(() => pb.classList.remove('flash'), 250);
    }
  }

  // ---- manual crossfade T-bar
  function updateXfader() {
    const m = rt.manual, box = $('#xfader');
    if (!m) { if (!box.hidden) { box.hidden = true; $('#pn-program').classList.remove('xf-on'); } return; }
    if (box.hidden) { box.hidden = false; $('#pn-program').classList.add('xf-on'); if ($('#pn-program').hidden || document.body.classList.contains('no-right')) toast('Manual crossfade ready — open the Program panel for the T-bar, or press Take', 'info'); }
    const names = `${m.outgoing.length ? m.outgoing.map((o) => o.cue.number || displayName(o.cue)).join(', ') : 'nothing'} → ${m.incoming.cue.number || displayName(m.incoming.cue)}`;
    const ne = $('#xf-names'); if (ne.textContent !== names) ne.textContent = names;
    const bar = $('#xf-bar');
    if (document.activeElement !== bar && !S.xfDrag) bar.value = String(Math.round(m.p * 1000));
  }
  function setupPanels() {
    for (const b of document.querySelectorAll('.pclose')) b.addEventListener('click', () => setPanel(b.dataset.panel, false));
    $('#pg-shot').append(icon('shot'));
    $('#pg-shot').onclick = () => screenshotOutputs();
    $('#pg-black').onclick = () => toggleBlackout();
    $('#pg-surface').addEventListener('change', (e) => { S.pgSurface = e.target.value; e.target.blur(); });
    $('#program-box').addEventListener('dblclick', () => toggleVideo());
    const bar = $('#xf-bar');
    bar.addEventListener('pointerdown', () => { S.xfDrag = true; });
    window.addEventListener('pointerup', () => { if (S.xfDrag) { S.xfDrag = false; bar.blur(); } });
    bar.addEventListener('input', () => { if (rt.manual) { rt.manual.take = null; rt.setManual(Number(bar.value) / 1000); } });
    $('#xf-take').onclick = () => { if (rt.manual) rt.takeManual(rt.manual.time); };
    const right = $('#toolbar .tgroup.right');
    right.insertBefore(h('button', { class: 'tbtn small', id: 'btn-panels', title: 'Right-hand panels: preview, program, now playing, waveforms', onclick: (e) => panelsMenu(e.currentTarget) }, icon('panels'), 'Panels'), $('#btn-video'));
    applyPanels();
  }

  // ---------------------------------------------------------------- loops
  function renderAll() { renderList(); renderInspector(); updateTitle(); }
  let lastWave = 0, lastTabs = 0;
  function uiLoop(ts) {
    if (S.needsList) { S.needsList = false; renderList(); }
    updateRunningRows();
    updateCartStates();
    updateScript();
    renderActive();
    renderPreview();
    drawProgram(ts);
    updateXfader();
    if (ts - (S.lastBlk || 0) > 500) { S.lastBlk = ts; if (S.blackout) applyBlackout(); }
    if (ts - (S.lastMeter || 0) > 45) { S.lastMeter = ts; renderMeters(); }
    if (waveCtl && rt.runsFor(waveCtl.cue.id).length && ts - lastWave > 50) { lastWave = ts; waveCtl.draw(); }
    if (ts - lastTabs > 500) { lastTabs = ts; renderTabs(); }
    requestAnimationFrame(uiLoop);
  }
  setInterval(() => { renderTimers(); $('#st-clock').textContent = new Date().toLocaleTimeString([], { hour12: false }); }, 250);
  setInterval(() => publishState(false), 100);

  async function refreshDevices() {
    const before = new Map((S.audioOutputs || []).map((d) => [d.deviceId, d.label]));
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const outs = devs.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
      if (S.devicesSeen) {
        const used = new Set([settings().audioDevice, settings().previewDevice, ...(settings().patches || []).map((p) => p.device)].filter(Boolean));
        for (const [id, label] of before) if (!outs.some((d) => d.deviceId === id) && used.has(id)) { rt.audio.contexts.delete(id); toast(`Audio device disconnected: ${label || 'output'} — its cues will use the system default`, 'err'); addLog('error', `Audio device disconnected: ${label}`); }
        for (const d of outs) if (!before.has(d.deviceId) && used.has(d.deviceId)) { toast(`Audio device back: ${d.label || 'output'}`, 'ok'); addLog('audio', `Audio device reconnected: ${d.label}`); rt.audio.contexts.delete(d.deviceId); }
      }
      S.devicesSeen = true;
      S.audioOutputs = devs.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
      S.videoInputs = devs.filter((d) => d.kind === 'videoinput');
      S.audioInputs = devs.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
    } catch { S.audioOutputs = []; S.videoInputs = []; }
  }
  function updateMidiStatus() {
    const el = $('#st-midi');
    if (!QP.midi.access) { el.innerHTML = '<span class="dot"></span>MIDI n/a'; return; }
    const ctl = QP.controllers.list();
    el.innerHTML = `<span class="dot ${QP.midi.inputs.length ? 'on' : ''}"></span>MIDI ${QP.midi.inputs.length} in / ${QP.midi.outputs.length} out${ctl.length ? ' · ' + ctl.join(', ') : ''}`;
    el.title = [...QP.midi.inputs.map((i) => `IN: ${i.name}`), ...QP.midi.outputs.map((o) => `OUT: ${o.name}`)].join('\n');
  }

  // ---------------------------------------------------------------- init
  async function init() {
    S.audioOutputs = []; S.videoInputs = [];
    applyTheme();
    buildToolbar();
    setupPanels();
    setupDropAndSplitter();
    setupInspectorDrop();
    P.onMenu((cmd, arg) => runCommand(cmd, arg));
    P.onOsc(onOsc);
    P.onRemoteCmd(onRemoteCmd);
    P.onVideoClosed(() => { if (!rt.output.anyOpen()) $('#btn-video').classList.remove('on'); });
    rt.output.onWarpChange = () => markDirty();
    QP.midi.onMessage = onMidi;
    QP.midi.onCC = (ch, num, val, inputName) => {
      const s = settings(), t = s.midiTriggers.xfader;
      if (!t || !rt.manual || QP.midi.learnCb || (s.midiInput && s.midiInput !== inputName)) return;
      if (t.type === 'cc' && t.num === num && (!t.ch || t.ch === ch)) { rt.manual.take = null; rt.setManual(val / 127); }
    };
    QP.midi.onDevices = () => { updateMidiStatus(); };
    QP.controllers.configure({
      onPad: (i) => cartPad(i),
      onAction: (a) => ({ go: () => go(), panic: () => panic(), pause: () => pauseAll(), resume: () => resumeAll(), prev: () => movePlayhead(-1), next: () => movePlayhead(1) }[a] || (() => {}))(),
      getPads: () => S.show.cart.map((c) => (c ? { assigned: true, color: c.color, playing: rt.runsFor(c.id).length > 0 } : null)),
    });
    await refreshDevices();
    if (navigator.mediaDevices) navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    QP.midi.init().then(updateMidiStatus);
    S.scriptsAllowed = await P.scriptStatus();
    applySettings();
    if (prefs.get('collabHost', false) && P.isElectron) setHosting(true);
    renderAll();
    requestAnimationFrame(uiLoop);
    addLog('app', 'QForge started');
    const launch = await P.launchFile();
    if (launch) openShow(launch);
    else await checkRecovery();
    window.addEventListener('beforeunload', (e) => { if (!P.isElectron && S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  }
  // expose a small API for debugging / automation
  QP.app = { dropFiles, toggleBlackout, screenshotOutputs, setInOutFromPlayback, setPanel, toggleLock, renderInspector, remotePeaks, S, rt, go, joinSession, leaveSession, setHosting, addCue, insertCues, newCue, loadShowData, showData, runCommand, setField, cueById, fireByNumber, onOsc, onSync, onRemoteCmd, groupSelected, renderAll, cartPad, setCartCue, switchList, publishState, normalizeCues, preflight, settings };
  init();
})();
