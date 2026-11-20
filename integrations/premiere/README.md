# Another Zone SRT Studio — Premiere Pro integration

First-release Adobe Premiere Pro UXP panel. This is a native dockable panel, not an embedded website.

## Current capabilities
- Import and parse SRT files.
- Edit cue text and start/end timecodes.
- Add and delete subtitle cues.
- Export a standards-based SRT file.
- Add local audio/video files and drag them from the panel into Premiere's Project panel or Timeline using Adobe's documented third-party drag payload.
- Local SRT editing and handoff do not require a paid transcription API.

## Subtitle handoff
The panel exports SRT. In Premiere, use File → Import, select the exported SRT, then place the imported subtitle item/track in the sequence. Direct creation and styling of caption clips through Premiere's UXP DOM is not claimed in this release; that requires validation against the current caption and sequence APIs.

## Install for development
Requirements: Premiere Pro 25.6 or later, UXP Developer Tool 2.2 or later. The optional panel-to-timeline media drag-and-drop feature requires Premiere Pro 27.0 or later; SRT editing and export are designed for the 25.6+ baseline.

1. Enable Developer Mode in Premiere: Settings → Plugins → Enable developer mode, then restart Premiere.
2. In UXP Developer Tool, choose Add Plugin and select integrations/premiere/manifest.json.
3. Click Load or Load & Watch.
4. In Premiere, open Window → UXP Plugins → Another Zone SRT Studio.

## Limitations
- This release is the editor/integration shell and SRT workflow; AI transcription is not yet connected to this panel.
- Drag-and-drop media import supports common local audio/video formats. Subtitle timing uses SRT interchange.
- Not yet tested inside the user's local Premiere installation. Load it in UXP Developer Tool and verify with a short test sequence before production use.

## Multi-editor roadmap
1. Premiere Pro UXP — first native panel.
2. DaVinci Resolve scripting integration.
3. CapCut Desktop and other editors through SRT interchange, then native integrations where supported.
4. Photoshop companion for subtitle graphics and title cards.
