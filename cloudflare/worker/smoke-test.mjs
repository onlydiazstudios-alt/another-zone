import { randomBytes } from 'node:crypto';

const worker = process.env.WORKER_URL || 'https://another-zone-srt-ai.anotherzone.workers.dev';
const token = randomBytes(32).toString('hex');
const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

async function request(path, options = {}) {
  const response = await fetch(worker + path, options);
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  return { response, data };
}

const health = await request('/health');
if (!health.response.ok || !health.data.ok || !health.data.backgroundJobs?.available) {
  throw new Error('Worker health check failed or D1/Queue bindings are unavailable: ' + JSON.stringify(health.data));
}
if (health.data.backgroundJobs.storage !== 'D1') {
  throw new Error('Expected the no-card D1 background storage configuration.');
}

const created = await request('/jobs', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    files: [{ name: 'deployment-smoke-test.wav', duration: 1, chunkCount: 1 }],
    sourceLanguage: 'English',
    provider: 'cloudflare',
    translationProvider: 'gemini',
    targetLanguage: 'English'
  })
});
if (created.response.status !== 201 || !created.data.jobId) {
  throw new Error('Could not create a background job: ' + JSON.stringify(created.data));
}
const jobId = created.data.jobId;

const privateRead = await request('/jobs/' + jobId, { headers });
if (!privateRead.response.ok || privateRead.data.job?.files?.[0]?.chunksTotal !== 1) {
  throw new Error('Authenticated job read failed: ' + JSON.stringify(privateRead.data));
}
const anonymousRead = await request('/jobs/' + jobId);
if (anonymousRead.response.status !== 404) {
  throw new Error('Private job endpoint did not reject an unauthenticated request.');
}
const aborted = await request('/jobs/' + jobId + '/abort', { method: 'POST', headers });
if (!aborted.response.ok || aborted.data.status !== 'upload_failed') {
  throw new Error('Could not clean up the smoke-test job: ' + JSON.stringify(aborted.data));
}
console.log('Background SRT smoke test passed: health, D1 storage, job creation, private reads and cleanup.');
