'use strict';
// QForge companion apps: Stage Manager (shows the remote's SM view) and Output (receives a
// QForge video output as a live WebRTC stream). Finds QForge on the network, remembers
// settings per window and reconnects on its own.
(() => {
  const qs = new URLSearchParams(location.search);
  const KIND = qs.get('kind') === 'output' ? 'output' : 'sm';
  const N = Number(qs.get('n')) || 1;
  const C = window.client || {   // plain-browser fallback (testing)
    net: async () => ({ hostname: 'browser', addresses: [], version: 'dev', platform: 'web' }),
    displays: async () => [{ id: 0, label: 'This screen', primary: true }],
    place: async () => true, fullscreen: async () => false, loginItem: async () => null, awake: async () => {},
    newWindow: async () => window.open(location.href, '_blank'), title: async (t) => { document.title = t; },
    onMenu: (cb) => window.addEventListener('keydown', (e) => { if (e.key === 'Escape') cb(); }),
    onReconnect: () => {},
  };
  const $ = (s) => document.querySelector(s);
  const NAME = KIND === 'output' ? 'QForge Output' : 'QForge Stage Manager';
  document.body.classList.add(`k-${KIND}`);
  document.title = N > 1 ? `${NAME} ${N}` : NAME;
  $('#app-name').textContent = N > 1 ? `${NAME} — window ${N}` : NAME;
  $('#app-sub').textContent = KIND === 'output' ? 'Shows a QForge video output streamed over the network' : 'Clock, timers, standby and now playing from QForge';

  // ---- settings (per window)
  const KEY = `qfc.${KIND}.${N}`;
  const DEF = { host: '', pin: '', surface: '', fit: 'contain', view: 'sm', display: '', fs: true, auto: true, stats: false, sound: true, volume: 100, sink: '' };
  // ask Opus for full-quality stereo
  const opusStereo = (sdp) => {
    const m = String(sdp).match(/a=rtpmap:(\d+) opus\/48000\/2/i);
    if (!m) return sdp;
    const re = new RegExp(`a=fmtp:${m[1]} ([^\r\n]*)`);
    const extra = 'stereo=1;sprop-stereo=1;maxaveragebitrate=320000;usedtx=0';
    if (re.test(sdp)) return sdp.replace(re, (all, prm) => `a=fmtp:${m[1]} ${prm.split(';').filter((x) => !/^(stereo|sprop-stereo|maxaveragebitrate|usedtx)=/.test(x.trim())).concat(extra).join(';')}`);
    return sdp.replace(m[0], `${m[0]}\r\na=fmtp:${m[1]} ${extra}`);
  };
  let cfg = { ...DEF };
  try { cfg = { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* defaults */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* ignore */ } };
  let clientId = localStorage.getItem(`${KEY}.id`);
  if (!clientId) { clientId = Math.random().toString(36).slice(2, 12); localStorage.setItem(`${KEY}.id`, clientId); }
  let me = { hostname: '', addresses: [] };

  const base = (host) => {
    let h = String(host || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!h) return '';
    if (!/:\d+$/.test(h)) h += ':8080';
    return `http://${h}`;
  };
  const withPin = (url, pin) => `${url}${url.includes('?') ? '&' : '?'}pin=${encodeURIComponent(pin || '')}`;
  async function fetchJson(url, opts = {}, ms = 3000) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
    try { const r = await fetch(url, { ...opts, signal: ac.signal, cache: 'no-store' }); const j = await r.json().catch(() => ({})); return { status: r.status, json: j }; }
    finally { clearTimeout(t); }
  }

  // ---- status display
  let toastT = null;
  function toast(text, err) {
    const el = $('#toastline');
    el.innerHTML = `<span class="dot"></span>${text.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}`;
    el.className = err ? 'err' : '';
    el.hidden = false;
    clearTimeout(toastT);
    if (!err) toastT = setTimeout(() => { el.classList.add('fade'); setTimeout(() => { el.hidden = true; }, 700); }, 3500);
  }
  function waiting(on, title, sub) {
    $('#waiting').hidden = !on;
    if (title) $('#w-title').textContent = title;
    $('#w-sub').textContent = sub || '';
  }
  function pstatus(t, cls) { const el = $('#p-status'); el.textContent = t || ''; el.className = cls || 'muted'; }

  // ---- discovery: ask every address on this network for /api/info
  let scanning = false;
  async function scan() {
    if (scanning) return; scanning = true;
    const box = $('#found');
    box.innerHTML = '<div class="muted">Searching this network for QForge…</div>';
    const port = (String(cfg.host).match(/:(\d+)$/) || [])[1] || '8080';
    const targets = new Set(['127.0.0.1']);
    for (const a of (me.addresses || []).slice(0, 3)) {
      const p = a.address.split('.');
      for (let i = 1; i < 255; i++) targets.add(`${p[0]}.${p[1]}.${p[2]}.${i}`);
    }
    const found = [];
    const list = [...targets];
    let idx = 0;
    const worker = async () => {
      while (idx < list.length) {
        const ip = list[idx++];
        try {
          const r = await fetchJson(`http://${ip}:${port}/api/info`, {}, 900);
          if (r.json && r.json.app === 'QForge') { found.push({ ip, port, ...r.json }); render(); }
        } catch { /* nothing there */ }
      }
    };
    const render = () => {
      box.textContent = '';
      if (!found.length) { box.innerHTML = `<div class="muted">${scanning ? 'Searching…' : `No QForge found on port ${port}. Check the web remote is on (QForge → Settings → Remote), or type the address below.`}</div>`; return; }
      for (const f of found.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }))) {
        const b = document.createElement('button');
        b.className = `host${base(cfg.host) === `http://${f.ip}:${f.port}` ? ' sel' : ''}`;
        const ok = KIND === 'output' ? f.rtc : true;
        b.innerHTML = `<span class="nm"></span><span class="meta"></span>${f.pinRequired ? '<span class="tag">PIN</span>' : ''}<span class="tag ${ok ? 'ok' : ''}">${KIND === 'output' ? (f.rtc ? `${(f.surfaces || []).length} OUTPUT${(f.surfaces || []).length === 1 ? '' : 'S'}` : 'NETWORK OFF') : 'READY'}</span>`;
        b.querySelector('.nm').textContent = f.name || f.ip;
        b.querySelector('.meta').textContent = `${f.ip}:${f.port}${f.show ? ` · ${f.show}` : ''}${f.version ? ` · v${f.version}` : ''}`;
        b.onclick = () => { $('#host').value = `${f.ip}${f.port === '8080' ? '' : ':' + f.port}`; cfg.host = $('#host').value; save(); render(); loadSurfaces(f); if (f.pinRequired) $('#pin').focus(); };
        box.append(b);
      }
    };
    await Promise.all(Array.from({ length: 48 }, worker));
    scanning = false; render();
  }
  function loadSurfaces(info) {
    const sel = $('#surface');
    const list = (info && info.surfaces) || [];
    sel.textContent = '';
    if (!list.length) { sel.append(new Option('Main output', '')); return; }
    for (const s of list) sel.append(new Option(s.name, s.id));
    sel.value = list.some((s) => s.id === cfg.surface) ? cfg.surface : list[0].id;
  }

  // ---- connection
  let es = null, pc = null, retryT = null, watchT = null, statsT = null, active = false, gen = 0, lastInfo = null;
  function teardown() {
    gen++;
    clearTimeout(retryT); clearTimeout(watchT); clearInterval(statsT);
    if (es) { es.close(); es = null; }
    if (pc) { try { pc.close(); } catch { /* ignore */ } pc = null; }
    const v = $('#vid'); v.srcObject = null;
  }
  function retry(why, ms = 3000) {
    if (!active) return;
    teardown();
    const g = gen;
    waiting(true, 'Waiting for QForge…', `${why} — trying again…`);
    retryT = setTimeout(() => { if (active && g === gen) connect(); }, ms);
  }
  async function connect() {
    teardown();
    const b = base(cfg.host);
    if (!b) { openPanel('Type the QForge address, or pick one from the list.', 'err'); return; }
    active = true;
    C.awake(true);
    const g = gen;
    waiting(true, 'Connecting…', b.replace('http://', ''));
    let info;
    try { info = (await fetchJson(`${b}/api/info`)).json; } catch { info = null; }
    if (g !== gen) return;
    if (!info || info.app !== 'QForge') return retry(`Can’t reach QForge at ${b.replace('http://', '')}`, 4000);
    lastInfo = info;
    loadSurfaces(info);
    if (KIND === 'sm') return connectSM(b, info, g);
    return connectOutput(b, info, g);
  }
  // Stage manager: the remote's SM view in a frame; watch the host and reload when it comes back
  function connectSM(b, info, g) {
    const fr = $('#frame');
    const want = withPin(`${b}/?view=${encodeURIComponent(cfg.view || 'sm')}`, cfg.pin);
    if (fr.dataset.src !== want) { fr.src = want; fr.dataset.src = want; }
    waiting(false);
    toast(`Connected to ${info.name || b.replace('http://', '')}${info.show ? ` — ${info.show}` : ''}`);
    C.title(`${NAME} — ${info.name || b.replace('http://', '')}`);
    let down = false;
    const watch = async () => {
      if (g !== gen) return;
      let ok = false;
      try { ok = (await fetchJson(`${b}/api/info`, {}, 2500)).json.app === 'QForge'; } catch { ok = false; }
      if (g !== gen) return;
      if (!ok && !down) { down = true; waiting(true, 'Lost connection to QForge', `${b.replace('http://', '')} — waiting for it to come back…`); }
      if (ok && down) { down = false; waiting(false); fr.src = want; toast('Reconnected'); }
      watchT = setTimeout(watch, 4000);
    };
    watchT = setTimeout(watch, 4000);
  }
  // Output: WebRTC — post an offer through QForge's remote server, get the answer on our event stream
  async function connectOutput(b, info, g) {
    if (!info.rtc) { active = false; openPanel('Network outputs are turned off in that QForge — QForge → Settings → Remote → Network displays.', 'err'); waiting(true, 'Network outputs are off', 'Turn them on in QForge → Settings → Remote'); return; }
    const surface = cfg.surface && (info.surfaces || []).some((s) => s.id === cfg.surface) ? cfg.surface : ((info.surfaces || [])[0] || {}).id || 'main';
    const sName = ((info.surfaces || []).find((s) => s.id === surface) || {}).name || 'Output';
    // check the PIN before opening the event stream
    try {
      const r = await fetchJson(withPin(`${b}/api/rtc/signal`, cfg.pin), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ type: 'bye', from: clientId }) });
      if (r.status === 403) { active = false; openPanel('Wrong PIN for that QForge.', 'err'); waiting(true, 'PIN needed', 'Press Esc and enter the QForge remote PIN'); return; }
      if (r.status === 404) { active = false; openPanel('Network outputs are turned off in that QForge.', 'err'); return; }
    } catch { return retry('QForge stopped answering'); }
    if (g !== gen) return;
    es = new EventSource(withPin(`${b}/rtc/events?id=${encodeURIComponent(clientId)}`, cfg.pin));
    const offer = async () => {
      if (g !== gen) return;
      if (pc) { try { pc.close(); } catch { /* ignore */ } }
      pc = new RTCPeerConnection({ iceServers: [] });
      const myPc = pc;
      pc.addTransceiver('video', { direction: 'recvonly' });
      if (cfg.sound) pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.ontrack = (e) => {
        const v = $('#vid');
        const st = e.streams && e.streams[0];
        if (st) { if (v.srcObject !== st) v.srcObject = st; }
        else { const cur = v.srcObject instanceof MediaStream ? v.srcObject : new MediaStream(); cur.addTrack(e.track); v.srcObject = cur; }
        applySound();
        v.play().catch(() => { v.muted = true; v.play().catch(() => {}); toast('Click once to allow sound', true); window.addEventListener('pointerdown', () => { applySound(); v.play().catch(() => {}); }, { once: true }); });
      };
      let dropT = null;
      pc.onconnectionstatechange = () => {
        if (myPc !== pc || g !== gen) return;
        const st = pc.connectionState;
        if (st === 'connected') {
          clearTimeout(dropT); clearTimeout(watchT);
          waiting(false);
          toast(`Showing “${sName}” from ${info.name || b.replace('http://', '')}`);
          C.title(`${NAME} — ${sName} · ${info.name || ''}`);
          if (cfg.stats) startStats();
        }
        if (st === 'disconnected') { clearTimeout(dropT); dropT = setTimeout(() => { if (myPc === pc && pc.connectionState !== 'connected') retry('Stream interrupted', 1500); }, 4000); }
        if (st === 'failed' || st === 'closed') retry('Stream stopped', 1500);
      };
      const off = await pc.createOffer();
      await pc.setLocalDescription({ type: 'offer', sdp: opusStereo(off.sdp) });
      await new Promise((res) => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, 2500); pc.addEventListener('icegatheringstatechange', () => { if (pc && pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });
      if (myPc !== pc || g !== gen) return;
      const name = `${me.hostname || 'Display'}${N > 1 ? ` (window ${N})` : ''}`;
      try {
        const r = await fetchJson(withPin(`${b}/api/rtc/signal`, cfg.pin), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ type: 'offer', from: clientId, surface, name, sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } }) });
        if (r.status !== 200) return retry(`QForge refused the stream (${r.status})`);
      } catch { return retry('QForge stopped answering'); }
      clearTimeout(watchT);
      watchT = setTimeout(() => { if (myPc === pc && pc.connectionState !== 'connected') retry('No picture from QForge yet'); }, 12000);
    };
    // 'hello' arrives every time the event stream (re)connects, e.g. after QForge restarts
    es.addEventListener('hello', () => { waiting(true, 'Connecting…', `${sName} · ${b.replace('http://', '')}`); offer().catch((e) => retry(e.message)); });
    es.addEventListener('rtc', async (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'answer' && pc && pc.signalingState === 'have-local-offer') { try { await pc.setRemoteDescription(m.sdp); } catch (err) { retry(err.message); } }
      if (m.type === 'error') { waiting(true, 'QForge couldn’t send this output', m.error); clearTimeout(watchT); retryT = setTimeout(() => { if (active && g === gen) offer(); }, 6000); }
      if (m.type === 'bye') retry('QForge stopped the stream', 4000);
    });
    es.onerror = () => { if (g === gen && es && es.readyState === EventSource.CLOSED) retry('Lost connection to QForge'); else if (g === gen && (!pc || pc.connectionState !== 'connected')) waiting(true, 'Waiting for QForge…', `${b.replace('http://', '')} isn’t answering — retrying…`); };
  }
  function applySound() {
    const v = $('#vid');
    v.muted = !cfg.sound;
    v.volume = Math.max(0, Math.min(1, (Number(cfg.volume) || 0) / 100));
    if (v.setSinkId && (v.sinkId || '') !== (cfg.sink || '')) v.setSinkId(cfg.sink || '').catch(() => toast('That sound output isn’t available — using the default', true));
  }
  async function loadSinks() {
    const sel = $('#sink'); const keep = cfg.sink;
    let outs = [];
    try { outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications'); } catch { /* none */ }
    sel.textContent = '';
    sel.append(new Option('System default', ''));
    outs.forEach((d, i) => sel.append(new Option(d.label || `Audio output ${i + 1}`, d.deviceId)));
    sel.value = outs.some((d) => d.deviceId === keep) ? keep : '';
  }
  function startStats() {
    clearInterval(statsT);
    const box = $('#stats-box');
    let lastBytes = 0, lastT = 0;
    statsT = setInterval(async () => {
      if (!pc) return;
      const st = await pc.getStats().catch(() => null); if (!st) return;
      let vtxt = '', atxt = '';
      st.forEach((r) => {
        if (r.type === 'inbound-rtp' && r.kind === 'video') {
          const now = r.timestamp, mbps = lastT ? (((r.bytesReceived - lastBytes) * 8) / ((now - lastT) / 1000)) / 1e6 : 0;
          lastBytes = r.bytesReceived; lastT = now;
          vtxt = `${r.frameWidth || '?'}×${r.frameHeight || '?'}  ${Math.round(r.framesPerSecond || 0)} fps\n${mbps.toFixed(1)} Mbit/s  lost ${r.packetsLost || 0}`;
        }
        if (r.type === 'inbound-rtp' && r.kind === 'audio') atxt = `\nsound ${cfg.sound ? (r.audioLevel != null ? `level ${Math.round(r.audioLevel * 100)}%` : 'on') : 'off'}  jitter ${Math.round((r.jitter || 0) * 1000)} ms`;
      });
      box.textContent = vtxt + atxt;
      box.hidden = !cfg.stats;
    }, 1000);
  }
  function disconnect() {
    active = false; teardown(); C.awake(false);
    const fr = $('#frame'); fr.removeAttribute('src'); delete fr.dataset.src;
    waiting(true, 'Disconnected', 'Press Esc to connect');
    C.title(NAME);
  }

  // ---- settings panel
  async function openPanel(msg, cls) {
    $('#panel').hidden = false;
    $('#host').value = cfg.host; $('#pin').value = cfg.pin; $('#fit').value = cfg.fit; $('#view').value = cfg.view;
    $('#fs').checked = !!cfg.fs; $('#auto').checked = !!cfg.auto; $('#stats').checked = !!cfg.stats;
    $('#sound').checked = !!cfg.sound; $('#vol').value = String(cfg.volume ?? 100); $('#vol-v').textContent = `${cfg.volume ?? 100}%`;
    if (KIND === 'output') loadSinks();
    const ds = await C.displays();
    const dsel = $('#display'); dsel.textContent = '';
    dsel.append(new Option('Keep where it is', ''));
    for (const d of ds) dsel.append(new Option(d.label, String(d.id)));
    dsel.value = ds.some((d) => String(d.id) === String(cfg.display)) ? String(cfg.display) : '';
    const li = await C.loginItem();
    $('#login-wrap').hidden = li == null; $('#login').checked = !!li;
    if (lastInfo) loadSurfaces(lastInfo);
    pstatus(msg || (active ? 'Connected — change settings and press Connect to apply.' : ''), cls);
    setTimeout(() => { if (!cfg.host) $('#host').focus(); }, 50);
    scan();
  }
  function closePanel() { $('#panel').hidden = true; }
  function readPanel() {
    cfg.host = $('#host').value.trim(); cfg.pin = $('#pin').value.trim();
    cfg.surface = $('#surface').value; cfg.fit = $('#fit').value; cfg.view = $('#view').value;
    cfg.display = $('#display').value; cfg.fs = $('#fs').checked; cfg.auto = $('#auto').checked; cfg.stats = $('#stats').checked;
    if (KIND === 'output') { cfg.sound = $('#sound').checked; cfg.volume = Number($('#vol').value); cfg.sink = $('#sink').value; }
    save(); applyLook();
  }
  function applyLook() { $('#vid').className = `fit-${cfg.fit || 'contain'}`; $('#stats-box').hidden = !cfg.stats || KIND !== 'output'; }
  $('#connect').onclick = async () => {
    readPanel();
    if (!base(cfg.host)) { pstatus('Type the QForge address first.', 'err'); return; }
    closePanel();
    await C.place({ displayId: cfg.display || null, fullscreen: cfg.fs });
    connect();
  };
  $('#disconnect').onclick = () => { disconnect(); pstatus('Disconnected.'); };
  $('#p-close').onclick = closePanel;
  $('#scan').onclick = () => scan();
  $('#newwin').onclick = () => C.newWindow();
  $('#login').onchange = () => C.loginItem($('#login').checked);
  for (const id of ['fit', 'stats', 'sink']) $(`#${id}`).addEventListener('change', () => { readPanel(); applySound(); if (cfg.stats && pc) startStats(); });
  $('#vol').addEventListener('input', () => { $('#vol-v').textContent = `${$('#vol').value}%`; readPanel(); applySound(); });
  $('#sound').addEventListener('change', () => {
    readPanel(); applySound();
    // turning sound on needs a new stream that includes it
    if (cfg.sound && active && pc && !pc.getTransceivers().some((t) => t.receiver.track && t.receiver.track.kind === 'audio')) connect();
  });
  // keyboard: M mutes / unmutes, + / - volume (when the panel is closed)
  document.addEventListener('keydown', (e) => {
    if (KIND !== 'output' || !$('#panel').hidden) return;
    if (e.key === 'm' || e.key === 'M') { cfg.sound = !cfg.sound; save(); applySound(); toast(cfg.sound ? 'Sound on' : 'Sound muted'); if (cfg.sound && active && pc && !pc.getTransceivers().some((t) => t.receiver.track && t.receiver.track.kind === 'audio')) connect(); }
    if (e.key === '+' || e.key === '=') { cfg.volume = Math.min(100, (Number(cfg.volume) || 0) + 5); save(); applySound(); toast(`Volume ${cfg.volume}%`); }
    if (e.key === '-' || e.key === '_') { cfg.volume = Math.max(0, (Number(cfg.volume) || 0) - 5); save(); applySound(); toast(`Volume ${cfg.volume}%`); }
  });
  $('#host').addEventListener('change', async () => {
    cfg.host = $('#host').value.trim(); save();
    const b = base(cfg.host); if (!b) return;
    try { const r = await fetchJson(`${b}/api/info`, {}, 2000); if (r.json.app === 'QForge') { loadSurfaces(r.json); pstatus(`Found ${r.json.name || 'QForge'}${r.json.show ? ` — ${r.json.show}` : ''}`, 'ok'); } } catch { pstatus('Nothing answering at that address yet.', 'err'); }
  });
  C.onMenu(() => { if ($('#panel').hidden) openPanel(); else closePanel(); });
  C.onReconnect(() => { if (cfg.host) connect(); });

  // hide the mouse pointer when it's not moving
  let curT = null;
  window.addEventListener('mousemove', () => { document.body.classList.remove('hide-cursor'); clearTimeout(curT); curT = setTimeout(() => { if ($('#panel').hidden) document.body.classList.add('hide-cursor'); }, 2500); });
  document.addEventListener('keydown', (e) => { if ((e.key === 'i' || e.key === 'I') && KIND === 'output' && $('#panel').hidden) { cfg.stats = !cfg.stats; save(); applyLook(); if (cfg.stats) startStats(); } });

  // ---- start
  (async () => {
    me = await C.net();
    applyLook();
    if (cfg.auto && cfg.host) {
      if (cfg.display || cfg.fs) await C.place({ displayId: cfg.display || null, fullscreen: cfg.fs });
      connect();
    } else { waiting(true, NAME, 'Press Esc or use the panel to connect to QForge'); openPanel(); }
  })();
  window.qfClient = { connect, disconnect, cfg: () => cfg, state: () => ({ active, pc: pc && pc.connectionState }) };
})();
