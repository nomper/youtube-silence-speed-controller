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

## Install for local testing

No Chrome Web Store or Microsoft Edge Add-ons listing is linked here. To test the extension locally, use an unpacked copy of the extension files:

1. Obtain the source files or a source ZIP and extract the ZIP if needed.
2. Use a clean folder containing `manifest.json` at its root and the extension's JavaScript, HTML, CSS, and `icons` files. Do not include a signing key, the `release` directory, or other private files in this folder.
3. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
4. Enable Developer mode, choose **Load unpacked**, and select the clean folder.

If using this workspace's locally generated package, the prepared folder is `release\unpacked\youtube-silence-speed-controller-v0.1.12\`. Do not select the repository root when it contains a signing key under `release\artifacts\`. The unpacked folder and local release artifacts are not included in the repository.

For store submission, use the source ZIP rather than the signed CRX. Keep the PEM signing key private and never upload or share it.

## Notes

- The toolbar icon switches between active and disabled variants depending on whether the current tab is a supported YouTube watch page and whether the controller is enabled.
- The silence detector is relative to recent audio history, so it adapts per video instead of using a single fixed dB threshold.
- After reloading the extension during development, reload existing YouTube tabs once so the content script reconnects cleanly.

## Versioning

- Runtime changes use the canonical `0.1.N` version in both `manifest.json` and `AGENTS.md`.
- Documentation-only edits do not increment the release version.
