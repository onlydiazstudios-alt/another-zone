import { writeFile } from 'node:fs/promises';

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) throw new Error('Cloudflare deployment credentials are missing.');
const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
async function api(path, method = 'GET', body) {
  const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error('Cloudflare API ' + method + ' ' + path + ' failed: ' + JSON.stringify(data.errors || data));
  return data.result;
}
const d1List = await api('/accounts/' + account + '/d1/database');
let database = (d1List || []).find(item => item.name === 'another-zone-srt-jobs');
if (!database) database = await api('/accounts/' + account + '/d1/database', 'POST', { name: 'another-zone-srt-jobs' });
const queueList = await api('/accounts/' + account + '/queues');
const queues = queueList?.queues || queueList || [];
let queue = queues.find(item => item.queue_name === 'another-zone-srt-jobs');
if (!queue) queue = await api('/accounts/' + account + '/queues', 'POST', { queue_name: 'another-zone-srt-jobs' });
const config = `name = "another-zone-srt-ai"
main = "src/index.js"
compatibility_date = "2026-11-20"
compatibility_flags = ["nodejs_compat"]

[ai]
binding = "AI"

[[d1_databases]]
binding = "DB"
database_name = "another-zone-srt-jobs"
database_id = "${database.uuid || database.id}"

[[queues.producers]]
binding = "JOBS_QUEUE"
queue = "another-zone-srt-jobs"

[[queues.consumers]]
queue = "another-zone-srt-jobs"
max_batch_size = 1
max_batch_timeout = 1
max_retries = 5
max_concurrency = 2

[triggers]
crons = ["0 3 * * *"]
`;
await writeFile(new URL('./wrangler.toml', import.meta.url), config);
console.log('Cloudflare D1 and Queue resources are ready; wrangler.toml generated.');
