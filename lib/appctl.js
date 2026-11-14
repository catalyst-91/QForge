'use strict';
// Control music apps running on this computer (Spotify, Apple Music / iTunes, any media player)
// and the system volume. macOS uses AppleScript; Windows uses media keys and the Core Audio API
// through PowerShell; Linux uses playerctl / pactl when installed.
const { execFile } = require('child_process');

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

function run(cmd, args, timeout = 15000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err && err.code === 'ENOENT') resolve({ ok: false, error: `${cmd} isn’t installed on this computer` });
      else if (err) resolve({ ok: false, error: (stderr || err.message || '').toString().trim().split('\n').pop() });
      else resolve({ ok: true, out: String(stdout || '').trim() });
    });
  });
}
const asq = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const osa = (script) => run('osascript', ['-e', script]);
const ps = (script, timeout) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], timeout);

// ---------------------------------------------------------------- macOS
const MAC_APP = { spotify: 'Spotify', music: 'Music' };
async function mac({ app, action, value, uri, fade }) {
  if (app === 'system') {
    if (action === 'volume') return osa(`set volume output volume ${Math.round(value)}`);
    if (action === 'mute') return osa('set volume with output muted');
    if (action === 'unmute') return osa('set volume without output muted');
    if (action === 'fadeVolume') return macFade('system', value, fade);
    // media keys for "any player": fall back to whichever of Spotify / Music is running
    for (const a of ['spotify', 'music']) {
      const r = await osa(`application "${MAC_APP[a]}" is running`);
      if (r.ok && r.out === 'true') return mac({ app: a, action, value, uri, fade });
    }
    return { ok: false, error: 'No supported player is running (Spotify or Music)' };
  }
  const name = MAC_APP[app];
  if (!name) return { ok: false, error: `Unknown app ${app}` };
  const running = await osa(`application "${name}" is running`);
  if (!(running.ok && running.out === 'true') && !['play', 'playUri'].includes(action)) return { ok: false, error: `${name} is not running` };
  const back = app === 'spotify' ? 'previous track' : 'back track';
  const cmds = {
    play: 'play', pause: 'pause', playpause: 'playpause', stop: app === 'spotify' ? 'pause' : 'stop',
    next: 'next track', previous: back,
    volume: `set sound volume to ${Math.round(value)}`,
    shuffleOn: app === 'spotify' ? 'set shuffling to true' : 'set shuffle enabled to true',
    shuffleOff: app === 'spotify' ? 'set shuffling to false' : 'set shuffle enabled to false',
  };
  if (action === 'fadeVolume') return macFade(app, value, fade);
  if (action === 'playUri') {
    if (!uri) return { ok: false, error: 'No track / playlist given' };
    if (app === 'spotify') return osa(`tell application "Spotify" to play track "${asq(uri)}"`);
    return osa(`tell application "Music" to play playlist "${asq(uri)}"`);
  }
  if (action === 'nowPlaying') {
    const r = await osa(`tell application "${name}" to if player state is playing then return (name of current track) & " — " & (artist of current track)`);
    return r.ok ? { ok: true, info: r.out || 'Nothing playing' } : r;
  }
  if (!cmds[action]) return { ok: false, error: `Unsupported action ${action}` };
  return osa(`tell application "${name}" to ${cmds[action]}`);
}
async function macFade(app, to, secs) {
  const steps = Math.max(1, Math.round((Number(secs) || 0) * 10));
  const getter = app === 'system' ? 'output volume of (get volume settings)' : `tell application "${MAC_APP[app]}" to get sound volume`;
  const setter = (v) => (app === 'system' ? `set volume output volume ${v}` : `tell application "${MAC_APP[app]}" to set sound volume to ${v}`);
  const cur = await osa(getter);
  const from = cur.ok ? Number(cur.out) || 0 : 50;
  // one AppleScript loop so the fade is smooth and doesn't spawn a process per step
  const script = `repeat with i from 1 to ${steps}\n${setter(`(round (${from} + (${Number(to)} - ${from}) * i / ${steps}))`)}\ndelay ${((Number(secs) || 0) / steps).toFixed(3)}\nend repeat`;
  return osa(script);
}

// ---------------------------------------------------------------- Windows
const WIN_AUDIO = `
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume { int f(); int g(); int h(); int i(); int SetMasterVolumeLevelScalar(float fLevel, Guid ctx); int j(); int GetMasterVolumeLevelScalar(out float pfLevel); int k(); int l(); int m(); int n(); int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid ctx); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ep); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public class QfVol {
  static IAudioEndpointVolume V() { var e = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator; IMMDevice d; e.GetDefaultAudioEndpoint(0, 1, out d); var id = typeof(IAudioEndpointVolume).GUID; object o; d.Activate(ref id, 23, IntPtr.Zero, out o); return o as IAudioEndpointVolume; }
  public static float Get() { float v; V().GetMasterVolumeLevelScalar(out v); return v; }
  public static void Set(float v) { V().SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, v)), Guid.Empty); }
  public static void Mute(bool m) { V().SetMute(m, Guid.Empty); }
}
'@
`;
const VK = { playpause: 179, play: 179, pause: 179, next: 176, previous: 177, stop: 178 };
async function win({ app, action, value, uri, fade }) {
  if (action === 'playUri') {
    if (!uri) return { ok: false, error: 'No track / playlist given' };
    if (app === 'spotify' && /^spotify:/.test(uri)) return ps(`Start-Process "${uri.replace(/"/g, '')}"`);
    return { ok: false, error: 'Playing a specific item needs a spotify: link (Apple Music for Windows has no scripting)' };
  }
  if (['volume', 'fadeVolume', 'mute', 'unmute'].includes(action)) {
    if (app !== 'system') return { ok: false, error: 'On Windows only the system volume can be set — choose “System / any player”' };
    if (action === 'mute' || action === 'unmute') return ps(`${WIN_AUDIO}[QfVol]::Mute($${action === 'mute'})`);
    const to = Math.max(0, Math.min(100, Number(value) || 0)) / 100;
    if (action === 'volume' || !(Number(fade) > 0)) return ps(`${WIN_AUDIO}[QfVol]::Set(${to})`);
    const steps = Math.max(1, Math.round(Number(fade) * 20));
    return ps(`${WIN_AUDIO}$f=[QfVol]::Get(); for($i=1;$i -le ${steps};$i++){[QfVol]::Set($f+(${to}-$f)*$i/${steps}); Start-Sleep -Milliseconds ${Math.round((Number(fade) * 1000) / steps)}}`, (Number(fade) + 15) * 1000);
  }
  if (action === 'nowPlaying') {
    const r = await ps('(Get-Process Spotify -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowTitle} | Select-Object -First 1).MainWindowTitle');
    return r.ok ? { ok: true, info: r.out || 'Spotify not playing / not running' } : r;
  }
  const vk = VK[action];
  if (!vk) return { ok: false, error: `Unsupported action ${action} on Windows` };
  // media keys reach whichever app owns the system media session (Spotify, Apple Music, browsers, VLC…)
  return ps(`$w=New-Object -ComObject WScript.Shell; $w.SendKeys([char]${vk})`);
}

// ---------------------------------------------------------------- Linux
async function linux({ app, action, value, uri, fade }) {
  const player = app === 'spotify' ? ['-p', 'spotify'] : [];
  if (action === 'volume' || action === 'fadeVolume') {
    if (app === 'system') return run('pactl', ['set-sink-volume', '@DEFAULT_SINK@', `${Math.round(value)}%`]);
    return run('playerctl', [...player, 'volume', String((Number(value) || 0) / 100)]);
  }
  if (action === 'playUri') return run('playerctl', [...player, 'open', uri || '']);
  if (action === 'nowPlaying') { const r = await run('playerctl', [...player, 'metadata', '--format', '{{title}} — {{artist}}']); return r.ok ? { ok: true, info: r.out } : r; }
  const map = { play: 'play', pause: 'pause', playpause: 'play-pause', stop: 'stop', next: 'next', previous: 'previous' };
  if (!map[action]) return { ok: false, error: `Unsupported action ${action}` };
  return run('playerctl', [...player, map[action]]);
}

async function control(req) {
  try {
    const r = isMac ? await mac(req) : isWin ? await win(req) : await linux(req);
    return r.ok ? { ok: true, info: r.info || '' } : r;
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { control };
