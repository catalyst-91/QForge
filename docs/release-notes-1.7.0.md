# QForge 1.7.0: NDI®

**Send and receive NDI®¹ video in QForge, QForge Output and QForge Stage Manager.**

## What's new

- **Send QForge outputs as NDI sources.** Go to **Settings ▸ NDI®** and tick *Send* next to an output. It shows up in vision mixers, OBS, vMix, Resolume and recorders as `COMPUTER (QForge Main output)`, with the show's sound.
- **NDI inputs in camera cues.** Use **Show ▸ New NDI® Input Cue**, or set a camera cue's Input to *NDI® source*. PTZ cameras, mixers, other computers and phone camera apps all work. Sound and low-bandwidth mode are optional.
- **QForge Output shows any NDI source** full screen with sound. Pick *Show: An NDI® source* in its panel.
- **Stage Manager and Output can send their own screen as NDI.** This puts your stage-manager or presenter-timer screen straight into the vision mixer.
- Sources are found automatically. You can also list IP addresses to reach sources on other subnets.

## Before you start

- **Windows:** install the free [NDI 6 Runtime](https://ndi.link/NDIRedistV6) once (it also comes with [NDI Tools](https://ndi.video/tools/)).
- **macOS:** the NDI runtime is included. Allow **Screen Recording** (to send outputs) and **Local Network** when asked.
- Use a wired gigabit network. A full-quality 1080p NDI stream is around 100–150 Mbit/s.

## Downloads

| | QForge | Stage Manager | Output |
|---|---|---|---|
| Windows (x64) | `QForge-1.7.0-win-x64.exe` | `QForge.Stage.Manager-1.7.0-win-x64.exe` | `QForge.Output-1.7.0-win-x64.exe` |
| Mac (Apple Silicon) | `QForge-1.7.0-mac-arm64.dmg` | `QForge.Stage.Manager-1.7.0-mac-arm64.dmg` | `QForge.Output-1.7.0-mac-arm64.dmg` |
| Mac (Intel) | `QForge-1.7.0-mac-x64.dmg` | `QForge.Stage.Manager-1.7.0-mac-x64.dmg` | `QForge.Output-1.7.0-mac-x64.dmg` |

---
¹ NDI® is a registered trademark of Vizrt NDI AB. QForge uses the NDI® SDK and is not a product of, or sponsored by, Vizrt NDI AB. https://ndi.video/
