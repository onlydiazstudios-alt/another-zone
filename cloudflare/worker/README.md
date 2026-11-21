# Another Zone SRT Studio — AI providers

The Cloudflare Worker provides transcription and subtitle translation for the SRT Studio frontend and AppDeploy edition.

## Transcription providers

- `cloudflare` — Cloudflare Workers AI using `@cf/openai/whisper-large-v3-turbo`. Uses the existing `AI` binding.
- `gemini` — Google Gemini `gemini-3.5-transcribe` audio transcription. Requires the `GEMINI_API_KEY` Worker secret.
- `deepgram` — Deepgram Nova-3 multilingual speech recognition. Requires the `DEEPGRAM_API_KEY` Worker secret.

Send the selected provider in `X-AI-Provider` to `POST /transcribe-chunk`. If omitted, Cloudflare Whisper is used for backwards compatibility.

## Translation providers

- `cloudflare` — Meta M2M100-1.2B hosted on Workers AI. Uses the existing `AI` binding.
- `gemini` — Google Gemini `gemini-3.5-flash-lite` text translation. Requires `GEMINI_API_KEY`.

Send `POST /translate` with JSON:

```json
{
  "provider": "cloudflare",
  "sourceLanguage": "French",
  "targetLanguage": "English",
  "items": ["Bonjour tout le monde."]
}
```

The response returns one translated string per input item in the original order.

## Required Worker secrets

On the Cloudflare Worker named `another-zone-srt-ai`, add:

- `GEMINI_API_KEY` — enables Gemini transcription and translation.
- `DEEPGRAM_API_KEY` — enables Deepgram Nova-3 transcription.

Add each through Cloudflare's Worker Settings → Variables and Secrets as a Secret. Never put keys in frontend code, GitHub files, chat messages, or ordinary plaintext variables.

The `GET /health` response reports which providers are configured without exposing secret values.

## Important operating notes

- Existing clients that omit `X-AI-Provider` continue using Cloudflare Whisper.
- Deepgram Nova-3 and Gemini API use their own account quotas and pricing. A free tier or introductory credit is not a promise of unlimited free use.
- Cloudflare Workers AI usage is subject to Cloudflare's account limits and pricing.
- The M2M100 language list is model-specific. Verify support for the chosen source/target language.
- Deepgram returns word timestamps; Gemini and Whisper timestamp support varies by model response. The SRT Studio currently estimates cue timing when a provider does not return usable alignment data.
- OpenAI is intentionally not included in this provider lineup.
