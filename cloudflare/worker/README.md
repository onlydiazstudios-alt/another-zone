# Another Zone SRT Studio — AI providers

The Worker exposes a single API for transcription and subtitle translation.

## Transcription providers

- `cloudflare` — Cloudflare Workers AI, using `@cf/openai/whisper-large-v3-turbo`. Uses the existing `AI` binding and needs no third-party API key.
- `gemini` — Google Gemini audio transcription. Requires the `GEMINI_API_KEY` Worker secret.
- `openai` — OpenAI Audio API using the current `gpt-transcribe` model. Requires the `OPENAI_API_KEY` Worker secret. OpenAI API usage is billed separately from ChatGPT subscriptions.

Send the selected provider in `X-AI-Provider` on `POST /transcribe-chunk`. If omitted, the Worker defaults to Cloudflare Whisper for backwards compatibility.

## Translation providers

- `cloudflare` — Cloudflare Workers AI Meta M2M100 translation model. Uses the existing `AI` binding.
- `gemini` — Gemini text translation; requires `GEMINI_API_KEY`.
- `openai` — OpenAI GPT translation; requires `OPENAI_API_KEY`.

Send `POST /translate` with JSON:

```json
{
  "provider": "cloudflare",
  "targetLanguage": "French",
  "items": ["First subtitle line", "Second subtitle line"]
}
```

The response returns one translated string per input item, preserving the cue order.

## Required secrets

Add secrets to the Cloudflare Worker named `another-zone-srt-ai`:

- `GEMINI_API_KEY` — optional, enables Gemini.
- `OPENAI_API_KEY` — optional, enables OpenAI GPT.

Do not put API keys in frontend code, GitHub files, or chat messages. The Worker `GET /health` response reports provider availability without exposing secret values.

## Notes

- Existing clients that do not send `X-AI-Provider` continue to use Cloudflare Whisper.
- Provider/API availability and free quotas vary. Gemini and OpenAI API usage is subject to the respective provider's API terms, quotas, and pricing; ChatGPT or Gemini consumer subscriptions do not automatically include API usage.
- M2M100 language coverage is model-specific; verify the selected target language for the chosen provider.
- Gemini and OpenAI transcription responses currently return text without word-level timestamps. The frontend uses the available chunk-level timing fallback for these providers. Whisper remains the preferred option when timestamp quality is important.
