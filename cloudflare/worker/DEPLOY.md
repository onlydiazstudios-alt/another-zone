# Deploy the Another Zone SRT Studio AI Worker

This Worker moves speech recognition off the iPhone and into Cloudflare Workers AI.

## One-time Cloudflare setup

1. Sign in to the Cloudflare dashboard.
2. Open **Workers & Pages** and choose **Create application**.
3. Choose the GitHub import option and connect the GitHub account that owns `onlydiazstudios-alt/another-zone`.
4. Select the `another-zone` repository.
5. Set the Worker name to exactly `another-zone-srt-ai`.
6. Set the **Root directory** to `cloudflare/worker`.
7. Leave the **Build command** empty.
8. Set the **Deploy command** to `npx wrangler deploy`.
9. Save and deploy.

The included `wrangler.toml` declares the Workers AI binding named `AI`. If Cloudflare asks you to configure it manually, open the Worker settings, add a **Workers AI** binding, and name it exactly `AI`.

## Verify the Worker

After deployment, Cloudflare shows a URL similar to:

`https://another-zone-srt-ai.<your-subdomain>.workers.dev`

Open this URL with `/health` appended. A working Worker responds with JSON containing `"ok": true` and the model ID.

## Connect the app

1. Open https://hometown-srt.netlify.app/
2. Refresh the page after the Netlify deployment has finished.
3. Paste the full `workers.dev` URL into **Cloudflare AI Worker URL**.
4. Select a short test audio file and press **PROCESS QUEUE**.

## API

- `GET /health` — service and binding health check.
- `POST /transcribe-chunk` — accepts one raw audio chunk up to 1 MiB. The app sends chunks sequentially.
- Model: `@cf/openai/whisper-large-v3-turbo`.

## Important

- Audio chunks are sent to Cloudflare for processing; this is not local/offline transcription.
- Workers AI free allowances, model availability, account limits, and any applicable charges apply. It is not unlimited.
- Audio chunk boundaries are byte-based to avoid decoding the full recording on the phone. Subtitle cue timing is estimated from each chunk's position and the file duration. Review and adjust timings before publishing.
- The Worker currently allows browser requests from `https://hometown-srt.netlify.app` only.
- Do not publish Cloudflare API tokens in the frontend or repository.
