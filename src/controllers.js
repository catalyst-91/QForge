'use strict';
// Native control surfaces with LED feedback: Akai APC Mini mk2 and Novation Launchpad
// Mini mk3 / X / Pro mk3. The 8x8 grid plays the cart wall; side buttons are transport.
window.QP = window.QP || {};

QP.controllers = (() => {
  const PALETTE = { off: 0, white: 3, red: 5, orange: 9, yellow: 13, green: 21, cyan: 37, blue: 45, indigo: 49, magenta: 53, pink: 57 };
  const COLOR_MAP = { '#f43f5e': 'red', '#f97316': 'orange', '#facc15': 'yellow', '#34d399': 'green', '#22d3ee': 'cyan', '#6366f1': 'indigo', '#d946ef': 'magenta' };
  const ACTIONS = ['go', 'panic', 'pause', 'resume', 'prev', 'next'];

  const PROFILES = [
    {
      id: 'apc', name: 'APC Mini mk2', match: /apc\s*mini\s*mk\s*2|apc mini mk2/i,
      init: () => [],
      padNote: (i) => (7 - Math.floor(i / 8)) * 8 + (i % 8),
      noteToPad: (note) => (note >= 0 && note < 64 ? (7 - Math.floor(note / 8)) * 8 + (note % 8) : -1),
      // scene launch buttons (right column) 0x70..0x77
      sideIn: (status, num) => ((status & 0xf0) === 0x90 && num >= 0x70 && num <= 0x75 ? ACTIONS[num - 0x70] : null),
      padLed: (i, color, mode) => [mode === 'blink' ? 0x9d : mode === 'dim' ? 0x91 : 0x96, (7 - Math.floor(i / 8)) * 8 + (i % 8), PALETTE[color] ?? 0],
      sideLed: (k, on) => [0x90, 0x70 + k, on ? 1 : 0],
      exit: () => [],
    },
    ...[['lpmini', 'Launchpad Mini mk3', /lpminimk3 midi|launchpad mini mk3.*midi|launchpad mini mk3$/i, 0x0d],
      ['lpx', 'Launchpad X', /lpx midi|launchpad x.*midi|launchpad x$/i, 0x0c],
      ['lppro', 'Launchpad Pro mk3', /lppromk3 midi|launchpad pro mk3.*midi|launchpad pro mk3$/i, 0x0e]].map(([id, name, match, dev]) => ({
      id, name, match,
      init: () => [[0xf0, 0x00, 0x20, 0x29, 0x02, dev, 0x0e, 0x01, 0xf7]],
      noteToPad: (note) => { const r = Math.floor(note / 10), c = note % 10; return r >= 1 && r <= 8 && c >= 1 && c <= 8 ? (8 - r) * 8 + (c - 1) : -1; },
      // right column CCs top→bottom: 89,79,69,59,49,39
      sideIn: (status, num, val) => ((status & 0xf0) === 0xb0 && val > 0 && num % 10 === 9 && num >= 39 && num <= 89 ? ACTIONS[(89 - num) / 10] : null),
      padLed: (i, color, mode) => [mode === 'blink' ? 0x91 : mode === 'pulse' ? 0x92 : 0x90, (8 - Math.floor(i / 8)) * 10 + (i % 8) + 1, PALETTE[color] ?? 0],
      sideLed: (k, on) => [0xb0, 89 - k * 10, on ? [21, 5, 13, 45, 3, 3][k] : 0],
      exit: () => [[0xf0, 0x00, 0x20, 0x29, 0x02, dev, 0x0e, 0x00, 0xf7]],
    })),
  ];

  const state = { devices: [], enabled: true, onPad: () => {}, onAction: () => {}, getPads: () => [], lastLeds: new Map(), timer: null };

  function refresh() {
    const m = QP.midi;
    for (const d of state.devices) { try { for (const msg of d.profile.exit()) d.out.send(msg); } catch { /* ignore */ } }
    state.devices = [];
    state.lastLeds.clear();
    if (!m.access || !state.enabled) return;
    for (const out of m.outputs) {
      if (/daw/i.test(out.name)) continue;
      const profile = PROFILES.find((p) => p.match.test(out.name));
      if (!profile) continue;
      const inp = m.inputs.find((i) => i.name === out.name) || m.inputs.find((i) => profile.match.test(i.name) && !/daw/i.test(i.name));
      if (!inp) continue;
      const dev = { profile, out, inp, name: profile.name };
      try { for (const msg of profile.init()) out.send(msg); } catch { /* sysex not allowed */ }
      state.devices.push(dev);
    }
    if (!state.timer) state.timer = setInterval(updateLeds, 100);
    updateLeds(true);
  }

  function handle(input, d) {
    const dev = state.devices.find((x) => x.inp === input || x.inp.id === input.id);
    if (!dev) return false;
    const status = d[0], num = d[1], val = d[2] || 0;
    const act = dev.profile.sideIn(status, num, val);
    if (act) { state.onAction(act); return true; }
    if ((status & 0xf0) === 0x90 && val > 0) {
      const pad = dev.profile.noteToPad(num);
      if (pad >= 0) { state.onPad(pad); return true; }
    }
    return true; // swallow everything else from the surface
  }

  function updateLeds(force) {
    if (!state.devices.length) return;
    const pads = state.getPads(); // [{color, playing, assigned}]
    const blinkOn = Math.floor(performance.now() / 250) % 2 === 0;
    for (const dev of state.devices) {
      for (let i = 0; i < 64; i++) {
        const p = pads[i];
        let msg;
        if (!p || !p.assigned) msg = dev.profile.padLed(i, 'off', 'solid');
        else if (p.playing) msg = dev.profile.padLed(i, dev.profile.id === 'apc' ? 'green' : (blinkOn ? 'green' : 'white'), dev.profile.id === 'apc' ? 'blink' : 'solid');
        else msg = dev.profile.padLed(i, COLOR_MAP[p.color] || 'white', 'dim');
        const key = `${dev.out.id}:p${i}`;
        const sig = msg.join(',');
        if (force || state.lastLeds.get(key) !== sig) { state.lastLeds.set(key, sig); try { dev.out.send(msg); } catch { /* ignore */ } }
      }
      for (let k = 0; k < 6; k++) {
        const msg = dev.profile.sideLed(k, true);
        const key = `${dev.out.id}:s${k}`; const sig = msg.join(',');
        if (force || state.lastLeds.get(key) !== sig) { state.lastLeds.set(key, sig); try { dev.out.send(msg); } catch { /* ignore */ } }
      }
    }
  }

  return {
    PROFILES,
    refresh, handle, updateLeds,
    setEnabled(on) { state.enabled = !!on; refresh(); },
    configure({ onPad, onAction, getPads }) { Object.assign(state, { onPad, onAction, getPads }); },
    list() { return state.devices.map((d) => d.name); },
  };
})();
