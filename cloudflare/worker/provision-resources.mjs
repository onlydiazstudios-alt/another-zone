import { readFile, writeFile } from 'node:fs/promises';

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
const databaseId = database.uuid || database.id;
if (!databaseId) throw new Error('Cloudflare created or found the D1 database but did not return its database ID.');

const queueList = await api('/accounts/' + account + '/queues');
const queues = queueList?.queues || queueList || [];
let queue = queues.find(item => item.queue_name === 'another-zone-srt-jobs');
if (!queue) queue = await api('/accounts/' + account + '/queues', 'POST', { queue_name: 'another-zone-srt-jobs' });

// Keep the DB and Queue bindings in the committed Wrangler configuration.
// Only the account-specific D1 identifier is injected during deployment.
const configPath = new URL('./wrangler.toml', import.meta.url);
const template = await readFile(configPath, 'utf8');
if (!template.includes('binding = "DB"') || !template.includes('database_id = "__D1_DATABASE_ID__"')) {
  throw new Error('wrangler.toml must declare the DB D1 binding and its database ID placeholder.');
}
if (!template.includes('binding = "JOBS_QUEUE"')) {
  throw new Error('wrangler.toml must declare the JOBS_QUEUE producer binding.');
}
const config = template.replace('database_id = "__D1_DATABASE_ID__"', 'database_id = "' + databaseId + '"');
if (config.includes('__D1_DATABASE_ID__')) throw new Error('D1 database ID placeholder was not fully replaced.');
await writeFile(configPath, config);
console.log('Cloudflare D1 and Queue bindings verified in wrangler.toml; database ID injected for deployment.');
