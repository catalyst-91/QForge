# QForge 1.6.1

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
