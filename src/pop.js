'use strict';
// Proof of play: one record per play (written by app.js when a cue finishes), and the report built from them.
window.QP = window.QP || {};

QP.POP = (() => {
  const KINDS = { audio: 'Audio', video: 'Video', image: 'Image', text: 'Text / title', camera: 'Camera', ndi: 'NDI® input' };
  const STATUS = { completed: 'Played in full', stopped: 'Stopped early', error: 'Error' };
  const VIA = { operator: 'Operator', remote: 'Web remote', osc: 'OSC', midi: 'MIDI', timecode: 'Timecode', schedule: 'Time of day', 'auto-follow': 'Auto-follow', group: 'Group / playlist', sync: 'Main computer (backup)' };
  const pad = (n) => String(n).padStart(2, '0');
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtDate = (t) => { const d = new Date(t); return isoDay(d); };
  const fmtTime = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const fmtDur = (s) => {
    if (s == null || !isFinite(s)) return '—';
    s = Math.max(0, Math.round(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const csvCell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const toCsv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

  // ---- date ranges
  function range(preset, from, to) {
    const now = new Date(); const t0 = dayStart(now); const day = 864e5;
    switch (preset) {
      case 'today': return { from: t0, to: now, label: `Today (${isoDay(t0)})` };
      case 'yesterday': { const a = new Date(t0 - day); return { from: a, to: new Date(t0 - 1), label: `Yesterday (${isoDay(a)})` }; }
      case 'week': { const a = new Date(t0 - 6 * day); return { from: a, to: now, label: `Last 7 days (${isoDay(a)} – ${isoDay(t0)})` }; }
      case 'month': { const a = new Date(now.getFullYear(), now.getMonth(), 1); return { from: a, to: now, label: `This month (${a.toLocaleString([], { month: 'long', year: 'numeric' })})` }; }
      case 'lastmonth': { const a = new Date(now.getFullYear(), now.getMonth() - 1, 1), b = new Date(now.getFullYear(), now.getMonth(), 1); return { from: a, to: new Date(b - 1), label: a.toLocaleString([], { month: 'long', year: 'numeric' }) }; }
      default: {
        const a = from ? new Date(`${from}T00:00:00`) : t0;
        const b = to ? new Date(`${to}T23:59:59.999`) : now;
        return { from: a, to: b, label: `${isoDay(a)} – ${isoDay(b)}` };
      }
    }
  }

  // ---- filtering and grouping
  function filter(entries, f = {}) {
    const q = (f.search || '').trim().toLowerCase();
    return entries.filter((e) => {
      if (!f.rehearsal && e.rehearsal) return false;
      if (f.completedOnly && e.status !== 'completed') return false;
      if (f.kind && e.kind !== f.kind) return false;
      if (f.show && e.show !== f.show) return false;
      if (f.output && e.output !== f.output) return false;
      if (q && ![e.name, e.file, e.cue, e.show, e.output, e.list, e.parent].some((v) => String(v || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }
  const keyOf = (e) => (e.path ? `f:${e.path}` : `c:${e.show}|${e.cueId || e.cue}|${e.name}`);
  function summarize(entries) {
    const map = new Map();
    for (const e of entries) {
      const k = keyOf(e);
      let r = map.get(k);
      if (!r) { r = { key: k, name: e.file || e.name, cue: e.cue, cueName: e.name, kind: e.kind, length: e.length, plays: 0, completed: 0, stopped: 0, errors: 0, total: 0, first: e.start, last: e.start, outputs: new Set(), shows: new Set(), days: new Set() }; map.set(k, r); }
      r.plays++; r.total += Number(e.played) || 0;
      if (e.status === 'completed') r.completed++; else if (e.status === 'error') r.errors++; else r.stopped++;
      if (e.start < r.first) r.first = e.start;
      if (e.start > r.last) r.last = e.start;
      if (e.output) r.outputs.add(e.output);
      if (e.show) r.shows.add(e.show);
      r.days.add(fmtDate(e.start));
      if (e.length && !r.length) r.length = e.length;
    }
    return [...map.values()].sort((a, b) => b.plays - a.plays || b.total - a.total || String(a.name).localeCompare(String(b.name)));
  }
  function totals(entries) {
    const t = { plays: entries.length, completed: 0, total: 0, media: new Set(), days: new Set() };
    for (const e of entries) { if (e.status === 'completed') t.completed++; t.total += Number(e.played) || 0; t.media.add(keyOf(e)); t.days.add(fmtDate(e.start)); }
    return { plays: t.plays, completed: t.completed, total: t.total, media: t.media.size, days: t.days.size };
  }

  // ---- exports
  function detailCsv(entries) {
    return toCsv([
      ['Date', 'Start', 'End', 'Played (s)', 'Played', 'Media length (s)', 'Status', 'Cue', 'Name', 'Type', 'Media file', 'Output', 'Cue list', 'Playlist / group', 'Show', 'Started by', 'Computer', 'Rehearsal', 'Media path'],
      ...entries.map((e) => [fmtDate(e.start), fmtTime(e.start), fmtTime(e.end), (Number(e.played) || 0).toFixed(1), fmtDur(e.played), e.length ? Number(e.length).toFixed(1) : '', STATUS[e.status] || e.status, e.cue, e.name, KINDS[e.kind] || e.kind, e.file, e.output, e.list, e.parent, e.show, VIA[e.via] || e.via, e.host, e.rehearsal ? 'yes' : '', e.path]),
    ]);
  }
  function summaryCsv(rows) {
    return toCsv([
      ['Media / cue', 'Cue', 'Type', 'Media length', 'Plays', 'Played in full', 'Stopped early', 'Total time played', 'Total seconds', 'Days played', 'First played', 'Last played', 'Outputs', 'Shows'],
      ...rows.map((r) => [r.name, r.cue, KINDS[r.kind] || r.kind, fmtDur(r.length), r.plays, r.completed, r.stopped + r.errors, fmtDur(r.total), Math.round(r.total), r.days.size, `${fmtDate(r.first)} ${fmtTime(r.first)}`, `${fmtDate(r.last)} ${fmtTime(r.last)}`, [...r.outputs].join('; '), [...r.shows].join('; ')]),
    ]);
  }
  // printable report (A4, saved as PDF by the desktop app)
  function html({ entries, rows, title, rangeLabel, filters, detail = true, generatedBy = 'QForge', host = '' }) {
    const t = totals(entries);
    const filt = [filters.show && `Show: ${filters.show}`, filters.output && `Output: ${filters.output}`, filters.kind && `Type: ${KINDS[filters.kind]}`, filters.search && `Search: “${filters.search}”`, filters.completedOnly && 'Full plays only', filters.rehearsal && 'Includes rehearsal plays'].filter(Boolean).join(' · ');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      @page { size: A4; margin: 14mm 12mm; }
      body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 10.5px; margin: 0; }
      h1 { font-size: 20px; margin: 0 0 2px; } .sub { color: #555; font-size: 11px; margin-bottom: 12px; }
      .tiles { display: flex; gap: 8px; margin: 10px 0 14px; } .tile { flex: 1; border: 1px solid #ccc; border-radius: 6px; padding: 7px 9px; }
      .tile b { display: block; font-size: 17px; } .tile span { color: #666; font-size: 9.5px; text-transform: uppercase; letter-spacing: .4px; }
      h2 { font-size: 13px; margin: 16px 0 6px; border-bottom: 2px solid #111; padding-bottom: 3px; }
      table { width: 100%; border-collapse: collapse; } th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .3px; color: #555; border-bottom: 1px solid #999; padding: 4px 5px; }
      td { padding: 3.5px 5px; border-bottom: 1px solid #e3e3e3; vertical-align: top; font-variant-numeric: tabular-nums; } tr { page-break-inside: avoid; }
      td.n, th.n { text-align: right; } .muted { color: #777; } .stopped { color: #a15c00; } .error { color: #b00020; }
      .foot { margin-top: 16px; color: #777; font-size: 9px; border-top: 1px solid #ccc; padding-top: 6px; }
    </style></head><body>
      <h1>${esc(title)}</h1>
      <div class="sub">${esc(rangeLabel)}${filt ? ` · ${esc(filt)}` : ''}<br>Generated ${esc(new Date().toLocaleString())}${host ? ` on ${esc(host)}` : ''} by ${esc(generatedBy)}</div>
      <div class="tiles">
        <div class="tile"><b>${t.plays}</b><span>Plays</span></div>
        <div class="tile"><b>${t.completed}</b><span>Played in full</span></div>
        <div class="tile"><b>${t.media}</b><span>Media items</span></div>
        <div class="tile"><b>${fmtDur(t.total)}</b><span>Total time played</span></div>
        <div class="tile"><b>${t.days}</b><span>Days</span></div>
      </div>
      <h2>Summary by media</h2>
      <table><tr><th>Media / cue</th><th>Type</th><th>Length</th><th class="n">Plays</th><th class="n">In full</th><th class="n">Total played</th><th>First played</th><th>Last played</th><th>Outputs</th></tr>
      ${rows.map((r) => `<tr><td><b>${esc(r.name)}</b>${r.cue ? ` <span class="muted">cue ${esc(r.cue)}</span>` : ''}${r.name !== r.cueName && r.cueName ? `<br><span class="muted">${esc(r.cueName)}</span>` : ''}</td><td>${esc(KINDS[r.kind] || r.kind)}</td><td>${fmtDur(r.length)}</td><td class="n">${r.plays}</td><td class="n">${r.completed}</td><td class="n">${fmtDur(r.total)}</td><td>${fmtDate(r.first)} ${fmtTime(r.first)}</td><td>${fmtDate(r.last)} ${fmtTime(r.last)}</td><td>${esc([...r.outputs].join(', '))}</td></tr>`).join('')}
      </table>
      ${detail ? `<h2>Play log</h2>
      <table><tr><th>Date</th><th>Start</th><th>End</th><th class="n">Played</th><th>Status</th><th>Media / cue</th><th>Output</th><th>Show</th><th>Started by</th></tr>
      ${entries.map((e) => `<tr><td>${fmtDate(e.start)}</td><td>${fmtTime(e.start)}</td><td>${fmtTime(e.end)}</td><td class="n">${fmtDur(e.played)}</td><td class="${e.status === 'completed' ? '' : e.status}">${esc(STATUS[e.status] || e.status)}${e.rehearsal ? ' <span class="muted">(rehearsal)</span>' : ''}</td><td>${esc(e.file || e.name)}${e.cue ? ` <span class="muted">· ${esc(e.cue)}</span>` : ''}</td><td>${esc(e.output || '')}</td><td>${esc(e.show || '')}</td><td>${esc(VIA[e.via] || e.via || '')}</td></tr>`).join('')}
      </table>` : ''}
      <div class="foot">Each play is recorded by ${esc(generatedBy)} as it happens: the time the cue's media started on its output, the time it ended, and how long it ran. “Played in full” means it reached its end; “Stopped early” means it was stopped, faded out or replaced before then.</div>
    </body></html>`;
  }
  return { KINDS, STATUS, VIA, range, filter, summarize, totals, detailCsv, summaryCsv, html, fmtDur, fmtDate, fmtTime, isoDay };
})();
