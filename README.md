# YouTube Silence Speed Controller

Manifest V3 extension for Google Chrome and Microsoft Edge.

## What it does

- Runs only on `https://www.youtube.com/watch*`
- Watches the actual audio level of the current video with the Web Audio API
- Switches to a faster playback speed after the audio stays quiet long enough
- Returns to the normal playback speed immediately when audio resumes
- Ignores ads, paused playback, seeking, and live streams
- Shows a compact live meter in the popup and a detailed live monitor in the settings page

## Settings

- Normal speed
- Silent-section speed
- Silence sensitivity
- Silence hold time in seconds
- `Enable` toggle in the popup to turn the controller on or off
- `Status Display` toggle in the popup to hide or show the live status panels

## Load the extension

### Chrome

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select this folder

### Edge

1. Open `edge://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select this folder

## Notes

- The toolbar icon switches between active and disabled variants depending on whether the current tab is a supported YouTube watch page and whether the controller is enabled.
- The silence detector is relative to recent audio history, so it adapts per video instead of using a single fixed dB threshold.
- After reloading the extension during development, reload existing YouTube tabs once so the content script reconnects cleanly.

## Versioning

- Runtime changes use the canonical `0.1.N` version in both `manifest.json` and `AGENTS.md`.
- Documentation-only edits do not increment the release version.
