'use strict';
// Network outputs: streams a QForge video output to the "QForge Output" app on other computers
// over WebRTC. Signalling goes through the web-remote server (the display posts an offer,
// we answer over its event stream). One capture per output, shared by every display watching it.
window.QP = window.QP || {};

QP.iceComplete = (pc, ms = 2500) => new Promise((resolve) => {
  if (pc.iceGatheringState === 'complete') return resolve();
  const t = setTimeout(resolve, ms);
  pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); } });
});

// ask Opus for full-quality stereo (browsers default to a low-rate, mono-leaning setup)
QP.opusStereo = (sdp) => {
  const m = String(sdp).match(/a=rtpmap:(\d+) opus\/48000\/2/i);
  if (!m) return sdp;
  const pt = m[1];
  const re = new RegExp(`a=fmtp:${pt} ([^\r\n]*)`);
  const extra = 'stereo=1;sprop-stereo=1;maxaveragebitrate=320000;usedtx=0';
  if (re.test(sdp)) return sdp.replace(re, (all, params) => `a=fmtp:${pt} ${params.split(';').filter((x) => !/^(stereo|sprop-stereo|maxaveragebitrate|usedtx)=/.test(x.trim())).concat(extra).join(';')}`);
  return sdp.replace(m[0], `${m[0]}\r\na=fmtp:${pt} ${extra}`);
};

QP.NetOut = class NetOut {
  // getStream(surfaceId) -> MediaStream; send(clientId, msg); onChange(); log(text)
  constructor({ getStream, send, onChange, log }) {
    this.getStream = getStream; this.sendTo = send;
    this.onChange = onChange || (() => {}); this.log = log || (() => {});
    this.peers = new Map();     // clientId -> { pc, surface, name, address, since, sender }
    this.streams = new Map();   // surfaceId -> MediaStream
  }
  get count() { return this.peers.size; }
  list() { return [...this.peers.values()].map((p) => ({ id: p.id, name: p.name, surface: p.surface, address: p.address, state: p.pc.connectionState, since: p.since })); }
  async stream(surface) {
    let st = this.streams.get(surface);
    if (st && st.getVideoTracks().some((t) => t.readyState === 'live')) return st;
    st = await this.getStream(surface);
    this.streams.set(surface, st);
    for (const t of st.getVideoTracks()) t.addEventListener('ended', () => { if (this.streams.get(surface) === st) this.streams.delete(surface); });
    return st;
  }
  async signal(msg) {
    const id = msg.from;
    if (msg.type === 'bye') { this.close(id, 'disconnected'); return; }
    if (msg.type !== 'offer' || !msg.sdp) return;
    this.close(id, null);
    let st;
    try { st = await this.stream(msg.surface); }
    catch (e) { this.sendTo(id, { type: 'error', error: `Can’t capture that output: ${e.message}` }); return; }
    const pc = new RTCPeerConnection({ iceServers: [] });
    const peer = { id, pc, surface: msg.surface, name: String(msg.name || 'Display').slice(0, 60), address: String(msg.address || '').replace('::ffff:', ''), since: Date.now(), sender: null };
    this.peers.set(id, peer);
    const wantsSound = /m=audio/.test(msg.sdp.sdp || '');
    for (const t of st.getVideoTracks()) peer.sender = pc.addTrack(t, st);
    if (wantsSound) for (const t of st.getAudioTracks()) peer.asender = pc.addTrack(t, st);
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'connected') this.log(`Network display connected: ${peer.name} (${peer.address}) ← ${msg.surfaceName || msg.surface}`);
      if (['failed', 'closed'].includes(pc.connectionState) && this.peers.get(id) === peer) this.close(id, pc.connectionState);
      this.onChange();
    });
    try {
      await pc.setRemoteDescription(msg.sdp);
      const ans = await pc.createAnswer();
      await pc.setLocalDescription({ type: 'answer', sdp: QP.opusStereo(ans.sdp) });
      await QP.iceComplete(pc);
      this.sendTo(id, { type: 'answer', sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
      if (peer.sender) {
        const prm = peer.sender.getParameters();
        if (!prm.encodings || !prm.encodings.length) prm.encodings = [{}];
        prm.encodings[0].maxBitrate = Math.round((Number(msg.bitrate) || 15) * 1e6);
        prm.encodings[0].maxFramerate = Number(msg.fps) || 30;
        prm.degradationPreference = 'maintain-resolution';
        await peer.sender.setParameters(prm).catch(() => {});
      }
      if (peer.asender) {
        const ap = peer.asender.getParameters();
        if (!ap.encodings || !ap.encodings.length) ap.encodings = [{}];
        ap.encodings[0].maxBitrate = 320000;
        await peer.asender.setParameters(ap).catch(() => {});
      }
    } catch (e) {
      this.sendTo(id, { type: 'error', error: e.message });
      this.close(id, null);
    }
    this.onChange();
  }
  close(id, why) {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    try { p.pc.close(); } catch { /* ignore */ }
    if (why) this.log(`Network display ${why}: ${p.name}`);
    if (this.onEmpty && !this.peers.size) this.onEmpty();
    // stop capturing outputs nobody watches any more
    for (const [sid, st] of this.streams) {
      if (![...this.peers.values()].some((x) => x.surface === sid)) { st.getTracks().forEach((t) => t.stop()); this.streams.delete(sid); }
    }
    this.onChange();
  }
  closeAll() {
    for (const id of [...this.peers.keys()]) { this.sendTo(id, { type: 'bye' }); this.close(id, null); }
  }
};
