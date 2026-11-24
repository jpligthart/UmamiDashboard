import { z } from 'zod';
import type { Counts, Point, Period, Site } from '@dashboard/shared';
import { DateTime } from 'luxon';
import type { Config } from './config.js';

export const palette = ['#87b9ff', '#a8d5a2', '#d8b4fe', '#f5bf7b', '#75d5cf'];
const website = z.object({ id: z.uuid(), name: z.string(), domain: z.string() });
const point = z.object({ x: z.string().nullable(), y: z.coerce.number().finite().nonnegative() });
export class UpstreamError extends Error {}
export function range(period: Period, timezone: string, now = DateTime.now()) {
  const end = now.setZone(timezone);
  const start = period === 'today' ? end.startOf('day') : end.minus({ days: period === '7d' ? 7 : 30 });
  return { startAt: start.toMillis(), endAt: end.toMillis(), unit: period === 'today' ? 'hour' : 'day', timezone };
}
const countNames = ['visitors', 'pageviews', 'visits', 'bounces', 'totaltime'] as const;
export function normalizeStats(raw: unknown): { stats: Counts; previous: Counts } {
  const data = z.record(z.string(), z.unknown()).parse(raw);
  const comparison = data.comparison as Record<string, unknown> | undefined;
  const stats = {} as Counts;
  const previous = {} as Counts;
  for (const name of countNames) {
    const value = data[name];
    const old = typeof value === 'object' && value !== null ? value as { value?: unknown; prev?: unknown } : null;
    stats[name] = z.number().finite().nonnegative().parse(old ? old.value : value);
    previous[name] = z.number().finite().nonnegative().parse(old ? old.prev : comparison?.[name]);
  }
  return { stats, previous };
}
export class Umami {
  private base: string;
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(baseUrl: string, private key: string) {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error('UMAMI_URL moet een HTTP(S)-adres zonder credentials, query of fragment zijn');
    this.base = url.href.replace(/\/$/, '').replace(/\/api$/, '') + '/api/';
  }
  async get(path: string, query: Record<string, string | number> = {}): Promise<unknown> {
    // A bounded queue also covers concurrent overview and details requests.
    if (this.active >= 6) await new Promise<void>(resolve => this.queue.push(resolve));
    else this.active++;
    try {
      const url = new URL(path, this.base);
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.key}`, Accept: 'application/json' },
        redirect: 'error', signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401 || response.status === 403)
          throw new UpstreamError('Umami weigert toegang. Controleer de API-key en applicatierechten.');
        if (response.status === 429) throw new UpstreamError('Umami ontvangt te veel verzoeken. Probeer straks opnieuw.');
        throw new UpstreamError(`Umami gaf HTTP ${response.status}. Controleer het adres en de proxy.`);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof UpstreamError) throw error;
      throw new UpstreamError('Geen geldig antwoord van Umami. Controleer het adres, netwerk en de Umami-versie.');
    } finally {
      const next = this.queue.shift();
      if (next) next(); else this.active--;
    }
  }
  async sites(config: Config): Promise<Site[]> {
    let found: z.infer<typeof website>[] = [];
    if (config.discovery === 'auto') {
      for (let page = 1; page <= 100; page++) {
        const raw = await this.get('websites', { includeTeams: 'true', page, pageSize: 100 });
        const result = z.object({ data: z.array(website), count: z.number(), pageSize: z.number().positive() }).parse(raw);
        found.push(...result.data);
        if (found.length >= result.count || result.data.length === 0) break;
        if (page === 100) throw new UpstreamError('Te veel applicaties om automatisch op te halen. Gebruik handmatige selectie.');
      }
    } else {
      found = await Promise.all(config.sites.filter(s => !s.hidden).map(async s => website.parse(await this.get(`websites/${s.id}`))));
    }
    const unique = [...new Map(found.map(s => [s.id, s])).values()];
    return unique.filter(s => !config.sites.find(o => o.id === s.id)?.hidden)
      .map((s, i) => {
        const override = config.sites.find(o => o.id === s.id);
        return { ...s, name: override?.name ?? s.name, domain: override?.domain ?? s.domain,
          group: override?.group ?? 'Applicaties', color: override?.color ?? palette[i % palette.length] };
      }).sort((a, b) => (config.sites.find(s => s.id === a.id)?.order ?? 100) -
        (config.sites.find(s => s.id === b.id)?.order ?? 100) || a.name.localeCompare(b.name, 'nl'));
  }
  async stats(id: string, query: ReturnType<typeof range>) {
    try { return normalizeStats(await this.get(`websites/${id}/stats`, query)); }
    catch (error) { if (error instanceof UpstreamError) throw error; throw new UpstreamError('Onverwachte statistieken van Umami. Controleer de Umami-versie.'); }
  }
  async activeVisitors(id: string): Promise<number> {
    return z.object({ visitors: z.number().int().nonnegative() }).parse(await this.get(`websites/${id}/active`)).visitors;
  }
  async trend(id: string, query: ReturnType<typeof range>): Promise<Point[]> {
    const result = z.object({ pageviews: z.array(point) }).parse(await this.get(`websites/${id}/pageviews`, query));
    return result.pageviews.map(p => ({ x: p.x ?? '', y: p.y }));
  }
  async metrics(id: string, type: string, query: ReturnType<typeof range>): Promise<Point[]> {
    return z.array(point).parse(await this.get(`websites/${id}/metrics`, { ...query, type, limit: 7 }))
      .map(p => ({ x: p.x ?? '', y: p.y }));
  }
}
