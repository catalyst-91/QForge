# QForge 1.5.0

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

## Downloads

- **Windows (64-bit):** `QForge-Windows-x64.zip`. Extract it, then run *Install QForge.bat*.
- **Mac, Apple Silicon:** `QForge-mac-AppleSilicon.zip`. Unzip it, right-click *Install QForge.command*, then choose *Open*.
- **Mac, Intel:** `QForge-mac-Intel.zip`. Install the same way as Apple Silicon.
