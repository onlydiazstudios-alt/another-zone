import { Buffer } from "node:buffer";

const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";
const GEMINI_TRANSCRIBE_MODEL = "gemini-3.5-transcribe";
const GEMINI_TEXT_MODEL = "gemini-3.5-flash-lite";
const TRANSLATION_MODEL = "@cf/meta/m2m100-1.2b";
const MAX_CHUNK_BYTES = 1024 * 1024;
const ALLOWED_ORIGINS = new Set([
  "https://hometown-srt.netlify.app",
  "https://another-zone-srt.onrender.com",
  "https://another-zone-srt-studio-3knhlv.v2.appdeploy.ai"
]);

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://another-zone-srt.onrender.com";
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization, X-Chunk-Index, X-Chunk-Count, X-Audio-Name, X-Task, X-Chunk-Start, X-Chunk-Duration, X-AI-Provider",
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


const MAX_JOB_CHUNKS = 300;
const MAX_PENDING_AUDIO_BYTES = 400 * 1024 * 1024;
const now = () => Math.floor(Date.now() / 1000);
async function tokenHash(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
function bearer(request) {
  const value = request.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}
async function authorizedJob(request, env, jobId) {
  const token = bearer(request);
  if (!token || token.length < 24) return false;
  const job = await env.DB.prepare('SELECT owner_hash FROM jobs WHERE id = ?').bind(jobId).first();
  return !!job && job.owner_hash === await tokenHash(token);
}
function srtStamp(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const hh = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const mm = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return hh + ':' + mm + ':' + ss + ',' + String(ms % 1000).padStart(3, '0');
}
function makeJobCues(chunks) {
  const cues = [];
  for (let i = 0; i < chunks.length; i++) {
    const item = chunks[i];
    const parsed = JSON.parse(item.result_json || '{}');
    const offset = Number(item.chunk_index) * 30;
    const words = Array.isArray(parsed.segments) ? parsed.segments : [];
    if (words.length) {
      let group = [];
      const flush = () => {
        if (!group.length) return;
        const start = offset + Number(group[0].start || 0);
        const end = offset + Number(group[group.length - 1].end || start + 0.3);
        cues.push({ start, end: Math.max(start + 0.12, end), text: group.map(w => w.text).join(' ') });
        group = [];
      };
      for (const word of words) {
        const next = [...group, word].map(w => w.text).join(' ');
        if (group.length && next.length > 82) flush();
        group.push(word);
      }
      flush();
    } else if (parsed.text) {
      const sentences = String(parsed.text).match(/[^.!?。！？]+[.!?。！？]?/g) || [parsed.text];
      const parts = sentences.map(x => x.trim()).filter(Boolean);
      const weights = parts.map(x => Math.max(1, x.split(/\s+/).length));
      const sum = weights.reduce((a, b) => a + b, 0);
      let cursor = offset;
      const duration = Math.min(30, Number(item.duration || 30));
      parts.forEach((text, n) => {
        const end = n === parts.length - 1 ? offset + duration : cursor + duration * weights[n] / sum;
        cues.push({ start: cursor, end: Math.max(cursor + 0.12, end), text });
        cursor = end;
      });
    }
  }
  let previous = 0;
  return cues.map((cue, index) => {
    const start = Math.max(previous, cue.start);
    const end = Math.max(start + 0.12, cue.end);
    previous = end;
    return { index: index + 1, start: srtStamp(start), end: srtStamp(end), text: cue.text };
  });
}
async function handleJobs(request, env, url, origin) {
  const path = url.pathname;
  if (request.method === 'POST' && path === '/jobs') {
    try {
      const token = bearer(request);
      if (token.length < 24) return json({ ok: false, error: 'CLIENT_KEY_REQUIRED' }, 401, origin);
      const body = await request.json();
      if (!Array.isArray(body.files) || !body.files.length || body.files.length > 5)
        return json({ ok: false, error: 'INVALID_FILES', message: 'Submit between one and five audio files.' }, 400, origin);
      const files = body.files.map((file, index) => ({
        index,
        name: String(file.name || 'audio-' + (index + 1) + '.wav').slice(0, 180),
        duration: Number(file.duration),
        chunkCount: Number(file.chunkCount)
      }));
      if (files.some(f => !Number.isFinite(f.duration) || f.duration <= 0 || !Number.isInteger(f.chunkCount) || f.chunkCount < 1 || f.chunkCount > MAX_JOB_CHUNKS))
        return json({ ok: false, error: 'INVALID_FILE_METADATA' }, 400, origin);
      const id = crypto.randomUUID();
      const owner = await tokenHash(token);
      const timestamp = now();
      await env.DB.prepare('INSERT INTO jobs (id, owner_hash, status, source_language, transcription_provider, translation_provider, target_language, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, owner, 'uploading', String(body.sourceLanguage || 'Auto-detect').slice(0, 50),
          ['cloudflare','gemini','deepgram'].includes(body.provider) ? body.provider : 'cloudflare',
          ['cloudflare','gemini'].includes(body.translationProvider) ? body.translationProvider : 'gemini',
          String(body.targetLanguage || 'English').slice(0, 50), timestamp, timestamp).run();
      const statements = files.map(file => env.DB.prepare('INSERT INTO job_files (job_id, file_index, name, duration, chunk_count, status) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, file.index, file.name, file.duration, file.chunkCount, 'uploading'));
      if (statements.length) await env.DB.batch(statements);
      return json({ ok: true, jobId: id, status: 'uploading', files }, 201, origin);
    } catch (error) {
      return json({ ok: false, error: 'JOB_CREATE_FAILED', message: errorMessage(error) }, 500, origin);
    }
  }
  const chunkMatch = path.match(/^\/jobs\/([0-9a-f-]+)\/chunks\/(\d+)\/(\d+)$/i);
  if (request.method === 'POST' && chunkMatch) {
    const [, jobId, fileIndexText, chunkIndexText] = chunkMatch;
    if (!(await authorizedJob(request, env, jobId))) return json({ ok: false, error: 'JOB_NOT_FOUND' }, 404, origin);
    const fileIndex = Number(fileIndexText);
    const chunkIndex = Number(chunkIndexText);
    const file = await env.DB.prepare('SELECT chunk_count FROM job_files WHERE job_id = ? AND file_index = ?').bind(jobId, fileIndex).first();
    if (!file || chunkIndex < 0 || chunkIndex >= file.chunk_count) return json({ ok: false, error: 'CHUNK_NOT_FOUND' }, 404, origin);
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_CHUNK_BYTES) return json({ ok: false, error: 'INVALID_CHUNK_SIZE' }, 413, origin);
    const existing = await env.DB.prepare('SELECT status FROM job_chunks WHERE job_id = ? AND file_index = ? AND chunk_index = ?').bind(jobId, fileIndex, chunkIndex).first();
    if (existing?.status === 'done') return json({ ok: true, duplicate: true, status: 'done' }, 200, origin);
    try {
      const pending = await env.DB.prepare('SELECT COALESCE(SUM(length(audio_blob)), 0) AS bytes FROM job_chunks').first();
      if ((pending?.bytes || 0) + bytes.byteLength > MAX_PENDING_AUDIO_BYTES)
        return json({ ok: false, error: 'BACKGROUND_STORAGE_BUSY', message: 'The background queue is temporarily full. Your audio is safe on this device; retry the upload shortly.' }, 429, origin);
      await env.DB.prepare('INSERT INTO job_chunks (job_id, file_index, chunk_index, audio_blob, duration, status) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(job_id, file_index, chunk_index) DO UPDATE SET audio_blob = excluded.audio_blob, duration = excluded.duration, status = CASE WHEN job_chunks.status = "done" THEN "done" ELSE "queued" END')
        .bind(jobId, fileIndex, chunkIndex, bytes, Math.max(0.1, Math.min(30, Number(request.headers.get('X-Chunk-Duration') || 30))), 'queued').run();
      const current = await env.DB.prepare('SELECT status FROM job_chunks WHERE job_id = ? AND file_index = ? AND chunk_index = ?').bind(jobId, fileIndex, chunkIndex).first();
      if (current.status !== 'done') await env.JOBS_QUEUE.send({ type: 'transcribe', jobId, fileIndex, chunkIndex });
      await env.DB.prepare('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?').bind('processing', now(), jobId).run();
      return json({ ok: true, queued: true, fileIndex, chunkIndex }, 202, origin);
    } catch (error) {
      return json({ ok: false, error: 'CHUNK_QUEUE_FAILED', message: errorMessage(error) }, 502, origin);
    }
  }
  const downloadMatch = path.match(/^\/jobs\/([0-9a-f-]+)\/download\/(\d+)$/i);
  if (request.method === 'GET' && downloadMatch) {
    const [, jobId, fileIndexText] = downloadMatch;
    if (!(await authorizedJob(request, env, jobId))) return json({ ok: false, error: 'JOB_NOT_FOUND' }, 404, origin);
    const file = await env.DB.prepare('SELECT name, output_srt, status FROM job_files WHERE job_id = ? AND file_index = ?').bind(jobId, Number(fileIndexText)).first();
    if (!file || file.status !== 'completed' || !file.output_srt) return json({ ok: false, error: 'OUTPUT_NOT_READY' }, 409, origin);
    const safeName = String(file.name).replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_') + '.srt';
    return new Response(file.output_srt, { headers: { ...corsHeaders(origin), 'content-type': 'application/x-subrip; charset=utf-8', 'content-disposition': 'attachment; filename="' + safeName + '"', 'cache-control': 'no-store' } });
  }
  const jobMatch = path.match(/^\/jobs\/([0-9a-f-]+)$/i);
  if (request.method === 'GET' && (path === '/jobs' || jobMatch)) {
    try {
      let jobs;
      if (jobMatch) {
        const id = jobMatch[1];
        if (!(await authorizedJob(request, env, id))) return json({ ok: false, error: 'JOB_NOT_FOUND' }, 404, origin);
        const job = await env.DB.prepare('SELECT id, status, source_language AS sourceLanguage, transcription_provider AS provider, translation_provider AS translationProvider, target_language AS targetLanguage, created_at AS createdAt, updated_at AS updatedAt FROM jobs WHERE id = ?').bind(id).first();
        const files = await env.DB.prepare('SELECT file_index AS fileIndex, name, duration, chunk_count AS chunkCount, status, error FROM job_files WHERE job_id = ? ORDER BY file_index').bind(id).all();
        const enriched = [];
        for (const file of files.results || []) {
          const counts = await env.DB.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN status = "done" THEN 1 ELSE 0 END) AS completed FROM job_chunks WHERE job_id = ? AND file_index = ?').bind(id, file.fileIndex).first();
          enriched.push({ ...file, chunksCompleted: counts?.completed || 0, chunksTotal: file.chunkCount });
        }
        return json({ ok: true, job: { ...job, files: enriched } }, 200, origin);
      }
      const token = bearer(request);
      if (token.length < 24) return json({ ok: false, error: 'CLIENT_KEY_REQUIRED' }, 401, origin);
      const owner = await tokenHash(token);
      jobs = await env.DB.prepare('SELECT id, status, created_at AS createdAt, updated_at AS updatedAt FROM jobs WHERE owner_hash = ? ORDER BY created_at DESC LIMIT 50').bind(owner).all();
      const result = [];
      for (const job of jobs.results || []) {
        const files = await env.DB.prepare('SELECT file_index AS fileIndex, name, duration, chunk_count AS chunkCount, status, error FROM job_files WHERE job_id = ? ORDER BY file_index').bind(job.id).all();
        const enriched = [];
        for (const file of files.results || []) {
          const counts = await env.DB.prepare('SELECT SUM(CASE WHEN status = "done" THEN 1 ELSE 0 END) AS completed FROM job_chunks WHERE job_id = ? AND file_index = ?').bind(job.id, file.fileIndex).first();
          enriched.push({ ...file, chunksCompleted: counts?.completed || 0, chunksTotal: file.chunkCount });
        }
        result.push({ ...job, files: enriched });
      }
      return json({ ok: true, jobs: result }, 200, origin);
    } catch (error) {
      return json({ ok: false, error: 'JOB_READ_FAILED', message: errorMessage(error) }, 500, origin);
    }
  }
  return json({ ok: false, error: 'NOT_FOUND' }, 404, origin);
}
async function processJobQueueMessage(message, env) {
  const body = message.body || {};
  const { jobId, fileIndex, chunkIndex } = body;
  if (!jobId || !Number.isInteger(fileIndex)) return;
  const file = await env.DB.prepare('SELECT * FROM job_files WHERE job_id = ? AND file_index = ?').bind(jobId, fileIndex).first();
  const job = await env.DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(jobId).first();
  if (!file || !job) return;
  if (body.type === 'transcribe') {
    const chunk = await env.DB.prepare('SELECT * FROM job_chunks WHERE job_id = ? AND file_index = ? AND chunk_index = ?').bind(jobId, fileIndex, chunkIndex).first();
    if (!chunk || chunk.status === 'done') return;
    await env.DB.prepare('UPDATE job_chunks SET status = ? WHERE job_id = ? AND file_index = ? AND chunk_index = ?').bind('processing', jobId, fileIndex, chunkIndex).run();
    if (!chunk.audio_blob) throw new Error('Queued audio chunk is missing from D1 storage.');
    const bytes = chunk.audio_blob instanceof ArrayBuffer ? new Uint8Array(chunk.audio_blob) : new Uint8Array(chunk.audio_blob);
    let result;
    if (job.transcription_provider === 'cloudflare') {
      const audio = Buffer.from(bytes).toString('base64');
      result = await env.AI.run(WHISPER_MODEL, { audio, task: 'transcribe' });
    } else if (job.transcription_provider === 'gemini') {
      result = await transcribeGemini(bytes, env, 'transcribe');
    } else {
      result = await transcribeDeepgram(bytes, env, job.source_language);
    }
    const segments = (Array.isArray(result?.segments) ? result.segments : []).flatMap(segment => {
      if (Array.isArray(segment.words) && segment.words.length) return segment.words.map(word => ({ start: Number(word.start), end: Number(word.end), text: String(word.word || word.text || '') })).filter(w => w.text && Number.isFinite(w.start) && Number.isFinite(w.end));
      return segment.text && Number.isFinite(segment.start) && Number.isFinite(segment.end) ? [{ start: Number(segment.start), end: Number(segment.end), text: String(segment.text) }] : [];
    });
    await env.DB.prepare('UPDATE job_chunks SET status = ?, result_json = ?, audio_blob = NULL, error = NULL WHERE job_id = ? AND file_index = ? AND chunk_index = ?')
      .bind('done', JSON.stringify({ text: result?.text || '', segments }), jobId, fileIndex, chunkIndex).run();
    const count = await env.DB.prepare('SELECT COUNT(*) AS completed FROM job_chunks WHERE job_id = ? AND file_index = ? AND status = ?').bind(jobId, fileIndex, 'done').first();
    if ((count?.completed || 0) >= file.chunk_count) await env.JOBS_QUEUE.send({ type: 'finalize', jobId, fileIndex });
    return;
  }
  if (body.type === 'finalize') {
    if (file.status === 'completed') return;
    const rows = await env.DB.prepare('SELECT chunk_index, result_json, duration FROM job_chunks WHERE job_id = ? AND file_index = ? ORDER BY chunk_index').bind(jobId, fileIndex).all();
    if ((rows.results || []).length !== file.chunk_count || rows.results.some(row => !row.result_json)) throw new Error('Not all audio chunks are ready for finalization.');
    const cues = makeJobCues(rows.results);
    if (!cues.length) throw new Error('No clear speech was detected in this audio file.');
    if (job.translation_provider === 'gemini') {
      for (let offset = 0; offset < cues.length; offset += 40) {
        const batch = cues.slice(offset, offset + 40);
        const numbered = batch.map((cue, i) => ({ index: i, text: cue.text }));
        const key = requireKey(env.GEMINI_API_KEY, 'GEMINI');
        const prompt = 'Translate every subtitle line into ' + job.target_language + '. Preserve meaning, tone, names and order. Return JSON only as {"translations":["..."]} with exactly ' + batch.length + ' strings. Lines: ' + JSON.stringify(numbered);
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_TEXT_MODEL + ':generateContent?key=' + encodeURIComponent(key), {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } })
        });
        const data = await response.json();
        if (!response.ok) throw new Error('Gemini translation failed: ' + (data.error?.message || response.status));
        const raw = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.translations) || parsed.translations.length !== batch.length || parsed.translations.some(x => typeof x !== 'string' || !x.trim())) throw new Error('Translation returned an incomplete subtitle batch.');
        batch.forEach((cue, i) => { cue.text = parsed.translations[i].trim(); });
      }
    } else {
      const language = job.source_language;
      if (['auto-detect', 'other / multilingual'].includes(language.toLowerCase())) throw new Error('Cloudflare translation requires a selected spoken language.');
      for (let offset = 0; offset < cues.length; offset += 40) {
        const batch = cues.slice(offset, offset + 40);
        const translated = await Promise.all(batch.map(cue => translateText(cue.text, 'cloudflare', env, job.target_language, language)));
        batch.forEach((cue, i) => { cue.text = translated[i] || cue.text; });
      }
    }
    const srt = cues.map((cue, i) => (i + 1) + '\n' + cue.start + ' --> ' + cue.end + '\n' + cue.text.trim()).join('\n\n') + '\n';
    await env.DB.prepare('UPDATE job_files SET status = ?, output_srt = ?, error = NULL WHERE job_id = ? AND file_index = ?').bind('completed', srt, jobId, fileIndex).run();
    const states = await env.DB.prepare('SELECT status FROM job_files WHERE job_id = ?').bind(jobId).all();
    const allDone = (states.results || []).every(row => ['completed', 'failed'].includes(row.status));
    if (allDone) {
      const hasFailure = states.results.some(row => row.status === 'failed');
      await env.DB.prepare('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?').bind(hasFailure ? 'completed_with_errors' : 'completed', now(), jobId).run();
    }
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response("Origin not allowed", { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...corsHeaders(origin), "access-control-max-age":"86400" } });
    const url = new URL(request.url);
    if (url.pathname === '/jobs' || url.pathname.startsWith('/jobs/')) return handleJobs(request, env, url, origin);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok:true, service:"Another Zone SRT Studio AI", model:WHISPER_MODEL, maxChunkBytes:MAX_CHUNK_BYTES,
        providers:{
          cloudflare:{available:!!env.AI, tasks:["transcribe","translate"]},
          gemini:{available:!!env.GEMINI_API_KEY, tasks:["transcribe","translate","text-translation"]},
          deepgram:{available:!!env.DEEPGRAM_API_KEY, tasks:["transcribe"]},
          cloudflareTranslation:{available:!!env.AI, model:TRANSLATION_MODEL}
        },
        backgroundJobs:{available:!!env.DB && !!env.JOBS_QUEUE, storage:'D1', queue:!!env.JOBS_QUEUE}
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
  },
  async scheduled(controller, env) {
    const cutoff = now() - 30 * 24 * 60 * 60;
    const expired = await env.DB.prepare('SELECT id FROM jobs WHERE created_at < ? LIMIT 25').bind(cutoff).all();
    for (const row of expired.results || []) {
      await env.DB.prepare('DELETE FROM job_chunks WHERE job_id = ?').bind(row.id).run();
      await env.DB.prepare('DELETE FROM job_files WHERE job_id = ?').bind(row.id).run();
      await env.DB.prepare('DELETE FROM jobs WHERE id = ?').bind(row.id).run();
    }
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        await processJobQueueMessage(message, env);
        message.ack();
      } catch (error) {
        console.error('Background SRT job failed', error);
        if (message.attempts >= 5) {
          const body = message.body || {};
          if (body.jobId && Number.isInteger(body.fileIndex)) {
            await env.DB.prepare('UPDATE job_files SET status = ?, error = ? WHERE job_id = ? AND file_index = ? AND status != ?')
              .bind('failed', errorMessage(error).slice(0, 500), body.jobId, body.fileIndex, 'completed').run();
            await env.DB.prepare('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?')
              .bind('completed_with_errors', now(), body.jobId).run();
          }
          message.ack();
        } else {
          message.retry({ delaySeconds: Math.min(300, 5 * Math.pow(2, Math.max(0, message.attempts - 1))) });
        }
      }
    }
  }
};
