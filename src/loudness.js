'use strict';
// Integrated loudness (ITU-R BS.1770 / EBU R128 style, LUFS) of an AudioBuffer.
window.QP = window.QP || {};

QP.measureLoudness = async (buffer) => {
  const ch = Math.min(buffer.numberOfChannels, 2);
  const sr = buffer.sampleRate;
  const off = new OfflineAudioContext(ch, buffer.length, sr);
  const src = off.createBufferSource();
  src.buffer = buffer;
  // K-weighting: high-shelf (+4 dB @ ~1.68 kHz) then high-pass (~38 Hz)
  const shelf = off.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 1681.97; shelf.gain.value = 4;
  const hp = off.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38.13; hp.Q.value = 0.5;
  src.connect(shelf).connect(hp).connect(off.destination);
  src.start();
  const out = await off.startRendering();
  const block = Math.round(0.4 * sr), step = Math.round(0.1 * sr);
  const chans = []; for (let c = 0; c < ch; c++) chans.push(out.getChannelData(c));
  const powers = [];
  for (let s = 0; s + block <= out.length; s += step) {
    let sum = 0;
    for (const d of chans) { let acc = 0; for (let i = s; i < s + block; i++) acc += d[i] * d[i]; sum += acc / block; }
    powers.push(sum);
  }
  if (!powers.length) {
    let sum = 0; for (const d of chans) { let acc = 0; for (let i = 0; i < d.length; i++) acc += d[i] * d[i]; sum += acc / Math.max(1, d.length); }
    powers.push(sum);
  }
  const lufs = (p) => -0.691 + 10 * Math.log10(p);
  const abs = powers.filter((p) => lufs(p) > -70);
  if (!abs.length) return -70;
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const rel = lufs(mean(abs)) - 10;
  const gated = abs.filter((p) => lufs(p) > rel);
  return lufs(mean(gated.length ? gated : abs));
};
