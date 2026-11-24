import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { DateTime } from 'luxon';
import { createApp } from '../src/server.js';
import { configSchema } from '../src/config.js';
import { normalizeCounts, range, Umami } from '../src/umami.js';

const idA = '11111111-1111-4111-8111-111111111111';
const idB = '22222222-2222-4222-8222-222222222222';
const counts = { visitors: 10, pageviews: 30, visits: 12, bounces: 3, totaltime: 1200 };
async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) {
  await new Promise<void>((resolve, reject) => { server.close(e => e ? reject(e) : resolve()); server.closeAllConnections(); });
}
test('normalizes v3 scalar and v2 nested stats without treating invalid data as zero', () => {
  assert.deepEqual(normalizeCounts({ ...counts, comparison: counts }), counts);
  const legacy = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, { value: v, prev: v }]));
  assert.deepEqual(normalizeCounts(legacy), counts);
  assert.throws(() => normalizeCounts({ visitors: 'unknown' }));
});
test('today and rolling calendar ranges respect Amsterdam DST', () => {
  const today = range('today', 'Europe/Amsterdam', DateTime.fromISO('2026-03-29T12:00:00+02:00'));
  assert.equal(new Date(today.startAt).toISOString(), '2026-03-28T23:00:00.000Z');
  assert.equal(today.endAt - today.startAt, 11 * 3600000);
  const week = range('7d', 'Europe/Amsterdam', DateTime.fromISO('2026-03-30T12:00:00+02:00'));
  assert.equal(week.endAt - week.startAt, 167 * 3600000);
});
test('validates config and rejects duplicate or unsafe display values', () => {
  assert.throws(() => configSchema.parse({ timezone: 'not-a-zone' }));
  assert.throws(() => configSchema.parse({ sites: [{ id: idA }, { id: idA }] }));
  assert.throws(() => configSchema.parse({ sites: [{ id: idA, color: 'url(https://example.com)' }] }));
});
test('real HTTP adapter paginates, authenticates, filters sites, caches and stays read-only', async () => {
  const requests: string[] = [];
  const upstream = createServer((req, res) => {
    assert.equal(req.method, 'GET');
    assert.equal(req.headers.authorization, 'Bearer private-test-key');
    requests.push(req.url!);
    const url = new URL(req.url!, 'http://upstream');
    let value: unknown;
    if (url.pathname === '/api/websites') {
      assert.equal(url.searchParams.get('includeTeams'), 'true');
      const second = url.searchParams.get('page') === '2';
      value = { data: [{ id: second ? idB : idA, name: second ? 'Hidden' : 'Original', domain: 'example.nl' }], count: 2, pageSize: 1 };
    } else if (url.pathname.endsWith('/stats')) {
      assert.equal(url.searchParams.get('timezone'), 'Europe/Amsterdam');
      assert(Number(url.searchParams.get('startAt')) < Number(url.searchParams.get('endAt')));
      value = { ...counts, visitors: requests.filter(p => p.includes('/stats?')).length === 1 ? 10 : 7,
        comparison: { ...counts, visitors: 999 } };
    } else if (url.pathname.endsWith('/active')) value = { visitors: 2 };
    else if (url.pathname.endsWith('/pageviews')) value = { pageviews: [{ x: '2026-11-24 10:00:00', y: 30 }] };
    else value = [{ x: '/', y: 30 }];
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value));
  });
  const upstreamUrl = await listen(upstream);
  const app = createApp(configSchema.parse({ sites: [{ id: idA, name: 'Mijn app', group: 'Werk' }, { id: idB, hidden: true }] }), { url: upstreamUrl, key: 'private-test-key' });
  const url = await listen(app);
  try {
    const [r1, r2] = await Promise.all([fetch(`${url}/api/dashboard?period=7d`), fetch(`${url}/api/dashboard?period=7d`)]);
    const body = await r1.json(); await r2.arrayBuffer();
    assert.equal(body.demo, false); assert.equal(body.sites.length, 1);
    assert.equal(body.sites[0].name, 'Mijn app'); assert.equal(body.sites[0].active, 2);
    assert.equal(body.sites[0].stats.visitors, 10);
    assert.equal(body.sites[0].previous.visitors, 7);
    assert(!JSON.stringify(body).includes('private-test-key'));
    assert.equal(requests.filter(p => p.includes('/stats?')).length, 2);
    const statQueries = requests.filter(p => p.includes('/stats?')).map(p => new URL(p, upstreamUrl).searchParams);
    assert.equal(Number(statQueries[0].get('startAt')), body.startAt);
    assert.equal(Number(statQueries[0].get('endAt')), body.endAt);
    assert.equal(Number(statQueries[1].get('startAt')), body.comparison.startAt);
    assert.equal(Number(statQueries[1].get('endAt')), body.comparison.endAt);
    assert.equal(body.comparison.endAt, body.startAt - 1);
    const statsBeforeActive = requests.filter(p => p.includes('/stats?')).length;
    const activity = await fetch(`${url}/api/active`).then(r => r.json());
    assert.equal(activity.sites.length, 1);
    assert.equal(activity.sites[0].id, idA);
    assert.equal(activity.sites[0].active, 2);
    assert.equal(requests.filter(p => p.includes('/stats?')).length, statsBeforeActive);
    assert.equal(requests.filter(p => p.startsWith('/api/websites?')).length, 2);
    const details = await fetch(`${url}/api/sites/${idA}/details?period=7d`).then(r => r.json());
    assert.equal(details.lists.length, 4); assert.equal(details.lists[0].rows[0].x, '/');
    const before = requests.length;
    assert.equal((await fetch(`${url}/api/sites/${idB}/details`)).status, 404);
    assert.equal((await fetch(`${url}/api/dashboard`, { method: 'POST', body: '{}' })).status, 405);
    assert.equal((await fetch(`${url}/api/dashboard?period=all`)).status, 400);
    assert.equal((await fetch(`${url}/api/proxy?url=https://example.com`)).status, 404);
    assert.equal(requests.length, before);
  } finally { await close(app); await close(upstream); }
});
test('historical cache survives normal polling; manual refresh bypasses it after a shared guard', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-24T14:00:00Z') });
  const upstream = createServer((req, res) => {
    let value: unknown;
    if (req.url!.startsWith('/api/websites?')) value = { data: [{ id: idA, name: 'App', domain: 'example.nl' }], count: 1, pageSize: 100 };
    else if (req.url!.includes('/stats?')) value = counts;
    else if (req.url!.endsWith('/active')) value = { visitors: 1 };
    else value = { pageviews: [] };
    res.end(JSON.stringify(value));
  });
  const app = createApp(configSchema.parse({}), { url: await listen(upstream), key: 'test-key' });
  const url = await listen(app);
  const overview = (fresh = false) => fetch(`${url}/api/dashboard?period=7d${fresh ? '&refresh=1' : ''}`).then(r => r.json());
  try {
    const first = await overview();
    t.mock.timers.setTime(Date.now() + 31000);
    assert.equal((await overview()).generatedAt, first.generatedAt);
    const fresh = await overview(true);
    assert.notEqual(fresh.generatedAt, first.generatedAt);
    t.mock.timers.setTime(Date.now() + 1000);
    assert.equal((await overview(true)).generatedAt, fresh.generatedAt);
    t.mock.timers.setTime(Date.now() + 5000);
    assert.notEqual((await overview(true)).generatedAt, fresh.generatedAt);
  } finally { await close(app); await close(upstream); }
});
test('partial upstream failure remains visible; upstream secrets never enter errors', async () => {
  const upstream = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url!.startsWith('/api/websites?')) res.end(JSON.stringify({ data: [{ id: idA, name: 'App', domain: 'example.nl' }], count: 1, pageSize: 100 }));
    else if (req.url!.includes('/stats?')) { res.statusCode = 403; res.end('private-test-key and sensitive upstream content'); }
    else if (req.url!.includes('/active')) res.end(JSON.stringify({ visitors: 0 }));
    else res.end(JSON.stringify({ pageviews: [] }));
  });
  const app = createApp(configSchema.parse({}), { url: await listen(upstream), key: 'private-test-key' });
  const url = await listen(app);
  try {
    const body = await fetch(`${url}/api/dashboard`).then(r => r.json());
    assert.equal(body.sites[0].stats, null); assert.equal(body.sites[0].active, 0);
    assert.match(body.sites[0].warnings[0], /weigert toegang/);
    assert(!JSON.stringify(body).includes('private-test-key'));
  } finally { await close(app); await close(upstream); }
});
test('missing credentials produce a setup error; demo is opt-in', async () => {
  const live = createApp(configSchema.parse({}), {});
  const demo = createApp(configSchema.parse({}), { demo: true });
  const liveUrl = await listen(live); const demoUrl = await listen(demo);
  try {
    assert.equal((await fetch(`${liveUrl}/api/dashboard`)).status, 503);
    const body = await fetch(`${demoUrl}/api/dashboard`).then(r => r.json());
    assert.equal(body.demo, true); assert.equal(body.sites.length, 5);
    assert.equal((await fetch(`${demoUrl}/api/sites/${body.sites[0].id}/details`)).status, 200);
  } finally { await close(live); await close(demo); }
});
test('manual selection fetches only configured visible sites', async () => {
  const upstream = createServer((req, res) => {
    assert(!req.url!.startsWith('/api/websites?'));
    assert(!req.url!.includes(idB));
    let data: unknown = { id: idA, name: 'Handmatig', domain: 'example.nl' };
    if (req.url!.includes('/stats?')) data = { ...counts, comparison: counts };
    if (req.url!.endsWith('/active')) data = { visitors: 1 };
    if (req.url!.includes('/pageviews?')) data = { pageviews: [] };
    res.end(JSON.stringify(data));
  });
  const app = createApp(configSchema.parse({ discovery: 'manual', sites: [{ id: idA }, { id: idB, hidden: true }] }), { url: await listen(upstream), key: 'private-test-key' });
  try {
    const body = await fetch(`${await listen(app)}/api/dashboard`).then(r => r.json());
    assert.equal(body.sites.length, 1); assert.equal(body.sites[0].name, 'Handmatig');
  } finally { await close(app); await close(upstream); }
});
test('automatic application colors remain stable when discovery order changes', async () => {
  let reversed = false;
  const upstream = createServer((_req, res) => {
    const data = [{ id: idA, name: 'A', domain: 'a.nl' }, { id: idB, name: 'B', domain: 'b.nl' }];
    res.end(JSON.stringify({ data: reversed ? data.reverse() : data, count: 2, pageSize: 100 }));
  });
  const client = new Umami(await listen(upstream), 'test-key');
  try {
    const before = await client.sites(configSchema.parse({}));
    reversed = true;
    const after = await client.sites(configSchema.parse({}));
    assert.deepEqual(after.map(s => [s.id, s.color]), before.map(s => [s.id, s.color]));
    const custom = await client.sites(configSchema.parse({ sites: [{ id: idA, color: '#123456' }] }));
    assert.equal(custom.find(s => s.id === idA)?.color, '#123456');
  } finally { await close(upstream); }
});
