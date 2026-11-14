'use strict';
// Web MIDI: input triggers (note / CC / program change), MIDI Show Control receive,
// and MIDI output for MIDI cues.
window.QP = window.QP || {};

QP.midi = {
  access: null,
  inputs: [],
  outputs: [],
  learnCb: null,
  onMessage: () => {},
  onDevices: () => {},
  lastCC: new Map(),

  async init() {
    if (!navigator.requestMIDIAccess) return false;
    try { this.access = await navigator.requestMIDIAccess({ sysex: true }); } catch {
      try { this.access = await navigator.requestMIDIAccess(); } catch { return false; }
    }
    this.access.onstatechange = () => this.refresh();
    this.refresh();
    return true;
  },

  refresh() {
    if (!this.access) return;
    this.inputs = [...this.access.inputs.values()];
    this.outputs = [...this.access.outputs.values()];
    for (const inp of this.inputs) inp.onmidimessage = (e) => this.handle(inp, e.data);
    if (QP.controllers) QP.controllers.refresh();
    this.onDevices();
  },

  learn(cb) { this.learnCb = cb; },
  cancelLearn() { this.learnCb = null; },

  handle(input, d) {
    if (!d || !d.length) return;
    if (QP.controllers && QP.controllers.handle(input, d)) return;
    if ((d[0] === 0xf1 || (d[0] === 0xf0 && d[1] === 0x7f && d[3] === 0x01)) && QP.mtcIn && QP.mtcIn.feed(d)) return;
    if (d[0] === 0xf0) { const msc = this.parseMSC(d); if (msc) this.onMessage({ type: 'msc', ...msc }, input.name); return; }
    const type = d[0] & 0xf0, ch = (d[0] & 0x0f) + 1;
    let msg = null;
    if (type === 0x90 && d[2] > 0) msg = { type: 'note', ch, num: d[1], val: d[2] };
    else if (type === 0xb0) {
      // trigger on the rising edge only (value crosses from <64 to >=64)
      if (this.onCC) this.onCC(ch, d[1], d[2], input.name);
      const key = `${input.id}:${ch}:${d[1]}`;
      const prev = this.lastCC.get(key) || 0;
      this.lastCC.set(key, d[2]);
      if (d[2] >= 64 && prev < 64) msg = { type: 'cc', ch, num: d[1], val: d[2] };
    } else if (type === 0xc0) msg = { type: 'pc', ch, num: d[1], val: 127 };
    if (!msg) return;
    if (this.learnCb) { const cb = this.learnCb; this.learnCb = null; cb(msg); return; }
    this.onMessage(msg, input.name);
  },

  // F0 7F <device> 02 <format> <command> [cue number ascii] [00 list ...] F7
  parseMSC(d) {
    if (d.length < 6 || d[1] !== 0x7f || d[3] !== 0x02) return null;
    const device = d[2], command = d[5];
    let cue = '';
    for (let i = 6; i < d.length && d[i] !== 0x00 && d[i] !== 0xf7; i++) cue += String.fromCharCode(d[i]);
    return { device, command, cue };
  },

  describe(t) {
    if (!t) return '—';
    if (t.type === 'note') return `Note ${t.num} · ch ${t.ch}`;
    if (t.type === 'cc') return `CC ${t.num} · ch ${t.ch}`;
    if (t.type === 'pc') return `Program ${t.num} · ch ${t.ch}`;
    return '—';
  },
  matches(t, msg) {
    return !!t && t.type === msg.type && t.num === msg.num && (!t.ch || t.ch === msg.ch);
  },

  send(c) {
    const out = this.outputs.find((o) => o.name === c.midiOut) || this.outputs[0];
    if (!out) throw new Error('no MIDI output available');
    const ch = QP.clamp((Number(c.channel) || 1) - 1, 0, 15);
    const d1 = QP.clamp(Number(c.data1) || 0, 0, 127), d2 = QP.clamp(Number(c.data2) || 0, 0, 127);
    let bytes;
    switch (c.message) {
      case 'note_off': bytes = [0x80 | ch, d1, d2]; break;
      case 'cc': bytes = [0xb0 | ch, d1, d2]; break;
      case 'pc': bytes = [0xc0 | ch, d1]; break;
      case 'msc_go': case 'msc_stop': case 'msc_resume': {
        const cmd = { msc_go: 0x01, msc_stop: 0x02, msc_resume: 0x03 }[c.message];
        const cue = [...String(c.mscCue || '')].map((x) => x.charCodeAt(0) & 0x7f);
        const list = [...String(c.mscList || '')].map((x) => x.charCodeAt(0) & 0x7f);
        bytes = [0xf0, 0x7f, QP.clamp(Number(c.mscDevice) || 0, 0, 127), 0x02, 0x01, cmd, ...cue, ...(list.length ? [0x00, ...list] : []), 0xf7];
        break;
      }
      default: bytes = [0x90 | ch, d1, d2];
    }
    out.send(bytes);
  },
};
