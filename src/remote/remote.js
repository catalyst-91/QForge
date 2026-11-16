'use strict';
// QForge web remote: control, live timeline, cue list, cart wall and stage manager view.
(() => {
  const $ = (s) => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  let pin = params.get('pin') || localStorage.getItem('qforge.pin') || '';
  let info = { pinRequired: false, viewPin: false };
  let st = null;          // last state
  let stAt = 0;           // performance.now() when received
  let es = null;
  let span = 120;
  let view = params.get('view') || localStorage.getItem('qforge.view') || 'control';

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (s) => {
    if (s == null || isNaN(s)) return '';
    if (!isFinite(s)) return '∞';
    const neg = s < 0; s = Math.abs(s);
    let out;
    if (s < 60) out = s.toFixed(1);
    else { const m = Math.floor(s / 60), r = Math.floor(s % 60); out = `${m}:${String(r).padStart(2, '0')}`; }
    return (neg ? '-' : '') + out;
  };
  const clock = (sec) => { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return `${h ? h + ':' : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`; };
  const age = () => (st ? (performance.now() - stAt) / 1000 : 0);
  const liveElapsed = (r) => r.elapsed + (r.paused ? 0 : age());
  let wavesLocal = localStorage.getItem('qforge.waves') !== '0';
  const waveSvgCache = new Map();
  function waveSvg(peaks) {
    let svg = waveSvgCache.get(peaks);
    if (!svg) {
      const v = peaks.split(',').map(Number);
      const bars = v.map((x, i) => { const hh = Math.max(1, (x / 99) * 18); return `<rect x="${i}" y="${(20 - hh) / 2 + 0}" width=".8" height="${hh.toFixed(1)}"/>`; }).join('');
      svg = `<svg viewBox="0 0 120 20" preserveAspectRatio="none">${bars}</svg>`;
      if (waveSvgCache.size > 50) waveSvgCache.clear();
      waveSvgCache.set(peaks, svg);
    }
    return svg;
  }
  document.addEventListener('keydown', (e) => { if ((e.key === 'w' || e.key === 'W') && !e.target.closest('input')) { wavesLocal = !wavesLocal; localStorage.setItem('qforge.waves', wavesLocal ? '1' : '0'); const b = document.getElementById('wavetoggle'); if (b) b.classList.toggle('on', wavesLocal); render(); } });
  const wb = document.getElementById('wavetoggle');
  if (wb) {
    wb.classList.toggle('on', wavesLocal);
    wb.addEventListener('click', () => { wavesLocal = !wavesLocal; localStorage.setItem('qforge.waves', wavesLocal ? '1' : '0'); wb.classList.toggle('on', wavesLocal); render(); });
  }

  // ---------------------------------------------------------------- views
  function setView(v) {
    view = v;
    localStorage.setItem('qforge.view', v);
    document.querySelectorAll('.view').forEach((el) => el.classList.toggle('on', el.id === `v-${v}`));
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    document.body.classList.toggle('smonly', params.get('view') === 'sm');
    document.body.classList.toggle('timeronly', params.get('view') === 'timer');
    render();
  }
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.v)));
  document.querySelectorAll('.tl-tools button[data-span]').forEach((b) => b.addEventListener('click', () => {
    span = Number(b.dataset.span);
    document.querySelectorAll('.tl-tools button[data-span]').forEach((x) => x.classList.toggle('on', x === b));
    renderTimeline();
  }));

  // ---------------------------------------------------------------- PIN + commands
  function askPin(msg) {
    return new Promise((resolve) => {
      $('#pin').classList.remove('hidden');
      $('#pin-err').textContent = msg || '';
      const inp = $('#pin-in');
      inp.value = ''; setTimeout(() => inp.focus(), 50);
      const done = () => { pin = inp.value.trim(); localStorage.setItem('qforge.pin', pin); $('#pin').classList.add('hidden'); resolve(pin); };
      $('#pin-ok').onclick = done;
      inp.onkeydown = (e) => { if (e.key === 'Enter') done(); };
    });
  }
  async function cmd(c, arg) {
    if (info.pinRequired && !pin) await askPin();
    const res = await fetch('/api/cmd', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-QForge-Pin': pin }, body: JSON.stringify({ cmd: c, arg }) }).catch(() => null);
    if (res && res.status === 403) { await askPin('Wrong PIN — try again'); return cmd(c, arg); }
    if (navigator.vibrate) navigator.vibrate(15);
  }
  $('#go').addEventListener('click', () => cmd('go'));
  document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => cmd(b.dataset.cmd)));
  $('#t-timer-box').addEventListener('click', () => cmd('timer-toggle'));
  $('#t-timer-box').addEventListener('dblclick', () => cmd('timer-reset'));

  // ---------------------------------------------------------------- connection
  async function connect() {
    try { info = await (await fetch('/api/info')).json(); } catch { setTimeout(connect, 2000); return; }
    if (info.viewPin && !pin) await askPin();
    if (es) es.close();
    es = new EventSource(`/events${pin ? `?pin=${encodeURIComponent(pin)}` : ''}`);
    es.onmessage = (e) => { try { st = JSON.parse(e.data); stAt = performance.now(); $('#conn').classList.add('ok'); render(); } catch { /* ignore */ } };
    es.onerror = async () => {
      $('#conn').classList.remove('ok');
      if (info.viewPin) {
        const r = await fetch(`/api/state?pin=${encodeURIComponent(pin)}`).catch(() => null);
        if (r && r.status === 403) { es.close(); await askPin('Wrong PIN — try again'); connect(); }
      }
    };
  }

  // ---------------------------------------------------------------- rendering
  function render() {
    if (!st || !st.ok) return;
    $('#rh').hidden = !st.rehearsal;
    document.body.classList.toggle('rehearsal', !!st.rehearsal);
    $('#showname').textContent = `${st.show}${st.role && st.role !== 'off' ? ' · ' + st.role.toUpperCase() : ''}`;
    if (view === 'control') renderControl();
    if (view === 'timeline') renderTimeline();
    if (view === 'cues') renderCues();
    if (view === 'cart') renderCart();
    if (view === 'sm') renderSM();
    if (view === 'timer') renderPresenter();
    if (view === 'timers') renderTimers();
  }
  // ---- stage timers: values move on smoothly between updates from QForge
  const tfmt = (sec, up) => {
    const neg = sec < 0; let s2 = Math.abs(sec);
    s2 = up ? Math.floor(s2) : Math.ceil(s2 - 1e-6);
    const h = Math.floor(s2 / 3600), m = Math.floor((s2 % 3600) / 60), x = s2 % 60;
    return `${neg ? '−' : ''}${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(x).padStart(2, '0')}`;
  };
  function liveTimer(v) {
    if (!v) return null;
    const dt = v.running ? age() : 0;
    let sec = v.sec + v.dir * dt;
    if (v.overtime === 'stop' && v.mode !== 'up' && sec < 0) sec = 0;
    let rem = v.rem == null ? null : v.rem - (v.running ? dt : 0);
    if (v.mode === 'tod' || v.mode === 'down') rem = sec;
    let phase = 'normal';
    if (rem != null) {
      if (rem < 0 || (rem <= 0 && v.mode !== 'up')) phase = 'over';
      else if (v.crit && rem <= v.crit) phase = 'crit';
      else if (v.warn && rem <= v.warn) phase = 'warn';
    }
    if (v.overtime === 'stop' && phase === 'over') phase = 'crit';
    const frac = v.total > 0 && rem != null ? Math.min(1, Math.max(0, 1 - rem / v.total)) : null;
    return { ...v, sec, rem, phase, frac, text: tfmt(sec, v.mode === 'up') };
  }
  function renderPresenter() {
    const sg = st.stage; if (!sg) return;
    const t = liveTimer(sg.onAir);
    const el = $('#pt-time');
    el.textContent = t ? t.text : '';
    document.body.dataset.phase = t ? t.phase : 'normal';
    $('#pt-name').textContent = t ? t.name : '';
    $('#pt-bar i').style.width = t && t.frac != null ? `${(t.frac * 100).toFixed(1)}%` : '0%';
    $('#pt-bar').style.visibility = t && t.frac != null ? 'visible' : 'hidden';
    const m = $('#pt-msg');
    m.hidden = !(sg.msg && sg.msg.text);
    if (!m.hidden && m.textContent !== sg.msg.text) m.textContent = sg.msg.text;
    m.classList.toggle('flash', !!(sg.msg && sg.msg.flash));
    document.body.classList.toggle('has-msg', !m.hidden);
    $('#pt-clock').textContent = sg.clock ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    // shrink the digits to fit long times
    const len = el.textContent.length;
    el.style.fontSize = `min(${len > 7 ? 21 : len > 5 ? 27 : 34}vw, ${document.body.classList.contains('has-msg') ? 38 : 58}vh)`;
  }
  let tmSig = '';
  function renderTimers() {
    const sg = st.stage; if (!sg) return;
    const sig = JSON.stringify(sg.timers.map((t) => [t.id, t.name, t.mode, t.running])) + (sg.onAir && sg.onAir.id);
    const list = $('#tm-list');
    if (sig !== tmSig) {
      tmSig = sig;
      list.innerHTML = sg.timers.map((t) => `<div class="tm" data-id="${esc(t.id)}">
        <div class="tm-head"><b>${esc(t.name)}</b>${sg.onAir && sg.onAir.id === t.id ? '<span class="air">ON AIR</span>' : `<button class="tm-airbtn" data-a="onair">Put on air</button>`}</div>
        <div class="tm-time">0:00</div>
        <div class="tm-bar"><i></i></div>
        <div class="tm-btns">${t.mode === 'tod' ? '' : `<button class="ctl small ${t.running ? 'on' : ''}" data-a="toggle">${t.running ? '❚❚ Pause' : '▶ Start'}</button><button class="ctl small ghost" data-a="reset">↺ Reset</button>`}
        <button class="ctl small ghost" data-a="add" data-v="-60">−1:00</button><button class="ctl small ghost" data-a="add" data-v="-10">−0:10</button><button class="ctl small ghost" data-a="add" data-v="10">+0:10</button><button class="ctl small ghost" data-a="add" data-v="60">+1:00</button></div>
      </div>`).join('');
      list.querySelectorAll('button[data-a]').forEach((b) => b.addEventListener('click', () => {
        const id = b.closest('.tm').dataset.id;
        cmd('stimer', { action: b.dataset.a, id, value: Number(b.dataset.v) || 0 });
      }));
      const pr = $('#tm-presets');
      pr.innerHTML = (sg.presets || []).map((p) => `<button class="chip">${esc(p)}</button>`).join('');
      pr.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => cmd('stimer', { action: 'message', text: b.textContent, flash: $('#tm-flash').checked })));
    }
    for (const v of sg.timers) {
      const row = list.querySelector(`.tm[data-id="${CSS.escape(v.id)}"]`); if (!row) continue;
      const t = liveTimer(v);
      const te = row.querySelector('.tm-time'); te.textContent = t.text; te.dataset.phase = t.phase;
      row.querySelector('.tm-bar i').style.width = t.frac != null ? `${(t.frac * 100).toFixed(1)}%` : '0%';
      row.querySelector('.tm-bar').dataset.phase = t.phase;
    }
    $('#tm-cur').textContent = sg.msg && sg.msg.text ? `Showing: “${sg.msg.text}”` : '';
  }
  $('#tm-send').addEventListener('click', () => { cmd('stimer', { action: 'message', text: $('#tm-msg').value.trim(), flash: $('#tm-flash').checked }); });
  $('#tm-msg').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#tm-send').click(); });
  $('#tm-clear').addEventListener('click', () => { $('#tm-msg').value = ''; cmd('stimer', { action: 'clearmsg' }); });
  function timers() {
    const tmr = st.timer || { elapsed: 0, running: false };
    const t = tmr.elapsed + (tmr.running ? age() : 0);
    const rem = st.remain ? Math.max(0, st.remain.s - age()) : null;
    return { t: clock(t), rem: rem != null ? `-${clock(Math.ceil(rem))}` : '—', now: new Date() };
  }
  function activeHtml(bigControls) {
    if (!st.runs.length) return '<div class="empty">Nothing running</div>';
    const order = [];
    const add = (p) => st.runs.filter((r) => r.parent === p).forEach((r) => { order.push(r); add(r.id); });
    add(null);
    st.runs.forEach((r) => { if (!order.includes(r)) order.push(r); });
    return order.map((r) => {
      const el = liveElapsed(r);
      const countdown = r.state === 'prewait' || r.state === 'post';
      const rem = r.total != null ? r.total - el : null;
      const p = r.total ? Math.min(1, Math.max(0, el / r.total)) : 1;
      return `<div class="act${r.paused ? ' paused' : ''}${r.parent ? ' child' : ''}" style="${r.color ? `--c:${r.color}` : ''}">
        <div class="row1"><div class="nm"><b>${esc(r.num)}</b>${esc(r.name)}</div>
        ${bigControls ? `<button class="ab" data-run-pause="${r.id}">${r.paused ? '▶' : '❚❚'}</button><button class="ab" data-run-stop="${r.id}">■</button>` : ''}</div>
        <div class="meta"><span>${esc(r.phase)}</span><span>${countdown ? `-${fmt(Math.max(0, rem))}` : `${fmt(el)}${rem != null ? ' / -' + fmt(Math.max(0, rem)) : ''}`}</span></div>
        ${r.wave && wavesLocal && st.waves ? `<div class="wave" style="--p:${((r.wpos ?? p) * 100).toFixed(2)}%">${waveSvg(r.wave)}<div class="played">${waveSvg(r.wave)}</div><i></i></div>` : `<div class="bar"><i style="width:${(p * 100).toFixed(1)}%"></i></div>`}</div>`;
    }).join('');
  }
  function bindRunButtons(root) {
    root.querySelectorAll('[data-run-pause]').forEach((b) => (b.onclick = () => cmd('pauserun', b.dataset.runPause)));
    root.querySelectorAll('[data-run-stop]').forEach((b) => (b.onclick = () => cmd('stoprun', b.dataset.runStop)));
  }
  function deptHtml(ph) {
    if (!ph) return '';
    const items = [['SOUND', ph.sound], ['LX', ph.lights], ['VIDEO', ph.video]].filter(([, v]) => v);
    return items.length ? `<div class="dept">${items.map(([k, v]) => `<div><b>${k}</b>${esc(v)}</div>`).join('')}</div>` : '';
  }
  function renderControl() {
    const ph = st.playhead;
    $('#sb-dept').innerHTML = deptHtml(ph);
    $('#sb-num').textContent = ph ? ph.num : '';
    $('#sb-name').textContent = ph ? ph.name : '— end of cue list —';
    $('#sb-notes').textContent = ph ? ph.notes : '';
    $('#go').disabled = !ph;
    const t = timers();
    $('#t-clock').textContent = t.now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    $('#t-timer').textContent = t.t;
    $('#t-timer-box').classList.toggle('on', !!(st.timer && st.timer.running));
    $('#t-remain').textContent = t.rem;
    const a = $('#active');
    a.innerHTML = activeHtml(true);
    bindRunButtons(a);
  }
  function renderSM() {
    const t = timers();
    $('#sm-clock').textContent = t.now.toLocaleTimeString([], { hour12: false });
    $('#sm-timer').textContent = t.t;
    $('#sm-remain').textContent = t.rem;
    const ph = st.playhead;
    $('#sm-num').textContent = ph ? ph.num : '';
    $('#sm-name').textContent = ph ? ph.name : '— end of cue list —';
    $('#sm-notes').textContent = ph ? ph.notes : '';
    $('#sm-dept').innerHTML = deptHtml(ph);
    const ss = st.showStart != null ? st.showStart - age() : null;
    $('#sm-start-box').hidden = ss == null;
    if (ss != null) {
      $('#sm-start-lbl').textContent = ss > 0 ? 'SHOW STARTS IN' : 'SHOW STARTED';
      $('#sm-start').textContent = ss > 0 ? clock(Math.ceil(ss)) : `+${clock(-ss)}`;
      $('#sm-start-box').classList.toggle('soon', ss > 0 && ss <= 300);
    }
    $('#sm-active').innerHTML = activeHtml(false);
    const sg = st.stage;
    const box = $('#sm-stage-box');
    const stt = sg && sg.showOnSm ? liveTimer(sg.onAir) : null;
    box.hidden = !stt;
    if (stt) { $('#sm-stage-lbl').textContent = stt.name.toUpperCase(); $('#sm-stage').textContent = stt.text; box.dataset.phase = stt.phase; }
    const sm = $('#sm-msg');
    const msg = sg && sg.showOnSm && sg.msg && sg.msg.text ? sg.msg.text : '';
    sm.hidden = !msg; if (msg) sm.textContent = `Presenter message: ${msg}`;
    const nx = st.upNext || [];
    $('#sm-next').innerHTML = nx.length ? nx.map((c, i) => `<div class="nx${i === 0 ? ' first' : ''}" style="${c.color ? `--c:${c.color}` : ''}">
        <div class="nx-row"><b>${esc(c.num)}</b><span class="nx-name">${esc(c.name)}</span>${c.dur > 0 ? `<span class="nx-dur">${clock(c.dur)}</span>` : ''}</div>
        ${c.notes ? `<div class="nx-notes">${esc(c.notes)}</div>` : ''}${c.chain ? `<div class="nx-chain">+ ${c.chain} cue${c.chain > 1 ? 's' : ''} follow automatically</div>` : ''}</div>`).join('') : '<div class="empty">Nothing after standby</div>';
  }
  function renderCues() {
    $('#listtabs').innerHTML = st.lists.length > 1 ? st.lists.map((n, i) => `<button data-list="${i}" class="${i === st.listIdx ? 'on' : ''}">${esc(n)}</button>`).join('') : '';
    $('#listtabs').querySelectorAll('[data-list]').forEach((b) => (b.onclick = () => cmd('list', Number(b.dataset.list))));
    const running = new Set(st.runs.map((r) => r.cueId));
    $('#cuelist').innerHTML = st.cues.map((c) => `<div class="cue${st.playhead && st.playhead.id === c.id ? ' ph' : ''}${running.has(c.id) ? ' run' : ''}" style="padding-left:${12 + c.depth * 18}px">
      <span class="n">${esc(c.num)}</span>
      <div class="nm"><div>${esc(c.name)}</div><small>${esc(c.type)}${c.mode ? ' · ' + esc(c.mode) : ''}${c.cont !== 'none' ? ' · ' + (c.cont === 'auto-continue' ? 'auto-continue' : 'auto-follow') : ''}</small></div>
      <span class="d">${c.dur == null ? '' : c.dur < 0 ? '∞' : fmt(c.dur)}</span>
      <button data-sel="${c.id}">Standby</button>${running.has(c.id) ? `<button data-stop="${c.id}">Stop</button>` : `<button data-fire="${c.id}">Fire</button>`}
      ${c.color ? `<span class="cb" style="background:${esc(c.color)}"></span>` : ''}</div>`).join('') || '<div class="empty">No cues</div>';
    const root = $('#cuelist');
    root.querySelectorAll('[data-sel]').forEach((b) => (b.onclick = () => cmd('select', b.dataset.sel)));
    root.querySelectorAll('[data-fire]').forEach((b) => (b.onclick = () => cmd('fire', b.dataset.fire)));
    root.querySelectorAll('[data-stop]').forEach((b) => (b.onclick = () => cmd('stop', b.dataset.stop)));
  }
  function renderCart() {
    const el = $('#cart');
    el.innerHTML = st.cart.map((p, i) => (p
      ? `<button class="rpad on${p.playing ? ' playing' : ''}" style="${p.color ? `--c:${p.color}` : ''}" data-pad="${i}"><small>${i + 1}</small>${esc(p.name)}</button>`
      : `<div class="rpad empty"><small>${i + 1}</small></div>`)).join('');
    el.querySelectorAll('[data-pad]').forEach((b) => (b.onclick = () => cmd('cart', Number(b.dataset.pad))));
  }

  // ---------------------------------------------------------------- live timeline
  function renderTimeline() {
    if (!st) return;
    const box = $('#timeline');
    const W = box.clientWidth;
    const past = span * 0.15;          // seconds of history visible
    const x = (t) => ((t + past) / span) * W;
    // axis
    const axis = $('#tl-axis');
    let step = span <= 60 ? 10 : span <= 120 ? 15 : span <= 300 ? 30 : 60;
    let ticks = '';
    for (let t = -Math.floor(past / step) * step; t <= span - past; t += step) ticks += `<div class="tick" style="left:${x(t)}px"><span>${t === 0 ? 'now' : (t > 0 ? '+' : '') + fmt(t)}</span></div>`;
    axis.innerHTML = ticks;
    $('#tl-now').style.left = `${x(0)}px`;
    $('#tl-tc').textContent = st.tc ? `TC ${st.tc}` : '';
    const rows = [];
    const bar = (cls, t0, t1, label, color, extra = '') => {
      const left = Math.max(-2, x(t0));
      const right = t1 == null ? W + 4 : Math.min(W + 4, x(t1));
      if (right < 0 || left > W) return '';
      return `<div class="tl-bar ${cls}${t1 == null ? ' inf' : ''}${extra}" style="left:${left}px;width:${Math.max(3, right - left)}px">${color ? `<span class="c" style="background:${esc(color)}"></span>` : ''}${esc(label)}</div>`;
    };
    // running cues (parents before children)
    const order = [];
    const add = (p, d) => st.runs.filter((r) => r.parent === p).forEach((r) => { order.push([r, d]); add(r.id, d + 1); });
    add(null, 0);
    const cueDur = new Map(st.cues.map((c) => [c.id, c.dur]));
    for (const [r, d] of order) {
      const el = liveElapsed(r);
      const label = `${'  '.repeat(d)}${r.num ? r.num + ' · ' : ''}${r.name}`;
      let html = '';
      if (r.state === 'prewait') {
        const start = -el, end = start + (r.total || 0);
        html += bar('pre', start, end, `${label} (pre-wait)`, r.color);
        const dur = cueDur.get(r.cueId);
        html += bar('pred', end, dur == null ? end + 3 : dur < 0 ? null : end + dur, label, null);
      } else if (r.state === 'post') {
        html += bar('post', -el, -el + (r.total || 0), `${label} (post-wait)`, r.color);
      } else {
        html += bar(`run${r.paused ? ' paused' : ''}`, -el, r.total == null ? null : -el + r.total, `${label}${r.paused ? ' — paused' : ''}`, r.color);
      }
      rows.push(`<div class="tl-row">${html}</div>`);
    }
    if (!order.length) rows.push('<div class="tl-row" style="color:var(--dim);font-size:13px;padding:8px 12px">Nothing running</div>');
    // forecast: what happens if GO is pressed now
    if ($('#tl-pred').checked && st.playhead) {
      const idx = st.cues.findIndex((c) => c.id === st.playhead.id);
      if (idx >= 0) {
        rows.push('<div class="tl-sep">IF GO NOW</div>');
        const depth = st.cues[idx].depth;
        let t = 0, i = idx, n = 0;
        while (i < st.cues.length && n < 12) {
          const c = st.cues[i];
          if (c.depth !== depth) { i++; continue; }
          const start = t + c.pre;
          const end = c.dur == null ? start + 2 : c.dur < 0 ? null : start + c.dur;
          let html = '';
          if (c.pre > 0) html += bar('pre', t, start, '', null);
          html += bar('pred', start, end, `${c.num ? c.num + ' · ' : ''}${c.name}${c.dur == null ? ' (length unknown)' : ''}`, c.color);
          rows.push(`<div class="tl-row">${html}</div>`);
          n++;
          if (c.cont === 'auto-continue') t = start + c.post;
          else if (c.cont === 'auto-follow' && end != null) t = end;
          else break;
          i++;
          while (i < st.cues.length && st.cues[i].depth > depth) i++;
          if (i < st.cues.length && st.cues[i].depth < depth) break;
        }
      }
    }
    $('#tl-rows').innerHTML = rows.join('');
  }

  // smooth animation between server updates
  function loop() {
    if (st) {
      if (view === 'timeline') renderTimeline();
      else if (view === 'timer') renderPresenter();
      else if (view === 'timers') { if (performance.now() - lastTouch > 300) renderTimers(); }
      else if (view === 'control' || view === 'sm') {
        // only refresh the time-dependent bits cheaply
        if (view === 'control' && performance.now() - lastTouch > 500) { const a = $('#active'); a.innerHTML = activeHtml(true); bindRunButtons(a); const t = timers(); $('#t-timer').textContent = t.t; $('#t-remain').textContent = t.rem; }
        else renderSM();
      }
    }
    setTimeout(() => requestAnimationFrame(loop), view === 'timeline' ? 50 : view === 'timer' ? 100 : 200);
  }
  let lastTouch = 0;
  document.addEventListener('pointerdown', () => { lastTouch = performance.now(); }, true);
  window.addEventListener('resize', () => { if (view === 'timeline') renderTimeline(); });
  // keep the phone / tablet screen awake while the remote is open
  let wakeLock = null;
  async function keepAwake() {
    if (!('wakeLock' in navigator)) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); $('#wake').hidden = true; wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    catch { $('#wake').hidden = false; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !wakeLock) keepAwake(); });
  document.addEventListener('pointerdown', () => { if (!wakeLock) keepAwake(); });
  keepAwake();
  setView(['control', 'timeline', 'cues', 'cart', 'sm', 'timer', 'timers'].includes(view) ? view : 'control');
  connect();
  loop();
})();
