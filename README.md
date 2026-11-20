# Another Zone SRT Studio

A browser-only static app for SRT import, editing, export, and Whisper-based audio transcription.

## Netlify deployment
1. Sign in to Netlify.
2. Choose Add new site, then Import an existing project.
3. Connect GitHub and select `onlydiazstudios-alt/another-zone`.
4. Leave the build command blank and set the publish directory to `.` (repository root).
5. Deploy.

## AI behavior
- Whisper runs in the browser through Transformers.js.
- Model files download on first use and may be cached by the browser.
- No transcription API key or server-side audio upload is configured.
- Speed and compatibility depend on device, browser, memory, and model size.
- Generated wording and timings need human review; no ASR system guarantees perfection.

## Included
- Import multiple SRT files.
- Edit start/end timestamps and subtitle text in horizontal rows.
- Add/delete cues and sort by time.
- Export SRT files grouped by source.
- Local transcription with Whisper Tiny, Base, or Small.
- Optional translation to English.

This is an initial browser-only build. Test with representative audio and devices before production use.

## Editor integrations

- **Adobe Premiere Pro:** a native UXP panel is available in `integrations/premiere/`. It supports SRT import/edit/export and local media drag-and-drop. See the integration README for installation and current limitations.
- **DaVinci Resolve:** planned next.
- **CapCut Desktop and other editors:** SRT interchange compatibility planned as the cross-editor baseline.
- **Photoshop:** future companion for subtitle graphics and title cards.

The Premiere panel is an early development build and has not yet been tested inside a local Premiere installation. It currently exports SRT for Premiere's native import workflow; direct caption-track creation is not yet implemented.
