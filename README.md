# Another Zone SRT Studio

A static subtitle editor with remote Cloudflare Workers AI transcription.

## Netlify deployment
- Repository: `onlydiazstudios-alt/another-zone`
- Publish directory: repository root (`.`)
- Build command: leave blank
- When Netlify is linked to this GitHub repository, pushes to the production branch automatically trigger deployment.

## Batch audio transcription
- Select up to five audio files in one batch.
- Maximum selected file size: 100 MB per file.
- Files are processed sequentially, one at a time, to avoid running several speech-recognition models concurrently.
- Each completed audio file gets its own editable subtitle document and its own SRT export.
- A failed file does not discard successful earlier outputs; the queue continues to the next file.
- Whisper runs in the browser through Transformers.js; the model downloads on first use and may be cached.
- The translation option asks Whisper to translate speech into English.
- No transcription API key or server-side audio upload is configured.

## Important processing limits
Audio is uploaded to your configured Cloudflare Worker in sequential 1 MB pieces. The Worker calls Cloudflare Workers AI (`@cf/openai/whisper-large-v3-turbo`). Cloudflare account AI allowances and model limits apply; usage is not unlimited. Audio chunk timing is estimated from the file duration and byte position, so review and correct cue timing before delivery. Keep the tab open while the chunks are processed.

## SRT editing
- Import and edit SRT files.
- Edit cue text and millisecond timestamps in horizontal rows.
- Export normalized SRT files.
- Review timing and overlaps before delivery.

## Editor integrations
- **Adobe Premiere Pro:** native UXP panel in `integrations/premiere/`. Current release supports SRT import/edit/export; AI transcription is not yet wired into the panel.
- **DaVinci Resolve:** planned.
- **CapCut Desktop and other editors:** SRT interchange is the compatibility route.
- **Photoshop:** future companion for subtitle graphics and title cards.

The Premiere panel has not yet been verified inside the user's local Premiere installation.
## Cloudflare AI setup\n- Worker source: `cloudflare/worker/src/index.js`.\n- Wrangler config: `cloudflare/worker/wrangler.toml` (includes the `AI` binding).\n- In Cloudflare, create a Worker from this repository with root directory `cloudflare/worker` and deploy command `npx wrangler deploy`.\n- If the dashboard does not pick up the binding from Wrangler config, add a Workers AI binding named `AI` in the Worker settings.\n- Set the deployed `workers.dev` URL in the app's Cloudflare AI Worker URL field.\n- Health check: `GET /health`; transcription endpoint: `POST /transcribe-chunk`.\n\n## Reliability fixes
- Fixed Whisper input to pass raw audio together with its actual sample rate, as required by the Transformers.js audio pipeline.
- Changed Whisper segment timestamp mode to the documented boolean timestamp option.
- Audio is decoded at 16 kHz to reduce memory use before inference.
- Added direct SRT/TXT import into the editable subtitle table.
- Completed subtitle documents are autosaved in browser IndexedDB and restored when the same browser opens the app again.
- This does not guarantee recovery of an audio transcription interrupted by a browser or operating-system crash; large files can still exceed device memory, particularly on phones.
