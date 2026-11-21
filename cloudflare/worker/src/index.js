import { Buffer } from "node:buffer";

const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";
const GEMINI_TRANSCRIBE_MODEL = "gemini-3.5-transcribe";
const GEMINI_TEXT_MODEL = "gemini-3.5-flash-lite";
const TRANSLATION_MODEL = "@cf/meta/m2m100-1.2b";
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
    "access-control-allow-headers": "Content-Type, X-Chunk-Index, X-Chunk-Count, X-Audio-Name, X-Task, X-Chunk-Start, X-Chunk-Duration, X-AI-Provider",
    "vary": "Origin"
  };
}
function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function requireKey(value, label) {
  if (!value) throw new Error(label + "_API_KEY_MISSING: Add the key as a Cloudflare Worker secret.");
  return value;
}
async function transcribeGemini(bytes, env, task) {
  const key = requireKey(env.GEMINI_API_KEY, "GEMINI");
  const audio = Buffer.from(bytes).toString("base64");
  const instruction = task === "translate"
    ? "Translate the spoken audio into natural English. Return only the translated words, without commentary."
    : "Transcribe the spoken audio accurately in its original language. Return only the spoken words, without commentary.";
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-transcribe:generateContent?key=" + encodeURIComponent(key), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: instruction }, { inline_data: { mime_type: "audio/wav", data: audio } }] }] })
  });
  const data = await response.json();
  if (!response.ok) throw new Error("GEMINI_API_ERROR: " + (data.error?.message || response.status));
  return { text: (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("\n").trim(), segments: [], provider: "gemini" };
}
async function transcribeDeepgram(bytes, env, sourceLanguage) {
  const key = requireKey(env.DEEPGRAM_API_KEY, "DEEPGRAM");
  const deepgramLanguages = { "English":"en", "French":"fr", "Spanish":"es", "Portuguese":"pt", "Arabic":"ar", "Hausa":"ha", "Yoruba":"yo", "Igbo":"ig", "Swahili":"sw", "German":"de", "Japanese":"ja", "Chinese":"zh" };
  const language = deepgramLanguages[sourceLanguage] || "multi";
  const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&language=" + encodeURIComponent(language) + "&smart_format=true&punctuate=true", {
    method: "POST",
    headers: { authorization: "Token " + key, "content-type": "audio/wav" },
    body: bytes
  });
  const data = await response.json();
  if (!response.ok) throw new Error("DEEPGRAM_API_ERROR: " + (data.err_msg || data.message || response.status));
  const alternative = data.results?.channels?.[0]?.alternatives?.[0];
  return { text: alternative?.transcript || "", segments: (alternative?.words || []).map(word => ({start:word.start,end:word.end,text:word.word})), provider: "deepgram" };
}
const LANGUAGE_NAMES = {
  en:"english",fr:"french",es:"spanish",pt:"portuguese",de:"german",it:"italian",ja:"japanese",ko:"korean",
  zh:"chinese",ar:"arabic",hi:"hindi",yo:"yoruba",ha:"hausa",ig:"igbo",sw:"swahili",ru:"russian",tr:"turkish"
};
async function translateText(text, provider, env, targetLanguage, sourceLanguage) {
  if (!text) return "";
  if (provider === "cloudflare") {
    if (!env.AI) throw new Error("AI_BINDING_MISSING: Workers AI binding named AI is not configured.");
    const target = LANGUAGE_NAMES[String(targetLanguage).toLowerCase()] || String(targetLanguage).toLowerCase();
    const source = LANGUAGE_NAMES[String(sourceLanguage || "english").toLowerCase()] || String(sourceLanguage || "english").toLowerCase();
    const result = await env.AI.run(TRANSLATION_MODEL, { text, source_lang: source, target_lang: target });
    return result?.translated_text || result?.text || "";
  }
  if (provider === "gemini") {
    const key = requireKey(env.GEMINI_API_KEY, "GEMINI");
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" + encodeURIComponent(key), {
      method:"POST", headers:{"content-type":"application/json"},
      body:JSON.stringify({contents:[{parts:[{text:"Translate the following text into " + targetLanguage + ". Preserve meaning, tone, names, and line breaks. Return only the translation.\n\n" + text}]}]})
    });
    const data = await response.json();
    if (!response.ok) throw new Error("GEMINI_API_ERROR: " + (data.error?.message || response.status));
    return (data.candidates?.[0]?.content?.parts || []).map(p=>p.text||"").join("\n").trim();
  }
  throw new Error("PROVIDER_NOT_SUPPORTED: Choose Cloudflare or Gemini for translation.");
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response("Origin not allowed", { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...corsHeaders(origin), "access-control-max-age":"86400" } });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok:true, service:"Another Zone SRT Studio AI", model:WHISPER_MODEL, maxChunkBytes:MAX_CHUNK_BYTES,
        providers:{
          cloudflare:{available:!!env.AI, tasks:["transcribe","translate"]},
          gemini:{available:!!env.GEMINI_API_KEY, tasks:["transcribe","translate","text-translation"]},
          deepgram:{available:!!env.DEEPGRAM_API_KEY, tasks:["transcribe"]},
          cloudflareTranslation:{available:!!env.AI, model:TRANSLATION_MODEL}
        }
      },200,origin);
    }
    if (request.method === "POST" && url.pathname === "/translate") {
      try {
        const body = await request.json();
        const items = Array.isArray(body.items) ? body.items : [];
        if (!items.length || items.length > 500) return json({ok:false,error:"INVALID_ITEMS",message:"Send between 1 and 500 subtitle lines."},400,origin);
        const provider = ["cloudflare","gemini"].includes(body.provider) ? body.provider : "cloudflare";
        const target = String(body.targetLanguage || "English").slice(0,50);
        const source = String(body.sourceLanguage || "English").slice(0,50);
        if (provider === "cloudflare" && ["auto-detect","other / multilingual",""].includes(source.toLowerCase())) {
          return json({ok:false,error:"SOURCE_LANGUAGE_REQUIRED",message:"Cloudflare M2M100 requires the actual source language. Select it or use Gemini for automatic language detection."},400,origin);
        }
        let translated;
        let detectedSourceLanguage = source;
        if (provider === "gemini") {
          const key = requireKey(env.GEMINI_API_KEY, "GEMINI");
          const numbered = items.map((item, index) => ({ index, text: String(item || "").slice(0, 4000) }));
          const sourceInstruction = ["auto-detect","other / multilingual",""].includes(source.toLowerCase())
            ? "Identify the source language from the text. The lines may contain multilingual speech."
            : "The source language is " + source + ".";
          const prompt = "You are a professional subtitle translator. " + sourceInstruction +
            " Translate every subtitle line into " + target + ". Preserve meaning, intent, tone, names, slang and cultural context. Do not summarize, censor, embellish, or add explanations. Keep each line separate and in exactly the same order. Return a JSON object with detectedSourceLanguage (language name) and translations (an array of strings with exactly " + numbered.length + " entries). Input lines: " + JSON.stringify(numbered);
          const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_TEXT_MODEL + ":generateContent?key=" + encodeURIComponent(key), {
            method:"POST",
            headers:{"content-type":"application/json"},
            body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",temperature:0.1}})
          });
          const data = await response.json();
          if (!response.ok) throw new Error("GEMINI_API_ERROR: " + (data.error?.message || response.status));
          const raw = (data.candidates?.[0]?.content?.parts || []).map(p=>p.text||"").join("").trim();
          let parsed;
          try { parsed = JSON.parse(raw); } catch { throw new Error("GEMINI_TRANSLATION_FORMAT_ERROR: The translation model did not return valid structured subtitle lines."); }
          if (!Array.isArray(parsed.translations) || parsed.translations.length !== items.length || parsed.translations.some(x => typeof x !== "string" || !x.trim())) {
            throw new Error("GEMINI_TRANSLATION_COUNT_ERROR: The model did not return one translation for every subtitle line.");
          }
          translated = parsed.translations;
          detectedSourceLanguage = String(parsed.detectedSourceLanguage || source);
        } else {
          const pool = 4;
          translated = new Array(items.length);
          let cursor = 0;
          const run = async () => {
            while (true) {
              const index = cursor++;
              if (index >= items.length) return;
              translated[index] = await translateText(String(items[index] || "").slice(0,4000),provider,env,target,source);
            }
          };
          await Promise.all(Array.from({length:Math.min(pool,items.length)},run));
        }
        return json({ok:true,translated,provider,detectedSourceLanguage},200,origin);
      } catch(error) { return json({ok:false,error:"TRANSLATION_FAILED",message:errorMessage(error)},502,origin); }
    }
    if (request.method !== "POST" || url.pathname !== "/transcribe-chunk") {
      return json({ok:false,error:"NOT_FOUND",message:"Use GET /health, POST /transcribe-chunk, or POST /translate."},404,origin);
    }
    const provider = request.headers.get("X-AI-Provider") || "cloudflare";
    const task = request.headers.get("X-Task") === "translate" ? "translate" : "transcribe";
    if (provider === "cloudflare" && !env.AI) return json({ok:false,error:"AI_BINDING_MISSING",message:"Workers AI binding named AI is not configured."},503,origin);
    if (provider === "gemini" && !env.GEMINI_API_KEY) return json({ok:false,error:"GEMINI_API_KEY_MISSING",message:"Add GEMINI_API_KEY as a Cloudflare Worker secret."},503,origin);
    if (provider === "deepgram" && !env.DEEPGRAM_API_KEY) return json({ok:false,error:"DEEPGRAM_API_KEY_MISSING",message:"Add DEEPGRAM_API_KEY as a Cloudflare Worker secret."},503,origin);
    try {
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength) return json({ok:false,error:"EMPTY_CHUNK",message:"No audio bytes received."},400,origin);
      if (bytes.byteLength > MAX_CHUNK_BYTES) return json({ok:false,error:"CHUNK_TOO_LARGE",message:"Audio chunk exceeds the 1 MB limit."},413,origin);
      let result;
      if (provider === "cloudflare") {
        const audio = Buffer.from(bytes).toString("base64");
        result = await env.AI.run(WHISPER_MODEL,{audio,task});
      } else if (provider === "gemini") result = await transcribeGemini(bytes,env,task);
      else if (provider === "deepgram") result = await transcribeDeepgram(bytes,env,request.headers.get("X-Source-Language") || "Auto-detect");
      else return json({ok:false,error:"PROVIDER_NOT_SUPPORTED",message:"Choose Cloudflare Whisper, Gemini, or Deepgram."},400,origin);
      const rawSegments = Array.isArray(result?.segments) ? result.segments : [];
      const timedWords = rawSegments.flatMap(segment => {
        if (Array.isArray(segment.words) && segment.words.length) {
          return segment.words.map(word => ({
            start: Number(word.start), end: Number(word.end), text: String(word.word || word.text || "")
          })).filter(word => word.text && Number.isFinite(word.start) && Number.isFinite(word.end));
        }
        return segment.text && Number.isFinite(segment.start) && Number.isFinite(segment.end)
          ? [{ start: Number(segment.start), end: Number(segment.end), text: String(segment.text) }]
          : [];
      });
      return json({ok:true,text:result?.text||"",segments:timedWords,vtt:result?.vtt||"",wordCount:result?.word_count||0,provider},200,origin);
    } catch(error) { return json({ok:false,error:"TRANSCRIPTION_FAILED",message:errorMessage(error)},502,origin); }
  }
};
