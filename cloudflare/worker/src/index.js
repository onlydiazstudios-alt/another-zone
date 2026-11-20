import { Buffer } from "node:buffer";

const MODEL = "@cf/openai/whisper-large-v3-turbo";
const MAX_CHUNK_BYTES = 1024 * 1024;
const ALLOWED_ORIGINS = new Set([
  "https://hometown-srt.netlify.app",
  "https://another-zone-srt.onrender.com"
]);

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://another-zone-srt.onrender.com";
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, X-Chunk-Index, X-Chunk-Count, X-Audio-Name, X-Task, X-Chunk-Start, X-Chunk-Duration",
    "vary": "Origin"
  };
}
function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      ...corsHeaders(origin),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return new Response("Origin not allowed", { status: 403 });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        ...corsHeaders(origin),
        "access-control-max-age": "86400"
      }});
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "Another Zone SRT Studio AI", model: MODEL, maxChunkBytes: MAX_CHUNK_BYTES }, 200, origin);
    }
    if (request.method !== "POST" || url.pathname !== "/transcribe-chunk") {
      return json({ ok: false, error: "NOT_FOUND", message: "Use GET /health or POST /transcribe-chunk." }, 404, origin);
    }
    if (!env.AI) {
      return json({ ok: false, error: "AI_BINDING_MISSING", message: "Workers AI binding named AI is not configured." }, 503, origin);
    }

    try {
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength) return json({ ok: false, error: "EMPTY_CHUNK", message: "No audio bytes received." }, 400, origin);
      if (bytes.byteLength > MAX_CHUNK_BYTES) return json({ ok: false, error: "CHUNK_TOO_LARGE", message: "Audio chunk exceeds the 1 MB limit." }, 413, origin);

      const task = request.headers.get("X-Task") === "translate" ? "translate" : "transcribe";
      const audio = Buffer.from(bytes).toString("base64");
      const result = await env.AI.run(MODEL, { audio, task });

      return json({
        ok: true,
        text: result?.text || "",
        segments: Array.isArray(result?.segments) ? result.segments : [],
        vtt: result?.vtt || "",
        wordCount: result?.word_count || 0
      }, 200, origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ ok: false, error: "TRANSCRIPTION_FAILED", message }, 502, origin);
    }
  }
};
