# QForge user guide

Reference for day-to-day use. For installing, see the [README](../README.md); for what changed in each version, see the [changelog](../CHANGELOG.md).

## Keyboard

| Key | Action |
|---|---|
| **Space** | GO: fires the standby cue and moves the playhead on |
| **Esc** | Stop all with a fade. Press it again to stop instantly |
| ↑ / ↓ | Move the playhead (add Shift to extend the selection) |
| ← / → | Collapse / expand a group |
| Delete | Delete the selected cues |
| Ctrl/⌘ + 1…0 | New Audio, Video, Group, Fade, Stop, Start, Go To, Wait, Memo, MIDI cue (⇧0 = OSC) |
| Ctrl/⌘ + G / ⇧G | Group the selected cues / ungroup |
| Ctrl/⌘ + D, C, X, V | Duplicate, copy, cut, paste cues |
| Ctrl/⌘ + Z / ⇧Z | Undo / redo |
| Ctrl/⌘ + P / R | Pause all / resume all |
| Ctrl/⌘ + L | Show mode: locks all editing |
| Ctrl/⌘ + S, ⇧S, O, N | Save, Save As, Open, New |
| Ctrl/⌘ + ⇧I / ⇧E | Import cues from another show / export a show package |
| I / O | Set the In / Out point of the playing cue |
| Ctrl/⌘ + B | Black out the video outputs |
| Ctrl/⌘ + ⇧X | Take a manual crossfade |
| Ctrl/⌘ + Alt + S | Screenshot the video outputs |
| Ctrl/⌘ + Alt + 1 / 2 / 3 | Show / hide the Preview, Program and Now Playing panels |
| Page Down / Page Up | Presentation clicker: GO / back |
| Ctrl/⌘ + / | Show every keyboard shortcut |

## Progression and timing

Every cue has these timing settings:
- **Pre-wait**: a delay before the cue's action starts.
- **Continue**:
  - **Do not continue** (the default).
  - **Auto-continue**: fires the next cue once the post-wait time has passed after this cue starts.
  - **Auto-follow**: fires the next cue when this cue finishes.
- **Post-wait**: the delay that Auto-continue uses.

GO skips over cues that are chained together this way. The playhead lands on the next cue after the chain.

## Loops

- Audio and video cues have a **Play count**: 1 plays once, *n* plays *n* times, and **0 loops forever**. Use Start and End times to set the loop region (you can drag the trim handles on the waveform). The fade-out happens at the end of the last loop.
- A **Stop cue** with the **Devamp** action lets a looping cue or group finish its current pass and then stop.
- A **Start cue** that points at an earlier cue (with auto-continue) makes a loop in the cue list itself.

## Groups

A group holds other cues, and groups can sit inside other groups. Each group has its own mode:

| Mode | Behaviour |
|---|---|
| **Timeline** | Starts all children together. Each child's pre-wait is its start time. |
| **Sequence** | Starts the first child. After that, each child's own auto-continue / auto-follow carries playback through the group. |
| **Playlist** | Plays the children one after another. **Gap** sets the time between them, and a negative gap overlaps them. |
| **Shuffle** | Like Playlist, but the order changes randomly on every pass. |

Each group also has a **Loop count** (0 = forever) and its own Pre-wait, Continue and Post-wait. Fading, stopping, pausing or devamping a group does the same to everything running inside it.

To put cues in a group, drag them onto the middle of the group's row, or select them and press Ctrl/⌘+G.

## Saving, loading and exporting

- **Save / Open**: show files are `.qforge` (JSON). Each media path is saved two ways, as the full path and relative to the show file. That means a show folder you move still finds its media.
- **Import cues**: adds the cues from another `.qforge` show to the end of the current one. Fade, Stop and Start targets between the imported cues keep working.
- **Export Show Package**: creates a folder holding a copy of the show and all its media (`Media/`). Copy that folder to any machine, open the `.qforge` file inside it, and everything is there.
- **Export Cue List (CSV)**: a cue sheet you can open in Excel or Numbers for paperwork and printing.

## Remote control

**OSC**: UDP, port 53000 by default. Change it in Settings.
```
/go                          GO
/go/{n}   /cue/{n}/start     fire cue number n
/cue/{n}/stop | pause | resume | devamp | select
/stop  /panic  /hardstop  /pause  /resume
/playhead/next   /playhead/previous
```
If the last argument of a message is 0, QForge ignores it, because that's a button release. This lets console executor buttons (grandMA3, etc.) trigger cues directly. Addresses can also start with `/qforge`.

**MIDI**:
- Learn MIDI triggers for GO, Stop all, Pause, Resume, Next and Previous in Settings. Each cue can also have its own trigger (Triggers tab).
- **MIDI Show Control** receive: an MSC GO with a cue number fires that cue.
- **MIDI cues** send Note, CC, Program Change or MSC GO/STOP/RESUME.

**OSC cues** send any address and arguments to any IP and port. For example, send `/cmd "Go+ Sequence 1"` to a grandMA3.

## Video output

- Video and image cues play in a separate output window. In Settings you pick which display it opens on and whether it goes full screen.
- Each cue has a **layer** (higher layers sit on top), a fit mode, an opacity and an audio level, plus fade in/out. Fade cues can fade a video's opacity and volume.
- Formats: MP4/H.264, WebM, MOV (H.264), PNG, JPG, GIF, WebP. ProRes and HEVC may not play.

## NDI®

NDI®¹ sends broadcast-quality video and sound over a network. QForge can both send and receive it. Learn more at [ndi.video](https://ndi.video/).

### Setting up
- **Windows:** install the free [NDI 6 Runtime](https://ndi.link/NDIRedistV6) (or [NDI Tools](https://ndi.video/tools/)). **Settings ▸ NDI®** shows whether it was found.
- **macOS:** nothing to install. Allow **Screen Recording** and **Local Network** the first time macOS asks.
- Use a wired gigabit network. Full-quality 1080p NDI uses around 100–150 Mbit/s.

### Sending outputs
- In **Settings ▸ NDI®**, tick **Send** next to an output and give it a name. Other machines see it as `COMPUTER (name)`.
- **Picture quality** limits the size and frame rate. **Include sound** sends the main output mix with the picture.
- The output window must be open; it can sit behind QForge or on a spare screen.
- The status bar shows **NDI n · receivers**. Click it to open the NDI settings.
- These settings belong to the computer, not the show file, so a show opened on another computer doesn't start sending NDI.

### Receiving sources
- **Show ▸ New NDI® Input Cue** adds a camera cue set to NDI. You can also change any camera cue's **Input** to *NDI® source*.
- Pick the source from the list. Press **Find NDI® sources** if it hasn't appeared yet.
- **Low bandwidth** uses the source's preview stream, which suits multiviews or Wi-Fi.
- **Play the source's sound** plays it to the default output at the level you set.
- NDI inputs work with layers, fit, keying, mapping, transitions and fades like any camera cue.
- If sources on another subnet don't appear, enter those computers' IP addresses under **Find sources on other subnets**.

### Companion apps
- **QForge Output:** in the panel (Esc), choose **Show: An NDI® source**, pick it and press Connect. Sound, volume, speaker choice, fit and auto-connect work the same as for QForge streams.
- **Stage Manager and Output:** tick **Send this window as an NDI® source** to put that screen into a vision mixer or recorder.

---
¹ NDI® is a registered trademark of Vizrt NDI AB.
