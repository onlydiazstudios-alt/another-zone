import { Buffer } from "node:buffer";

const MODEL = "@cf/openai/whisper-large-v3-turbo";
const MAX_CHUNK_BYTES = 1024 * 1024;
const ALLOWED_ORIGIN = "https://hometown-srt.netlify.app";

function json(data, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": ALLOWED_ORIGIN,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, X-Chunk-Index, X-Chunk-Count, X-Audio-Name, X-Task, X-Duration",
      "cache-control": "no-store"
    }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";\n    if (origin && origin !== ALLOWED_ORIGIN) return new Response("Origin not allowed", { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "Content-Type, X-Chunk-Index, X-Chunk-Count, X-Audio-Name, X-Task, X-Duration",
        "access-control-max-age": "86400"
      }
    });

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "Another Zone SRT Studio AI", model: MODEL, maxChunkBytes: MAX_CHUNK_BYTES });
    }
    if (request.method !== "POST" || url.pathname !== "/transcribe-chunk") {
      return json({ ok: false, error: "NOT_FOUND", message: "Use GET /health or POST /transcribe-chunk." }, 404, ALLOWED_ORIGIN);
    }
    if (!env.AI) return json({ ok: false, error: "AI_BINDING_MISSING", message: "Workers AI binding named AI is not configured." }, 503, ALLOWED_ORIGIN);

    try {
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength) return json({ ok: false, error: "EMPTY_CHUNK", message: "No audio bytes received." }, 400, ALLOWED_ORIGIN);
      if (bytes.byteLength > MAX_CHUNK_BYTES + 65536) return json({ ok: false, error: "CHUNK_TOO_LARGE", message: "Chunk exceeds the 1 MB limit." }, 413, ALLOWED_ORIGIN);
      const index = Number(request.headers.get("X-Chunk-Index") || 0);
      const count = Number(request.headers.get("X-Chunk-Count") || 1);
      const task = request.headers.get("X-Task") === "translate" ? "translate" : "transcribe";
      const binary = Buffer.from(bytes);
      const audio = binary.toString("base64");
      const result = await env.AI.run(MODEL, { audio, task });
      return json({
        ok: true,
        chunkIndex: index,
        chunkCount: count,
        text: result?.text || "",
        segments: Array.isArray(result?.segments) ? result.segments : [],
        vtt: result?.vtt || "",
        wordCount: result?.word_count || 0
      }, 200, ALLOWED_ORIGIN);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ ok: false, error: "TRANSCRIPTION_FAILED", message }, 502, ALLOWED_ORIGIN);
    }
  }
};
