import { createServer } from 'node:http';
import type { Config } from './config.js';
import type { Dashboard, Details, Period, Site, SiteRow } from '@dashboard/shared';
import { Umami, UpstreamError, range, comparisonRange } from './umami.js';
import { demoDashboard, demoDetails } from './demo.js';

const message = (error: unknown) => error instanceof UpstreamError ? error.message : 'Onverwacht antwoord van Umami. Controleer de versie en rechten.';
class HttpError extends Error { constructor(public status: number, text: string) { super(text); } }
export function createApp(config: Config, options: { demo?: boolean; url?: string; key?: string }) {
  const client = options.url && options.key ? new Umami(options.url, options.key) : null;
  const cache = new Map<string, { expires: number; data: unknown }>();
  const pending = new Map<string, Promise<unknown>>();
  async function cached<T>(key: string, work: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.data as T;
    const inflight = pending.get(key);
    if (inflight) return inflight as Promise<T>;
    const promise = work().then(data => {
      if (cache.size >= 128) cache.delete(cache.keys().next().value!);
      cache.set(key, { expires: Date.now() + config.cacheSeconds * 1000, data });
      return data;
    }).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  }
  async function sites(): Promise<Site[]> {
    if (!client) throw new HttpError(503, 'Stel UMAMI_URL en UMAMI_API_KEY in op de server en herstart de API.');
    return cached('sites', () => client.sites(config));
  }
  async function dashboard(period: Period): Promise<Dashboard> {
    if (options.demo) return demoDashboard(config, period);
    const available = await sites();
    const bounds = range(period, config.timezone);
    const comparison = comparisonRange(bounds, period);
    const rows: SiteRow[] = await Promise.all(available.map(async site => {
      const [stats, previous, active, trend] = await Promise.allSettled([
        client!.stats(site.id, bounds), client!.stats(site.id, comparison), client!.activeVisitors(site.id), client!.trend(site.id, bounds),
      ]);
      const warnings: string[] = [];
      if (stats.status === 'rejected') warnings.push(message(stats.reason));
      if (previous.status === 'rejected') warnings.push('De vergelijkingsperiode kon niet worden opgehaald.');
      if (active.status === 'rejected') warnings.push('Actieve bezoekers konden niet worden opgehaald.');
      if (trend.status === 'rejected') warnings.push('De trend kon niet worden opgehaald.');
      return { ...site, stats: stats.status === 'fulfilled' ? stats.value : null,
        previous: previous.status === 'fulfilled' ? previous.value : null,
        active: active.status === 'fulfilled' ? active.value : null,
        trend: trend.status === 'fulfilled' ? trend.value : null, warnings };
    }));
    return { title: config.title, demo: false, timezone: config.timezone, refreshSeconds: config.refreshSeconds,
      columns: config.columns, period, startAt: bounds.startAt, endAt: bounds.endAt,
      comparison: { startAt: comparison.startAt, endAt: comparison.endAt }, generatedAt: new Date().toISOString(), sites: rows };
  }
  async function details(id: string, period: Period): Promise<Details> {
    const available = options.demo ? demoDashboard(config, period).sites : await sites();
    if (!available.some(s => s.id === id)) throw new HttpError(404, 'Deze applicatie is niet beschikbaar in dit dashboard.');
    if (options.demo) return demoDetails(id, period);
    return cached(`details:${period}:${id}`, async () => {
      const query = range(period, config.timezone);
      const dimensions = [['path', 'Pagina’s'], ['referrer', 'Verwijzers'], ['event', 'Events'], ['country', 'Landen']] as const;
      const lists = await Promise.all(dimensions.map(async ([type, label]) => {
        try { return { type, label, rows: await client!.metrics(id, type, query) }; }
        catch (error) { return { type, label, rows: null, error: message(error) }; }
      }));
      return { siteId: id, period, lists };
    });
  }
  return createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    const send = (status: number, body: unknown) => { res.writeHead(status); res.end(JSON.stringify(body)); };
    try {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(405, { error: 'Alleen lezen is toegestaan.' }); }
      const url = new URL(req.url ?? '/', 'http://dashboard.local');
      if (url.pathname === '/health') return send(200, { status: 'ok', mode: options.demo ? 'demo' : client ? 'live' : 'configuration-required' });
      const period = url.searchParams.get('period') ?? 'today';
      if (!['today', '7d', '30d'].includes(period)) throw new HttpError(400, 'Ongeldige periode. Kies today, 7d of 30d.');
      if (url.pathname === '/api/dashboard') return send(200, await cached(`overview:${period}`, () => dashboard(period as Period)));
      const match = url.pathname.match(/^\/api\/sites\/([0-9a-f-]{36})\/details$/i);
      if (match) return send(200, await details(match[1], period as Period));
      send(404, { error: 'Niet gevonden.' });
    } catch (error) {
      send(error instanceof HttpError ? error.status : 502, { error: error instanceof HttpError ? error.message : message(error) });
    }
  });
}
