# Changelog

All notable changes to QForge, newest first.

## 1.7.1

- **Outputs are sent from what QForge plays, not from the screen.** Network outputs (QForge Output) and NDI® outputs now take the picture straight from QForge's own rendering of the output (Chromium page capture). Nothing on your desktop is shared. macOS no longer asks for Screen Recording permission, and covered output windows still send correctly. The same applies to "Send this window as an NDI® source" in Stage Manager and Output.
- **Virtual outputs.** The old "NDI capture window" option becomes **Virtual output** (Settings ▸ Video outputs). It plays the output at a fixed size (720p to 4K, or portrait) in an invisible, click-through window that uses no display, purely for NDI® or QForge Output.
- **Video player on the stage manager screen.** A live, movable and resizable player of any output, with optional sound.
  - **Stage Manager app:** choose *Video player* in its settings.
  - **Browser SM screen:** press **▶ Video** or **P**.
  - Needs network outputs turned on in QForge (Settings ▸ Remote & network).

## 1.7.0

- **NDI®¹ in all three apps.**
  - **QForge sends outputs as NDI sources.** Tick *Send* next to any output in the new **Settings ▸ NDI®** tab. The picture goes out at 720p to 4K and 25 to 59.94 fps, with the show's main mix as sound. The status bar shows each NDI output and how many receivers are watching.
  - **QForge receives NDI sources.** Camera cues have a new **Input: NDI® source** option, and **Show ▸ New NDI® Input Cue** adds one. Pick from the sources found on the network. Options: play the source's sound (with level), low-bandwidth mode. NDI inputs work with keying, mapping, transitions and crossfades like any camera.
  - **QForge Output shows any NDI source** full screen, with sound, volume and speaker choice. It reconnects on its own and remembers the source.
  - **Stage Manager and Output can send their own window as an NDI source.** For example, put the stage-manager or presenter-timer screen into a vision mixer.
  - Sources are found automatically. An optional list of IP addresses finds sources on other subnets or where multicast is blocked.
  - The Mac apps include the NDI runtime. On Windows, install the free NDI 6 Runtime (Settings ▸ NDI® links to it).
  - Installers now show a licence page covering the NDI terms. The About box, Help menu and README carry the NDI® notice and a link to ndi.video.
- The Mac apps ask for **Local Network** access (needed for NDI discovery).

¹ NDI® is a registered trademark of Vizrt NDI AB.

## 1.6.1

- **Stage timers:** named presenter or segment timers, like dedicated stage-timer software.
  - Modes: count down, count up, or count down to a time of day.
  - Yellow and red warnings, then overtime that keeps counting and flashes (or stops at zero).
  - Live start, pause, reset, ±1 min / ±10 s and "set exact time".
  - Messages to the presenter, with quick presets and flash.
- **Where timers show:**
  - A new **Stage Timer** panel in QForge.
  - A full-screen **presenter view** (`/?view=timer`) for confidence monitors.
  - A **timer control** page for phones (`/?view=timers`).
  - The Stage Manager screen.
  - Text cues on video outputs (`{timer}`, `{timer:Name}`).
- **Timer control:** a new **Stage Timer cue** controls timers from the cue list. You can also use OSC `/timer/...`, MIDI learn and Ctrl/⌘+Shift+T.
- **Up Next on the Stage Manager screen:** the next cues after standby, with notes, duration and auto-follow info.
- **Stage Manager and Output apps:** new **Port** field, and network search also checks ports 8081–8083.
- **Fix:** if port 8080 is already used by another app (e.g. PIXORA), the web remote now moves to the next free port instead of failing with "Remote error". The Remote & network settings and a notice show which port it's using. You can also click the status-bar remote indicator to open those settings.

## 1.6

- **Three separate apps:** QForge, QForge Stage Manager and QForge Output, each with a proper installer (Windows setup .exe, Mac .dmg) built automatically on GitHub.
- **Network displays:** QForge streams any video output to QForge Output apps over the network: live WebRTC video plus lip-synced stereo sound (the show's main mix, including video soundtracks).
  - Pick the quality: 720p, 1080p30, 1080p60 or 4K30.
  - The status bar shows how many displays are connected.
  - Settings → Remote lists each connected display and lets you disconnect it.
- **Stage Manager app:** a dedicated full-screen stage-manager display that finds QForge on the network and survives QForge restarts.
- **Auto-discovery:** the companion apps scan the local network for QForge, showing each machine's name, show and PIN status.
- **Sound on displays:** play or mute the sound and set the volume per display (M, +/−), and send it to any speaker or HDMI output on that computer.
- **Unattended screens:** full screen on a chosen display, connect on launch, start with the computer, keep the display awake, and a hidden mouse pointer.

## 1.5

- **Preview and Program monitors (right-hand panel)**
  - *Preview* shows the cue in standby: video with a scrub bar and IN/OUT buttons, images, text, a live camera picture, a waveform for audio, or a group's contents.
  - *Program* is a live mirror of what's on the outputs, with Blackout and Screenshot buttons.
  - *Now Playing* lists running cues, with waveforms.
  - Close any panel with ×. Reopen it from the **Panels** button or the View menu (Ctrl/⌘+Alt+1/2/3).
- **Minimal show view**: locking the show (Ctrl/⌘+L) switches to a stripped-back layout with a big GO, standby, a large cue list, the monitors and Now Playing. You can turn this off in Settings → General.
- **App control cue**
  - Controls Spotify, Apple Music or any media player on the same computer: play/pause, next/previous, set or fade the volume, and play a Spotify link or a Music playlist.
  - On Mac it controls the apps directly. On Windows it uses media keys and the system volume.
- **MA Lighting cue**
  - grandMA3 over OSC (command line).
  - grandMA2 over Telnet on port 30000, with automatic login and a kept-open connection.
  - Either console over MIDI Show Control (GO / STOP / RESUME with cue and list).
  - Includes command templates.
- **Transitions**: 14 PowerPoint-style transitions for video, image, text and camera cues: fade, cut, dip to black, wipes, push slides, zoom, blur and iris. You can set a separate transition for in and for out.
- **Per-cue crossfade**
  - *Auto*: what's already playing fades out as the new cue comes in (equal-power for audio). For visuals, this works on the same layer, the same output, or everything.
  - *Manual*: the cue waits until you move the T-bar under the Program monitor, press Take (Ctrl/⌘+Shift+X), or move a MIDI fader or an OSC `/xfade` control.
- **Keying and background removal**: green/blue-screen chroma key (with auto colour pick), luma key, and one-click background removal for images on plain backgrounds. Keying runs live on the GPU and works on video, images and cameras.
- **Vocal tools**: remove vocals (karaoke / backing track) or isolate vocals on stereo files. This is a centre-channel technique, so results depend on the mix.
- **Surround**: 5.1, 7.1 and quad files show their channels. Turn on surround to map each channel to an interface output (with presets), or leave it off to fold down to stereo.
- **Waveforms on/off** in the cue list, in Now Playing / Preview, and on the web remote and stage manager view (press W on the SM screen).
- **Output screenshots**: Ctrl/⌘+Alt+S, the camera button or OSC `/screenshot` saves a PNG of every open output to a folder you choose (default: Pictures/QForge Screenshots).
- **Bluetooth and wireless**
  - Bluetooth and AirPlay speakers are tagged in the device lists, and you're warned if one disconnects.
  - Presentation clickers work out of the box: Page Down = GO, Page Up = back, B or . = black out.
  - Bluetooth MIDI works on Mac, and on Windows through the WinRT MIDI backend.
- **Better drag and drop**
  - Text and lyric files (.txt, .srt, .lrc) become title cues; lyric files become a Step group, one cue per verse.
  - .m3u playlists become playlist groups.
  - Hold Alt/Option while dropping to make one playlist or slideshow group.
  - Drop a file on the inspector to replace a cue's media.
- **In/Out points**: press I or O while a cue plays, or use the IN/OUT buttons in Preview, to set its In and Out points.
- **Cameras**: choose capture resolution and frame rate, refresh the camera list, see a live camera preview, and use chroma key on live cameras.

## 1.4

- **Built-in templates** — File → New offers Blank, Theatre, Corporate, Wedding, Band/Gig, Sports, Installation/Loop, Church/Service and Broadcast. Each sets up cue lists, cart buttons and settings with "(add file)" placeholders ready to relink.
- **Audio device patches** — any cue can play to a specific system output (e.g. a USB interface, HDMI or a Bluetooth speaker) as listed in your OS sound settings. Name patches like *Mains*, *Monitors* or *Effects* in Settings → Audio, then point cues at the patch. If you move to another machine you only re-patch once. Click "Show device names" if the list only shows generic names.
- **Collaboration over IP** — Settings → Remote → Collaboration. One machine *hosts* the session. Others *join* with the host's IP address (e.g. `192.168.1.20:8080`) and PIN. Edits sync live in both directions, and coloured badges show who is selecting which cue. The last edit wins. Edits made while someone is typing are held until they finish.
- **Video mapping**
  - *Per cue (Mapping tab)*: position, size, rotation, crop and mirror, plus quick layouts (full, halves, quadrants, PiP). Corner-pin dragging works live on the output.
  - *Per surface*: corner-pin keystone or a full **mesh warp** grid (up to 9×9) for curved or odd surfaces. **Masks** are drawn polygons with feather and invert, for blacking out areas or shaping to a set piece.
- **NDI** — native NDI needs the proprietary NDI SDK, so QForge works alongside the free **NDI Tools**:
  - *Out*: set a surface to "NDI capture window". It opens at an exact size with the title `QForge NDI - <name>`. Capture it with NDI Screen Capture (Windows) or NDI Scan Converter / Capture (Mac).
  - *In*: NDI Virtual Input / NDI Webcam appears as a camera source, labelled NDI ▸ in camera cues.
- **New group modes**
  - **Random one**: fires a single random child each GO and avoids repeats.
  - **Slideshow**: steps through children with a set slide time and optional crossfade.
  - **Step through**: each GO plays the next child, with optional wrap.
- **Group end actions** (what happens after the last child): **Stop**, **Repeat group only**, **Continue to next cue**, **Go to cue** (moves the playhead) or **Fire cue**.
- **Windows and Mac Intel builds**: there are now builds for Windows x64, Mac Apple Silicon and Mac Intel.

## 1.3.1 — Time & Loops waveform editor
Audio cues now have a QLab-style **Time & Loops** tab:
- **The waveform**: a separate lane for each channel (L/R, or up to 4), a time ruler, −6/−12 dB guide lines, and colour that fades out beyond the trim points.
- **Zoom and scroll**:
  - Mouse wheel zooms around the cursor; Shift-wheel or dragging scrolls.
  - The **−/+**, **Fit** and **Trim** buttons zoom out, zoom in, show the whole file, or show the IN–OUT region.
  - Double-click to fit the whole file.
  - The overview strip underneath shows the whole file; click or drag it to move the view.
- **Handles you can drag**: the **IN/OUT** trim flags, the yellow **fade-in/fade-out** handles (the fade curve is drawn on the wave), and **markers**.
  - Alt-click adds or removes a marker. Drag a marker to move it, or right-click it to delete.
  - Split the cue into separate cues at its markers.
- **Playback**:
  - Live playheads, and **Follow** keeps the playhead in view while zoomed in.
  - Shift-click sets the load-to-time point, or jumps playback if the cue is running.
  - **▶ From start** and **▶ From load point** preview the cue through the headphone or preview output.
- **Loops**: the play count is shown on the wave. The start, end, fade, loop, rate and preserve-pitch fields sit underneath and stay in step with the wave as you drag.

## 1.3

- **Version history** (Tools → Version history): every save keeps the previous version, up to the last 20 for each show. Opening an old version loads it as unsaved changes, so nothing is overwritten until you save.
- **House music playlists**: playlist and shuffle groups can **crossfade** between items, and can **resume** from the next track the next time they're started.
- **Fade out on GO**: any cue can be set to fade out when the next GO is pressed. Typical use is walk-in music that fades as the show starts.
- **Show-start countdown** (Settings → General): a "Show starts in" box appears in the header, the SM view and the web remote. It turns orange in the last 5 minutes. Text cues can show it with `{showstart}`.
- **Department notes**: sound, lighting and video notes on each cue. They show under standby, in the SM view and on the remote.
- **Record input** (Tools → Record input): record from any input with a level meter. The recording becomes an audio cue straight away, saved in a `Recordings` folder next to the show.
- **Admin PIN** (Settings → General): when set, unlocking show mode and the other admin actions need the PIN. Lock the show before you hand it over to an operator.
- **Show statistics** (Tools → Show statistics): records actual running times across rehearsals and shows, and compares them with the planned times (including cues stopped early). Export them to CSV. The statistics are saved with the show.
- **Audio markers and split**: Alt-click the waveform to add or remove markers, then **Split into cues** to turn one long soundtrack into separate cues.
- **Waveform thumbnails** next to audio cues in the cue list.
- **Speaker alignment** (Settings → Audio): delay, trim, polarity and mute for each output channel of each device. Use it to time-align fills and delay speakers (about 2.9 ms per metre).
- **Script / hit-list mode** (the Script tab, or Ctrl/⌘+J):
  - Paste or load your script, then link cues to lines.
  - The standby line is highlighted and scrolls to follow the show, and running cues are tinted.
  - Click a linked line to put its cue in standby.
- **Headphone preview** (Settings → Audio): the inspector's ▶ Preview button plays through a separate output, so you can audition cues during the show.

## 1.2

- **Level meters** in the Active Cues panel:
  - Every output channel of each device in use shows a meter with peak hold and a clip light (click the light to reset it).
  - Each running audio or mic cue gets its own small meter.
- **Master limiter** (Settings → Audio, on by default, ceiling −1 dBFS) protects the PA. The **LIM** light comes on when it's reducing gain. It only runs on stereo outputs, so multichannel routing is never downmixed.
- **Auto-ducking**: tick "Duck other audio while this plays" on an announcement or VO cue. Everything else dips by the amount you set and comes back up after the recovery time when the cue ends. Any cue can be set to **never duck**.
- **Mic / line input cue**: a live input with level, pan, EQ, routing, fades and auto-ducking (on by default, so music dips under announcements). Expect a little latency; for a lectern mic in the PA, use the desk.
- **Time-of-day triggers** (Inspector → Triggers): a cue fires every day at a set clock time, such as `19:30` for house music or `19:55:00` for a doors announcement.
- **Rehearsal mode** (toolbar button, or Ctrl/⌘+⇧H): mutes all audio and holds back MIDI, OSC, DMX, timecode and script cues, so you can run the show silently. Video and text still play.
  - An orange banner shows on the app and on every web remote.
  - Everything held back is written to the log.
- **Right-click a cue** to fire it, stop it, put it in standby, add a fade-out-and-stop, Stop, Start or Devamp cue for it, arm or disarm it, recolour it, duplicate, group or delete.
- **Edit several cues at once**: select multiple cues and the inspector edits them together. You can change colour, continue mode, pre/post-wait, armed, fades, level, output device, surface and layer. Fields that differ between cues show as "mixed" and stay unchanged unless you set them.
- **OSC device templates** in OSC cues: grandMA3 (Go+, Goto, Off, sequence level, macro), ETC Eos, Resolume, Behringer X32 / Midas M32, QLab / another QForge, Bitfocus Companion.
- **OSC feedback**: sends the standby number, name and notes, the running cue names, the remaining time, the show timer, the rehearsal state and the 64 cart pad states to TouchOSC, Companion or a console (Settings → Remote & network).
- **Hold last frame** on video cues: the video freezes on its final frame until you stop it or fade it out.
- **Keyboard shortcut sheet**: press **?** (or Help → Keyboard Shortcuts).
- **Web remote**:
  - It keeps the phone or tablet screen awake.
  - You can add it to your home screen, where it opens full screen like an app.
  - It shows the rehearsal banner.

## 1.1

### Reliability
- **Autosave and crash recovery**: while a show has unsaved changes, QForge writes a recovery copy every 30 seconds. If the app or computer crashes, it offers to restore that copy the next time it opens.
- **Relink missing media** (Tools menu): choose a folder and QForge searches it, including subfolders, and reconnects every missing file by name.
- **Pre-flight check** (Ctrl/⌘+⇧K) checks the show before doors and offers a fix button where it can. It looks for:
  - missing media and broken cue targets
  - duplicate cue numbers
  - audio devices and MIDI ports that aren't connected
  - OSC hosts that can't be found
  - output displays that aren't connected
  - whether the web remote is running and backup sync is set up
  - unsaved changes
- **Main/backup sync** (Settings → Remote & network): the MAIN machine sends every GO, cue start/stop, pause/resume, stop-all and playhead move to the BACKUP over OSC, plus a heartbeat once a second. The backup's status bar shows **main OK** or **LOST**.
- **Show log**: a timestamped record of cue starts, errors, remote commands and sync activity. You can filter it, export it, or open the daily log files on disk.

### Audio
- **Routing matrix**: send each file channel to any output channel(s) on a multichannel interface. You'll find it in the inspector's Audio tab.
- **Loudness normalisation** to a target LUFS level (set it in Settings → Audio). Use the Normalise button on a cue, or Tools → Normalise for the selected cues.
- **3-band EQ** on each cue, and **Preserve pitch** for audio played at a rate other than 1.
- **Cart wall** (Ctrl/⌘+K, or the Cart tab): 64 pads for sound effects and walk-ons.
  - Click a pad to play or stop it, Alt-click to edit it, or drop files onto pads. Drag one pad onto another to swap them.
  - Pads can have hotkeys.
- **Load to time / jump**: Shift-click the waveform to set where the cue's next GO starts, or to jump while the cue is playing.

### Timecode and lighting
- **Timecode cue**: generates **LTC** (audio, to a chosen interface output) or **MTC** (MIDI) at 24 / 25 / 29.97 drop-frame / 30 fps, from a start time you set.
  - Put it in a Timeline group alongside your audio or video to drive a grandMA3 timecode show.
  - Pausing holds the timecode; resuming continues from the same frame.
- **Timecode in**: QForge can chase incoming **MTC**. Cues with a trigger time fire when the timecode passes that time (big jumps from locating are ignored). LTC input isn't supported; convert it to MTC first.
- **Light cue (Art-Net / sACN)**: channel levels such as `1@255, 2-8@50%, 20@full`, with a fade time. Channels you don't list keep their current level.
  - Stop All doesn't blackout the lights. Use the light cue `1-512@0`, or Tools → Blackout.
- **APC Mini mk2 / Launchpad Mini mk3, X, Pro mk3**: detected automatically.
  - The 8×8 grid plays cart pads 1–64, lit in each pad's colour and flashing while playing.
  - The right-hand buttons are GO, Stop all, Pause, Resume, Previous, Next.
- **grandMA3 OSC**: an OSC cue sends `/cmd "Go+ Sequence 1"` (or whatever command you type) to the console's OSC input.

### Video
- **Multiple output surfaces** (Settings → Video outputs): one window per screen or projector, each with its own display, full-screen setting and background. Video, image, text and camera cues each choose a surface.
- **Corner-pin warping**: drag the corners directly in the output window (arrow keys nudge a corner, Tab moves to the next one).
- **Edge blending** on each side, with an adjustable gamma.
- **Text / titles cue**: font, size, colour, position (including lower third), a background box, and fades.
  - Live values: `{countdown}` (counting down from a duration or to a clock time), `{clock}`, `{clock:s}`, `{elapsed}`.
- **Camera / live input cue**: webcams and HDMI/SDI capture cards, with mirroring.
- **Test pattern** and **Identify** for each surface.
- *Not included: NDI, Spout and Syphon. They need native modules compiled for each platform.*

### Remote and operator tools
- **Web remote** (Settings → Remote & network). Open the address it shows in any browser on the same network, on a phone, tablet or laptop. It has five views:
  - **Control**: GO, Previous/Next, Pause, Resume, Stop all, timers, and the active cues with pause and stop for each.
  - **Live timeline**: running cues drawn on a moving time axis (1/2/5/10-minute windows), including pre-waits, post-waits and child cues inside groups. A forecast shows what will play, and when, **if GO is pressed now**.
  - **Cue list**: choose the list, put any cue in standby, fire it, or stop it.
  - **Cart**: tap pads to play them.
  - **Stage manager**: large clock, show timer, cue remaining, standby with notes, and now playing.

  A PIN protects control. Viewing can stay open, or you can require the PIN for that too. A link to the timeline alone: `http://<ip>:8080/?view=timeline`.
- **Stage manager view** on the QForge computer itself: Ctrl/⌘+⇧M, or the SM view button.
- **Header timers**: time of day, a show timer (click to start or stop, double-click to reset, or Ctrl/⌘+T), and **cue remaining** for the longest running cue.
- **Several cue lists in one show** (tabs above the cue list: + to add, double-click to rename). Fade, Stop and Start cues can target cues in other lists.
- **Find** (Ctrl/⌘+F) filters the list. **Find & Replace** (Ctrl/⌘+H) works across all lists and the cart. **Renumber** (Ctrl/⌘+⇧R) renumbers the selected cues or the whole list.
- **Script cue**: runs an HTTP request (GET/POST/PUT/DELETE, with headers and body) or a shell command.
  - Scripts are **off by default on each computer** (Settings → Advanced). A show file you download can never run commands unless you've turned this on.

### Polish
- Themes: **Neon**, **Midnight**, **High contrast** (for dark booths).
- **Cue defaults**: ⋯ in the inspector → "Save as default for new … cues".
- **Print cue sheet (PDF)** (Ctrl/⌘+⇧P): landscape, with colour bars, timings and notes.
- Esc closes an open dialog, menu or search box first. A plain Esc with nothing open is Stop All.
- OSC `/cart/{1-64}` toggles cart pads.

Show files from 1.0 open in 1.1 and are upgraded automatically: the old cue list becomes the "Main" list.
