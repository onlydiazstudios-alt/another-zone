const MODEL = "@cf/black-forest-labs/flux-1-schnell";
const API_KEY_SHA256 = "5c4e4423a5efb73dd3fe70be3ab425085fe199d3c5c38dcd7799f24017703e13";
const DAILY_IMAGE_LIMIT = 7;
const IMAGE_TTL_SECONDS = 60 * 24 * 60 * 60;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization"
    }
  });
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authorize(request, url) {
  const bearer = request.headers.get("Authorization") || "";
  const headerKey = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";
  const supplied = headerKey || url.searchParams.get("key") || "";
  if (supplied.length !== 64) return false;
  return constantTimeEqual(await sha256(supplied), API_KEY_SHA256);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function currentCount(env, date) {
  return Number(await env.COVERS.get("quota:" + date) || 0);
}

function coverPrompt(productName, visualDirection) {
  const subject = String(visualDirection || productName || "business toolkit").slice(0, 1200);
  return [
    "Create a premium square digital product cover artwork background.",
    "Another Zone brand art direction: matte near-black base, deep electric violet and restrained purple light, polished editorial composition, confident premium business-toolkit aesthetic, clean geometry, subtle dimensional lighting, crisp focal subject, generous negative space.",
    "Visual subject: " + subject + ".",
    "No text, no letters, no numbers, no logos, no watermark, no mockup frame, no collage, no border.",
    "Professional commercial cover art, balanced composition, high detail."
  ].join(" ");
}

async function generate(request, env, url) {
  if (!(await authorize(request, url))) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (!env.AI || !env.COVERS) return json({ ok: false, error: "WORKER_BINDING_MISSING", message: "Workers AI and the COVERS KV namespace must both be bound." }, 503);

  let body = {};
  if (request.method === "POST") {
    try { body = await request.json(); } catch { return json({ ok: false, error: "INVALID_JSON" }, 400); }
  } else {
    body = {
      prompt: url.searchParams.get("prompt") || "",
      productName: url.searchParams.get("name") || ""
    };
  }

  const productName = String(body.productName || "Another Zone Digital Toolkit").trim().slice(0, 120);
  const visualDirection = String(body.prompt || "").trim();
  if (!visualDirection || visualDirection.length < 8 || visualDirection.length > 1800) {
    return json({ ok: false, error: "INVALID_PROMPT", message: "Provide a visual direction between 8 and 1,800 characters." }, 400);
  }

  const date = today();
  const count = await currentCount(env, date);
  if (count >= DAILY_IMAGE_LIMIT) {
    return json({ ok: false, error: "DAILY_FREE_LIMIT_REACHED", limit: DAILY_IMAGE_LIMIT, generated_today: count, resets_at_utc: "00:00 UTC" }, 429);
  }

  try {
    const result = await env.AI.run(MODEL, {
      prompt: coverPrompt(productName, visualDirection),
      steps: 4
    });
    if (!result || !result.image) throw new Error("The image model returned no image data.");
    const binary = atob(result.image);
    const imageBytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    if (!imageBytes.byteLength || imageBytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error("Generated image exceeded the 8 MB storage limit.");
    }

    const id = crypto.randomUUID();
    const key = "generated-" + date + "-" + id + ".jpg";
    await env.COVERS.put(key, imageBytes, {
      metadata: { contentType: "image/jpeg", productName, generatedAt: new Date().toISOString(), model: MODEL },
      expirationTtl: IMAGE_TTL_SECONDS
    });
    const nextCount = count + 1;
    await env.COVERS.put("quota:" + date, String(nextCount), { expirationTtl: 2 * 24 * 60 * 60 });
    const imageUrl = new URL("/image/" + key, request.url).toString();
    return json({
      ok: true,
      product_name: productName,
      model: MODEL,
      image_url: imageUrl,
      generated_today: nextCount,
      remaining_today: DAILY_IMAGE_LIMIT - nextCount,
      expires_after_days: 60
    }, 201);
  } catch (error) {
    return json({ ok: false, error: "IMAGE_GENERATION_FAILED", message: String(error?.message || error).slice(0, 500) }, 502);
  }
}

async function upload(request, env, url) {
  if (!(await authorize(request, url))) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (!env.COVERS) return json({ ok: false, error: "KV_BINDING_MISSING" }, 503);
  const date = today();
  const count = await currentCount(env, date);
  if (count >= DAILY_IMAGE_LIMIT) return json({ ok: false, error: "DAILY_FREE_LIMIT_REACHED", limit: DAILY_IMAGE_LIMIT, generated_today: count, resets_at_utc: "00:00 UTC" }, 429);
  const type = request.headers.get("Content-Type") || "";
  const allowed = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };
  const mime = type.split(";")[0].trim().toLowerCase();
  if (!allowed[mime]) return json({ ok: false, error: "UNSUPPORTED_IMAGE_TYPE", message: "Upload JPEG, PNG or WebP." }, 415);
  const data = new Uint8Array(await request.arrayBuffer());
  if (!data.byteLength || data.byteLength > MAX_UPLOAD_BYTES) return json({ ok: false, error: "INVALID_IMAGE_SIZE", message: "Images must be smaller than 8 MB." }, 413);
  const key = "upload-" + today() + "-" + crypto.randomUUID() + "." + allowed[mime];
  await env.COVERS.put(key, data, {
    metadata: { contentType: mime, generatedAt: new Date().toISOString(), source: "user-upload" },
    expirationTtl: IMAGE_TTL_SECONDS
  });
  const nextCount = count + 1;
  await env.COVERS.put("quota:" + date, String(nextCount), { expirationTtl: 2 * 24 * 60 * 60 });
  return json({ ok: true, image_url: new URL("/image/" + key, request.url).toString(), key, generated_today: nextCount, remaining_today: DAILY_IMAGE_LIMIT - nextCount, expires_after_days: 60 }, 201);
}

const HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Another Zone Cover Studio</title>
<style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#08070d;color:#f5f2ff}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 80% 0%,#30105b 0,transparent 38%),#08070d;min-height:100vh}
main{max-width:850px;margin:0 auto;padding:36px 20px 70px}.brand{color:#c7a8ff;letter-spacing:.24em;font-size:11px;font-weight:800}
h1{font-size:clamp(30px,6vw,48px);margin:12px 0 8px;letter-spacing:-.04em}p{color:#bdb6cb;line-height:1.6}
.panel{background:#121019;border:1px solid #30253e;border-radius:18px;padding:22px;margin-top:22px;box-shadow:0 20px 70px #0008}
label{display:block;font-size:13px;color:#cfc5dd;margin:16px 0 8px}
input,textarea{width:100%;background:#09080f;color:#fff;border:1px solid #40364d;border-radius:10px;padding:13px;font:inherit}
textarea{min-height:120px;resize:vertical}
button{background:#8c4be8;color:white;border:0;border-radius:10px;padding:13px 18px;font-weight:750;margin-top:14px;cursor:pointer}
button:disabled{opacity:.5;cursor:wait}.muted{font-size:12px;color:#968da4}
#status{margin-top:14px;color:#d8c8ff;white-space:pre-wrap}img{max-width:100%;border-radius:12px;margin-top:18px;display:none}
.url{display:flex;gap:8px;align-items:center;margin-top:12px}.url input{min-width:0}.url button{white-space:nowrap;margin:0}
hr{border:0;border-top:1px solid #30253e;margin:26px 0}
</style></head><body><main>
<div class="brand">ANOTHER ZONE / IMAGE INFRASTRUCTURE</div><h1>Cover Studio</h1>
<p>Generate premium product artwork or host an existing image and receive a public HTTPS URL ready for Gumroad.</p>
<section class="panel">
<label for="token">Service key</label><input id="token" type="password" autocomplete="off" placeholder="Paste the private cover-service key">
<label for="name">Product name</label><input id="name" placeholder="e.g. Inventory Forecasting Toolkit">
<label for="prompt">Visual direction</label><textarea id="prompt" placeholder="Describe the main visual subject. The Another Zone black-and-violet art direction is applied automatically."></textarea>
<button id="generate">Generate cover</button><div id="status"></div><img id="preview" alt="Generated cover preview">
<div class="url"><input id="imageUrl" readonly placeholder="Your public image URL appears here"><button id="copy" type="button">Copy URL</button></div>
<hr><label for="file">Or upload an existing JPEG, PNG or WebP</label><input id="file" type="file" accept="image/jpeg,image/png,image/webp"><button id="upload" type="button">Upload and create URL</button>
<p class="muted">Free allowance: up to 7 generated or uploaded images per UTC day. Stored image URLs expire after 60 days.</p>
</section></main>
<script>
const $=id=>document.getElementById(id);let lastUrl='';
function setStatus(s){$('status').textContent=s}
function headers(){return {Authorization:'Bearer '+$('token').value.trim()}}
$('generate').onclick=async()=>{if(!$('token').value.trim())return setStatus('Enter your service key first.');$('generate').disabled=true;setStatus('Generating…');try{const r=await fetch('/api/generate',{method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({productName:$('name').value,prompt:$('prompt').value})});const d=await r.json();if(!r.ok)throw new Error(d.message||d.error||r.status);lastUrl=d.image_url;$('imageUrl').value=lastUrl;$('preview').src=lastUrl;$('preview').style.display='block';setStatus('Generated. '+d.remaining_today+' free generations remain today.')}catch(e){setStatus('Could not generate: '+e.message)}finally{$('generate').disabled=false}};
$('upload').onclick=async()=>{const f=$('file').files[0];if(!f)return setStatus('Choose an image first.');if(!$('token').value.trim())return setStatus('Enter your service key first.');$('upload').disabled=true;setStatus('Uploading…');try{const r=await fetch('/api/upload',{method:'POST',headers:{...headers(),'Content-Type':f.type},body:f});const d=await r.json();if(!r.ok)throw new Error(d.message||d.error||r.status);lastUrl=d.image_url;$('imageUrl').value=lastUrl;$('preview').src=lastUrl;$('preview').style.display='block';setStatus('Uploaded. Public HTTPS URL created.')}catch(e){setStatus('Could not upload: '+e.message)}finally{$('upload').disabled=false}};
$('copy').onclick=async()=>{if(!$('imageUrl').value)return;await navigator.clipboard.writeText($('imageUrl').value);setStatus('URL copied.')};
</script></body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization",
      "access-control-max-age": "86400"
    }});
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "Another Zone Cover Studio", model: MODEL, daily_free_image_limit: DAILY_IMAGE_LIMIT, kv_bound: !!env.COVERS, ai_bound: !!env.AI });
    }
    if ((request.method === "POST" || request.method === "GET") && url.pathname === "/api/generate") return generate(request, env, url);
    if (request.method === "POST" && url.pathname === "/api/upload") return upload(request, env, url);
    if (request.method === "GET" && url.pathname.startsWith("/image/")) {
      const key = decodeURIComponent(url.pathname.slice("/image/".length));
      if (!/^(generated-\d{4}-\d{2}-\d{2}-[a-f0-9-]+\.jpg|upload-\d{4}-\d{2}-\d{2}-[a-f0-9-]+\.(jpg|png|webp))$/i.test(key)) {
        return new Response("Not found", { status: 404 });
      }
      const result = await env.COVERS.getWithMetadata(key, { type: "arrayBuffer" });
      if (!result.value) return new Response("Image not found or expired", { status: 404 });
      const contentType = result.metadata?.contentType || "image/jpeg";
      return new Response(result.value, { headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
        "x-content-type-options": "nosniff",
        "access-control-allow-origin": "*"
      }});
    }
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  }
};
