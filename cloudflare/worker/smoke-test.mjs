import { randomBytes } from 'node:crypto';

const worker = process.env.WORKER_URL || 'https://another-zone-srt-ai.anotherzone.workers.dev';
const token = randomBytes(32).toString('hex');
const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const audio = Buffer.from('//MoxAANIHYMAUMQAP/iFxEKhwMXAMDeIACCcAEAMPlP6w+XeGFvB/6wfPg/EAYKHF///+XD5cPqBAaCA0Hz5d6F//3CXPmY//MoxAYOiu6wAYIoAOGjnI3VnMNI/+7neQ36CnuKDn/90LbdBwcL//KZ9cxCSOv/87frdX210X//kZF/rw8olxMq21zklroc//MoxAYOsPMKX88YAoABui7NN3U/zrhNSsdRgqA0MwGRz0xs/zf2/59kP8vasrnKBwWERwyBv/6nEP8Z5RRAp1+issbl4rts//MoxAYOcesWXhJEM6ABhxJpCQVTTEEl8p4m6FIXY1Ct//5lo9BTsVjlb///ehjkMYpVT///8poUQ2L4fkaENkpxtqz1u9tQ//MoxAcNmMr+XgpGFgGbYN7OnbywD74Bhy5CK0pfy5LP6ZSgZ8DFWA32yv5OvX+4ugQVH9TihxIYU7+CFQxgF/QBwP+1mtv9//MoxAsPGVLiWHgPRJ4mFMva8ieWMZiFzZqth3rd5Z4m9J9n8MWQrJ8xXesQZv9NSgOCZxEPyc0W3/7jwYJKBgBpAYTMp1nS//MoxAkPUVbVsUxoANmGy2JdbpwbkXIDAGX5UtegCeAS00JABMBdWmYkxCetFv/////WcNlFwnsQD3/+KFyKf/pq6pwq8yJM//MoxAYOYebIAY9QAO2KUKSO8+yIVx1xVwMjw3IhiREZsFsKxAwgDyzKMSE3/0////yYo/lkO91/1f//0lO2vqqCrYSl2feU//MoxAcOoQ6wAY8oAMpAlQu5fCcnSldn1MilUgoqFjQFRmeWZ6/70OKft8VfyP6wD1aHIDn/uDjtAo0+z//R+aoWO3W4XCgC//MoxAcMyEL+X8kYAoH/B01fFibJk4lj13A8fLl3lGlxUE1/sz4PV2f+geGf/////1dYJngqRad01RAmgKAg/se2y7VpChjB//MoxA4MGX7JkAJKGBgYdMjE8s8M3////OeMAAUQgcHHRX/+nO9A+8gp//KHCjlq5fHzqEC8cFLIJASyogfb/nRw+PDo0AAs//MoxBgMEXrUADgK6HBwcLI3/+tFMhg4cAO/8XNA+Khg1wuKgaoqQTAZhYH47xLUOFtAkOlwi3B80gOAhrRv//kWeJVwhku///MoxCIMsXbptEAFBP++REUozA7/+8JLMK6HBNZmYACoATA/pv912zvSjy6l6GGlRcl96yf///+ilExQSICmObX//kVR5yjA//MoxCoM2XbdrUkoABN/9hWDaX+9E3WTLTKE+Lo7Pj8fIzkMCcColD8E9DgSCmHOeDiE6Pv27fqX0zPQNSITCRHIJiWJGw0l//MoxDEXcf7IAYxoABNUYwJGMmYyumbDvKJImZ0kkUkpqgXvNVfW33dFP6Bk6i6cRukfOyrlNfqYRa1QBS7Qui4ADuJS0xfK//MoxA4NOM7mf8YoAErI7zNYqtxKjN/DpTl/uvlU4O0TAB3JCGaGmHf/8VJnTLW/cXaJUNUA7AC4sAlgmR+myX5uuykftO4c//MoxBQNONLZvUw4Aj1w+RXYsgcy/7fopxw45NNJQWIjp//+iJBcc1HyJZAZLUgoz4Pe20Ycp2Hd7EiC1jvCozIE/DgKIYBz//MoxBoTMbKwAY9oAJuZF50e39jg0BdxKJmS4XwL/WipZImRWdPOSx4lykWOutf///+YmST+oxSLzfioefxYVVgsGia0LKSK//MoxAgM4I34AclIAAiRTIRSykigiRaqykFgNOCwJBppVChOiUFRgNBosDR4WBoGniVZ3//+s6JVTEFNRTMuMTAwVVVVVVVV//MoxA8AAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVV//MoxEoAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVV//MoxIUAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVV//MoxMAAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MoxMQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MoxMQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV', 'base64');

async function request(path, options = {}) {
  const response = await fetch(worker + path, options);
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  return { response, data, text };
}

const health = await request('/health');
if (!health.response.ok || !health.data.ok || !health.data.backgroundJobs?.available || health.data.backgroundJobs.storage !== 'D1') {
  throw new Error('Worker health check failed or D1/Queue bindings are unavailable: ' + JSON.stringify(health.data));
}
const created = await request('/jobs', {
  method: 'POST', headers,
  body: JSON.stringify({
    files: [{ name: 'background-smoke-test.mp3', duration: 0.851, chunkCount: 1 }],
    sourceLanguage: 'English', provider: 'cloudflare',
    translationProvider: 'gemini', targetLanguage: 'English'
  })
});
if (created.response.status !== 201 || !created.data.jobId) throw new Error('Could not create a background job: ' + JSON.stringify(created.data));
const jobId = created.data.jobId;
try {
  const privateRead = await request('/jobs/' + jobId, { headers });
  if (!privateRead.response.ok || privateRead.data.job?.files?.[0]?.chunksTotal !== 1) throw new Error('Authenticated job read failed: ' + JSON.stringify(privateRead.data));
  const anonymousRead = await request('/jobs/' + jobId);
  if (anonymousRead.response.status !== 404) throw new Error('Private job endpoint did not reject an unauthenticated request.');

  const uploaded = await request('/jobs/' + jobId + '/chunks/0/0', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'audio/mpeg', 'X-Chunk-Duration': '0.851' },
    body: audio
  });
  if (!uploaded.response.ok || !uploaded.data.ok) throw new Error('Audio chunk upload failed: ' + JSON.stringify(uploaded.data));
  const finished = await request('/jobs/' + jobId + '/complete-upload', { method: 'POST', headers });
  if (!finished.response.ok) throw new Error('Could not finalize smoke-test upload: ' + JSON.stringify(finished.data));

  let completed = false;
  let lastStatus = '';
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const current = await request('/jobs/' + jobId, { headers });
    if (!current.response.ok) throw new Error('Could not poll background job: ' + JSON.stringify(current.data));
    const file = current.data.job?.files?.[0];
    lastStatus = current.data.job?.status + '/' + file?.status;
    if (file?.status === 'completed') { completed = true; break; }
    if (file?.status === 'failed' || current.data.job?.status === 'completed_with_errors') {
      throw new Error('Background transcription failed: ' + JSON.stringify(file));
    }
  }
  if (!completed) throw new Error('Background transcription did not complete within 120 seconds. Last state: ' + lastStatus);
  const download = await fetch(worker + '/jobs/' + jobId + '/download/0', { headers: { Authorization: 'Bearer ' + token } });
  const srt = await download.text();
  if (!download.ok || !srt.includes('-->')) throw new Error('Completed SRT could not be downloaded or contains no subtitle timing.');
  console.log('Background SRT integration test passed: upload, Queue transcription, D1 result persistence, job polling and SRT download.');
} finally {
  await fetch(worker + '/jobs/' + jobId, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
}
