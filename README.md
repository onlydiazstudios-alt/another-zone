# Another Zone SRT Studio

A browser-based subtitle editor with remote Whisper transcription through Cloudflare Workers AI.

## Website hosting
The static website is hosted on Render from the repository root. No build command is required; publish directory is `.`.

## AI transcription service
The AI service is a separate Cloudflare Worker in `cloudflare/worker`. Render static hosting does not run the AI model.

1. Deploy `cloudflare/worker/wrangler.toml` and `cloudflare/worker/src/index.js` as a Cloudflare Worker.
2. Ensure the Worker has the Workers AI binding named `AI`.
3. Add the deployed Worker URL to the **Cloudflare AI Worker URL** field in the app.
4. Confirm the URL opens at `/health` and returns JSON with `ok: true`.

The app processes MP3 files sequentially. It parses MP3 frames and sends valid audio-frame chunks of approximately 15 seconds to Whisper, rather than cutting the file at arbitrary byte offsets. Subtitle timestamps are offset using each chunk's actual audio start time. This avoids browser-side full-file audio decoding and reduces memory pressure on iPhones.

For now, remote transcription accepts MP3 audio. Convert other formats to MP3 before uploading.

## Free usage
Cloudflare Workers AI currently includes a daily free allowance, not unlimited transcription. The allowance resets daily; transcription can stop when it is exhausted. Check current Cloudflare pricing and usage before relying on it for large batches.

## Editing and export
- Import existing SRT files.
- Edit subtitle text and timecodes.
- Export normalized SRT files.
- Completed subtitle documents are saved in browser IndexedDB on the same device.
- Review subtitle wording, timing, and overlaps before delivery.
