import type { Counts, Dashboard, Details, Period, SiteRow } from '@dashboard/shared';
import type { Config } from './config.js';
import { palette, range, comparisonRange } from './umami.js';
import { timeline } from './timeline.js';

export function demoDashboard(config: Config, period: Period): Dashboard {
  const bounds = range(period, config.timezone);
  const names = [['Website', 'voorbeeld.nl'], ['Klantportaal', 'portaal.voorbeeld.nl'], ['Documentatie', 'docs.voorbeeld.nl'], ['Status', 'status.voorbeeld.nl'], ['Webshop', 'shop.voorbeeld.nl']];
  const factor = period === 'today' ? 1 : period === '7d' ? 7 : 30;
  const sites: SiteRow[] = names.map(([name, domain], index) => {
    const n = 5 - index;
    const stats: Counts = { visitors: n * 127 * factor, pageviews: n * 341 * factor, visits: n * 160 * factor, bounces: n * 40 * factor, totaltime: n * 16000 * factor };
    return { id: `00000000-0000-4000-8000-00000000000${index}`, name, domain, color: palette[index], group: index < 3 ? 'Applicaties' : 'Overig',
      stats, previous: Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, Math.round(v / (1.12 + index * .04))])) as unknown as Counts,
      active: [4, 2, 0, 1, 0][index], warnings: [],
      trend: timeline([], bounds).map((p, i) => ({ ...p, y: Math.round((Math.sin(i * .7 + index) + 1.4) * n * 12 * factor) })),
    };
  });
  return { title: config.title, demo: true, timezone: config.timezone, refreshSeconds: config.refreshSeconds,
    columns: config.columns, period, startAt: bounds.startAt, endAt: bounds.endAt,
    comparison: comparisonRange(bounds, period), generatedAt: new Date().toISOString(), sites };
}
export function demoDetails(siteId: string, period: Period): Details {
  return { siteId, period, lists: [
    { type: 'path', label: 'Pagina’s', rows: ['/', '/producten', '/over-ons', '/contact', '/blog'].map((x, i) => ({ x, y: 540 - i * 101 })) },
    { type: 'referrer', label: 'Verwijzers', rows: ['', 'google.com', 'github.com', 'bing.com'].map((x, i) => ({ x, y: 340 - i * 81 })) },
    { type: 'event', label: 'Events', rows: ['aanmelding', 'contact_verstuurd', 'download'].map((x, i) => ({ x, y: 79 - i * 24 })) },
    { type: 'country', label: 'Landen', rows: ['NL', 'BE', 'DE', 'US'].map((x, i) => ({ x, y: 250 - i * 64 })) },
  ] };
}
